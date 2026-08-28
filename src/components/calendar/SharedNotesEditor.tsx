import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as Y from 'yjs';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { supabase } from '@/lib/supabase';
import { sanitizeRichText } from '@/lib/sanitize';
import { useAuth } from '@/auth/AuthContext';
import { SupabaseYjsProvider, colorForUser } from '@/lib/sharedNotesProvider';
import { toBase64, fromBase64 } from '@/lib/yjsCodec';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SharedNotesHandle {
  /** Cancels any pending debounce and saves immediately, awaited. Used on Close. */
  flush: () => Promise<{ error: string | null }>;
}

interface Props {
  eventId: string;
  userId: string;
  onStatusChange: (status: SaveStatus) => void;
}

interface PresenceUser {
  clientId: number;
  name?: string;
  color?: string;
}

const SAVE_DEBOUNCE_MS = 1000;

function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5 border-b border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-4 py-1.5">
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
        className={`rounded px-2.5 py-1 text-sm font-bold text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 ${editor.isActive('bold') ? 'bg-sparrow-mist dark:bg-sparrow-dark-surface2' : ''}`}
        title="Bold (Ctrl+B)"
      >
        B
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
        className={`rounded px-2.5 py-1 text-sm italic text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 ${editor.isActive('italic') ? 'bg-sparrow-mist dark:bg-sparrow-dark-surface2' : ''}`}
        title="Italic (Ctrl+I)"
      >
        I
      </button>
      <div className="mx-1.5 h-4 w-px bg-sparrow-rule dark:bg-sparrow-dark-border" />
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }}
        className={`rounded px-2.5 py-1 text-sm text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 ${editor.isActive('bulletList') ? 'bg-sparrow-mist dark:bg-sparrow-dark-surface2' : ''}`}
        title="Bullet list"
      >
        • List
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }}
        className={`rounded px-2.5 py-1 text-sm text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 ${editor.isActive('orderedList') ? 'bg-sparrow-mist dark:bg-sparrow-dark-surface2' : ''}`}
        title="Numbered list"
      >
        1. List
      </button>
    </div>
  );
}

/**
 * Shared Notes pane — live collaborative editing via Yjs, synced between everyone
 * with the panel open through a Supabase Realtime broadcast channel (see
 * sharedNotesProvider.ts). Two people typing at once merge automatically instead of
 * one save silently overwriting the other's, which is what used to happen here.
 *
 * Prep/Live notes are unaffected — they stay private, plain contentEditable boxes in
 * MeetingNotesView.tsx. Only this pane, the one everyone can see and edit, needed this.
 */
export const SharedNotesEditor = forwardRef<SharedNotesHandle, Props>(function SharedNotesEditor(
  { eventId, userId, onStatusChange },
  ref,
) {
  const { profile } = useAuth();
  const userName = profile?.full_name ?? 'Someone';

  const [ready, setReady] = useState(false);
  const [presence, setPresence] = useState<PresenceUser[]>([]);

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<SupabaseYjsProvider | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSucceeded = useRef(false);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        ...(docRef.current
          ? [
              Collaboration.configure({ document: docRef.current }),
              CollaborationCaret.configure({
                provider: providerRef.current,
                user: { name: userName, color: colorForUser(userId) },
              }),
            ]
          : []),
      ],
      editorProps: {
        attributes: {
          class: 'rich-text flex-1 overflow-y-auto p-6 text-sm focus:outline-none min-h-0',
        },
      },
      // Not editable until `ready` — before that, Collaboration/CollaborationCaret
      // aren't wired yet, so anything typed into this throwaway instance would be
      // lost the moment it's swapped for the real, doc-backed editor.
      editable: ready,
      onUpdate: () => scheduleSave(),
    },
    [ready],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const doc = new Y.Doc();
      let notesHtml = '';
      let yjsState: string | null = null;
      let primaryQueryOk = false;

      const { data, error } = await supabase
        .from('event_shared_notes')
        .select('yjs_state, notes')
        .eq('event_id', eventId)
        .maybeSingle();
      if (!error) {
        notesHtml = (data?.notes as string | null) ?? '';
        yjsState = (data?.yjs_state as string | null) ?? null;
        primaryQueryOk = true;
      } else if (error.code === '42703') {
        // yjs_state column doesn't exist yet (migration 0172/0173 not yet run) —
        // fall back to the plain html column so the pane still works pre-migration.
        // Seeding stays disabled below since primaryQueryOk is false: we can't
        // confirm this doc doesn't already have real collaborative content.
        const legacy = await supabase.from('event_shared_notes').select('notes').eq('event_id', eventId).maybeSingle();
        notesHtml = (legacy.data?.notes as string | null) ?? '';
      }
      // Any other error (network blip, etc.) leaves primaryQueryOk false too —
      // safer to skip seeding than risk misreading an already-collaborated note
      // as empty and duplicating its content back in.

      if (yjsState) {
        Y.applyUpdate(doc, fromBase64(yjsState));
      }

      docRef.current = doc;
      providerRef.current = new SupabaseYjsProvider(doc, eventId, userId, userName);
      loadSucceeded.current = true;

      if (cancelled) return;

      // Legacy content from before this migration, and this doc has nothing yet
      // (nobody's collaborative-edited it before) — seed it once so it isn't lost.
      // legacy_seeded is claimed with an atomic UPDATE ... WHERE legacy_seeded =
      // false, so if several people open a never-yet-migrated note at the same
      // instant, only the one whose UPDATE actually matched a row gets to seed —
      // everyone else picks the seeded text up over the realtime channel instead
      // of also inserting their own copy.
      const fragment = doc.getXmlFragment('default');
      if (primaryQueryOk && notesHtml.trim() && fragment.length === 0) {
        const { data: claimed } = await supabase
          .from('event_shared_notes')
          .update({ legacy_seeded: true })
          .eq('event_id', eventId)
          .eq('legacy_seeded', false)
          .select('event_id');
        if (cancelled) return;
        if (claimed && claimed.length > 0) {
          (doc as unknown as { _pendingSeedHtml?: string })._pendingSeedHtml = notesHtml;
        }
      }

      setReady(true);
    }

    void init();

    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      providerRef.current?.destroy();
      providerRef.current = null;
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, userId]);

  // Once the editor exists and the doc was empty but had legacy html, insert it —
  // this becomes a real Yjs edit like any other, synced/persisted from here on.
  useEffect(() => {
    if (!editor || !docRef.current) return;
    const pending = (docRef.current as unknown as { _pendingSeedHtml?: string })._pendingSeedHtml;
    if (pending) {
      editor.commands.setContent(pending);
      delete (docRef.current as unknown as { _pendingSeedHtml?: string })._pendingSeedHtml;
    }
  }, [editor]);

  // Presence — who else currently has this pane open, shown as small dots up top.
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider) return;
    function update() {
      const states = Array.from(provider!.awareness.states.entries())
        .filter(([clientId]) => clientId !== provider!.doc.clientID)
        .map(([clientId, state]) => ({
          clientId,
          name: (state as { user?: { name?: string; color?: string } }).user?.name,
          color: (state as { user?: { name?: string; color?: string } }).user?.color,
        }));
      setPresence(states);
    }
    provider.awareness.on('change', update);
    update();
    return () => provider.awareness.off('change', update);
  }, [ready]);

  function scheduleSave() {
    if (!loadSucceeded.current) return;
    onStatusChange('idle');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void doSave();
    }, SAVE_DEBOUNCE_MS);
  }

  async function doSave(): Promise<{ error: string | null }> {
    const doc = docRef.current;
    if (!doc || !editor) return { error: null };
    onStatusChange('saving');
    const html = sanitizeRichText(editor.getHTML());
    const base = {
      event_id: eventId,
      notes: html,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };
    const yjsState = toBase64(Y.encodeStateAsUpdate(doc));
    let { error } = await supabase.from('event_shared_notes').upsert({ ...base, yjs_state: yjsState }, { onConflict: 'event_id' });
    if (error) {
      // Retry without yjs_state in case migration 0172 hasn't landed yet.
      ({ error } = await supabase.from('event_shared_notes').upsert(base, { onConflict: 'event_id' }));
    }
    onStatusChange(error ? 'error' : 'saved');
    return { error: error ? error.message : null };
  }

  useImperativeHandle(ref, () => ({
    flush: async () => {
      if (!loadSucceeded.current) return { error: null };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      return doSave();
    },
  }));

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-sparrow-rule dark:border-sparrow-dark-border bg-blue-50 dark:bg-blue-500/15 px-6 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Shared Notes</p>
          <p className="text-xs text-blue-600/70 dark:text-blue-400/70">Visible to everyone with calendar access</p>
        </div>
        {presence.length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {presence.map((p) => (
              <span
                key={p.clientId}
                title={p.name ?? 'Someone else'}
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white dark:border-sparrow-dark-surface"
                style={{ backgroundColor: p.color ?? '#1E4D30' }}
              >
                {(p.name ?? '?').slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
        )}
      </div>
      {ready && <EditorToolbar editor={editor} />}
      <div className="flex flex-1 flex-col overflow-hidden bg-blue-50/20 dark:bg-blue-500/10">
        {ready ? <EditorContent editor={editor} className="flex flex-1 flex-col overflow-hidden" /> : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
          </div>
        )}
      </div>
    </div>
  );
});

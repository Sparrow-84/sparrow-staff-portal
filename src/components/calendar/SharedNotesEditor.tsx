import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as Y from 'yjs';
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { supabase } from '@/lib/supabase';
import { sanitizeRichText } from '@/lib/sanitize';
import { useAuth } from '@/auth/AuthContext';
import { SupabaseYjsProvider, colorForUser } from '@/lib/sharedNotesProvider';
import { toBase64, fromBase64 } from '@/lib/yjsCodec';
import { markSharedNoteRestore, type SharedNoteVersion } from '@/lib/sharedNotesVersions';
import { SharedNotesVersionHistory } from './SharedNotesVersionHistory';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SharedNotesHandle {
  /** Cancels any pending debounce and saves immediately, awaited. Used on Close.
   *  Does nothing when the notes haven't changed since the last save. */
  flush: () => Promise<{ error: string | null }>;
  /** How many words THIS person's own changes have removed since they opened the
   *  notes, when that's big enough to warn about before closing; otherwise null. */
  bigRemoval: () => { removed: number } | null;
  /** Undoes every change this person made since opening the notes (never anyone
   *  else's), then saves. */
  undoAllMine: () => Promise<{ error: string | null }>;
}

// Same rule the database uses for "before a big removal" versions (migration 0219).
function isBigRemoval(startWords: number, removed: number) {
  return removed >= 40 || (startWords >= 10 && removed * 2 >= startWords);
}

function countWords(node: { textBetween: (from: number, to: number, block?: string, leaf?: string) => string; content: { size: number } }) {
  const text = node.textBetween(0, node.content.size, ' ', ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

interface Props {
  eventId: string;
  userId: string;
  onStatusChange: (status: SaveStatus) => void;
  /** Shown at the top of the Version history screen. */
  eventTitle?: string;
  eventSubtitle?: string;
}

interface PresenceUser {
  clientId: number;
  name?: string;
  color?: string;
}

const SAVE_DEBOUNCE_MS = 1000;

function EditorToolbar({ editor }: { editor: Editor }) {
  // Undo/Redo come from the Collaboration extension's Yjs-aware undo manager, which
  // only ever undoes YOUR OWN changes — never someone else's concurrent typing.
  // That's why StarterKit's plain undoRedo stays disabled below.
  const { canUndo, canRedo } = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ canUndo: e.can().undo(), canRedo: e.can().redo() }),
  });
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
      <div className="mx-1.5 h-4 w-px bg-sparrow-rule dark:bg-sparrow-dark-border" />
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().undo().run(); }}
        disabled={!canUndo}
        className="rounded px-2.5 py-1 text-sm text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 disabled:opacity-40 disabled:hover:bg-transparent"
        title="Undo your last change (Ctrl+Z)"
      >
        ↶ Undo
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().redo().run(); }}
        disabled={!canRedo}
        className="rounded px-2.5 py-1 text-sm text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 disabled:opacity-40 disabled:hover:bg-transparent"
        title="Redo (Ctrl+Shift+Z)"
      >
        ↷ Redo
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
  { eventId, userId, onStatusChange, eventTitle, eventSubtitle },
  ref,
) {
  const { profile } = useAuth();
  const userName = profile?.full_name ?? 'Someone';

  const [ready, setReady] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [presence, setPresence] = useState<PresenceUser[]>([]);

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<SupabaseYjsProvider | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSucceeded = useRef(false);
  // The very first onUpdate after the real (doc-backed) editor mounts is TipTap/
  // Collaboration's own initial sync -- it fires even when nothing was typed and
  // nothing was seeded (e.g. binding to a genuinely empty Yjs doc still produces a
  // default empty paragraph, which counts as a transaction). Autosaving that blindly
  // was overwriting real, already-saved content with blank HTML the instant a note
  // was merely opened, whenever the doc happened to load/seed as empty for any
  // reason. Skipping just this first call is enough: flush()-on-close and any real
  // subsequent edit still persist whatever ended up in the doc, seeded or typed.
  const skipNextUpdate = useRef(true);

  // What needs saving. Only the person who actually typed is recorded as the editor
  // (updated_by): opening and closing notes, or just watching someone else type,
  // used to re-save them under the viewer's name, which hid who really changed them.
  // Someone else's typing that arrives live is still saved (as a backup copy) but
  // without touching updated_by.
  const localDirty = useRef(false);
  const remoteDirty = useRef(false);
  // True only while a change from another person is being applied to this doc.
  const applyingRemote = useRef(false);
  // Net words added (+) or removed (-) by this person's own changes since they
  // opened the notes (reset after the legacy seed and after a restore).
  const localNetWords = useRef(0);
  const startWords = useRef(0);

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
      onUpdate: ({ transaction }) => {
        if (skipNextUpdate.current) {
          skipNextUpdate.current = false;
          // The initial sync is when the saved notes show up in the editor.
          startWords.current = countWords(transaction.doc);
          return;
        }
        if (applyingRemote.current) {
          remoteDirty.current = true;
        } else {
          localDirty.current = true;
          localNetWords.current += countWords(transaction.doc) - countWords(transaction.before);
        }
        scheduleSave();
      },
    },
    [ready],
  );

  useEffect(() => {
    let cancelled = false;
    skipNextUpdate.current = true;

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
        try {
          Y.applyUpdate(doc, fromBase64(yjsState));
        } catch {
          // A yjs_state value that won't decode/apply (e.g. the 0172-era column-type
          // bug that silently corrupted every save -- see migration 0174) must never
          // strand the pane on "Loading" forever. Treat it exactly like no yjs_state
          // existed: the doc stays empty here, and the legacy-seed check below
          // rebuilds it from `notes`, which this bug never touched.
          yjsState = null;
        }
      }

      docRef.current = doc;
      providerRef.current = new SupabaseYjsProvider(doc, eventId, userId, userName);
      loadSucceeded.current = true;
      localDirty.current = false;
      remoteDirty.current = false;
      localNetWords.current = 0;

      // The provider applies other people's changes with itself as the origin. The
      // editor updates inside that Yjs transaction (before 'afterTransaction'), so
      // this flag tells onUpdate the change wasn't typed here. Undo/redo and our own
      // typing have other origins, so they count as this person's changes.
      const provider = providerRef.current;
      doc.on('beforeTransaction', (tr: Y.Transaction) => {
        if (tr.origin === provider) applyingRemote.current = true;
      });
      doc.on('afterTransaction', (tr: Y.Transaction) => {
        if (tr.origin === provider) applyingRemote.current = false;
      });

      if (cancelled) return;

      // Legacy content from before this migration, and this doc has nothing yet
      // (nobody's collaborative-edited it before) — seed it once so it isn't lost.
      // legacy_seeded is claimed with an atomic UPDATE ... WHERE legacy_seeded =
      // false, so if several people open a never-yet-migrated note at the same
      // instant, only the one whose UPDATE actually matched a row gets to seed —
      // everyone else picks the seeded text up over the realtime channel instead
      // of also inserting their own copy.
      //
      // Also reclaim a row where legacy_seeded is (wrongly) already true but
      // yjs_state is null: migration 0173's own backfill marked any row with a
      // non-null yjs_state as already-seeded, back when yjs_state was still the
      // pre-0174 corrupted bytea data. 0174 correctly wiped that corrupted data
      // to null, but couldn't know to also reset legacy_seeded — so those rows
      // got stuck believing "already seeded" and "nothing to load" at once,
      // rendering fully empty despite the real text being intact in `notes`.
      // yjsState is what THIS load just saw, so if it's null there's genuinely
      // nothing in the doc regardless of what legacy_seeded currently says.
      const fragment = doc.getXmlFragment('default');
      if (primaryQueryOk && notesHtml.trim() && fragment.length === 0) {
        const { data: claimed, error: claimError } = await supabase
          .from('event_shared_notes')
          .update({ legacy_seeded: true })
          .eq('event_id', eventId)
          .or(yjsState ? 'legacy_seeded.eq.false' : 'legacy_seeded.eq.false,yjs_state.is.null')
          .select('event_id');
        if (cancelled) return;
        // Fail OPEN, not closed: only skip seeding when we have positive proof
        // someone else already claimed it (update succeeded, zero rows matched).
        // Any error here (e.g. legacy_seeded column not migrated in yet) falls
        // back to seeding — a rare duplicate line is far better than silently
        // discarding real note content, which is what skipping on error caused.
        const alreadyClaimedByOther = !claimError && claimed && claimed.length === 0;
        if (!alreadyClaimedByOther) {
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
    resetRemovalTracking();
  }, [editor]);

  function resetRemovalTracking() {
    localNetWords.current = 0;
    startWords.current = editor ? countWords(editor.state.doc) : 0;
  }

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
    const mine = localDirty.current;
    const theirs = remoteDirty.current;
    // Nothing changed since the last save: don't re-save (and don't put this
    // person's name on notes they only looked at).
    if (!mine && !theirs) return { error: null };
    localDirty.current = false;
    remoteDirty.current = false;
    onStatusChange('saving');
    const html = sanitizeRichText(editor.getHTML());
    // Only this person's own changes stamp updated_by/updated_at. A save that only
    // carries someone else's live changes leaves both as they were (an upsert only
    // sets the columns it's given).
    const base: { event_id: string; notes: string; updated_at?: string; updated_by?: string } = mine
      ? { event_id: eventId, notes: html, updated_at: new Date().toISOString(), updated_by: userId }
      : { event_id: eventId, notes: html };
    const yjsState = toBase64(Y.encodeStateAsUpdate(doc));
    let { error } = await supabase.from('event_shared_notes').upsert({ ...base, yjs_state: yjsState }, { onConflict: 'event_id' });
    if (error) {
      // Retry without yjs_state in case migration 0172 hasn't landed yet.
      ({ error } = await supabase.from('event_shared_notes').upsert(base, { onConflict: 'event_id' }));
    }
    if (error) {
      // Keep it marked unsaved so Close / the next change tries again.
      localDirty.current = localDirty.current || mine;
      remoteDirty.current = remoteDirty.current || theirs;
    }
    onStatusChange(error ? 'error' : 'saved');
    return { error: error ? error.message : null };
  }

  // Restore: the database first keeps the current notes as a version, then the old
  // text goes into the live collaborative doc (so everyone with the pane open sees
  // it right away) and is saved immediately rather than on the usual debounce.
  async function restoreVersion(version: SharedNoteVersion) {
    if (!editor || !loadSucceeded.current) throw new Error('Notes are still loading — try again in a moment.');
    await markSharedNoteRestore(version.id);
    editor.commands.setContent(sanitizeRichText(version.notes));
    // A restore is on purpose, so it never triggers the "you removed a lot" warning.
    resetRemovalTracking();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const { error } = await doSave();
    if (error) throw new Error(`Restored in the editor, but saving failed: ${error}`);
  }

  useImperativeHandle(ref, () => ({
    flush: async () => {
      if (!loadSucceeded.current) return { error: null };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      return doSave();
    },
    bigRemoval: () => {
      if (!loadSucceeded.current) return null;
      const removed = -localNetWords.current;
      return removed > 0 && isBigRemoval(startWords.current, removed) ? { removed } : null;
    },
    undoAllMine: async () => {
      if (!editor || !loadSucceeded.current) return { error: null };
      // The Yjs undo stack only holds this person's own changes. Cap the loop so a
      // stuck stack can never hang the page.
      for (let i = 0; i < 1000 && editor.can().undo(); i++) editor.commands.undo();
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
        <div className="flex items-center gap-3">
        {ready && (
          <button
            onClick={() => setShowHistory(true)}
            className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-500/30 dark:bg-sparrow-dark-surface dark:text-blue-300 dark:hover:bg-blue-500/15"
          >
            Version history
          </button>
        )}
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
      </div>
      {showHistory && (
        <SharedNotesVersionHistory
          eventId={eventId}
          eventTitle={eventTitle}
          eventSubtitle={eventSubtitle}
          onClose={() => setShowHistory(false)}
          onRestore={restoreVersion}
        />
      )}
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

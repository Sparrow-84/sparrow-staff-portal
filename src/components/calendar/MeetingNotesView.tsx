import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { KIND_LABEL, KIND_PILL, type CalendarEvent } from '@/lib/calendar';

interface Props {
  event: CalendarEvent;
  userId: string;
  onClose: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function sanitize(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

function Toolbar() {
  function apply(cmd: string) {
    document.execCommand(cmd, false, undefined);
  }
  return (
    <div className="flex items-center gap-0.5 border-b border-sparrow-rule bg-white px-4 py-1.5">
      <button
        onMouseDown={(e) => { e.preventDefault(); apply('bold'); }}
        className="rounded px-2.5 py-1 text-sm font-bold text-sparrow-ink hover:bg-sparrow-mist"
        title="Bold (Ctrl+B)"
      >
        B
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); apply('italic'); }}
        className="rounded px-2.5 py-1 text-sm italic text-sparrow-ink hover:bg-sparrow-mist"
        title="Italic (Ctrl+I)"
      >
        I
      </button>
      <div className="mx-1.5 h-4 w-px bg-sparrow-rule" />
      <button
        onMouseDown={(e) => { e.preventDefault(); apply('insertUnorderedList'); }}
        className="rounded px-2.5 py-1 text-sm text-sparrow-ink hover:bg-sparrow-mist"
        title="Bullet list"
      >
        • List
      </button>
      <button
        onMouseDown={(e) => { e.preventDefault(); apply('insertOrderedList'); }}
        className="rounded px-2.5 py-1 text-sm text-sparrow-ink hover:bg-sparrow-mist"
        title="Numbered list"
      >
        1. List
      </button>
    </div>
  );
}

const CONTENT_CLASSES =
  'flex-1 overflow-y-auto p-6 text-sm leading-relaxed text-sparrow-ink focus:outline-none ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 ' +
  '[&_li]:mb-0.5 [&_b]:font-semibold [&_strong]:font-semibold [&_p]:mb-2';

export function MeetingNotesView({ event, userId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [privateStatus, setPrivateStatus] = useState<SaveStatus>('idle');
  const [sharedStatus, setSharedStatus] = useState<SaveStatus>('idle');

  const prepRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const sharedRef = useRef<HTMLDivElement>(null);

  const latestPrep = useRef('');
  const latestLive = useRef('');
  const latestShared = useRef('');

  // Guard: only allow unmount flush and saves if initial load succeeded.
  // Without this, a failed load would autosave empty strings over existing notes.
  const loadSucceeded = useRef(false);

  const privateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sharedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [{ data: priv, error: privErr }, { data: shared }] = await Promise.all([
          supabase
            .from('meeting_notes')
            .select('prep_notes, live_notes')
            .eq('event_id', event.id)
            .eq('user_id', userId)
            .maybeSingle(),
          supabase
            .from('event_shared_notes')
            .select('notes')
            .eq('event_id', event.id)
            .maybeSingle(),
        ]);
        // Private notes are the critical path — fail if those error.
        // Shared notes degrade gracefully (schema cache may be stale after migrations).
        if (privErr) {
          setLoadError(privErr.message);
          setLoading(false);
          return;
        }
        if (priv) {
          latestPrep.current = priv.prep_notes;
          latestLive.current = priv.live_notes;
          if (prepRef.current) prepRef.current.innerHTML = priv.prep_notes;
          if (liveRef.current) liveRef.current.innerHTML = priv.live_notes;
        }
        if (shared) {
          latestShared.current = shared.notes;
          if (sharedRef.current) sharedRef.current.innerHTML = shared.notes;
        }
        loadSucceeded.current = true;
        setLoading(false);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    }
    void load();
  }, [event.id, userId]);

  // Flush any unsaved content on unmount — best-effort, no await.
  // Skipped entirely if initial load failed to prevent overwriting existing notes with empty state.
  useEffect(() => {
    return () => {
      if (privateTimer.current) clearTimeout(privateTimer.current);
      if (sharedTimer.current) clearTimeout(sharedTimer.current);
      if (!loadSucceeded.current) return; // eslint-disable-line @typescript-eslint/no-unnecessary-condition
      void supabase.from('meeting_notes').upsert(
        {
          event_id: event.id,
          user_id: userId,
          prep_notes: latestPrep.current,
          live_notes: latestLive.current,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'event_id,user_id' },
      );
      if (latestShared.current) {
        void supabase.from('event_shared_notes').upsert(
          {
            event_id: event.id,
            notes: sanitize(latestShared.current),
            updated_at: new Date().toISOString(),
            updated_by: userId,
          },
          { onConflict: 'event_id' },
        );
      }
    };
  }, [event.id, userId]);

  const schedulePrivateSave = useCallback(() => {
    if (!loadSucceeded.current) return;
    if (privateTimer.current) clearTimeout(privateTimer.current);
    setPrivateStatus('idle');
    privateTimer.current = setTimeout(async () => {
      setPrivateStatus('saving');
      const { error } = await supabase.from('meeting_notes').upsert(
        {
          event_id: event.id,
          user_id: userId,
          prep_notes: latestPrep.current,
          live_notes: latestLive.current,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'event_id,user_id' },
      );
      setPrivateStatus(error ? 'error' : 'saved');
    }, 1000);
  }, [event.id, userId]);

  const scheduleSharedSave = useCallback(() => {
    if (!loadSucceeded.current) return;
    if (sharedTimer.current) clearTimeout(sharedTimer.current);
    setSharedStatus('idle');
    sharedTimer.current = setTimeout(async () => {
      setSharedStatus('saving');
      const { error } = await supabase.from('event_shared_notes').upsert(
        {
          event_id: event.id,
          notes: sanitize(latestShared.current),
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: 'event_id' },
      );
      setSharedStatus(error ? 'error' : 'saved');
    }, 1000);
  }, [event.id, userId]);

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const html = e.nativeEvent.clipboardData?.getData('text/html');
    if (html) {
      // Strip inline styles and classes so pasted content uses our own styling
      const clean = html.replace(/ style="[^"]*"/g, '').replace(/ class="[^"]*"/g, '');
      document.execCommand('insertHTML', false, clean);
    } else {
      const text = e.nativeEvent.clipboardData?.getData('text/plain') ?? '';
      document.execCommand('insertText', false, text);
    }
  }

  function handlePrepInput() {
    latestPrep.current = prepRef.current?.innerHTML ?? '';
    schedulePrivateSave();
  }
  function handleLiveInput() {
    latestLive.current = liveRef.current?.innerHTML ?? '';
    schedulePrivateSave();
  }
  function handleSharedInput() {
    latestShared.current = sharedRef.current?.innerHTML ?? '';
    scheduleSharedSave();
  }

  const startsAt = new Date(event.starts_at);
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;
  const dateLabel = startsAt.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const timeLabel = event.all_day
    ? 'All day'
    : endsAt
      ? `${startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${endsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
      : startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  // Show the most active save status in the header
  const displayStatus: SaveStatus =
    privateStatus === 'saving' || sharedStatus === 'saving' ? 'saving'
    : privateStatus === 'error' || sharedStatus === 'error' ? 'error'
    : privateStatus === 'saved' || sharedStatus === 'saved' ? 'saved'
    : 'idle';

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
        <p className="text-sm text-sparrow-gray">Loading notes…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white">
        <p className="text-sm font-medium text-sparrow-ink">Could not load meeting notes.</p>
        <p className="text-sm text-sparrow-gray">Your existing notes are safe. Try closing and reopening, or refreshing the page.</p>
        <p className="rounded bg-sparrow-mist px-3 py-2 font-mono text-xs text-sparrow-ink">{loadError}</p>
        <button
          onClick={onClose}
          className="rounded-xl border border-sparrow-rule px-4 py-2 text-sm font-medium text-sparrow-ink hover:bg-sparrow-mist"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sparrow-rule px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${KIND_PILL[event.kind]}`}>
              {KIND_LABEL[event.kind]}
            </span>
            <h1 className="text-lg font-semibold text-sparrow-ink">{event.title}</h1>
          </div>
          <p className="mt-0.5 text-sm text-sparrow-gray">{dateLabel} · {timeLabel}</p>
        </div>
        <div className="flex items-center gap-4">
          {displayStatus === 'saving' && <span className="text-xs text-sparrow-gray">Saving…</span>}
          {displayStatus === 'saved' && <span className="text-xs text-sparrow-gray">Saved</span>}
          {displayStatus === 'error' && <span className="text-xs text-priority-p1">Error saving</span>}
          <button
            onClick={onClose}
            className="rounded-xl border border-sparrow-rule px-4 py-2 text-sm font-medium text-sparrow-ink hover:bg-sparrow-mist"
          >
            Exit meeting mode
          </button>
        </div>
      </div>

      {/* Formatting toolbar */}
      <Toolbar />

      {/* Three-column notes area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Prep Notes */}
        <div className="flex flex-1 flex-col border-r border-sparrow-rule">
          <div className="border-b border-sparrow-rule bg-amber-50 px-6 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Prep Notes</p>
            <p className="text-xs text-amber-600/70">Before the meeting · only visible to you</p>
          </div>
          <div
            ref={prepRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handlePrepInput}
            onPaste={handlePaste}
            className={`${CONTENT_CLASSES} bg-amber-50/20`}
          />
        </div>

        {/* Live Notes */}
        <div className="flex flex-1 flex-col border-r border-sparrow-rule">
          <div className="border-b border-sparrow-rule bg-green-50 px-6 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-green">Live Notes</p>
            <p className="text-xs text-sparrow-green/60">During the meeting · only visible to you</p>
          </div>
          <div
            ref={liveRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleLiveInput}
            onPaste={handlePaste}
            className={`${CONTENT_CLASSES} bg-green-50/20`}
          />
        </div>

        {/* Shared Notes */}
        <div className="flex flex-1 flex-col">
          <div className="border-b border-sparrow-rule bg-blue-50 px-6 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Shared Notes</p>
            <p className="text-xs text-blue-600/70">Visible to everyone with calendar access</p>
          </div>
          <div
            ref={sharedRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleSharedInput}
            onPaste={handlePaste}
            className={`${CONTENT_CLASSES} bg-blue-50/20`}
          />
        </div>
      </div>
    </div>
  );
}

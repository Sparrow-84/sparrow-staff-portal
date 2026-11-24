import { forwardRef, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { KIND_LABEL, KIND_PILL, type CalendarEvent } from '@/lib/calendar';
import { RichTextField } from '../lcp/RichText';
import type { SaveStatus, SharedNotesHandle } from './SharedNotesEditor';
import { SharedNotesVersionHistory } from './SharedNotesVersionHistory';
import { fetchPrivateNoteVersions, markPrivateNoteRestore, type PrivateNoteField } from '@/lib/privateNotesVersions';
import type { SharedNoteVersion } from '@/lib/sharedNotesVersions';

const FIELD_LABEL: Record<PrivateNoteField, string> = { prep: 'Prep Notes', live: 'Live Notes' };

// Lazy-loaded: Yjs + TipTap only need to be fetched once someone actually opens a
// meeting notes panel, not as part of every page's initial bundle.
//
// If the portal was updated while this tab was open, the file this asks for has been
// replaced by a newer one and the download fails. Unhandled, that blanked the whole
// screen. Instead, show a message asking for a refresh. No automatic reload, so
// nothing typed elsewhere on the page is lost. Everything already saved is safe on the
// server either way.
const SharedNotesEditor = lazy(() =>
  import('./SharedNotesEditor')
    .then((m) => ({ default: m.SharedNotesEditor }))
    .catch(() => ({ default: PortalUpdatedNotice as unknown as typeof import('./SharedNotesEditor').SharedNotesEditor })),
);

const PortalUpdatedNotice = forwardRef<SharedNotesHandle>(function PortalUpdatedNotice() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
        The portal was just updated. Refresh the page to open Shared Notes.
      </p>
      <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
        Your notes are saved. If you're typing in Prep or Live Notes, save first.
      </p>
      <button onClick={() => window.location.reload()} className="btn-primary text-xs">Refresh</button>
    </div>
  );
});

interface Props {
  event: CalendarEvent;
  userId: string;
  onClose: () => void;
}

export function MeetingNotesView({ event, userId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Fetched content held in state — handed to RichTextField as its
  // initialValue once loading finishes (RichTextField only reads
  // initialValue at mount, so this can't be applied any later than that).
  const [initialContent, setInitialContent] = useState<{ prep: string; live: string } | null>(null);
  const [privateStatus, setPrivateStatus] = useState<SaveStatus>('idle');
  const [sharedStatus, setSharedStatus] = useState<SaveStatus>('idle');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  // Set when Close is clicked after this person removed a lot of the Shared Notes.
  const [removalWarning, setRemovalWarning] = useState<{ removed: number } | null>(null);
  const [undoing, setUndoing] = useState(false);
  // Which private notes' Version history is open, if any.
  const [historyField, setHistoryField] = useState<PrivateNoteField | null>(null);
  // RichTextField only reads initialValue when it mounts, so a restore bumps its key
  // to remount it with the restored text.
  const [fieldKeys, setFieldKeys] = useState<Record<PrivateNoteField, number>>({ prep: 0, live: 0 });

  const loadPrepVersions = useCallback(() => fetchPrivateNoteVersions(event.id, userId, 'prep'), [event.id, userId]);
  const loadLiveVersions = useCallback(() => fetchPrivateNoteVersions(event.id, userId, 'live'), [event.id, userId]);

  const sharedEditorRef = useRef<SharedNotesHandle>(null);

  const latestPrep = useRef('');
  const latestLive = useRef('');

  // Guard: only allow unmount flush and saves if initial load succeeded.
  // Without this, a failed load would autosave empty strings over existing notes.
  const loadSucceeded = useRef(false);

  const privateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data: priv, error: privErr } = await supabase
          .from('meeting_notes')
          .select('prep_notes, live_notes')
          .eq('event_id', event.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (privErr) {
          setLoadError(privErr.message);
          setLoading(false);
          return;
        }
        const prep = priv?.prep_notes ?? '';
        const live = priv?.live_notes ?? '';
        latestPrep.current = prep;
        latestLive.current = live;
        loadSucceeded.current = true;
        setInitialContent({ prep, live });
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
  // Shared notes flush themselves (SharedNotesEditor owns its own Yjs-backed save).
  useEffect(() => {
    return () => {
      if (privateTimer.current) clearTimeout(privateTimer.current);
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
      void sharedEditorRef.current?.flush();
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

  // Close is the one path that must never silently drop content: cancel any
  // pending debounce timers and save directly, awaited, so a failure is
  // actually shown instead of discarded when the panel unmounts.
  async function flushAndClose(opts?: { keepRemoval?: boolean }) {
    if (!loadSucceeded.current) {
      onClose();
      return;
    }
    // Stop before closing if this person removed a lot of the Shared Notes, so a
    // select-all-and-type-over or a held Backspace gets noticed while it can still
    // be undone in one click.
    if (!opts?.keepRemoval) {
      const removal = sharedEditorRef.current?.bigRemoval() ?? null;
      if (removal) {
        setRemovalWarning(removal);
        return;
      }
    }
    setRemovalWarning(null);
    setClosing(true);
    setCloseError(null);
    if (privateTimer.current) clearTimeout(privateTimer.current);

    const [{ error: privError }, { error: sharedError }] = await Promise.all([
      supabase.from('meeting_notes').upsert(
        {
          event_id: event.id,
          user_id: userId,
          prep_notes: latestPrep.current,
          live_notes: latestLive.current,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'event_id,user_id' },
      ),
      sharedEditorRef.current?.flush() ?? Promise.resolve({ error: null }),
    ]);

    setClosing(false);
    if (privError || sharedError) {
      setPrivateStatus(privError ? 'error' : privateStatus);
      setSharedStatus(sharedError ? 'error' : sharedStatus);
      setCloseError(
        privError && sharedError
          ? 'Could not save your private or shared notes. Nothing is lost yet — try again, or close without saving.'
          : privError
            ? 'Could not save your private notes. Nothing is lost yet — try again, or close without saving.'
            : 'Could not save your shared notes. Nothing is lost yet — try again, or close without saving.',
      );
      return;
    }
    onClose();
  }

  function savePrivateNow() {
    if (privateTimer.current) clearTimeout(privateTimer.current);
    return supabase.from('meeting_notes').upsert(
      {
        event_id: event.id,
        user_id: userId,
        prep_notes: latestPrep.current,
        live_notes: latestLive.current,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'event_id,user_id' },
    );
  }

  // Restore an older version of this person's Prep or Live notes. Anything typed but
  // not yet saved is saved first, so the database keeps it as the "before restore" copy.
  async function restorePrivateVersion(field: PrivateNoteField, version: SharedNoteVersion) {
    if (!loadSucceeded.current) throw new Error('Notes are still loading — try again in a moment.');
    const pending = await savePrivateNow();
    if (pending.error) throw new Error(`Could not save your current notes first: ${pending.error.message}`);
    await markPrivateNoteRestore(version.id);
    if (field === 'prep') latestPrep.current = version.notes;
    else latestLive.current = version.notes;
    setInitialContent({ prep: latestPrep.current, live: latestLive.current });
    setFieldKeys((k) => ({ ...k, [field]: k[field] + 1 }));
    setPrivateStatus('saving');
    const { error } = await savePrivateNow();
    setPrivateStatus(error ? 'error' : 'saved');
    if (error) throw new Error(`Restored in the editor, but saving failed: ${error.message}`);
  }

  // RichTextField already sanitizes on every change (strips pasted inline
  // styles/classes down to plain structure) -- no separate paste handling
  // needed here anymore.
  function handlePrepChange(html: string) {
    latestPrep.current = html;
    schedulePrivateSave();
  }
  function handleLiveChange(html: string) {
    latestLive.current = html;
    schedulePrivateSave();
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white dark:bg-sparrow-dark-surface">
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading notes…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white dark:bg-sparrow-dark-surface">
        <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Could not load meeting notes.</p>
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Your existing notes are safe. Try closing and reopening, or refreshing the page.</p>
        <p className="rounded bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-3 py-2 font-mono text-xs text-sparrow-ink dark:text-sparrow-dark-ink">{loadError}</p>
        <button
          onClick={onClose}
          className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border px-4 py-2 text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
        >
          Close
        </button>
      </div>
    );
  }

  // Can't actually happen once loading is false and loadError is null (load()
  // always sets one of initialContent/loadError before clearing loading) --
  // just here so TS knows initialContent.prep/.live below are real strings.
  if (!initialContent) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-sparrow-dark-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sparrow-rule dark:border-sparrow-dark-border px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${KIND_PILL[event.kind]}`}>
              {KIND_LABEL[event.kind]}
            </span>
            <h1 className="text-lg font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{event.title}</h1>
          </div>
          <p className="mt-0.5 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{dateLabel} · {timeLabel}</p>
        </div>
        <div className="flex items-center gap-4">
          {!closing && displayStatus === 'saving' && <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Saving…</span>}
          {!closing && displayStatus === 'saved' && <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Saved</span>}
          {!closing && displayStatus === 'error' && <span className="text-xs text-priority-p1">Error saving</span>}
          <button
            onClick={() => void flushAndClose()}
            disabled={closing}
            className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border px-4 py-2 text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 disabled:opacity-60"
          >
            {closing ? 'Saving…' : 'Close notes'}
          </button>
        </div>
      </div>

      {removalWarning && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-amber-300 bg-amber-50 px-6 py-3 dark:border-amber-500/40 dark:bg-amber-500/10">
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              You removed about {removalWarning.removed} words from the Shared Notes.
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              If that wasn't on purpose, undo it before you close. Other people's notes aren't affected.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={async () => {
                setUndoing(true);
                const { error } = (await sharedEditorRef.current?.undoAllMine()) ?? { error: null };
                setUndoing(false);
                setRemovalWarning(null);
                if (error) setCloseError(`Your changes were undone, but saving failed: ${error}. Try closing again.`);
              }}
              disabled={undoing}
              className="rounded-lg bg-sparrow-green px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {undoing ? 'Undoing…' : 'Undo all my changes'}
            </button>
            <button
              onClick={() => setRemovalWarning(null)}
              disabled={undoing}
              className="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-500/50 dark:text-amber-200 dark:hover:bg-amber-500/20"
            >
              Go back to the notes
            </button>
            <button
              onClick={() => void flushAndClose({ keepRemoval: true })}
              disabled={undoing}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-sparrow-gray hover:bg-sparrow-mist dark:text-sparrow-dark-gray dark:hover:bg-sparrow-dark-surface2"
            >
              Keep it this way and close
            </button>
          </div>
        </div>
      )}

      {closeError && (
        <div className="flex items-center justify-between gap-4 border-b border-priority-p1/30 bg-priority-p1/5 px-6 py-3">
          <p className="text-sm text-priority-p1">{closeError}</p>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => void flushAndClose()}
              className="rounded-lg border border-priority-p1/40 px-3 py-1.5 text-xs font-medium text-priority-p1 hover:bg-priority-p1/10"
            >
              Try again
            </button>
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
            >
              Close without saving
            </button>
          </div>
        </div>
      )}

      {/* Three-column notes area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Prep Notes */}
        <div className="flex flex-1 flex-col border-r border-sparrow-rule dark:border-sparrow-dark-border">
          <div className="flex items-center justify-between gap-3 border-b border-sparrow-rule dark:border-sparrow-dark-border bg-amber-50 dark:bg-amber-500/15 px-6 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Prep Notes</p>
              <p className="text-xs text-amber-600/70 dark:text-amber-400/70">Before the meeting · only visible to you</p>
            </div>
            <button
              onClick={() => setHistoryField('prep')}
              className="shrink-0 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-sparrow-dark-surface dark:text-amber-300 dark:hover:bg-amber-500/15"
            >
              Version history
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-amber-50/20 p-4 dark:bg-amber-500/10">
            <RichTextField
              key={`prep-${fieldKeys.prep}`}
              initialValue={initialContent.prep}
              onChange={handlePrepChange}
              toolbar
              minHeightRem={20}
              placeholder="Notes before the meeting…"
            />
          </div>
        </div>

        {/* Live Notes */}
        <div className="flex flex-1 flex-col border-r border-sparrow-rule dark:border-sparrow-dark-border">
          <div className="flex items-center justify-between gap-3 border-b border-sparrow-rule dark:border-sparrow-dark-border bg-green-50 dark:bg-green-500/15 px-6 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-green dark:text-sparrow-dark-green">Live Notes</p>
              <p className="text-xs text-sparrow-green/60 dark:text-sparrow-dark-green/60">During the meeting · only visible to you</p>
            </div>
            <button
              onClick={() => setHistoryField('live')}
              className="shrink-0 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-sparrow-green hover:bg-green-50 dark:border-green-500/30 dark:bg-sparrow-dark-surface dark:text-sparrow-dark-green dark:hover:bg-green-500/15"
            >
              Version history
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-green-50/20 p-4 dark:bg-green-500/10">
            <RichTextField
              key={`live-${fieldKeys.live}`}
              initialValue={initialContent.live}
              onChange={handleLiveChange}
              toolbar
              minHeightRem={20}
              placeholder="Notes during the meeting…"
            />
          </div>
        </div>

        {/* Shared Notes — live collaborative, unlike Prep/Live above */}
        <Suspense fallback={<div className="flex flex-1 items-center justify-center"><p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p></div>}>
          <SharedNotesEditor
            ref={sharedEditorRef}
            eventId={event.id}
            userId={userId}
            onStatusChange={setSharedStatus}
            eventTitle={event.title}
            eventSubtitle={`${dateLabel} · ${timeLabel}`}
          />
        </Suspense>
      </div>

      {historyField && (
        <SharedNotesVersionHistory
          eventId={event.id}
          eventTitle={event.title}
          eventSubtitle={`${dateLabel} · ${timeLabel}`}
          notesLabel={FIELD_LABEL[historyField]}
          isPrivate
          loadVersions={historyField === 'prep' ? loadPrepVersions : loadLiveVersions}
          onClose={() => setHistoryField(null)}
          onRestore={(v) => restorePrivateVersion(historyField, v)}
        />
      )}
    </div>
  );
}

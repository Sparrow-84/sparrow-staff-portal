import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  diffLines,
  fetchProfileNames,
  fetchSharedNoteVersions,
  htmlToLines,
  wordChange,
  type DiffLine,
  type SharedNoteVersion,
} from '@/lib/sharedNotesVersions';

interface Props {
  eventId: string;
  eventTitle?: string;
  eventSubtitle?: string;
  onClose: () => void;
  /** Puts this version's text back in the live Shared Notes for everyone, and saves. */
  onRestore: (version: SharedNoteVersion) => Promise<void>;
}

interface Row {
  version: SharedNoteVersion;
  dayLabel: string | null;
  time: string;
  who: string;
  change: string;
  tag: string | null;
  tagClass: string;
  lines: DiffLine[];
  empty: boolean;
  isCurrent: boolean;
}

const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const SHORT_DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabelFor(d: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return 'Today';
  if (dayKey(d) === dayKey(yesterday)) return `Yesterday · ${SHORT_DAY.format(d)}`;
  return DAY.format(d);
}

function timeRange(v: SharedNoteVersion): string {
  const start = new Date(v.started_at);
  const end = new Date(v.ended_at);
  if (end.getTime() - start.getTime() < 60_000) return TIME.format(end);
  return `${TIME.format(start)} – ${TIME.format(end)}`;
}

function listNames(ids: string[], names: Record<string, string>): string {
  const list = ids.map((id) => (names[id] ?? 'Someone').split(' ')[0]);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function about(n: number) {
  return `about ${n} word${n === 1 ? '' : 's'}`;
}

function buildRows(versions: SharedNoteVersion[], names: Record<string, string>): Row[] {
  let lastDay = '';
  return versions.map((v, i) => {
    const prev = versions[i + 1];
    const before = htmlToLines(prev?.notes ?? '');
    const after = htmlToLines(v.notes);
    const isSnapshot = v.kind !== 'session';
    const lines: DiffLine[] = isSnapshot ? after.map((l) => ({ ...l, status: 'same' })) : diffLines(before, after);

    let change: string;
    if (v.kind === 'before_big_removal') change = 'Copy kept right before a big removal';
    else if (v.kind === 'before_restore') change = 'Copy kept right before a restore';
    else if (v.kind === 'before_delete') change = 'Copy kept before the notes were deleted';
    else if (v.restored_from) {
      const source = versions.find((x) => x.id === v.restored_from);
      change = source ? `Restored the ${TIME.format(new Date(source.ended_at))} version` : 'Restored an earlier version';
    } else if (!prev) change = after.length ? `Started the notes · ${about(v.word_count)}` : 'Started the notes';
    else {
      const { added, removed } = wordChange(before, after);
      if (v.word_count === 0 && removed > 0) change = `Removed everything (${about(removed)})`;
      else if (added && removed) change = `${about(added)} added · ${about(removed)} removed`;
      else if (added) change = `${about(added)} added`;
      else if (removed) change = `${about(removed)} removed`;
      else change = 'Formatting changes only';
      change = change.charAt(0).toUpperCase() + change.slice(1);
    }

    const tag =
      v.kind === 'before_big_removal' ? 'Before big removal'
      : v.kind === 'before_restore' ? 'Before restore'
      : v.kind === 'before_delete' ? 'Before delete'
      : i === 0 ? 'Current'
      : null;
    const tagClass =
      tag === 'Current'
        ? 'bg-sparrow-sage text-sparrow-green dark:bg-sparrow-dark-green/20 dark:text-sparrow-dark-ink'
        : 'bg-sparrow-cream text-amber-800 dark:bg-amber-500/20 dark:text-amber-200';

    const d = new Date(v.ended_at);
    const key = dayKey(d);
    const dayLabel = key !== lastDay ? dayLabelFor(d) : null;
    lastDay = key;

    const editors = listNames(v.editors, names);
    const who = isSnapshot ? 'Saved automatically' : editors ? `Edited by ${editors}` : 'Edited';

    return {
      version: v,
      dayLabel,
      time: timeRange(v),
      who,
      change,
      tag,
      tagClass,
      lines,
      empty: !lines.some((l) => l.status !== 'removed'),
      isCurrent: i === 0,
    };
  });
}

export function SharedNotesVersionHistory({ eventId, eventTitle, eventSubtitle, onClose, onRestore }: Props) {
  const [versions, setVersions] = useState<SharedNoteVersion[] | null | undefined>(undefined);
  const [names, setNames] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const vs = await fetchSharedNoteVersions(eventId);
      setVersions(vs);
      if (vs) setNames(await fetchProfileNames(vs.flatMap((v) => v.editors)));
      return vs;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load version history');
      setVersions([]);
      return [];
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = useMemo(() => (versions ? buildRows(versions, names) : []), [versions, names]);
  const selected = rows.find((r) => r.version.id === selectedId) ?? rows[0];

  function pick(id: string) {
    setSelectedId(id);
    setConfirming(false);
    setRestored(false);
    setError(null);
  }

  async function confirmRestore() {
    if (!selected) return;
    setRestoring(true);
    setError(null);
    try {
      await onRestore(selected.version);
      const vs = await load();
      setSelectedId(vs?.[0]?.id ?? null);
      setRestored(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setRestoring(false);
      setConfirming(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-sparrow-dark-surface" role="dialog" aria-modal="true" aria-label="Shared Notes version history">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sparrow-rule px-6 py-4 dark:border-sparrow-dark-border">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Shared Notes · Version history</p>
          {eventTitle && <h1 className="truncate text-lg font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{eventTitle}</h1>}
          {eventSubtitle && <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{eventSubtitle}</p>}
        </div>
        <button
          onClick={onClose}
          className="rounded-xl border border-sparrow-rule px-4 py-2 text-sm font-medium text-sparrow-ink hover:bg-sparrow-mist dark:border-sparrow-dark-border dark:text-sparrow-dark-ink dark:hover:bg-sparrow-dark-surface2"
        >
          ‹ Back to notes
        </button>
      </div>

      {versions === undefined ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
        </div>
      ) : versions === null ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Version history isn't switched on yet.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{error ?? 'No versions yet. They start once someone writes in Shared Notes.'}</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Selected version */}
          <div className="order-2 min-h-0 min-w-0 flex-1 overflow-y-auto p-6 md:order-1">
            {selected && (
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">
                      {(selected.dayLabel ?? dayLabelFor(new Date(selected.version.ended_at))).split(' · ')[0]}, {selected.time}
                    </p>
                    <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{selected.who} · {selected.change}</p>
                  </div>
                  {selected.isCurrent ? (
                    <span className="rounded-full bg-sparrow-sage px-3 py-1 text-sm font-semibold text-sparrow-green dark:bg-sparrow-dark-green/20 dark:text-sparrow-dark-ink">
                      What everyone sees now
                    </span>
                  ) : (
                    !confirming && (
                      <button
                        onClick={() => setConfirming(true)}
                        className="rounded-xl bg-sparrow-green px-5 py-2.5 text-sm font-semibold text-white hover:bg-sparrow-green-dark"
                      >
                        Restore this version
                      </button>
                    )
                  )}
                </div>

                {confirming && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sparrow-gold bg-sparrow-cream px-4 py-3 dark:bg-amber-500/10">
                    <p className="flex-1 text-sm text-sparrow-ink dark:text-sparrow-dark-ink" style={{ minWidth: 240 }}>
                      Replace the notes with this version for everyone? The current notes are saved as a version first.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirming(false)}
                        disabled={restoring}
                        className="rounded-xl border border-sparrow-rule bg-white px-4 py-2 text-sm font-medium text-sparrow-ink hover:bg-sparrow-mist dark:border-sparrow-dark-border dark:bg-sparrow-dark-surface dark:text-sparrow-dark-ink"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => void confirmRestore()}
                        disabled={restoring}
                        className="rounded-xl bg-sparrow-green px-4 py-2 text-sm font-semibold text-white hover:bg-sparrow-green-dark disabled:opacity-60"
                      >
                        {restoring ? 'Restoring…' : 'Restore'}
                      </button>
                    </div>
                  </div>
                )}

                {restored && (
                  <div className="rounded-xl bg-sparrow-sage px-4 py-3 text-sm font-medium text-sparrow-green dark:bg-sparrow-dark-green/20 dark:text-sparrow-dark-ink">
                    Restored. The notes everyone sees now match that version.
                  </div>
                )}
                {error && <p className="text-sm text-priority-p1">{error}</p>}

                {!selected.version.kind.startsWith('before_') && selected.lines.some((l) => l.status !== 'same') && (
                  <div className="flex flex-wrap gap-4 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                    <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-green-300 bg-green-100 dark:border-green-700 dark:bg-green-500/25" />Added in this version</span>
                    <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-red-300 bg-red-100 dark:border-red-700 dark:bg-red-500/25" />Removed in this version</span>
                  </div>
                )}

                <div className="flex flex-col gap-1.5 rounded-xl border border-sparrow-rule p-5 text-sm leading-relaxed text-sparrow-ink dark:border-sparrow-dark-border dark:text-sparrow-dark-ink">
                  {selected.lines.map((l, i) => {
                    const tone =
                      l.status === 'added' ? 'bg-green-100 dark:bg-green-500/25'
                      : l.status === 'removed' ? 'bg-red-100 text-red-900 line-through dark:bg-red-500/25 dark:text-red-200'
                      : '';
                    return (
                      <p key={i} className={`rounded px-1.5 py-0.5 ${tone} ${l.kind === 'head' ? 'mt-1 font-semibold' : ''} ${l.kind === 'item' ? 'pl-5' : ''}`}>
                        {l.kind === 'item' ? '• ' : ''}{l.text}
                      </p>
                    );
                  })}
                  {selected.empty && <p className="italic text-sparrow-gray dark:text-sparrow-dark-gray">(The notes are empty in this version.)</p>}
                </div>
              </div>
            )}
          </div>

          {/* Version list */}
          <div className="order-1 max-h-[40vh] shrink-0 overflow-y-auto border-b border-sparrow-rule bg-sparrow-mist p-4 dark:border-sparrow-dark-border dark:bg-sparrow-dark-surface2 md:order-2 md:max-h-none md:w-96 md:border-b-0 md:border-l">
            <p className="mb-2 px-2 text-xs font-semibold text-sparrow-gray dark:text-sparrow-dark-gray">Versions</p>
            <div className="flex flex-col gap-2">
              {rows.map((r) => {
                const on = r.version.id === selected?.version.id;
                return (
                  <div key={r.version.id}>
                    {r.dayLabel && (
                      <p className="mb-1 mt-3 px-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">{r.dayLabel}</p>
                    )}
                    <button
                      onClick={() => pick(r.version.id)}
                      className={`flex w-full flex-col gap-1 rounded-xl bg-white px-3.5 py-3 text-left dark:bg-sparrow-dark-surface ${
                        on ? 'border-2 border-sparrow-green dark:border-sparrow-dark-green' : 'border border-sparrow-rule dark:border-sparrow-dark-border'
                      }`}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{r.time}</span>
                        {r.tag && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.tagClass}`}>{r.tag}</span>}
                      </span>
                      <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{r.who}</span>
                      <span className="text-xs text-sparrow-ink dark:text-sparrow-dark-ink">{r.change}</span>
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 px-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              Older than 30 days: one version per day is kept, plus any “before” copies.
            </p>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

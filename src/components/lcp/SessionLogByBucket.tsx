import { useEffect, useState } from 'react';
import { MONDAY_BUCKETS, MONDAY_BUCKET_LABEL, type Family, type MondayBucket, type StaffNoteWithSession } from '@/lib/lcp-types';
import { fetchNotesByBucket } from '@/lib/lcp';
import { dayLabel } from '@/lib/lcp-format';
import { BucketNoteCard } from './SessionLogByParticipant';

// Active-row color matches that bucket's own color everywhere else in the app
// (Monday filing panel, badges) — not the generic green "selected" highlight.
const BUCKET_ACTIVE_ROW: Record<MondayBucket, string> = {
  finance: 'bg-[#2F6B4F]/10 border-l-[#2F6B4F]',
  life_skills: 'bg-[#B8790A]/10 border-l-[#B8790A]',
  mentoring: 'bg-[#7A5980]/[0.12] border-l-[#7A5980]',
};

export function SessionLogByBucket({ families }: { families: Family[] }) {
  const [selected, setSelected] = useState<MondayBucket>('finance');
  const [notes, setNotes] = useState<StaffNoteWithSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastLogged, setLastLogged] = useState<Record<MondayBucket, string | null>>({
    finance: null,
    life_skills: null,
    mentoring: null,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchNotesByBucket(selected).then((ns) => {
      if (cancelled) return;
      setNotes(ns);
      setLoading(false);
      setLastLogged((prev) => ({ ...prev, [selected]: ns[0] ? dayLabel(ns[0].created_at) : 'Never' }));
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="grid gap-3 sm:grid-cols-[15rem_1fr]">
      <div className="overflow-hidden rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
        {MONDAY_BUCKETS.map((bucket) => (
          <button
            key={bucket}
            onClick={() => setSelected(bucket)}
            className={`block w-full border-t border-l-4 border-sparrow-rule dark:border-sparrow-dark-border px-3.5 py-3 text-left text-sm first:border-t-0 ${
              bucket === selected ? BUCKET_ACTIVE_ROW[bucket] : 'border-l-transparent hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2'
            }`}
          >
            <p className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{MONDAY_BUCKET_LABEL[bucket]}</p>
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Last logged {lastLogged[bucket] ?? '…'}</p>
          </button>
        ))}
      </div>

      <div className="min-h-[20rem] rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4">
        <h3 className="mb-2 font-serif text-lg font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{MONDAY_BUCKET_LABEL[selected]}</h3>
        {loading ? (
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No notes yet.</p>
        ) : (
          notes.map((n) => <BucketNoteCard key={n.id} note={n} families={families} />)
        )}
      </div>
    </div>
  );
}

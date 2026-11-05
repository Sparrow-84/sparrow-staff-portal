import { useState } from 'react';
import { CHECKED_HOW_LABEL, freshness, relativeAge, type CheckedHow } from '@/lib/resident-services';

const TONE: Record<ReturnType<typeof freshness>, string> = {
  fresh: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  aging: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  stale: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  never: 'bg-sparrow-mist text-sparrow-gray dark:bg-sparrow-dark-surface2 dark:text-sparrow-dark-gray',
};

/** "Checked Mar 2, 2024 by … · 20 months ago" -- green under 9 months, amber to 18, red after. */
export function FreshnessStamp({
  checkedAt,
  checkedBy,
  how,
  nameFor,
}: {
  checkedAt: string | null;
  checkedBy: string | null;
  how?: CheckedHow | null;
  nameFor: (id: string | null) => string | null;
}) {
  const tone = freshness(checkedAt);
  if (!checkedAt) {
    return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${TONE.never}`}>Never checked</span>;
  }
  const who = nameFor(checkedBy);
  const date = new Date(checkedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${TONE[tone]}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      Checked {date}{who ? ` by ${who}` : ''}{how && how !== 'edited' ? ` (${CHECKED_HOW_LABEL[how]})` : ''} · {relativeAge(checkedAt)}
    </span>
  );
}

/** How-did-you-check picker + "Still correct": restamps without changing anything. */
export function StillCorrectButton({
  onConfirm,
  label = '✓ Still correct',
  disabled = false,
  primary = false,
}: {
  onConfirm: (how: Exclude<CheckedHow, 'edited'>) => Promise<void>;
  label?: string;
  disabled?: boolean;
  primary?: boolean;
}) {
  const [how, setHow] = useState<Exclude<CheckedHow, 'edited'>>('called');
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <select
        value={how}
        onChange={(e) => setHow(e.target.value as Exclude<CheckedHow, 'edited'>)}
        aria-label="How did you check?"
        className="rounded-md border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-1.5 py-1 text-xs"
      >
        <option value="called">Called them</option>
        <option value="website">Their website</option>
        <option value="in_person">In person</option>
      </select>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={async () => { setBusy(true); try { await onConfirm(how); } finally { setBusy(false); } }}
        className={primary ? 'btn-primary px-3 py-1.5 text-sm' : 'btn-secondary px-2.5 py-1 text-xs'}
      >
        {busy ? 'Saving…' : label}
      </button>
    </span>
  );
}

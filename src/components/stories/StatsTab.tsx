import type { Stat, StatLabel } from '@/lib/stats';
import { LABEL_COLORS } from '@/components/LabelPill';

interface Props {
  stats: Stat[];
  statLabels: StatLabel[];
  onAdd: () => void;
  onEdit: (stat: Stat) => void;
}

function labelPillClass(labels: StatLabel[], name: string): string {
  const color = labels.find((l) => l.name === name)?.color;
  return LABEL_COLORS.find((c) => c.id === color)?.pill ?? 'bg-sparrow-sage dark:bg-sparrow-green/15 text-sparrow-green dark:text-sparrow-dark-green';
}

export function StatsTab({ stats, statLabels, onAdd, onEdit }: Props) {
  return (
    <div>
      {/* Rules box */}
      <div className="rounded-xl border border-sparrow-gold/30 bg-sparrow-cream dark:bg-sparrow-dark-surface2 px-4 py-3 text-sm">
        <p className="font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">Verify before you add a stat</p>
        <ul className="mt-2 space-y-1 text-sparrow-gray dark:text-sparrow-dark-gray">
          <li>
            <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Verbatim only</span> — the exact number and
            wording, copied straight from the source. Don't round, paraphrase, or "clean up" the phrasing.
          </li>
          <li>
            <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Source is required</span> — publisher,
            report name, and date. Sources are nearly impossible to track down after the fact, so capture it now, not later.
          </li>
          <li>
            <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Mark it Verified</span> once you've
            confirmed the wording and source are exactly right — only verified stats should be pulled into a presentation,
            website copy, or collateral.
          </li>
        </ul>
        <p className="mt-2 border-t border-sparrow-gold/30 pt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
          Stats change over time — if a number gets outdated, add the new one as a fresh entry rather than editing the old
          figure in place, so anything already published still matches what was true when it was used.
        </p>
      </div>

      {/* Header row */}
      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          {stats.length} {stats.length === 1 ? 'stat' : 'stats'}
        </p>
        <button onClick={onAdd} className="btn-primary">
          + Add stat
        </button>
      </div>

      {/* Stat list */}
      {stats.length === 0 ? (
        <p className="mt-6 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          No stats yet. Add the first one to get started.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-sparrow-rule dark:divide-sparrow-dark-border rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
          {stats.map((s) => (
            <button
              key={s.id}
              onClick={() => onEdit(s)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-sparrow-mist/50"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{s.stat_text}</p>
                <p className="mt-0.5 truncate text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                  {s.source_publisher} · {s.source_report_name}
                  {s.source_date ? ` (${s.source_date})` : ''}
                  {s.logged_by_name ? ` · logged by ${s.logged_by_name}` : ''}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      s.verified
                        ? 'bg-sparrow-sage dark:bg-sparrow-green/15 text-sparrow-green dark:text-sparrow-dark-green'
                        : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray'
                    }`}
                  >
                    {s.verified ? '✓ Verified' : 'Unverified'}
                  </span>
                  {s.labels.map((label) => (
                    <span
                      key={label}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${labelPillClass(statLabels, label)}`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 text-sparrow-gray dark:text-sparrow-dark-gray">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

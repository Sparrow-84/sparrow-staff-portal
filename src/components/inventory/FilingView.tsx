import { useState, useEffect, useCallback } from 'react';
import {
  fetchFilingData, markFiled,
  type FilingItem,
} from '@/lib/inventory';
import {
  BENTON_SCHEDULE_LABELS, FILING_STATUS_META, formatCost,
  type InvBentonSchedule, type InvFilingStatus,
} from '@/lib/inventory-types';
import { BatchTalliesSection } from './BatchTalliesSection';

const TAXABLE_SCHEDULES: InvBentonSchedule[] = ['schedule_5a', 'schedule_5b', 'schedule_4'];

const FILING_STATUS_ORDER: Record<InvFilingStatus, number> = {
  added: 0, updated: 1, not_filed: 2, carried_over: 3,
};

function sortItems(items: FilingItem[]): FilingItem[] {
  return [...items].sort((a, b) => {
    const order = FILING_STATUS_ORDER[a.filing_status] - FILING_STATUS_ORDER[b.filing_status];
    if (order !== 0) return order;
    return a.description.localeCompare(b.description);
  });
}

// ── Info button ───────────────────────────────────────────────────────────

function InfoButton({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="ml-1.5 text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink transition text-sm leading-none"
        aria-label="More information"
      >
        ⓘ
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 w-72 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3 shadow-lg">
            <div className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray leading-relaxed space-y-1.5">
              {children}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-2.5 text-xs text-sparrow-green dark:text-sparrow-dark-green font-medium"
            >
              Got it
            </button>
          </div>
        </>
      )}
    </span>
  );
}

// ── Schedule info content ─────────────────────────────────────────────────

const SCHEDULE_INFO: Partial<Record<InvBentonSchedule, React.ReactNode>> = {
  schedule_5a: (
    <>
      <p><strong>Schedule 5A — All other taxable personal property.</strong></p>
      <p>Furniture, equipment, electronics, and anything not listed in another schedule. Items $50 or more are listed individually with description, year acquired, and value.</p>
      <p>Batch items (similar items all under $50) are grouped by category and tracked in the Batch Tallies section above.</p>
      <p className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Do not include:</p>
      <ul className="list-disc pl-4 space-y-0.5">
        <li>Consumable supplies — paper, cleaning products, etc. (those go in the Consumables tab)</li>
        <li>Software or subscriptions</li>
        <li>Items permanently attached to buildings</li>
        <li>Licensed vehicles</li>
        <li>Personal items belonging to staff</li>
        <li>Items owned by residents or participants</li>
        <li>Church-owned items (unless formally donated to Sparrow)</li>
      </ul>
    </>
  ),
  schedule_5b: (
    <>
      <p><strong>Schedule 5B — Small hand tools and non-power tools.</strong></p>
      <p>Report as a single estimated total value — no individual listing needed.</p>
      <p>Any tool $50 or more, or any power tool, goes in Schedule 5A instead as an individual item.</p>
      <p>The total is tracked in the Batch Tallies section. The items that appear here are the underlying register records for those tools.</p>
    </>
  ),
  schedule_4: (
    <>
      <p><strong>Schedule 4 — Professional libraries.</strong></p>
      <p>For libraries held by accountants, architects, attorneys, doctors, and other technical professionals.</p>
      <p>Sparrow's general books do not qualify — they go in Schedule 5A. This schedule is available here for any edge case that does apply.</p>
    </>
  ),
};

// ── Item row ──────────────────────────────────────────────────────────────

function FilingItemRow({ item }: { item: FilingItem }) {
  const meta = FILING_STATUS_META[item.filing_status];
  const yearAcquired = item.acquired_date ? item.acquired_date.slice(0, 4) : null;
  const totalValue = item.unit_cost * item.quantity;

  return (
    <tr className="border-b border-sparrow-rule dark:border-sparrow-dark-border last:border-0 hover:bg-sparrow-mist/40 transition-colors">
      <td className="py-2.5 pr-3 pl-4">
        <div className="flex items-start gap-2">
          <span className={`shrink-0 mt-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${meta.chip}`}>
            {meta.label}
          </span>
          <div className="min-w-0">
            <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink leading-snug">
              {item.filed_as ?? item.description}
            </p>
            {item.filed_as && item.filed_as !== item.description && (
              <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">internal: {item.description}</p>
            )}
            {item.who_has_it && (
              <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">off-site: {item.who_has_it}</p>
            )}
            {item.review_flag && (
              <p className="text-xs text-sparrow-gold mt-0.5">⚠ {item.review_flag}</p>
            )}
            {item.notes && (
              <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray mt-0.5">{item.notes}</p>
            )}
          </div>
        </div>
      </td>

      <td className="py-2.5 pr-3 text-xs text-sparrow-gray dark:text-sparrow-dark-gray whitespace-nowrap">
        {item.location.name}
        {item.sub_location && (
          <span className="block text-sparrow-rule dark:text-sparrow-dark-border-dark">{item.sub_location.name}</span>
        )}
      </td>

      <td className="py-2.5 pr-3 text-xs text-sparrow-gray dark:text-sparrow-dark-gray whitespace-nowrap text-right">
        {item.quantity > 1 && <span>{item.quantity} × </span>}
        {formatCost(item.unit_cost)}
        {item.quantity > 1 && (
          <span className="block text-sparrow-ink dark:text-sparrow-dark-ink font-medium">{formatCost(totalValue)}</span>
        )}
      </td>

      <td className="py-2.5 pr-4 text-xs text-sparrow-gray dark:text-sparrow-dark-gray whitespace-nowrap">
        {yearAcquired ?? '—'}
      </td>
    </tr>
  );
}

const SCHEDULE_HEADING: Record<InvBentonSchedule, { bg: string; text: string; count: string }> = {
  schedule_2:  { bg: 'bg-sparrow-mist dark:bg-sparrow-dark-surface2',       text: 'text-sparrow-gray dark:text-sparrow-dark-gray',  count: 'text-sparrow-gray dark:text-sparrow-dark-gray' },
  schedule_4:  { bg: 'bg-priority-p1/10',      text: 'text-priority-p1',   count: 'text-priority-p1/70' },
  schedule_5a: { bg: 'bg-sparrow-gold/10',     text: 'text-sparrow-gold',  count: 'text-sparrow-gold/70' },
  schedule_5b: { bg: 'bg-sparrow-mist dark:bg-sparrow-dark-surface2',        text: 'text-sparrow-ink dark:text-sparrow-dark-ink',   count: 'text-sparrow-gray dark:text-sparrow-dark-gray' },
};

// ── Schedule section ──────────────────────────────────────────────────────

function ScheduleSection({ schedule, items }: { schedule: InvBentonSchedule; items: FilingItem[] }) {
  const sorted = sortItems(items);
  const totalValue = items.reduce((sum, i) => sum + i.unit_cost * i.quantity, 0);
  const addedCount   = items.filter(i => i.filing_status === 'added').length;
  const updatedCount = items.filter(i => i.filing_status === 'updated').length;
  const h = SCHEDULE_HEADING[schedule];

  return (
    <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface overflow-hidden mb-4">
      <div className={`flex items-center justify-between gap-4 border-b border-sparrow-rule dark:border-sparrow-dark-border px-4 py-2.5 ${h.bg}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold uppercase tracking-wide ${h.text}`}>
            {BENTON_SCHEDULE_LABELS[schedule]}
          </span>
          <span className={`text-xs ${h.count}`}>({items.length})</span>
          {SCHEDULE_INFO[schedule] && (
            <InfoButton>{SCHEDULE_INFO[schedule]}</InfoButton>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {addedCount > 0 && (
            <span className="text-xs text-sparrow-green dark:text-sparrow-dark-green font-medium">+{addedCount} new</span>
          )}
          {updatedCount > 0 && (
            <span className="text-xs text-sparrow-gold font-medium">{updatedCount} updated</span>
          )}
          <span className="text-xs font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{formatCost(totalValue)} total</span>
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-sparrow-rule dark:border-sparrow-dark-border">
            <th className="py-2 pl-4 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Item</th>
            <th className="py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Location</th>
            <th className="py-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Value</th>
            <th className="py-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Year</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <FilingItemRow key={item.id} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── County contact ────────────────────────────────────────────────────────

function CountyContact() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist/40 transition"
      >
        <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Questions? Benton County Assessor</span>
        <span className="text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border px-4 py-3 text-xs text-sparrow-gray dark:text-sparrow-dark-gray space-y-1.5">
          <p>
            <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Website: </span>
            <a
              href="https://assessment.bentoncountyor.gov/business-personal-property/"
              target="_blank"
              rel="noreferrer"
              className="text-sparrow-green dark:text-sparrow-dark-green underline"
            >
              assessment.bentoncountyor.gov
            </a>
          </p>
          <p>
            <span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Email: </span>
            <a href="mailto:Personal.Property@bentoncountyor.gov" className="text-sparrow-green dark:text-sparrow-dark-green underline">
              Personal.Property@bentoncountyor.gov
            </a>
          </p>
          <p><span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Phone: </span>(541) 766-6269</p>
          <p><span className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Hours: </span>Mon–Fri 8:00 AM – 5:00 PM</p>
        </div>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────

export function FilingView() {
  const [items, setItems] = useState<FilingItem[]>([]);
  const [removedItems, setRemovedItems] = useState<FilingItem[]>([]);
  const [lastFiling, setLastFiling] = useState<{ year: number; filed_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [filingYear, setFilingYear] = useState(new Date().getFullYear());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markedCount, setMarkedCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const { activeItems, removedSinceLastFiling, lastFiling: lf } = await fetchFilingData();
      setItems(activeItems);
      setRemovedItems(removedSinceLastFiling);
      setLastFiling(lf);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load filing data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleMarkFiled() {
    setMarking(true);
    try {
      const count = await markFiled(filingYear);
      setMarkedCount(count);
      setConfirmOpen(false);
      void load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not mark as filed.');
      setConfirmOpen(false);
    } finally {
      setMarking(false);
    }
  }

  // Summary counts
  const addedCount    = items.filter(i => i.filing_status === 'added').length;
  const updatedCount  = items.filter(i => i.filing_status === 'updated').length;
  const onFileCount   = items.filter(i => i.filing_status === 'carried_over').length;
  const notFiledCount = items.filter(i => i.filing_status === 'not_filed').length;
  const totalActive   = items.length;
  const needsAction   = addedCount + updatedCount + notFiledCount;

  // Individual items only (batch items tracked in BatchTalliesSection)
  const bySchedule: Partial<Record<InvBentonSchedule, FilingItem[]>> = {};
  for (const item of items) {
    if (item.benton_schedule === 'schedule_2') continue;
    if (item.is_batch) continue;
    if (!bySchedule[item.benton_schedule]) bySchedule[item.benton_schedule] = [];
    bySchedule[item.benton_schedule]!.push(item);
  }

  // March 15 deadline indicator
  const now = new Date();
  const currentYear = now.getFullYear();
  const deadline = new Date(currentYear, 2, 15); // March 15
  const daysToDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const showDeadlineBanner = daysToDeadline >= 0 && daysToDeadline <= 60;
  const deadlineUrgent = daysToDeadline <= 14;

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-sparrow-gray dark:text-sparrow-dark-gray text-sm">Loading…</div>;
  }

  if (err) {
    return <p className="p-4 text-sm text-priority-p1">{err}</p>;
  }

  return (
    <div className="space-y-5">

      {/* March 15 deadline banner */}
      {showDeadlineBanner && (
        <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 ${
          deadlineUrgent
            ? 'border-priority-p1/30 bg-priority-p1/5'
            : 'border-sparrow-gold/30 bg-sparrow-gold/5'
        }`}>
          <div className="text-sm">
            <span className={`font-medium ${deadlineUrgent ? 'text-priority-p1' : 'text-sparrow-gold'}`}>
              Benton County filing deadline: March 15
            </span>
            <span className="text-sparrow-gray dark:text-sparrow-dark-gray ml-2">
              ({daysToDeadline === 0 ? 'today' : `${daysToDeadline} day${daysToDeadline !== 1 ? 's' : ''} away`})
            </span>
          </div>
          <InfoButton>
            <p><strong>Assessment date:</strong> January 1 at 1:00 AM — your return must reflect what you owned at that moment.</p>
            <p><strong>Filing deadline:</strong> March 15.</p>
            <p className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Late penalties:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>5% if filed by June 1</li>
              <li>25% if filed by August 1</li>
              <li>50% if filed after August 1</li>
            </ul>
          </InfoButton>
        </div>
      )}

      {/* Summary + action bar */}
      <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-4 py-3.5 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-4 flex-1 text-sm">
          {addedCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sparrow-green" />
              <span className="font-medium text-sparrow-green dark:text-sparrow-dark-green">{addedCount} new</span>
            </span>
          )}
          {updatedCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sparrow-gold" />
              <span className="font-medium text-sparrow-gold">{updatedCount} updated</span>
            </span>
          )}
          {removedItems.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-priority-p1" />
              <span className="font-medium text-priority-p1">{removedItems.length} removed</span>
            </span>
          )}
          {onFileCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sparrow-rule dark:bg-sparrow-dark-border" />
              <span className="text-sparrow-gray dark:text-sparrow-dark-gray">{onFileCount} on file</span>
            </span>
          )}
          {totalActive === 0 && (
            <span className="text-sparrow-gray dark:text-sparrow-dark-gray">No items in register yet</span>
          )}
        </div>

        {lastFiling && (
          <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray shrink-0">
            Last filed: {lastFiling.year} ({new Date(lastFiling.filed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
          </span>
        )}

        {needsAction > 0 && !confirmOpen && (
          <button
            onClick={() => setConfirmOpen(true)}
            className="shrink-0 rounded-lg bg-sparrow-green px-3.5 py-1.5 text-sm font-medium text-white hover:bg-sparrow-green/90 transition"
          >
            Mark as Filed →
          </button>
        )}
      </div>

      {/* Mark-as-filed confirmation */}
      {confirmOpen && (
        <div className="rounded-xl border border-sparrow-green/30 bg-sparrow-green/5 px-4 py-3.5">
          <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink mb-1">Mark Benton County filing as complete</p>
          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray mb-3">
            This will mark all {addedCount + updatedCount} new/updated items as "on file." It won't affect the register — only the filing status labels.
          </p>
          <div className="flex items-center gap-3">
            <label className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Filing year</label>
            <input
              type="number"
              value={filingYear}
              onChange={(e) => setFilingYear(Number(e.target.value))}
              min={2020}
              max={2030}
              className="w-20 rounded border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-2 py-1 text-sm text-sparrow-ink dark:text-sparrow-dark-ink focus:outline-none focus:ring-1 focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
            />
            <button
              onClick={() => void handleMarkFiled()}
              disabled={marking}
              className="rounded-lg bg-sparrow-green px-3.5 py-1.5 text-sm font-medium text-white hover:bg-sparrow-green/90 transition disabled:opacity-50"
            >
              {marking ? 'Saving…' : `Confirm — Mark ${filingYear} as Filed`}
            </button>
            <button onClick={() => setConfirmOpen(false)} className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Success */}
      {markedCount !== null && (
        <div className="rounded-xl border border-sparrow-green/20 bg-sparrow-green/5 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-sparrow-green dark:text-sparrow-dark-green">
            {markedCount} item{markedCount !== 1 ? 's' : ''} marked as on file for {filingYear}.
          </p>
          <button onClick={() => setMarkedCount(null)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
            Dismiss
          </button>
        </div>
      )}

      {/* Batch category tallies */}
      <BatchTalliesSection year={filingYear} />

      {/* Individual item schedule sections */}
      {TAXABLE_SCHEDULES.map((sched) => {
        const group = bySchedule[sched];
        if (!group || group.length === 0) return null;
        return (
          <ScheduleSection key={sched} schedule={sched} items={group} />
        );
      })}

      {totalActive === 0 && (
        <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-8 text-center">
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            No items in the register yet. Items appear here once monthly submissions are approved.
          </p>
        </div>
      )}

      {/* Removed since last filing */}
      {removedItems.length > 0 && (
        <div className="rounded-xl border border-priority-p1/20 bg-white dark:bg-sparrow-dark-surface overflow-hidden">
          <div className="flex items-center gap-2 border-b border-priority-p1/20 px-4 py-2.5 bg-priority-p1/5">
            <span className="text-xs font-semibold uppercase tracking-wide text-priority-p1">
              Removed Since Last Filing
            </span>
            <span className="text-xs text-priority-p1">({removedItems.length})</span>
          </div>
          <table className="w-full">
            <tbody>
              {removedItems.map((item) => (
                <tr key={item.id} className="border-b border-sparrow-rule dark:border-sparrow-dark-border last:border-0">
                  <td className="py-2.5 pl-4 pr-3">
                    <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{item.filed_as ?? item.description}</p>
                    {item.location && (
                      <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{item.location.name}</p>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-sparrow-gray dark:text-sparrow-dark-gray whitespace-nowrap">
                    Removed {item.removed_date ? new Date(item.removed_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-sparrow-gray dark:text-sparrow-dark-gray whitespace-nowrap">
                    {formatCost(item.unit_cost * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="space-y-3 pb-2">
        <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray text-center">
          Schedule 2 (consumables estimates) are managed in the Consumables tab.
        </p>
        <CountyContact />
      </div>

    </div>
  );
}

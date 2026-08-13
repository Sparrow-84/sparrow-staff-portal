import { Fragment, useMemo, useState } from 'react';
import type { RegisterItem, ItemEditPatch } from '@/lib/inventory';
import {
  formatCost, BENTON_SCHEDULE_SHORT, FILING_STATUS_META,
} from '@/lib/inventory-types';
import { ItemEditPanel } from './AssetRegisterView';

type SortKey =
  | 'schedule' | 'description' | 'location' | 'serial' | 'condition'
  | 'donated' | 'year' | 'qty' | 'cost_each' | 'total' | 'filing_status' | 'status' | 'flag';
type SortDir = 'asc' | 'desc';

const FILING_ORDER: Record<string, number> = { not_filed: 0, added: 1, updated: 2, carried_over: 3 };

function locationLabel(item: RegisterItem): string {
  return item.sub_location ? `${item.location.name} — ${item.sub_location.name}` : item.location.name;
}

function yearOf(item: RegisterItem): number | null {
  return item.acquired_date ? Number(item.acquired_date.slice(0, 4)) : null;
}

function compare(a: RegisterItem, b: RegisterItem, key: SortKey): number {
  switch (key) {
    case 'schedule':
      return a.benton_schedule.localeCompare(b.benton_schedule);
    case 'description':
      return a.description.localeCompare(b.description);
    case 'location': {
      const locDiff = a.location.sort_order - b.location.sort_order;
      if (locDiff !== 0) return locDiff;
      return (a.sub_location?.name ?? '').localeCompare(b.sub_location?.name ?? '');
    }
    case 'serial':
      return (a.serial_number ?? '').localeCompare(b.serial_number ?? '');
    case 'condition':
      return a.condition.localeCompare(b.condition);
    case 'donated':
      return Number(a.is_donated) - Number(b.is_donated);
    case 'year': {
      const ay = yearOf(a); const by = yearOf(b);
      if (ay === null && by === null) return 0;
      if (ay === null) return 1;
      if (by === null) return -1;
      return ay - by;
    }
    case 'qty':
      return a.quantity - b.quantity;
    case 'cost_each':
      return a.unit_cost - b.unit_cost;
    case 'total':
      return a.unit_cost * a.quantity - b.unit_cost * b.quantity;
    case 'filing_status':
      return (FILING_ORDER[a.filing_status] ?? 0) - (FILING_ORDER[b.filing_status] ?? 0);
    case 'status':
      return a.status.localeCompare(b.status);
    case 'flag':
      return Number(!!a.review_flag) - Number(!!b.review_flag);
    default:
      return 0;
  }
}

const COLUMNS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'description', label: 'Description' },
  { key: 'location', label: 'Location' },
  { key: 'serial', label: 'Serial / model #' },
  { key: 'condition', label: 'Condition' },
  { key: 'donated', label: 'Donated' },
  { key: 'year', label: 'Year acq.', align: 'right' },
  { key: 'qty', label: 'Qty', align: 'right' },
  { key: 'cost_each', label: 'Cost ea.', align: 'right' },
  { key: 'total', label: 'Total', align: 'right' },
  { key: 'filing_status', label: 'Filing status' },
  { key: 'status', label: 'Status' },
  { key: 'flag', label: 'Flag' },
];

export function RegisterTableView({
  items,
  onSave,
}: {
  items: RegisterItem[];
  onSave: (id: string, patch: ItemEditPatch) => Promise<void>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('location');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleHeaderClick(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const primary = compare(a, b, sortKey) * dir;
      if (primary !== 0) return primary;
      // Always tie-break alphabetically so equal-value rows don't jitter.
      return a.description.localeCompare(b.description);
    });
  }, [items, sortKey, sortDir]);

  const thBase = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray whitespace-nowrap cursor-pointer select-none hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink transition';
  const tdBase = 'px-3 py-2 text-sm text-sparrow-ink dark:text-sparrow-dark-ink whitespace-nowrap';

  return (
    <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-sparrow-green/10 sticky top-0 z-10">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleHeaderClick(col.key)}
                  className={`${thBase} ${col.align === 'right' ? 'text-right' : ''}`}
                >
                  {col.label}{' '}
                  {sortKey === col.key && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const filingMeta = FILING_STATUS_META[item.filing_status];
              const isExpanded = expandedId === item.id;
              return (
                <Fragment key={item.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className={`border-t border-sparrow-rule dark:border-sparrow-dark-border cursor-pointer transition ${
                      item.status === 'removed' ? 'opacity-50' : ''
                    } ${isExpanded ? 'bg-sparrow-mist/50 dark:bg-sparrow-dark-surface2' : 'hover:bg-sparrow-mist/30 dark:hover:bg-sparrow-dark-surface2/60'}`}
                  >
                    <td className={tdBase}>{BENTON_SCHEDULE_SHORT[item.benton_schedule]}</td>
                    <td className={tdBase}>{item.description}</td>
                    <td className={tdBase}>{locationLabel(item)}</td>
                    <td className={tdBase}>{item.serial_number ?? '—'}</td>
                    <td className={`${tdBase} capitalize`}>{item.condition}</td>
                    <td className={tdBase}>{item.is_donated ? 'Yes' : 'No'}</td>
                    <td className={`${tdBase} text-right`}>{yearOf(item) ?? '—'}</td>
                    <td className={`${tdBase} text-right`}>{item.quantity}</td>
                    <td className={`${tdBase} text-right`}>{formatCost(item.unit_cost)}</td>
                    <td className={`${tdBase} text-right font-medium`}>{formatCost(item.unit_cost * item.quantity)}</td>
                    <td className={tdBase}>
                      <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${filingMeta.chip}`}>{filingMeta.label}</span>
                    </td>
                    <td className={tdBase}>
                      {item.status === 'removed' ? (
                        <span className="rounded-full bg-priority-p1/10 px-1.5 py-0.5 text-[10px] font-medium text-priority-p1">Removed</span>
                      ) : 'Active'}
                    </td>
                    <td className={tdBase}>
                      {item.review_flag && <span title={item.review_flag}>⚠</span>}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={COLUMNS.length} className="p-0">
                        <ItemEditPanel
                          item={item}
                          onSave={(patch) => onSave(item.id, patch)}
                          onCancel={() => setExpandedId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && (
        <p className="p-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No items match this filter.</p>
      )}
    </div>
  );
}

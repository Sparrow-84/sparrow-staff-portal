import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { RegisterItem, ItemEditPatch } from '@/lib/inventory';
import { formatCost, FILING_STATUS_META, type InvBentonSchedule } from '@/lib/inventory-types';
import { ItemEditPanel } from './AssetRegisterView';

// Bare schedule number/letter for the table's Schedule column — the table is
// already labeled "Schedule", so repeating "Sched" on every row is noise.
const SCHEDULE_BARE: Record<InvBentonSchedule, string> = {
  schedule_2: '2',
  schedule_4: '4',
  schedule_5a: '5A',
  schedule_5b: '5B',
};

type SortKey =
  | 'schedule' | 'description' | 'building' | 'room' | 'serial' | 'condition'
  | 'donated' | 'year' | 'qty' | 'cost_each' | 'total' | 'filing_status' | 'status' | 'flag';
type SortDir = 'asc' | 'desc';

const FILING_ORDER: Record<string, number> = { not_filed: 0, added: 1, updated: 2, carried_over: 3 };

// Remote locations are named "Andrew — Remote", "Susanna — Remote", etc.
// Treat "Remote Staff" as the building and the person's own name as the room
// within it, so remote items slot into the same Building/Room grouping as
// everyone else instead of needing their own separate concept.
function buildingOf(item: RegisterItem): string {
  return item.location.is_remote ? 'Remote Staff' : item.location.name;
}

function roomOf(item: RegisterItem): string {
  if (item.location.is_remote) return item.location.name.replace(/\s*—\s*Remote$/, '');
  return item.sub_location?.name ?? '—';
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
    case 'building':
      // Numeric sort_order (not alphabetical) so physical locations keep
      // their defined order and Remote Staff (sort_order 100+) lands after
      // all of them as one block, same as the Cards view.
      return a.location.sort_order - b.location.sort_order;
    case 'room':
      return roomOf(a).localeCompare(roomOf(b));
    case 'serial':
      return (a.serial_number ?? '').localeCompare(b.serial_number ?? '');
    case 'condition':
      return a.condition.localeCompare(b.condition);
    case 'donated': {
      // Unknown sorts before No, which sorts before Yes.
      const rank = (v: boolean | null) => (v === null ? -1 : v ? 1 : 0);
      return rank(a.is_donated) - rank(b.is_donated);
    }
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

// Tie-break chain per primary sort key. Sorting by Building falls through to
// Room then Description, so clicking "Building" alone gives the full
// building → room → item grouping in one click, matching the spreadsheet.
function tieBreakChain(primaryKey: SortKey): SortKey[] {
  if (primaryKey === 'building') return ['building', 'room', 'description'];
  if (primaryKey === 'description') return ['description'];
  return [primaryKey, 'description'];
}

const COLUMNS: { key: SortKey; label: string; align?: 'right'; defaultWidth: number }[] = [
  { key: 'schedule', label: 'Schedule', defaultWidth: 90 },
  { key: 'description', label: 'Description', defaultWidth: 280 },
  { key: 'building', label: 'Building', defaultWidth: 170 },
  { key: 'room', label: 'Room', defaultWidth: 150 },
  { key: 'serial', label: 'Serial / model #', defaultWidth: 160 },
  { key: 'condition', label: 'Condition', defaultWidth: 90 },
  { key: 'donated', label: 'Donated', defaultWidth: 80 },
  { key: 'year', label: 'Year acq.', align: 'right', defaultWidth: 90 },
  { key: 'qty', label: 'Qty', align: 'right', defaultWidth: 60 },
  { key: 'cost_each', label: 'Cost ea.', align: 'right', defaultWidth: 90 },
  { key: 'total', label: 'Total', align: 'right', defaultWidth: 90 },
  { key: 'filing_status', label: 'Filing status', defaultWidth: 110 },
  { key: 'status', label: 'Status', defaultWidth: 90 },
  { key: 'flag', label: 'Flag', defaultWidth: 50 },
];

const MIN_COL_WIDTH = 44;
const WIDTHS_STORAGE_KEY = 'sparrow-inv-register-table-col-widths-v3';

function loadStoredWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(WIDTHS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function RegisterTableView({
  items,
  onSave,
}: {
  items: RegisterItem[];
  onSave: (id: string, patch: ItemEditPatch) => Promise<void>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('building');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [colWidths, setColWidths] = useState<Record<SortKey, number>>(() => {
    const stored = loadStoredWidths();
    const widths = {} as Record<SortKey, number>;
    for (const col of COLUMNS) widths[col.key] = stored[col.key] ?? col.defaultWidth;
    return widths;
  });

  useEffect(() => {
    localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(colWidths));
  }, [colWidths]);

  // Grid template applied to every row (header + body) so all columns line
  // up. Using CSS Grid rather than a native <table>/<colgroup> — table
  // column widths driven by <col> are notoriously inconsistent about
  // reflecting live JS updates across browsers, whereas grid-template-columns
  // is a plain inline style the browser re-applies exactly on every render.
  const gridTemplate = COLUMNS.map((c) => `${colWidths[c.key]}px`).join(' ');

  // A resize drag ends with a pointerup, which the browser follows with a
  // click on whatever element the cursor lands on — often the header label,
  // not the handle — so relying on stopPropagation from the handle alone
  // isn't enough. This ref suppresses exactly the one click that follows a
  // resize interaction, whether or not the pointer actually moved.
  const suppressSortRef = useRef(false);

  // Drag-to-resize via the Pointer Events API with explicit pointer capture:
  // once captured, every subsequent pointermove/pointerup for this drag is
  // delivered to the handle itself no matter where the cursor physically
  // ends up.
  function startResize(key: SortKey, e: ReactPointerEvent<HTMLSpanElement>) {
    e.preventDefault();
    e.stopPropagation();
    suppressSortRef.current = true;
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startWidth = colWidths[key];
    handle.setPointerCapture(e.pointerId);

    function handleMove(ev: PointerEvent) {
      const next = Math.max(MIN_COL_WIDTH, startWidth + (ev.clientX - startX));
      setColWidths((w) => ({ ...w, [key]: next }));
    }
    function handleUp(ev: PointerEvent) {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener('pointermove', handleMove);
      handle.removeEventListener('pointerup', handleUp);
      // Safety net in case a click never follows this (e.g. released
      // outside the window) — don't let the flag get stuck forever.
      setTimeout(() => { suppressSortRef.current = false; }, 300);
    }
    handle.addEventListener('pointermove', handleMove);
    handle.addEventListener('pointerup', handleUp);
  }

  function handleHeaderClick(key: SortKey) {
    if (suppressSortRef.current) {
      suppressSortRef.current = false;
      return;
    }
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const chain = tieBreakChain(sortKey);
    return [...items].sort((a, b) => {
      for (const key of chain) {
        const cmp = compare(a, b, key) * (key === sortKey ? dir : 1);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }, [items, sortKey, sortDir]);

  const cellBase = 'border-r border-sparrow-rule dark:border-sparrow-dark-border px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap';

  return (
    <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface overflow-hidden">
      <div className="overflow-x-auto">
        <div role="table" style={{ minWidth: 'max-content' }}>
          {/* Header row */}
          <div
            role="row"
            className="grid bg-sparrow-green/10 sticky top-0 z-10"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {COLUMNS.map((col) => (
              <div
                key={col.key}
                role="columnheader"
                onClick={() => handleHeaderClick(col.key)}
                title={col.label}
                className={`relative ${cellBase} py-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray cursor-pointer select-none hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink transition ${col.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                  {col.label}{' '}
                  {sortKey === col.key && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </span>
                {/* Drag handle — resizes this column without triggering sort */}
                <span
                  onPointerDown={(e) => startResize(col.key, e)}
                  style={{ touchAction: 'none' }}
                  className="absolute top-0 right-0 h-full w-3 cursor-col-resize hover:bg-sparrow-green/30 active:bg-sparrow-green/50"
                />
              </div>
            ))}
          </div>

          {/* Body rows */}
          {sorted.map((item) => {
            const filingMeta = FILING_STATUS_META[item.filing_status];
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} role="rowgroup">
                <div
                  role="row"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className={`grid border-t border-sparrow-rule dark:border-sparrow-dark-border cursor-pointer transition ${
                    item.status === 'removed' ? 'opacity-50' : ''
                  } ${isExpanded ? 'bg-sparrow-mist/50 dark:bg-sparrow-dark-surface2' : 'hover:bg-sparrow-mist/30 dark:hover:bg-sparrow-dark-surface2/60'}`}
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div role="cell" className={`${cellBase} text-sm text-sparrow-ink dark:text-sparrow-dark-ink`}>{SCHEDULE_BARE[item.benton_schedule]}</div>
                  <div role="cell" className={`${cellBase} text-sm text-sparrow-ink dark:text-sparrow-dark-ink`} title={item.description}>{item.description}</div>
                  <div role="cell" className={`${cellBase} text-sm text-sparrow-ink dark:text-sparrow-dark-ink`} title={buildingOf(item)}>{buildingOf(item)}</div>
                  <div role="cell" className={`${cellBase} text-sm text-sparrow-ink dark:text-sparrow-dark-ink`} title={roomOf(item)}>{roomOf(item)}</div>
                  <div role="cell" className={`${cellBase} text-sm text-sparrow-ink dark:text-sparrow-dark-ink`} title={item.serial_number ?? ''}>{item.serial_number ?? '—'}</div>
                  <div role="cell" className={`${cellBase} text-sm text-sparrow-ink dark:text-sparrow-dark-ink capitalize`}>{item.condition}</div>
                  <div role="cell" className={`${cellBase} text-sm ${item.is_donated === null ? 'italic text-sparrow-gray dark:text-sparrow-dark-gray' : 'text-sparrow-ink dark:text-sparrow-dark-ink'}`}>
                    {item.is_donated === null ? 'Unknown' : item.is_donated ? 'Yes' : 'No'}
                  </div>
                  <div role="cell" className={`${cellBase} text-sm text-sparrow-ink dark:text-sparrow-dark-ink text-right`}>{yearOf(item) ?? '—'}</div>
                  <div role="cell" className={`${cellBase} text-sm text-sparrow-ink dark:text-sparrow-dark-ink text-right`}>{item.quantity}</div>
                  <div role="cell" className={`${cellBase} text-sm text-sparrow-ink dark:text-sparrow-dark-ink text-right`}>{formatCost(item.unit_cost)}</div>
                  <div role="cell" className={`${cellBase} text-sm text-sparrow-ink dark:text-sparrow-dark-ink text-right font-medium`}>{formatCost(item.unit_cost * item.quantity)}</div>
                  <div role="cell" className={cellBase}>
                    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${filingMeta.chip}`}>{filingMeta.label}</span>
                  </div>
                  <div role="cell" className={`${cellBase} text-sm text-sparrow-ink dark:text-sparrow-dark-ink`}>
                    {item.status === 'removed' ? (
                      <span className="rounded-full bg-priority-p1/10 px-1.5 py-0.5 text-[10px] font-medium text-priority-p1">Removed</span>
                    ) : 'Active'}
                  </div>
                  <div role="cell" className={cellBase}>
                    {item.review_flag && <span title={item.review_flag}>⚠</span>}
                  </div>
                </div>
                {isExpanded && (
                  <ItemEditPanel
                    item={item}
                    onSave={(patch) => onSave(item.id, patch)}
                    onCancel={() => setExpandedId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {sorted.length === 0 && (
        <p className="p-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No items match this filter.</p>
      )}
    </div>
  );
}

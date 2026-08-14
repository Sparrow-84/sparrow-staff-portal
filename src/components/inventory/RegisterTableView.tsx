import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { clearAllReconciled, type RegisterItem, type ItemEditPatch } from '@/lib/inventory';
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

type ColKey =
  | 'schedule' | 'description' | 'building' | 'room' | 'serial' | 'condition'
  | 'donated' | 'year' | 'qty' | 'cost_each' | 'total' | 'filing_status' | 'status' | 'flag'
  | 'reconciled';
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

function compare(a: RegisterItem, b: RegisterItem, key: ColKey): number {
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
    case 'reconciled':
      return Number(a.reconciled) - Number(b.reconciled);
    default:
      return 0;
  }
}

// Tie-break chain per primary sort key. Sorting by Building falls through to
// Room then Description, so clicking "Building" alone gives the full
// building → room → item grouping in one click, matching the spreadsheet.
function tieBreakChain(primaryKey: ColKey): ColKey[] {
  if (primaryKey === 'building') return ['building', 'room', 'description'];
  if (primaryKey === 'description') return ['description'];
  return [primaryKey, 'description'];
}

const DEFAULT_CELL_COLOR = 'text-sparrow-ink dark:text-sparrow-dark-ink';

// `colorClass` replaces the default text color entirely (for cases like
// "Unknown" that need a different one); `layoutClass` is always appended on
// top (alignment, weight, etc.) so the two never fight over the same cell.
function cellContent(item: RegisterItem, key: ColKey): { node: ReactNode; layoutClass?: string; colorClass?: string; title?: string } {
  switch (key) {
    case 'schedule':
      return { node: SCHEDULE_BARE[item.benton_schedule] };
    case 'description':
      return { node: item.description, title: item.description };
    case 'building': {
      const v = buildingOf(item);
      return { node: v, title: v };
    }
    case 'room': {
      const v = roomOf(item);
      return { node: v, title: v };
    }
    case 'serial':
      return { node: item.serial_number ?? '—', title: item.serial_number ?? '' };
    case 'condition':
      return { node: item.condition, layoutClass: 'capitalize' };
    case 'donated':
      return item.is_donated === null
        ? { node: 'Unknown', colorClass: 'italic text-sparrow-gray dark:text-sparrow-dark-gray' }
        : { node: item.is_donated ? 'Yes' : 'No' };
    case 'year':
      return { node: yearOf(item) ?? '—', layoutClass: 'text-right' };
    case 'qty':
      return { node: item.quantity, layoutClass: 'text-right' };
    case 'cost_each':
      return { node: formatCost(item.unit_cost), layoutClass: 'text-right' };
    case 'total':
      return { node: formatCost(item.unit_cost * item.quantity), layoutClass: 'text-right font-medium' };
    case 'filing_status': {
      const meta = FILING_STATUS_META[item.filing_status];
      return { node: <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${meta.chip}`}>{meta.label}</span> };
    }
    case 'status':
      return {
        node: item.status === 'removed'
          ? <span className="rounded-full bg-priority-p1/10 px-1.5 py-0.5 text-[10px] font-medium text-priority-p1">Removed</span>
          : 'Active',
      };
    case 'flag':
      return { node: item.review_flag ? <span title={item.review_flag}>⚠</span> : null };
    default:
      return { node: null };
  }
}

const COLUMNS: { key: ColKey; label: string; align?: 'right'; defaultWidth: number }[] = [
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
  { key: 'reconciled', label: 'Reconciled', defaultWidth: 100 },
];

const MIN_COL_WIDTH = 44;
const WIDTHS_STORAGE_KEY = 'sparrow-inv-register-table-col-widths-v3';
const HIDDEN_STORAGE_KEY = 'sparrow-inv-register-table-hidden-cols-v1';
const ORDER_STORAGE_KEY = 'sparrow-inv-register-table-col-order-v1';

const DEFAULT_ORDER: ColKey[] = COLUMNS.map((c) => c.key);

function loadStoredWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(WIDTHS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadHiddenCols(): ColKey[] {
  try {
    const raw = localStorage.getItem(HIDDEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadColumnOrder(): ColKey[] {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as ColKey[]) : null;
    if (!stored) return DEFAULT_ORDER;
    // Guard against a stored order from before a column was added/removed —
    // keep only known keys, then append any new ones that aren't in it yet.
    const known = stored.filter((k) => DEFAULT_ORDER.includes(k));
    const missing = DEFAULT_ORDER.filter((k) => !known.includes(k));
    return [...known, ...missing];
  } catch {
    return DEFAULT_ORDER;
  }
}

// ── Columns visibility dropdown ─────────────────────────────────────────────

function ColumnsMenu({
  columns,
  hidden,
  onToggle,
}: {
  columns: { key: ColKey; label: string }[];
  hidden: Set<ColKey>;
  onToggle: (key: ColKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          hidden.size > 0
            ? 'border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green/10 text-sparrow-green dark:text-sparrow-dark-green'
            : 'border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2'
        }`}
      >
        Columns{hidden.size > 0 ? ` (${hidden.size} hidden)` : ''} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface shadow-card py-1 max-h-80 overflow-y-auto">
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={!hidden.has(col.key)}
                onChange={() => onToggle(col.key)}
                className="h-4 w-4 accent-sparrow-green"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function RegisterTableView({
  items,
  onSave,
  onRefresh,
}: {
  items: RegisterItem[];
  onSave: (id: string, patch: ItemEditPatch) => Promise<void>;
  onRefresh: () => void;
}) {
  const [sortKey, setSortKey] = useState<ColKey>('building');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Sticky "which row am I looking at" highlight — separate from expandedId
  // so the highlight stays put after closing the detail panel, letting you
  // scroll sideways through the rest of the row's columns without losing
  // your place.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(() => {
    const stored = loadStoredWidths();
    const widths = {} as Record<ColKey, number>;
    for (const col of COLUMNS) widths[col.key] = stored[col.key] ?? col.defaultWidth;
    return widths;
  });

  const [hiddenCols, setHiddenCols] = useState<Set<ColKey>>(() => new Set(loadHiddenCols()));
  const [columnOrder, setColumnOrder] = useState<ColKey[]>(loadColumnOrder);
  const [draggingKey, setDraggingKey] = useState<ColKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<ColKey | null>(null);

  useEffect(() => {
    localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(colWidths));
  }, [colWidths]);

  useEffect(() => {
    localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify([...hiddenCols]));
  }, [hiddenCols]);

  useEffect(() => {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(columnOrder));
  }, [columnOrder]);

  function toggleColumn(key: ColKey) {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Pick up a column header and drop it on another to move it there — native
  // HTML5 drag-and-drop, not the same mechanism as the resize handle, so the
  // two never compete for the same gesture. The resize handle sets
  // draggable={false} explicitly to guarantee it's never picked up as the
  // drag source no matter how a browser resolves overlapping gestures.
  function handleColumnDrop(targetKey: ColKey) {
    const draggedKey = draggingKey;
    setDraggingKey(null);
    setDragOverKey(null);
    if (!draggedKey || draggedKey === targetKey) return;
    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== draggedKey);
      const targetIdx = next.indexOf(targetKey);
      next.splice(targetIdx, 0, draggedKey);
      return next;
    });
  }

  const orderedColumns = useMemo(
    () => columnOrder.map((key) => COLUMNS.find((c) => c.key === key)!).filter(Boolean),
    [columnOrder],
  );
  const visibleColumns = useMemo(() => orderedColumns.filter((c) => !hiddenCols.has(c.key)), [orderedColumns, hiddenCols]);

  // Grid template applied to every row (header + body) so all columns line
  // up. Using CSS Grid rather than a native <table>/<colgroup> — table
  // column widths driven by <col> are notoriously inconsistent about
  // reflecting live JS updates across browsers, whereas grid-template-columns
  // is a plain inline style the browser re-applies exactly on every render.
  const gridTemplate = visibleColumns.map((c) => `${colWidths[c.key]}px`).join(' ');

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
  function startResize(key: ColKey, e: ReactPointerEvent<HTMLSpanElement>) {
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

  function handleHeaderClick(key: ColKey) {
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

  async function handleClearAll() {
    const reconciledCount = items.filter((i) => i.reconciled).length;
    if (reconciledCount === 0) return;
    if (!window.confirm(`Uncheck "Reconciled" on all ${reconciledCount} item(s) marked reconciled? This can't be undone item-by-item.`)) {
      return;
    }
    setClearingAll(true);
    try {
      await clearAllReconciled();
      onRefresh();
    } finally {
      setClearingAll(false);
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
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <button
          onClick={() => void handleClearAll()}
          disabled={clearingAll}
          className="rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-3 py-1.5 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 transition disabled:opacity-50"
        >
          {clearingAll ? 'Clearing…' : 'Clear All Reconciled'}
        </button>
        <ColumnsMenu columns={orderedColumns} hidden={hiddenCols} onToggle={toggleColumn} />
      </div>

      {/* Sized to fit exactly the visible columns — not stretched to fill the
          surrounding page — so there's no leftover blank strip that reads as
          a phantom extra column when there's more room than the table needs. */}
      <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface overflow-hidden" style={{ width: 'fit-content', maxWidth: '100%' }}>
        {/* Bounded height with its own scrollbar (not just horizontal) — a
            sticky header only pins to the top of whichever ancestor is
            actually doing the scrolling. Without a height limit here, this
            div never scrolls itself (it just grows to fit every row), so
            the sticky header would have nothing to stick to as the page
            scrolled past it instead. */}
        <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
          <div role="table" style={{ minWidth: 'max-content' }}>
            {/* Header row — opaque (not translucent) since it's pinned on top
                of scrolling rows; a see-through header made the row text
                underneath bleed through and hard to read. */}
            <div
              role="row"
              className="grid bg-sparrow-green dark:bg-sparrow-dark-green sticky top-0 z-20"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {visibleColumns.map((col, colIdx) => (
                <div
                  key={col.key}
                  role="columnheader"
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDraggingKey(col.key); }}
                  onDragEnd={() => { setDraggingKey(null); setDragOverKey(null); }}
                  onDragOver={(e) => { e.preventDefault(); if (draggingKey && draggingKey !== col.key) setDragOverKey(col.key); }}
                  onDragLeave={() => setDragOverKey((k) => (k === col.key ? null : k))}
                  onDrop={(e) => { e.preventDefault(); handleColumnDrop(col.key); }}
                  onClick={() => handleHeaderClick(col.key)}
                  title={col.label}
                  className={`relative border-r border-white/20 px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-white/90 cursor-grab active:cursor-grabbing select-none hover:text-white transition ${col.align === 'right' ? 'text-right' : 'text-left'} ${
                    draggingKey === col.key ? 'opacity-40' : ''
                  } ${dragOverKey === col.key ? 'bg-white/15' : ''} ${
                    colIdx === 0 ? 'sticky left-0 z-10 bg-sparrow-green dark:bg-sparrow-dark-green shadow-[2px_0_4px_-2px_rgba(0,0,0,0.25)]' : ''
                  }`}
                >
                  <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                    {col.label}{' '}
                    {sortKey === col.key && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </span>
                  {/* Resize handle — explicitly non-draggable so it's never picked up
                      as the column-move drag source, only ever the resize gesture. */}
                  <span
                    draggable={false}
                    onPointerDown={(e) => startResize(col.key, e)}
                    style={{ touchAction: 'none' }}
                    className="absolute top-0 right-0 h-full w-3 cursor-col-resize hover:bg-white/20 active:bg-white/30"
                  />
                </div>
              ))}
            </div>

            {/* Body rows */}
            {sorted.map((item) => {
              const isExpanded = expandedId === item.id;
              const isSelected = selectedId === item.id;
              // Whichever column currently sits first (Susanna's put Description
              // there, but this follows drag-reorder, not a hardcoded column) is
              // frozen to the left edge — same idea as the frozen header row, so
              // you can always tell which item you're looking at while scrolling
              // sideways. Needs its own FULLY OPAQUE background (no /NN opacity
              // suffixes) — unlike the rest of the row, this cell visually sits
              // on top of whatever other column has scrolled beneath it, so any
              // translucency lets that other cell's text/borders bleed through.
              const firstColBg = isExpanded || isSelected
                ? 'bg-sparrow-mist dark:bg-sparrow-dark-surface2'
                : 'bg-sparrow-sage dark:bg-sparrow-dark-surface2 group-hover:bg-sparrow-mist dark:group-hover:bg-sparrow-dark-border';
              return (
                <div key={item.id} role="rowgroup">
                  <div
                    role="row"
                    onClick={() => { setSelectedId(item.id); setExpandedId(isExpanded ? null : item.id); }}
                    className={`group grid border-t border-sparrow-rule dark:border-sparrow-dark-border cursor-pointer transition ${
                      item.status === 'removed' ? 'opacity-50' : ''
                    } ${isExpanded || isSelected ? 'bg-sparrow-mist/50 dark:bg-sparrow-dark-surface2' : 'hover:bg-sparrow-mist/30 dark:hover:bg-sparrow-dark-surface2/60'}`}
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    {visibleColumns.map((col, colIdx) => {
                      const stickyClass = colIdx === 0 ? `sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] ${firstColBg}` : '';
                      if (col.key === 'reconciled') {
                        return (
                          <div key={col.key} role="cell" className={`${cellBase} flex items-center ${stickyClass}`}>
                            <input
                              type="checkbox"
                              checked={item.reconciled}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => void onSave(item.id, { reconciled: e.target.checked })}
                              className="h-4 w-4 accent-sparrow-green cursor-pointer"
                            />
                          </div>
                        );
                      }
                      const { node, layoutClass, colorClass, title } = cellContent(item, col.key);
                      return (
                        <div key={col.key} role="cell" className={`${cellBase} text-sm ${colorClass ?? DEFAULT_CELL_COLOR} ${layoutClass ?? ''} ${stickyClass}`} title={title}>
                          {node}
                        </div>
                      );
                    })}
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
    </div>
  );
}

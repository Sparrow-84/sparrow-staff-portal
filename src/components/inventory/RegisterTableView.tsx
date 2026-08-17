import { useEffect, useMemo, useState } from 'react';
import {
  clearAllReconciled, fetchAllSubLocations, fetchAllLocations,
  type RegisterItem, type ItemEditPatch,
} from '@/lib/inventory';
import {
  formatCost, FILING_STATUS_META, BENTON_SCHEDULE_LABELS, BATCH_CATEGORIES,
  type InvBentonSchedule, type InvSubLocation, type InvLocation, type InvFilingStatus, type InvItemCondition, type InvItemStatus,
} from '@/lib/inventory-types';
import {
  useColumnLayout, useHeaderInteractions, GridTableShell,
  InlineText, InlineNumber, InlineSelect, InlineBadgeSelect, ExpandableText, InlineCheckbox,
  type GridColumn,
} from '@/components/gridtable/GridTable';

// Bare schedule number/letter — the column is already labeled "Schedule", so
// repeating "Sched"/the full name in every row is noise.
const SCHEDULE_BARE: Record<InvBentonSchedule, string> = {
  schedule_2: '2',
  schedule_4: '4',
  schedule_5a: '5A',
  schedule_5b: '5B',
};

type ColKey =
  | 'schedule' | 'description' | 'building' | 'room' | 'serial' | 'condition'
  | 'donated' | 'year' | 'qty' | 'cost_each' | 'total' | 'filing_status' | 'status'
  | 'flag' | 'notes' | 'who_has_it' | 'batch' | 'batch_category' | 'reconciled';
type SortDir = 'asc' | 'desc';

const FILING_ORDER: Record<string, number> = { not_filed: 0, added: 1, updated: 2, carried_over: 3 };

// Remote locations are named "Andrew — Remote", "Susanna — Remote", etc. —
// the person's own name (Remote suffix stripped) reads as the room, so
// remote items slot into the same Building/Room grouping as everyone else
// instead of needing their own separate concept.
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
    case 'notes':
      return Number(!!a.notes) - Number(!!b.notes);
    case 'who_has_it':
      return (a.who_has_it ?? '').localeCompare(b.who_has_it ?? '');
    case 'batch':
      return Number(a.is_batch) - Number(b.is_batch);
    case 'batch_category':
      return (a.batch_category ?? '').localeCompare(b.batch_category ?? '');
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

const COLUMNS: GridColumn<ColKey>[] = [
  { key: 'schedule', label: 'Schedule', defaultWidth: 90 },
  { key: 'description', label: 'Description', defaultWidth: 280 },
  { key: 'building', label: 'Building', defaultWidth: 170 },
  { key: 'room', label: 'Room', defaultWidth: 150 },
  { key: 'serial', label: 'Serial / model #', defaultWidth: 160 },
  { key: 'condition', label: 'Condition', defaultWidth: 90 },
  { key: 'donated', label: 'Donated', defaultWidth: 100 },
  { key: 'year', label: 'Year acq.', align: 'right', defaultWidth: 90 },
  { key: 'qty', label: 'Qty', align: 'right', defaultWidth: 70 },
  { key: 'cost_each', label: 'Cost ea.', align: 'right', defaultWidth: 100 },
  { key: 'total', label: 'Total', align: 'right', defaultWidth: 100 },
  { key: 'filing_status', label: 'Filing status', defaultWidth: 130 },
  { key: 'status', label: 'Status', defaultWidth: 110 },
  { key: 'flag', label: 'Review Flag', defaultWidth: 220 },
  { key: 'notes', label: 'Notes', defaultWidth: 220 },
  { key: 'who_has_it', label: 'Who Has It', defaultWidth: 140 },
  { key: 'batch', label: 'Batch', defaultWidth: 70 },
  { key: 'batch_category', label: 'Batch Category', defaultWidth: 210 },
  { key: 'reconciled', label: 'Reconciled', defaultWidth: 100 },
];

const STORAGE_PREFIX = 'sparrow-inv-register-table';

// Year is stored as acquired_date (always the 1st of the year — see the
// historical import migration), so this edits just the year and never
// touches month/day. Blank clears it back to unknown (null) rather than
// coercing to a real year like InlineNumber would.
function InlineYear({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  useEffect(() => setDraft(value === null ? '' : String(value)), [value]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === '') {
      if (value !== null) onSave(null);
      return;
    }
    const n = Math.round(Number(trimmed));
    const thisYear = new Date().getFullYear();
    if (!Number.isFinite(n) || n < 1900 || n > thisYear + 1) {
      setDraft(value === null ? '' : String(value));
      return;
    }
    if (n !== value) onSave(n);
    setDraft(String(n));
  }

  return (
    <input
      type="number"
      value={draft}
      placeholder="—"
      onChange={(e) => setDraft(e.target.value)}
      onWheel={(e) => e.currentTarget.blur()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setDraft(value === null ? '' : String(value)); e.currentTarget.blur(); }
      }}
      className="w-full bg-transparent border border-transparent rounded px-1 -mx-1 py-0.5 outline-none transition-colors hover:bg-sparrow-mist/50 dark:hover:bg-sparrow-dark-surface2/60 focus:bg-white dark:focus:bg-sparrow-dark-surface focus:border-sparrow-green dark:focus:border-sparrow-dark-green text-right text-sm text-sparrow-ink dark:text-sparrow-dark-ink"
    />
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [subLocations, setSubLocations] = useState<InvSubLocation[]>([]);
  const [locations, setLocations] = useState<InvLocation[]>([]);

  useEffect(() => {
    fetchAllSubLocations().then(setSubLocations).catch(() => setSubLocations([]));
    fetchAllLocations().then(setLocations).catch(() => setLocations([]));
  }, []);

  // Same order the Building column sorts by, so the dropdown lists buildings
  // in the familiar physical order with Remote Staff locations trailing.
  const sortedLocations = useMemo(() => [...locations].sort((a, b) => a.sort_order - b.sort_order), [locations]);

  const subLocationsByLocation = useMemo(() => {
    const map = new Map<string, InvSubLocation[]>();
    for (const sl of subLocations) {
      if (!map.has(sl.location_id)) map.set(sl.location_id, []);
      map.get(sl.location_id)!.push(sl);
    }
    return map;
  }, [subLocations]);

  const layout = useColumnLayout(COLUMNS, STORAGE_PREFIX);
  const { startResize, handleHeaderClick } = useHeaderInteractions(
    layout.colWidths, layout.setColWidths, sortKey, setSortKey, sortDir, setSortDir,
  );

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

  function renderCell(item: RegisterItem, key: ColKey) {
    const save = (patch: ItemEditPatch) => void onSave(item.id, patch);
    switch (key) {
      case 'schedule':
        return (
          <InlineSelect
            value={item.benton_schedule}
            onSave={(v) => save({ benton_schedule: v })}
            options={(Object.keys(BENTON_SCHEDULE_LABELS) as InvBentonSchedule[]).map((s) => ({ value: s, label: SCHEDULE_BARE[s] }))}
          />
        );
      case 'description':
        return <InlineText value={item.description} onSave={(v) => save({ description: v })} />;
      case 'building':
        // Shows/edits the item's real location (e.g. "Andrew — Remote"),
        // not a collapsed "Remote Staff" grouping label — a native <select>
        // can't display a label other than its actually-selected option's
        // own text. Changing buildings clears sub_location_id since the old
        // room won't exist in the new one.
        return (
          <InlineSelect
            value={item.location_id}
            onSave={(v) => save({ location_id: v, sub_location_id: null })}
            options={sortedLocations.map((l) => ({ value: l.id, label: l.name }))}
          />
        );
      case 'room': {
        if (item.location.is_remote) {
          const v = roomOf(item);
          return <span className="block truncate text-sm text-sparrow-ink dark:text-sparrow-dark-ink" title={v}>{v}</span>;
        }
        const options = subLocationsByLocation.get(item.location.id) ?? [];
        return (
          <InlineSelect
            value={item.sub_location_id ?? ''}
            onSave={(v) => save({ sub_location_id: v || null })}
            options={[{ value: '', label: '—' }, ...options.map((sl) => ({ value: sl.id, label: sl.name }))]}
          />
        );
      }
      case 'serial':
        return <InlineText value={item.serial_number ?? ''} placeholder="—" onSave={(v) => save({ serial_number: v.trim() || null })} />;
      case 'condition':
        return (
          <InlineSelect
            value={item.condition}
            onSave={(v: InvItemCondition) => save({ condition: v })}
            options={[{ value: 'new', label: 'New' }, { value: 'used', label: 'Used' }]}
          />
        );
      case 'donated':
        return (
          <InlineSelect
            value={item.is_donated === null ? 'unknown' : item.is_donated ? 'yes' : 'no'}
            onSave={(v) => save({ is_donated: v === 'unknown' ? null : v === 'yes' })}
            options={[{ value: 'unknown', label: 'Unknown' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
          />
        );
      case 'year':
        return (
          <InlineYear
            value={yearOf(item)}
            onSave={(y) => save({ acquired_date: y === null ? null : `${y}-01-01` })}
          />
        );
      case 'qty':
        return <InlineNumber value={item.quantity} min={1} onSave={(v) => save({ quantity: v })} />;
      case 'cost_each':
        return <InlineNumber value={item.unit_cost} min={0} onSave={(v) => save({ unit_cost: v })} />;
      case 'total':
        // Locked — computed from Qty × Cost, never directly editable.
        return <span className="block text-right text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{formatCost(item.unit_cost * item.quantity)}</span>;
      case 'filing_status':
        return (
          <InlineBadgeSelect
            value={item.filing_status}
            onSave={(v: InvFilingStatus) => save({ filing_status: v })}
            options={(Object.keys(FILING_STATUS_META) as InvFilingStatus[]).map((s) => ({
              value: s,
              label: FILING_STATUS_META[s].label,
              // "On file" is the normal, expected state — no pill, just quiet
              // grey text. Everything else gets its color-coded pill so it
              // stands out at a glance.
              badgeClass: s === 'carried_over'
                ? 'text-sparrow-gray dark:text-sparrow-dark-gray'
                : `rounded-full px-2 py-0.5 ${FILING_STATUS_META[s].chip}`,
            }))}
          />
        );
      case 'status':
        return (
          <InlineBadgeSelect
            value={item.status}
            onSave={(v: InvItemStatus) => save({
              status: v,
              removed_date: v === 'removed' && item.status !== 'removed'
                ? new Date().toISOString().slice(0, 10)
                : v === 'active' ? null : item.removed_date,
            })}
            options={[
              { value: 'active', label: 'Active', badgeClass: 'text-sparrow-gray dark:text-sparrow-dark-gray' },
              { value: 'removed', label: 'Removed', badgeClass: 'rounded-full px-2 py-0.5 bg-priority-p1/10 text-priority-p1' },
            ]}
          />
        );
      case 'flag':
        return <ExpandableText value={item.review_flag} placeholder="No open questions" onSave={(v) => save({ review_flag: v })} />;
      case 'notes':
        return <ExpandableText value={item.notes} placeholder="No notes" onSave={(v) => save({ notes: v })} />;
      case 'who_has_it':
        return <InlineText value={item.who_has_it ?? ''} placeholder="—" onSave={(v) => save({ who_has_it: v.trim() || null })} />;
      case 'batch':
        return (
          <InlineCheckbox
            checked={item.is_batch}
            onSave={(v) => save({ is_batch: v, batch_category: v ? item.batch_category : null })}
          />
        );
      case 'batch_category':
        return (
          <InlineSelect
            value={item.batch_category ?? ''}
            disabled={!item.is_batch}
            onSave={(v) => save({ batch_category: v || null })}
            options={[{ value: '', label: item.is_batch ? 'Select…' : '—' }, ...BATCH_CATEGORIES.map((c) => ({ value: c, label: c }))]}
          />
        );
      case 'reconciled':
        return <InlineCheckbox checked={item.reconciled} onSave={(v) => save({ reconciled: v })} />;
      default:
        return null;
    }
  }

  return (
    <GridTableShell
      layout={layout}
      sortKey={sortKey}
      sortDir={sortDir}
      onHeaderClick={handleHeaderClick}
      startResize={startResize}
      items={sorted}
      rowKey={(item) => item.id}
      renderCell={renderCell}
      onRowClick={(item) => setSelectedId(item.id)}
      rowClassName={(item) => `${item.status === 'removed' ? 'opacity-50' : ''} ${selectedId === item.id ? 'bg-sparrow-mist/50 dark:bg-sparrow-dark-surface2' : 'hover:bg-sparrow-mist/30 dark:hover:bg-sparrow-dark-surface2/60'}`}
      // Needs a FULLY OPAQUE background (no /NN opacity suffixes) — unlike the
      // rest of the row, this cell visually sits on top of whatever other
      // column has scrolled beneath it, so any translucency lets that other
      // cell's text/borders bleed through.
      firstColClassName={(item) => selectedId === item.id
        ? 'bg-sparrow-mist dark:bg-sparrow-dark-surface2'
        : 'bg-sparrow-sage dark:bg-sparrow-dark-surface2 group-hover:bg-sparrow-mist dark:group-hover:bg-sparrow-dark-border'}
      emptyMessage="No items match this filter."
      toolbar={
        <button
          onClick={() => void handleClearAll()}
          disabled={clearingAll}
          className="rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-3 py-1.5 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 transition disabled:opacity-50"
        >
          {clearingAll ? 'Clearing…' : 'Clear All Reconciled'}
        </button>
      }
    />
  );
}

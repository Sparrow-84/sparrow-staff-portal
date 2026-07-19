import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchRegisterItems, patchItem, fetchSubLocations,
  type RegisterItem, type ItemEditPatch,
} from '@/lib/inventory';
import {
  formatCost, FILING_STATUS_META,
  type InvSubLocation, type InvItemCondition,
} from '@/lib/inventory-types';

// ── Inline edit panel ────────────────────────────────────────────────────

function ItemEditPanel({
  item,
  onSave,
  onCancel,
}: {
  item: RegisterItem;
  onSave: (patch: ItemEditPatch) => Promise<void>;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(item.description);
  const [serialNumber, setSerialNumber] = useState(item.serial_number ?? '');
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unitCost, setUnitCost] = useState(String(item.unit_cost));
  const [condition, setCondition] = useState<InvItemCondition>(item.condition);
  const [isDonated, setIsDonated] = useState(item.is_donated);
  const [subLocationId, setSubLocationId] = useState(item.sub_location_id ?? '');
  const [whoHasIt, setWhoHasIt] = useState(item.who_has_it ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');
  const [reviewFlag, setReviewFlag] = useState(item.review_flag ?? '');
  const [subLocations, setSubLocations] = useState<InvSubLocation[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSubLocations(item.location_id).then(setSubLocations).catch(() => setSubLocations([]));
  }, [item.location_id]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        description,
        serial_number: serialNumber.trim() || null,
        quantity: Math.max(1, Number(quantity) || 1),
        unit_cost: Math.max(0, Number(unitCost) || 0),
        condition,
        is_donated: isDonated,
        sub_location_id: subLocationId || null,
        who_has_it: whoHasIt.trim() || null,
        notes: notes.trim() || null,
        review_flag: reviewFlag.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded border border-sparrow-rule px-2 py-1.5 text-sm text-sparrow-ink focus:outline-none focus:ring-1 focus:ring-sparrow-green';
  const labelCls = 'block text-xs font-medium text-sparrow-gray mb-1';

  return (
    <div className="border-t border-sparrow-rule bg-sparrow-mist/30 px-4 py-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={labelCls}>Description</label>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Serial / model #</label>
          <input className={inputCls} value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Sub-location</label>
          <select className={inputCls} value={subLocationId} onChange={(e) => setSubLocationId(e.target.value)}>
            <option value="">—</option>
            {subLocations.map((sl) => (
              <option key={sl.id} value={sl.id}>{sl.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Quantity</label>
          <input type="number" min={1} className={inputCls} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Unit cost ($)</label>
          <input type="number" min={0} step="0.01" className={inputCls} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Condition</label>
          <select className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value as InvItemCondition)}>
            <option value="new">New</option>
            <option value="used">Used</option>
          </select>
        </div>
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-2 text-sm text-sparrow-ink">
            <input type="checkbox" checked={isDonated} onChange={(e) => setIsDonated(e.target.checked)} />
            Donated
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Who has it (if off-site)</label>
          <input className={inputCls} value={whoHasIt} onChange={(e) => setWhoHasIt(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Notes</label>
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Review flag (open question — clear once resolved)</label>
          <textarea className={inputCls} rows={2} value={reviewFlag} onChange={(e) => setReviewFlag(e.target.value)} placeholder="Leave blank once resolved" />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-sparrow-green px-3.5 py-1.5 text-sm font-medium text-white hover:bg-sparrow-green/90 transition disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="text-sm text-sparrow-gray hover:text-sparrow-ink transition">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Item row ──────────────────────────────────────────────────────────────

function RegisterItemRow({
  item,
  expanded,
  onToggle,
  onSave,
}: {
  item: RegisterItem;
  expanded: boolean;
  onToggle: () => void;
  onSave: (patch: ItemEditPatch) => Promise<void>;
}) {
  const meta = FILING_STATUS_META[item.filing_status];
  const totalValue = item.unit_cost * item.quantity;

  return (
    <div className="border-b border-sparrow-rule last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-sparrow-mist/40 transition"
      >
        <span className={`shrink-0 mt-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${meta.chip}`}>
          {meta.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-sparrow-ink leading-snug">{item.description}</p>
            {item.status === 'removed' && (
              <span className="rounded-full bg-priority-p1/10 px-1.5 py-0.5 text-[10px] font-medium text-priority-p1">Removed</span>
            )}
            {item.review_flag && (
              <span className="rounded-full bg-sparrow-gold/20 px-1.5 py-0.5 text-[10px] font-medium text-sparrow-gold">Needs review</span>
            )}
          </div>
          {item.sub_location && (
            <p className="text-xs text-sparrow-gray">{item.sub_location.name}</p>
          )}
          {item.review_flag && (
            <p className="text-xs text-sparrow-gold mt-0.5">⚠ {item.review_flag}</p>
          )}
        </div>
        <div className="shrink-0 text-right text-xs text-sparrow-gray whitespace-nowrap">
          {item.quantity > 1 && <span>{item.quantity} × </span>}
          {formatCost(item.unit_cost)}
          {item.quantity > 1 && <span className="block text-sparrow-ink font-medium">{formatCost(totalValue)}</span>}
        </div>
        <span className="text-sparrow-gray shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <ItemEditPanel item={item} onSave={onSave} onCancel={onToggle} />
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────

export function AssetRegisterView() {
  const [items, setItems] = useState<RegisterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setItems(await fetchRegisterItems());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load the register.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(id: string, patch: ItemEditPatch) {
    await patchItem(id, patch);
    setExpandedId(null);
    void load();
  }

  const locations = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sort_order: number }>();
    for (const i of items) map.set(i.location.id, i.location);
    return [...map.values()].sort((a, b) => a.sort_order - b.sort_order);
  }, [items]);

  const flaggedCount = items.filter((i) => i.review_flag && i.status === 'active').length;

  const filtered = items.filter((i) => {
    if (!showRemoved && i.status === 'removed') return false;
    if (reviewOnly && !i.review_flag) return false;
    if (locationFilter && i.location.id !== locationFilter) return false;
    if (search.trim() && !i.description.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const grouped = new Map<string, RegisterItem[]>();
  for (const i of filtered) {
    const key = i.location.id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(i);
  }

  const totalActive = items.filter((i) => i.status === 'active').length;
  const totalValue = items
    .filter((i) => i.status === 'active')
    .reduce((sum, i) => sum + i.unit_cost * i.quantity, 0);

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-sparrow-gray text-sm">Loading…</div>;
  }
  if (err) {
    return <p className="p-4 text-sm text-priority-p1">{err}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-xl border border-sparrow-rule bg-white px-4 py-3.5 flex flex-wrap items-center gap-4 text-sm">
        <span className="font-medium text-sparrow-ink">{totalActive} active items</span>
        <span className="text-sparrow-gray">{formatCost(totalValue)} total value</span>
        {flaggedCount > 0 && (
          <button
            onClick={() => setReviewOnly((v) => !v)}
            className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium transition ${
              reviewOnly ? 'bg-sparrow-gold text-white' : 'bg-sparrow-gold/20 text-sparrow-gold'
            }`}
          >
            ⚠ {flaggedCount} need review
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Search description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-sparrow-rule px-3 py-1.5 text-sm text-sparrow-ink focus:outline-none focus:ring-1 focus:ring-sparrow-green flex-1 min-w-[180px]"
        />
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="rounded-lg border border-sparrow-rule px-2.5 py-1.5 text-sm text-sparrow-ink focus:outline-none focus:ring-1 focus:ring-sparrow-green"
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-sparrow-gray">
          <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
          Show removed
        </label>
      </div>

      {/* Grouped items */}
      {locations
        .filter((l) => grouped.has(l.id))
        .map((loc) => {
          const locItems = grouped.get(loc.id)!.sort((a, b) => a.description.localeCompare(b.description));
          return (
            <div key={loc.id} className="rounded-xl border border-sparrow-rule bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-sparrow-rule px-4 py-2.5 bg-sparrow-mist/40">
                <span className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">{loc.name}</span>
                <span className="text-xs text-sparrow-gray">({locItems.length})</span>
              </div>
              {locItems.map((item) => (
                <RegisterItemRow
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  onSave={(patch) => handleSave(item.id, patch)}
                />
              ))}
            </div>
          );
        })}

      {filtered.length === 0 && (
        <div className="rounded-xl border border-sparrow-rule bg-sparrow-mist p-8 text-center">
          <p className="text-sm text-sparrow-gray">No items match this filter.</p>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  archiveCollateralItem,
  createCollateralItem,
  fetchArchivedCollateral,
  fetchCollateral,
  updateCollateralItem,
  type CollateralInput,
  type PartnershipCollateral,
  type ReviewCycle,
} from '@/lib/partnerships-tabs';

function getNextReviewDate(cycle: ReviewCycle): Date {
  const today = new Date();
  const year = today.getFullYear();

  function marchDate(y: number): Date {
    const d = new Date(y, 2, 1); // March 1
    if (d.getDay() === 6) d.setDate(d.getDate() - 1); // Saturday → Friday
    if (d.getDay() === 0) d.setDate(d.getDate() - 2); // Sunday → Friday
    return d;
  }
  function septDate(y: number): Date {
    const d = new Date(y, 8, 1); // Sept 1
    if (d.getDay() === 6) d.setDate(d.getDate() - 1);
    if (d.getDay() === 0) d.setDate(d.getDate() - 2);
    return d;
  }

  const candidates: Date[] = [];
  if (cycle === 'march' || cycle === 'both') {
    let d = marchDate(year);
    if (d <= today) d = marchDate(year + 1);
    candidates.push(d);
  }
  if (cycle === 'sept' || cycle === 'both') {
    let d = septDate(year);
    if (d <= today) d = septDate(year + 1);
    candidates.push(d);
  }
  return candidates.sort((a, b) => a.getTime() - b.getTime())[0];
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function draftsDue(reviewDate: Date): Date {
  const d = new Date(reviewDate);
  d.setDate(d.getDate() - 14);
  return d;
}

const EMPTY_FORM: CollateralInput = {
  item_name: '',
  qty_on_hand: '',
  last_updated: null,
  review_cycle: 'march',
  needs_attention: false,
  notes: '',
};

export function PartnershipCollateralTab() {
  const [items, setItems] = useState<PartnershipCollateral[]>([]);
  const [archived, setArchived] = useState<PartnershipCollateral[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<CollateralInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([fetchCollateral(), showArchived ? fetchArchivedCollateral() : Promise.resolve([])])
      .then(([active, arch]) => { setItems(active); setArchived(arch); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [showArchived]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.item_name.trim()) return;
    setSaving(true);
    try {
      await createCollateralItem({ ...form, notes: form.notes || null, qty_on_hand: form.qty_on_hand || null });
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      load();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(id: string) {
    if (!confirm('Archive this item? It will be hidden from the active list.')) return;
    await archiveCollateralItem(id).catch(console.error);
    load();
  }

  async function handleToggleAttention(item: PartnershipCollateral) {
    const next = !item.needs_attention;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, needs_attention: next } : i)));
    await updateCollateralItem(item.id, { needs_attention: next }).catch(console.error);
  }

  function handleFieldBlur(item: PartnershipCollateral, field: keyof CollateralInput, value: string) {
    const patch = { [field]: value || null };
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    updateCollateralItem(item.id, patch as Partial<CollateralInput>).catch(console.error);
  }

  // Upcoming review banner: any item with next review within 30 days
  const today = new Date();
  const upcomingReview = items
    .map((item) => getNextReviewDate(item.review_cycle))
    .filter((d) => (d.getTime() - today.getTime()) / 86_400_000 <= 30)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const allRows = [...items, ...(showArchived ? archived : [])];

  return (
    <div className="space-y-4">
      {/* Upcoming review banner */}
      {upcomingReview && (
        <div className="rounded-xl border border-sparrow-gold/40 bg-sparrow-gold/5 px-4 py-3 text-sm text-sparrow-ink">
          Collateral review coming up <strong>{formatDate(upcomingReview)}</strong> — drafts due{' '}
          <strong>{formatDate(draftsDue(upcomingReview))}</strong>. Submit all proposed changes to Susanna before that date.
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-sparrow-gray">{items.length} active item{items.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowAddForm((v) => !v)} className="btn-primary text-xs">
          {showAddForm ? 'Cancel' : '+ Add item'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="rounded-xl border border-sparrow-rule bg-white p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="field-label">Item name *</label>
              <input
                className="field-input w-full"
                required
                value={form.item_name}
                onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="field-label">Qty on hand</label>
              <input
                className="field-input w-full"
                value={form.qty_on_hand ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, qty_on_hand: e.target.value }))}
              />
            </div>
            <div>
              <label className="field-label">Review cycle</label>
              <select
                className="field-input w-full"
                value={form.review_cycle}
                onChange={(e) => setForm((f) => ({ ...f, review_cycle: e.target.value as ReviewCycle }))}
              >
                <option value="march">March</option>
                <option value="sept">September</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="field-label">Notes</label>
              <input
                className="field-input w-full"
                value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAddForm(false)} className="btn-ghost text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving…' : 'Add item'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="py-8 text-center text-sm text-sparrow-gray">Loading…</p>}

      {!loading && allRows.length === 0 && (
        <p className="rounded-xl border border-dashed border-sparrow-rule p-8 text-center text-sm text-sparrow-gray">
          No collateral items yet. Add your first item above.
        </p>
      )}

      {!loading && allRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-sparrow-rule bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sparrow-rule text-left">
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Item</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Qty</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Last updated</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Review</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Attention</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Notes</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sparrow-rule">
              {allRows.map((item) => {
                const nextReview = getNextReviewDate(item.review_cycle);
                const isArchived = !item.active;
                return (
                  <tr key={item.id} className={isArchived ? 'opacity-50' : ''}>
                    <td className="px-4 py-2">
                      <input
                        className="field-input w-full min-w-[140px] text-sm"
                        defaultValue={item.item_name}
                        onBlur={(e) => handleFieldBlur(item, 'item_name', e.target.value)}
                        disabled={isArchived}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="field-input w-20 text-sm"
                        defaultValue={item.qty_on_hand ?? ''}
                        placeholder="—"
                        onBlur={(e) => handleFieldBlur(item, 'qty_on_hand', e.target.value)}
                        disabled={isArchived}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        className="field-input text-sm"
                        defaultValue={item.last_updated ?? ''}
                        onBlur={(e) => handleFieldBlur(item, 'last_updated', e.target.value)}
                        disabled={isArchived}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div>
                        <select
                          className="field-input text-sm"
                          value={item.review_cycle}
                          onChange={(e) => {
                            const val = e.target.value as ReviewCycle;
                            setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, review_cycle: val } : i)));
                            updateCollateralItem(item.id, { review_cycle: val }).catch(console.error);
                          }}
                          disabled={isArchived}
                        >
                          <option value="march">March</option>
                          <option value="sept">September</option>
                          <option value="both">Both</option>
                        </select>
                        <p className="mt-0.5 text-[10px] text-sparrow-gray">
                          Next: {formatDate(nextReview)}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        title={item.needs_attention ? 'Needs attention — click to clear' : 'No flag — click to flag'}
                        onClick={() => handleToggleAttention(item)}
                        disabled={isArchived}
                        className={`text-lg ${item.needs_attention ? 'text-amber-500' : 'text-sparrow-rule hover:text-amber-400'}`}
                      >
                        🚩
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="field-input w-full min-w-[160px] text-sm"
                        defaultValue={item.notes ?? ''}
                        placeholder="—"
                        onBlur={(e) => handleFieldBlur(item, 'notes', e.target.value)}
                        disabled={isArchived}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {!isArchived && (
                        <button
                          onClick={() => handleArchive(item.id)}
                          className="text-xs text-sparrow-gray hover:text-priority-p1"
                          title="Archive item"
                        >
                          Archive
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Show archived toggle */}
      <button
        onClick={() => setShowArchived((v) => !v)}
        className="text-xs text-sparrow-gray hover:text-sparrow-ink underline"
      >
        {showArchived ? 'Hide archived items' : 'Show archived items'}
      </button>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { localDate } from '@/lib/date';
import type { Profile } from '@/lib/types';
import {
  archiveCollateralItem,
  createCollateralItem,
  fetchArchivedCollateral,
  fetchCollateral,
  syncCollateralReviewTasks,
  updateCollateralItem,
  type CollateralInput,
  type PartnershipCollateral,
  type ReviewCycle,
} from '@/lib/partnerships-tabs';

// Default review calendar date shown next to the (now informational-only) review_cycle
// field — kept only for historical display per migration 0080's comments.
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

// ── Cadence-driven due date — this (not review_cycle) is what actually drives
// emit_collateral_review_tasks() as of migration 0080. Kept local to this file rather than
// a shared "recurring items" abstraction — collateral keeps its own identity, same as
// partners' daysUntilDue does for the Directory.
const DAY_MS = 86_400_000;

function collateralDueDate(item: PartnershipCollateral): Date {
  return new Date(new Date(`${item.last_reviewed_at}T12:00:00`).getTime() + item.cadence_days * DAY_MS);
}

function collateralDaysUntilDue(item: PartnershipCollateral, today: Date = new Date()): number {
  return Math.floor((collateralDueDate(item).getTime() - today.getTime()) / DAY_MS);
}

type CollateralStatus = 'on_cadence' | 'due_soon' | 'overdue';

const COLLATERAL_STATUS: Record<CollateralStatus, { label: string; dot: string; chip: string }> = {
  on_cadence: { label: 'On cadence', dot: 'bg-sparrow-green', chip: 'bg-sparrow-green/10 text-sparrow-green' },
  due_soon: { label: 'Due soon', dot: 'bg-sparrow-gold', chip: 'bg-sparrow-gold/20 text-sparrow-ink' },
  overdue: { label: 'Overdue', dot: 'bg-priority-p1', chip: 'bg-priority-p1/15 text-priority-p1' },
};

function collateralStatus(item: PartnershipCollateral, today: Date = new Date()): CollateralStatus {
  const days = collateralDaysUntilDue(item, today);
  if (days < 0) return 'overdue';
  if (days <= item.lead_time_days) return 'due_soon';
  return 'on_cadence';
}

function dueLabel(item: PartnershipCollateral, today: Date = new Date()): string {
  const days = collateralDaysUntilDue(item, today);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days <= 7) return `Due in ${days}d`;
  return `Due ${formatDate(collateralDueDate(item))}`;
}

function draftsDue(reviewDate: Date): Date {
  const d = new Date(reviewDate);
  d.setDate(d.getDate() - 14);
  return d;
}

function emptyForm(): CollateralInput {
  return {
    item_name: '',
    qty_on_hand: '',
    last_updated: null,
    review_cycle: 'march',
    needs_attention: false,
    notes: '',
    cadence_days: 182,
    lead_time_days: 14,
    owner_id: '',
    last_reviewed_at: localDate(),
  };
}

type SortKey = 'item' | 'owner' | 'cadence' | 'lead_time' | 'due';
type SortDir = 'asc' | 'desc';

export function PartnershipCollateralTab({ profiles }: { profiles: Profile[] }) {
  const [items, setItems] = useState<PartnershipCollateral[]>([]);
  const [archived, setArchived] = useState<PartnershipCollateral[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<CollateralInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('due');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Same standing-owner pattern used across the room: Bethany (dept=partnerships) + anyone
  // explicitly granted room access. Exec excluded — never a selectable standing owner here.
  const ownerProfiles = profiles.filter(
    (p) => (p.department === 'partnerships' || p.partnerships_access) && p.department !== 'exec',
  );

  function ownerName(id: string) {
    return profiles.find((p) => p.id === id)?.full_name ?? 'Unassigned';
  }

  function load() {
    setLoading(true);
    Promise.all([fetchCollateral(), showArchived ? fetchArchivedCollateral() : Promise.resolve([])])
      .then(([active, arch]) => { setItems(active); setArchived(arch); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [showArchived]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    syncCollateralReviewTasks().catch(console.error);
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.item_name.trim()) return;
    if (!form.owner_id) { setFormError('Owner is required — every item needs someone responsible for its review.'); return; }
    if (!form.cadence_days || form.cadence_days < 1) { setFormError('Cadence (days) is required.'); return; }
    if (!form.lead_time_days || form.lead_time_days < 1) { setFormError('Lead time (days) is required.'); return; }
    setFormError(null);
    setSaving(true);
    try {
      await createCollateralItem({
        ...form,
        notes: form.notes || null,
        qty_on_hand: form.qty_on_hand || null,
        last_reviewed_at: form.last_reviewed_at || localDate(),
      });
      setForm(emptyForm());
      setShowAddForm(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the item.');
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

  // Cadence/lead-time/owner are required (migration 0080 — all NOT NULL). Guard against
  // clearing to empty so a save attempt never hits the DB constraint as its only feedback.
  function handleRequiredNumberBlur(item: PartnershipCollateral, field: 'cadence_days' | 'lead_time_days', raw: string, input: HTMLInputElement) {
    if (!raw) { input.value = String(item[field]); return; }
    const v = Math.max(1, Number(raw));
    if (v === item[field]) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, [field]: v } : i)));
    updateCollateralItem(item.id, { [field]: v } as Partial<CollateralInput>).catch(console.error);
  }

  function handleOwnerChange(item: PartnershipCollateral, ownerId: string) {
    if (!ownerId) return; // required — ignore attempts to unset
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, owner_id: ownerId } : i)));
    updateCollateralItem(item.id, { owner_id: ownerId }).catch(console.error);
  }

  // "Mark reviewed" — the real resolve action for this table (fires on_collateral_reviewed(),
  // which resolves the open task and restarts the clock). A plain editable date field alone
  // wouldn't reliably express "I did this today"; this is a one-click, no-typo way to do it.
  async function handleMarkReviewed(item: PartnershipCollateral) {
    const today = localDate();
    if (item.last_reviewed_at === today) return;
    setBusyId(item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, last_reviewed_at: today } : i)));
    await updateCollateralItem(item.id, { last_reviewed_at: today }).catch(console.error);
    setBusyId(null);
  }

  const now = new Date();
  const overdueCount = items.filter((i) => collateralStatus(i, now) === 'overdue').length;
  const dueSoonCount = items.filter((i) => collateralStatus(i, now) === 'due_soon').length;

  // Legacy March/Sept banner — still shown since review_cycle stays informational/visible,
  // but no longer the thing driving actual reminder tasks (cadence_days/lead_time_days do).
  const upcomingReview = items
    .map((item) => getNextReviewDate(item.review_cycle))
    .filter((d) => (d.getTime() - now.getTime()) / DAY_MS <= 30)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const allRows = [...items, ...(showArchived ? archived : [])];
  const sorted = [...allRows].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'item':
        cmp = a.item_name.localeCompare(b.item_name);
        break;
      case 'owner':
        cmp = ownerName(a.owner_id).localeCompare(ownerName(b.owner_id));
        break;
      case 'cadence':
        cmp = a.cadence_days - b.cadence_days;
        break;
      case 'lead_time':
        cmp = a.lead_time_days - b.lead_time_days;
        break;
      case 'due':
        cmp = collateralDaysUntilDue(a, now) - collateralDaysUntilDue(b, now);
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        className="cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray hover:text-sparrow-ink"
      >
        {label}
        {active && <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </th>
    );
  }

  return (
    <div className="space-y-4">
      {/* Attention banners */}
      {(overdueCount > 0 || dueSoonCount > 0) && (
        <div className="rounded-xl border border-priority-p1/30 bg-priority-p1/5 px-4 py-3 text-sm text-sparrow-ink">
          {overdueCount > 0 && <span>{overdueCount} item{overdueCount > 1 ? 's' : ''} overdue for review. </span>}
          {dueSoonCount > 0 && <span>{dueSoonCount} due soon.</span>}
          {' '}Tasks have been pushed to each item's owner. Sort by Due to see them first.
        </div>
      )}
      {upcomingReview && (
        <div className="rounded-xl border border-sparrow-gold/40 bg-sparrow-gold/5 px-4 py-3 text-sm text-sparrow-ink">
          March/Sept review calendar coming up <strong>{formatDate(upcomingReview)}</strong> — drafts due{' '}
          <strong>{formatDate(draftsDue(upcomingReview))}</strong>. Submit all proposed changes to Susanna before that date.
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-sparrow-gray">{items.length} active item{items.length !== 1 ? 's' : ''}</p>
        <button onClick={() => { setShowAddForm((v) => !v); setFormError(null); }} className="btn-primary text-xs">
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
              <label className="field-label">Owner *</label>
              <select
                className="field-input w-full"
                required
                value={form.owner_id}
                onChange={(e) => setForm((f) => ({ ...f, owner_id: e.target.value }))}
              >
                <option value="">Select an owner…</option>
                {ownerProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
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
              <label className="field-label">Cadence (days) *</label>
              <input
                type="number"
                min={1}
                required
                className="field-input w-full"
                value={form.cadence_days}
                onChange={(e) => setForm((f) => ({ ...f, cadence_days: Math.max(1, Number(e.target.value) || 1) }))}
              />
            </div>
            <div>
              <label className="field-label">Lead time (days) *</label>
              <input
                type="number"
                min={1}
                required
                className="field-input w-full"
                value={form.lead_time_days}
                onChange={(e) => setForm((f) => ({ ...f, lead_time_days: Math.max(1, Number(e.target.value) || 1) }))}
              />
            </div>
            <div>
              <label className="field-label">Review cycle (informational)</label>
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
          {formError && <p className="text-sm text-priority-p1">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setShowAddForm(false); setFormError(null); }} className="btn-ghost text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving…' : 'Add item'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="py-8 text-center text-sm text-sparrow-gray">Loading…</p>}

      {!loading && sorted.length === 0 && (
        <p className="rounded-xl border border-dashed border-sparrow-rule p-8 text-center text-sm text-sparrow-gray">
          No collateral items yet. Add your first item above.
        </p>
      )}

      {!loading && sorted.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-sparrow-rule bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sparrow-rule text-left">
                <th className="w-6 px-3 py-2.5" />
                <SortTh label="Item" k="item" />
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Qty</th>
                <SortTh label="Owner" k="owner" />
                <SortTh label="Cadence" k="cadence" />
                <SortTh label="Lead time" k="lead_time" />
                <SortTh label="Due" k="due" />
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Review cycle</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Attention</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Notes</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sparrow-rule">
              {sorted.map((item) => {
                const isArchived = !item.active;
                const status = collateralStatus(item, now);
                const st = COLLATERAL_STATUS[status];
                const isBusy = busyId === item.id;
                return (
                  <tr key={item.id} className={isArchived ? 'opacity-50' : ''}>
                    <td className="px-3 py-2">
                      <span className={`block h-2 w-2 rounded-full ${st.dot}`} title={st.label} />
                    </td>
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
                      <select
                        className="field-input min-w-[140px] text-sm"
                        value={item.owner_id}
                        onChange={(e) => handleOwnerChange(item, e.target.value)}
                        disabled={isArchived}
                      >
                        {ownerProfiles.map((p) => (
                          <option key={p.id} value={p.id}>{p.full_name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        defaultValue={item.cadence_days}
                        onBlur={(e) => handleRequiredNumberBlur(item, 'cadence_days', e.target.value, e.target)}
                        disabled={isArchived}
                        className="field-input w-16 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        defaultValue={item.lead_time_days}
                        onBlur={(e) => handleRequiredNumberBlur(item, 'lead_time_days', e.target.value, e.target)}
                        disabled={isArchived}
                        className="field-input w-16 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.chip}`}>
                          {dueLabel(item, now)}
                        </span>
                        <button
                          onClick={() => void handleMarkReviewed(item)}
                          disabled={isArchived || isBusy}
                          className="text-left text-[10px] font-medium text-sparrow-green hover:underline disabled:opacity-50"
                        >
                          Mark reviewed
                        </button>
                      </div>
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
                          Info only — next: {formatDate(getNextReviewDate(item.review_cycle))}
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

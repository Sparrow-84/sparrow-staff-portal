import { useState, useEffect, useCallback } from 'react';
import {
  fetchOrCreateSubmission, fetchSubLocations, fetchActiveItems,
  patchSubmission, submitForReview,
  addAddition, deleteAddition, addRemoval, deleteRemoval,
  type NewAddition, type NewRemoval,
} from '@/lib/inventory';
import {
  BATCH_CATEGORIES, BATCH_CATEGORY_HINTS, EXIT_METHOD_LABELS,
  monthName, formatCost, displayAdditionCost, canSubmitForReview,
  isSectionAResolved, isSectionBResolved,
  type InvMonthlySubmission, type InvSubLocation, type InvItem,
  type InvAddition, type InvRemoval,
} from '@/lib/inventory-types';
import { useRequiredFields } from '@/hooks/useRequiredFields';

// ── Addition entry form ───────────────────────────────────────────────────

const EMPTY_ADD: NewAddition = {
  is_batch: false, batch_category: null, description: '',
  serial_number: null, condition: 'used', is_donated: false,
  quantity: 1, cost: 0, cost_basis: 'per_item', cost_source: 'known',
  sub_location_id: null, notes: null,
};

function AdditionForm({
  subLocations,
  onSave,
  onCancel,
}: {
  subLocations: InvSubLocation[];
  onSave: (entry: NewAddition) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<NewAddition>(EMPTY_ADD);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (patch: Partial<NewAddition>) => setForm((f) => ({ ...f, ...patch }));

  const { missingMessage, validate, fieldClass, clear } = useRequiredFields([
    {
      key: 'add-desc',
      label: form.is_batch ? 'Batch category' : 'Description',
      valid: form.is_batch ? !!form.batch_category : form.description.trim().length > 0,
    },
    { key: 'add-cost', label: 'Cost', valid: form.cost > 0 },
    { key: 'add-location', label: 'Location', valid: !!form.sub_location_id },
  ]);

  async function save() {
    if (!validate() || busy) return;
    setBusy(true);
    setErr('');
    try {
      const entry: NewAddition = {
        ...form,
        description: form.is_batch
          ? (form.batch_category ?? '')
          : form.description.trim(),
        batch_category: form.is_batch ? form.batch_category : null,
        serial_number: form.serial_number?.trim() || null,
        notes: form.notes?.trim() || null,
      };
      await onSave(entry);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-sparrow-green/30 bg-sparrow-green/5 p-4 space-y-4">
      {/* Individual / Batch toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => set({ is_batch: false })}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            !form.is_batch
              ? 'bg-sparrow-green text-white'
              : 'bg-white border border-sparrow-rule text-sparrow-gray hover:bg-sparrow-mist'
          }`}
        >
          Individual item
        </button>
        <button
          onClick={() => set({ is_batch: true })}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            form.is_batch
              ? 'bg-sparrow-green text-white'
              : 'bg-white border border-sparrow-rule text-sparrow-gray hover:bg-sparrow-mist'
          }`}
        >
          Batch group
        </button>
      </div>

      {form.is_batch ? (
        <div>
          <label className="field-label" htmlFor="add-desc">Batch category *</label>
          <select
            id="add-desc"
            value={form.batch_category ?? ''}
            onChange={(e) => { set({ batch_category: e.target.value || null }); clear('add-desc'); }}
            className={fieldClass('add-desc')}
          >
            <option value="">Select category…</option>
            {BATCH_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {form.batch_category && BATCH_CATEGORY_HINTS[form.batch_category] && (
            <p className="mt-1 text-xs text-sparrow-gray">
              {BATCH_CATEGORY_HINTS[form.batch_category]}
            </p>
          )}
        </div>
      ) : (
        <div>
          <label className="field-label" htmlFor="add-desc">Description *</label>
          <input
            id="add-desc"
            value={form.description}
            onChange={(e) => { set({ description: e.target.value }); clear('add-desc'); }}
            placeholder='e.g. "Ryobi cordless drill, serial #12345" — be specific'
            className={fieldClass('add-desc')}
          />
          <p className="mt-1 text-xs text-sparrow-gray">
            Include brand, model, and serial # for electronics, power tools, and appliances.
          </p>
        </div>
      )}

      {form.is_batch && (
        <div>
          <label className="field-label">Notes (optional)</label>
          <input
            value={form.notes ?? ''}
            onChange={(e) => set({ notes: e.target.value || null })}
            placeholder='e.g. "donated box from First Baptist, misc toys"'
            className="field-input"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Condition *</label>
          <div className="flex gap-2 mt-1">
            {(['new', 'used'] as const).map((c) => (
              <button
                key={c}
                onClick={() => set({ condition: c })}
                className={`flex-1 rounded-lg border py-1.5 text-sm font-medium transition capitalize ${
                  form.condition === c
                    ? 'border-sparrow-green bg-sparrow-green/10 text-sparrow-green'
                    : 'border-sparrow-rule bg-white text-sparrow-gray hover:bg-sparrow-mist'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="field-label">Quantity *</label>
          <input
            type="number"
            min={1}
            value={form.quantity}
            onChange={(e) => set({ quantity: Math.max(1, parseInt(e.target.value) || 1) })}
            className="field-input"
          />
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="add-cost">Cost *</label>
        <div className="flex gap-2 items-center">
          <span className="text-sparrow-gray text-sm">$</span>
          <input
            id="add-cost"
            type="number"
            min={0}
            step={1}
            value={form.cost || ''}
            onChange={(e) => { set({ cost: parseFloat(e.target.value) || 0 }); clear('add-cost'); }}
            placeholder="0"
            className={fieldClass('add-cost', 'field-input flex-1')}
          />
          {form.quantity > 1 && (
            <div className="flex gap-1">
              {(['per_item', 'total'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => set({ cost_basis: b })}
                  className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                    form.cost_basis === b
                      ? 'border-sparrow-green bg-sparrow-green/10 text-sparrow-green'
                      : 'border-sparrow-rule bg-white text-sparrow-gray hover:bg-sparrow-mist'
                  }`}
                >
                  {b === 'per_item' ? 'each' : 'total'}
                </button>
              ))}
            </div>
          )}
        </div>
        {form.cost > 0 && form.quantity > 1 && (
          <p className="mt-1 text-xs text-sparrow-gray">
            {form.cost_basis === 'per_item'
              ? `Total: ${formatCost(form.cost * form.quantity)}`
              : `Per item: ${formatCost(Math.round(form.cost / form.quantity))}`}
          </p>
        )}
        <div className="flex gap-2 mt-2">
          {(['known', 'estimated'] as const).map((s) => (
            <button
              key={s}
              onClick={() => set({ cost_source: s })}
              className={`rounded-md border px-2 py-1 text-xs transition ${
                form.cost_source === s
                  ? 'border-sparrow-green bg-sparrow-green/10 text-sparrow-green font-medium'
                  : 'border-sparrow-rule bg-white text-sparrow-gray hover:bg-sparrow-mist'
              }`}
            >
              {s === 'known' ? 'Known (receipt / handoff)' : 'Estimated (best guess)'}
            </button>
          ))}
        </div>
        {form.cost_source === 'estimated' && (
          <p className="mt-1 text-xs text-sparrow-gray">
            For donated items, check Facebook Marketplace for a realistic used price.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="add-location">Location *</label>
          <select
            id="add-location"
            value={form.sub_location_id ?? ''}
            onChange={(e) => { set({ sub_location_id: e.target.value || null }); clear('add-location'); }}
            className={fieldClass('add-location')}
          >
            <option value="">Select room / area…</option>
            {subLocations.map((sl) => (
              <option key={sl.id} value={sl.id}>{sl.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_donated}
              onChange={(e) => set({ is_donated: e.target.checked })}
              className="h-4 w-4 accent-sparrow-green"
            />
            <span className="text-sm text-sparrow-ink">Donated</span>
          </label>
        </div>
      </div>

      {!form.is_batch && (
        <div>
          <label className="field-label">Serial number <span className="normal-case font-normal text-sparrow-gray">(required for electronics, power tools, appliances)</span></label>
          <input
            value={form.serial_number ?? ''}
            onChange={(e) => set({ serial_number: e.target.value || null })}
            placeholder="If visible on the item"
            className="field-input"
          />
        </div>
      )}

      {(err || missingMessage) && <p className="text-sm text-priority-p1">{err || missingMessage}</p>}

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="btn-ghost text-sm">Cancel</button>
        <button
          onClick={save}
          disabled={busy}
          className="btn-primary text-sm disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Add item'}
        </button>
      </div>
    </div>
  );
}

// ── Removal entry form ────────────────────────────────────────────────────

function RemovalForm({
  items,
  onSave,
  onCancel,
}: {
  items: InvItem[];
  onSave: (entry: NewRemoval) => Promise<void>;
  onCancel: () => void;
}) {
  const [selectedItemId, setSelectedItemId] = useState('');
  const [freeText, setFreeText] = useState('');
  const [qtyRemoved, setQtyRemoved] = useState(1);
  const [howItLeft, setHowItLeft] = useState<NewRemoval['how_it_left'] | ''>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const selectedItem = items.find((i) => i.id === selectedItemId);
  const description = selectedItem ? selectedItem.description : freeText;
  const maxQty = selectedItem ? selectedItem.quantity : undefined;

  const { missingMessage, validate, fieldClass, clear } = useRequiredFields([
    { key: 'rm-what', label: 'What left', valid: !!(selectedItemId || freeText.trim()) },
    { key: 'rm-how', label: 'How it left', valid: !!howItLeft },
  ]);

  async function save() {
    if (!validate() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await onSave({
        inv_item_id: selectedItemId || null,
        description,
        serial_number: selectedItem?.serial_number ?? null,
        quantity_removed: qtyRemoved,
        how_it_left: howItLeft as NewRemoval['how_it_left'],
        notes: notes.trim() || null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-priority-p1/30 bg-priority-p1/5 p-4 space-y-4">
      {items.length > 0 ? (
        <div>
          <label className="field-label" htmlFor="rm-what">What left? *</label>
          <select
            id="rm-what"
            value={selectedItemId}
            onChange={(e) => { setSelectedItemId(e.target.value); setFreeText(''); clear('rm-what'); }}
            className={fieldClass('rm-what')}
          >
            <option value="">Select item from register…</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.description}
                {item.quantity > 1 ? ` (qty: ${item.quantity})` : ''}
              </option>
            ))}
            <option value="__freetext__">Not in list — type it in</option>
          </select>
          {selectedItemId === '__freetext__' && (
            <input
              value={freeText}
              onChange={(e) => { setFreeText(e.target.value); setSelectedItemId(''); clear('rm-what'); }}
              placeholder='e.g. "Large brown leather couch"'
              className="field-input mt-2"
            />
          )}
        </div>
      ) : (
        <div>
          <label className="field-label" htmlFor="rm-what">What left? *</label>
          <input
            id="rm-what"
            value={freeText}
            onChange={(e) => { setFreeText(e.target.value); clear('rm-what'); }}
            placeholder='e.g. "Large brown leather couch" — be specific'
            className={fieldClass('rm-what')}
          />
          <p className="mt-1 text-xs text-sparrow-gray">
            Only list items physically off the property. Broken items still on site are not gone yet.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Quantity removed *</label>
          <input
            type="number"
            min={1}
            max={maxQty}
            value={qtyRemoved}
            onChange={(e) => setQtyRemoved(Math.max(1, parseInt(e.target.value) || 1))}
            className="field-input"
          />
          {maxQty && qtyRemoved < maxQty && (
            <p className="mt-1 text-xs text-sparrow-gray">
              {maxQty - qtyRemoved} of {maxQty} will remain.
            </p>
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="rm-how">How did it leave? *</label>
          <select
            id="rm-how"
            value={howItLeft}
            onChange={(e) => { setHowItLeft(e.target.value as NewRemoval['how_it_left']); clear('rm-how'); }}
            className={fieldClass('rm-how')}
          >
            <option value="">Select…</option>
            {(Object.entries(EXIT_METHOD_LABELS) as [NewRemoval['how_it_left'], string][]).map(
              ([k, v]) => <option key={k} value={k}>{v}</option>,
            )}
          </select>
        </div>
      </div>

      <div>
        <label className="field-label">Notes (optional)</label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional context"
          className="field-input"
        />
      </div>

      {(err || missingMessage) && <p className="text-sm text-priority-p1">{err || missingMessage}</p>}

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} className="btn-ghost text-sm">Cancel</button>
        <button
          onClick={save}
          disabled={busy}
          className="btn-primary text-sm disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Log removal'}
        </button>
      </div>
    </div>
  );
}

// ── Addition row ──────────────────────────────────────────────────────────

function AdditionRow({
  entry,
  onDelete,
}: {
  entry: InvAddition;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-sparrow-green/25 bg-sparrow-green/5 px-4 py-3">
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-sparrow-ink truncate">{entry.description}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-sparrow-gray">
          <span>{displayAdditionCost(entry)}</span>
          {entry.cost_source === 'estimated' && (
            <span className="text-sparrow-gold">estimated</span>
          )}
          <span className="capitalize">{entry.condition}</span>
          {entry.is_donated && <span>Donated</span>}
          {entry.sub_location && <span>{entry.sub_location.name}</span>}
          {entry.is_batch && <span className="italic">{entry.batch_category}</span>}
          {entry.serial_number && <span>S/N: {entry.serial_number}</span>}
        </div>
      </div>
      <button
        onClick={onDelete}
        className="shrink-0 text-xs text-sparrow-gray hover:text-priority-p1 transition"
        aria-label="Remove entry"
      >
        ✕
      </button>
    </div>
  );
}

// ── Removal row ───────────────────────────────────────────────────────────

function RemovalRow({
  entry,
  onDelete,
}: {
  entry: InvRemoval;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-priority-p1/25 bg-priority-p1/5 px-4 py-3">
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-sparrow-ink truncate">{entry.description}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-sparrow-gray">
          {entry.quantity_removed > 1 && <span>Qty removed: {entry.quantity_removed}</span>}
          <span>{EXIT_METHOD_LABELS[entry.how_it_left]}</span>
        </div>
      </div>
      <button
        onClick={onDelete}
        className="shrink-0 text-xs text-sparrow-gray hover:text-priority-p1 transition"
        aria-label="Remove entry"
      >
        ✕
      </button>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────

export function MonthlySubmissionForm({
  locationId,
  locationName,
  month,
  year,
  onSubmitted,
  onBack,
}: {
  locationId: string;
  locationName: string;
  month: number;
  year: number;
  onSubmitted: () => void;
  onBack: () => void;
}) {
  const [sub, setSub] = useState<InvMonthlySubmission | null>(null);
  const [subLocations, setSubLocations] = useState<InvSubLocation[]>([]);
  const [items, setItems] = useState<InvItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRemovalForm, setShowRemovalForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, sls, its] = await Promise.all([
        fetchOrCreateSubmission(locationId, month, year),
        fetchSubLocations(locationId),
        fetchActiveItems(locationId),
      ]);
      setSub(s);
      setSubLocations(sls);
      setItems(its);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load.');
    } finally {
      setLoading(false);
    }
  }, [locationId, month, year]);

  useEffect(() => { void load(); }, [load]);

  const reload = useCallback(async () => {
    if (!sub) return;
    try {
      const s = await fetchOrCreateSubmission(locationId, month, year);
      setSub(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not reload.');
    }
  }, [sub, locationId, month, year]);

  async function handleNothingCameIn(checked: boolean) {
    if (!sub) return;
    await patchSubmission(sub.id, { nothing_came_in: checked });
    setSub((s) => s ? { ...s, nothing_came_in: checked } : s);
  }

  async function handleNothingLeft(checked: boolean) {
    if (!sub) return;
    await patchSubmission(sub.id, { nothing_left: checked });
    setSub((s) => s ? { ...s, nothing_left: checked } : s);
  }

  async function handleSaveAddition(entry: NewAddition) {
    if (!sub) return;
    await addAddition(sub.id, entry);
    setShowAddForm(false);
    await reload();
  }

  async function handleDeleteAddition(id: string) {
    await deleteAddition(id);
    await reload();
  }

  async function handleSaveRemoval(entry: NewRemoval) {
    if (!sub) return;
    await addRemoval(sub.id, entry);
    setShowRemovalForm(false);
    await reload();
  }

  async function handleDeleteRemoval(id: string) {
    await deleteRemoval(id);
    await reload();
  }

  async function handleSubmit() {
    if (!sub) return;
    setSubmitting(true);
    setErr('');
    try {
      await submitForReview(sub.id);
      onSubmitted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-sparrow-gray text-sm">
        Loading…
      </div>
    );
  }

  if (!sub) {
    return <p className="p-6 text-sm text-priority-p1">{err || 'Could not load submission.'}</p>;
  }

  const additions = sub.additions ?? [];
  const removals = sub.removals ?? [];
  const sectionAOk = isSectionAResolved(sub);
  const sectionBOk = isSectionBResolved(sub);
  const ready = canSubmitForReview(sub);
  const isReadOnly = sub.status !== 'draft';

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <button onClick={onBack} className="text-xs text-sparrow-gray hover:text-sparrow-green transition mb-3">
          ← Back
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-semibold">{locationName}</h1>
            <p className="text-sparrow-gray text-sm mt-0.5">{monthName(month)} {year} — Monthly inventory</p>
          </div>
          {isReadOnly && (
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              sub.status === 'approved'
                ? 'bg-sparrow-green/10 text-sparrow-green'
                : 'bg-priority-p3/15 text-priority-p3'
            }`}>
              {sub.status === 'approved' ? 'Approved' : 'Submitted — awaiting review'}
            </span>
          )}
        </div>
      </div>

      {/* Section A — Additions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sparrow-ink">
            Section A — Items that arrived this month
          </h2>
          {!sectionAOk && (
            <span className="text-xs text-priority-p1">Required</span>
          )}
          {sectionAOk && (
            <span className="text-xs text-sparrow-green">✓ Resolved</span>
          )}
        </div>

        {additions.map((a) => (
          <AdditionRow
            key={a.id}
            entry={a}
            onDelete={isReadOnly ? () => {} : () => handleDeleteAddition(a.id)}
          />
        ))}

        {!isReadOnly && (
          <>
            {showAddForm ? (
              <AdditionForm
                subLocations={subLocations}
                onSave={handleSaveAddition}
                onCancel={() => setShowAddForm(false)}
              />
            ) : (
              <button
                onClick={() => { setShowAddForm(true); handleNothingCameIn(false); }}
                disabled={sub.nothing_came_in}
                className="w-full rounded-xl border border-dashed border-sparrow-rule py-3 text-sm text-sparrow-gray hover:border-sparrow-green/40 hover:text-sparrow-green transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Add item
              </button>
            )}

            <label className={`flex items-center gap-2 cursor-pointer ${additions.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
              <input
                type="checkbox"
                checked={sub.nothing_came_in}
                onChange={(e) => {
                  handleNothingCameIn(e.target.checked);
                  if (e.target.checked) setShowAddForm(false);
                }}
                disabled={additions.length > 0}
                className="h-4 w-4 accent-sparrow-green"
              />
              <span className="text-sm text-sparrow-gray">Nothing came in this month</span>
            </label>
          </>
        )}
      </section>

      <div className="border-t border-sparrow-rule" />

      {/* Section B — Removals */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-sparrow-ink">
            Section B — Items that left this month
          </h2>
          {!sectionBOk && (
            <span className="text-xs text-priority-p1">Required</span>
          )}
          {sectionBOk && (
            <span className="text-xs text-sparrow-green">✓ Resolved</span>
          )}
        </div>

        {removals.map((r) => (
          <RemovalRow
            key={r.id}
            entry={r}
            onDelete={isReadOnly ? () => {} : () => handleDeleteRemoval(r.id)}
          />
        ))}

        {!isReadOnly && (
          <>
            {showRemovalForm ? (
              <RemovalForm
                items={items}
                onSave={handleSaveRemoval}
                onCancel={() => setShowRemovalForm(false)}
              />
            ) : (
              <button
                onClick={() => { setShowRemovalForm(true); handleNothingLeft(false); }}
                disabled={sub.nothing_left}
                className="w-full rounded-xl border border-dashed border-sparrow-rule py-3 text-sm text-sparrow-gray hover:border-priority-p1/40 hover:text-priority-p1 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Log removal
              </button>
            )}

            <label className={`flex items-center gap-2 cursor-pointer ${removals.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
              <input
                type="checkbox"
                checked={sub.nothing_left}
                onChange={(e) => {
                  handleNothingLeft(e.target.checked);
                  if (e.target.checked) setShowRemovalForm(false);
                }}
                disabled={removals.length > 0}
                className="h-4 w-4 accent-sparrow-green"
              />
              <span className="text-sm text-sparrow-gray">Nothing left this month</span>
            </label>
          </>
        )}
      </section>

      {/* Submit */}
      {!isReadOnly && (
        <div className="border-t border-sparrow-rule pt-4">
          {err && <p className="text-sm text-priority-p1 mb-3">{err}</p>}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSubmit}
              disabled={!ready || submitting}
              className="btn-primary disabled:opacity-40"
            >
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
            {!ready && (
              <p className="text-xs text-sparrow-gray">
                {!sectionAOk && !sectionBOk
                  ? 'Resolve both sections to submit'
                  : !sectionAOk
                  ? 'Resolve Section A to submit'
                  : 'Resolve Section B to submit'}
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-sparrow-gray">
            Once submitted, your sheet is locked and sent to Susanna for review.
          </p>
        </div>
      )}
    </div>
  );
}

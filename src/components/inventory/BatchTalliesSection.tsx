import { useState, useEffect, useCallback } from 'react';
import {
  fetchBatchTallies, upsertBatchTally, fetchBatchActivity, fetchBatchRegisterValues,
} from '@/lib/inventory';
import {
  BENTON_SCHEDULE_SHORT, formatCost,
  type InvBatchTally,
} from '@/lib/inventory-types';
import { useRequiredFields } from '@/hooks/useRequiredFields';

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

// ── Tally row ─────────────────────────────────────────────────────────────

function TallyRow({
  tally,
  addedValue,
  registerValue,
  onSave,
}: {
  tally: InvBatchTally;
  addedValue: number;
  registerValue: number;
  onSave: (patch: { filed_value?: number | null; decision?: 'keep' | 'update' | 'assess' | null }) => Promise<void>;
}) {
  const [editingValue, setEditingValue] = useState(false);
  const [draftValue, setDraftValue] = useState(String(tally.filed_value ?? ''));
  const [saving, setSaving] = useState(false);

  const filed = tally.filed_value;
  const net = filed != null ? registerValue - filed : null;

  const valueId = `tally-value-${tally.id}`;
  const parsedDraft = parseFloat(draftValue);
  const { missingMessage, validate, fieldClass, clear, reset: resetValidation } = useRequiredFields([
    { key: valueId, label: 'Filed value', valid: draftValue.trim() !== '' && !isNaN(parsedDraft) && parsedDraft >= 0 },
  ]);

  async function saveValue() {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({ filed_value: parsedDraft });
      setEditingValue(false);
    } finally {
      setSaving(false);
    }
  }

  async function setDecision(d: 'keep' | 'update' | 'assess') {
    setSaving(true);
    try {
      await onSave({ decision: tally.decision === d ? null : d });
    } finally {
      setSaving(false);
    }
  }

  const decisionBtn = (label: string, value: 'keep' | 'update' | 'assess', color: string) => (
    <button
      type="button"
      disabled={saving}
      onClick={() => void setDecision(value)}
      className={`rounded px-2 py-1 text-xs font-medium transition disabled:opacity-40 ${
        tally.decision === value
          ? color
          : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-rule dark:hover:bg-sparrow-dark-border'
      }`}
    >
      {label}
    </button>
  );

  return (
    <tr className="border-b border-sparrow-rule dark:border-sparrow-dark-border last:border-0 hover:bg-sparrow-mist/30 transition-colors">
      {/* Category */}
      <td className="py-2.5 pl-4 pr-3">
        <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{tally.category}</p>
        <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{BENTON_SCHEDULE_SHORT[tally.schedule]}</p>
      </td>

      {/* Filed Last Year */}
      <td className="py-2.5 pr-3 text-right whitespace-nowrap">
        {editingValue ? (
          <span className="inline-flex flex-col items-end gap-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">$</span>
              <input
                id={valueId}
                type="number"
                min={0}
                step={1}
                value={draftValue}
                onChange={(e) => { setDraftValue(e.target.value); clear(valueId); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveValue();
                  if (e.key === 'Escape') setEditingValue(false);
                }}
                className={`w-20 rounded border px-1.5 py-0.5 text-sm text-sparrow-ink dark:text-sparrow-dark-ink focus:outline-none ${
                  fieldClass(valueId, '').includes('field-input-error')
                    ? 'border-priority-p1'
                    : 'border-sparrow-green dark:border-sparrow-dark-green'
                }`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => void saveValue()}
                disabled={saving}
                className="text-xs text-sparrow-green dark:text-sparrow-dark-green font-medium disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingValue(false)}
                className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray"
              >
                ✕
              </button>
            </span>
            {missingMessage && <span className="text-[11px] text-priority-p1">{missingMessage}</span>}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => { setDraftValue(String(tally.filed_value ?? '')); setEditingValue(true); resetValidation(); }}
            className={`text-sm font-medium hover:underline transition ${
              filed == null ? 'text-sparrow-gold italic' : 'text-sparrow-ink dark:text-sparrow-dark-ink'
            }`}
            title="Click to edit"
          >
            {filed != null ? formatCost(filed) : 'Enter filed amount'}
          </button>
        )}
      </td>

      {/* Added This Year */}
      <td className="py-2.5 pr-3 text-right text-sm whitespace-nowrap">
        {addedValue > 0
          ? <span className="text-sparrow-green dark:text-sparrow-dark-green font-medium">+{formatCost(addedValue)}</span>
          : <span className="text-sparrow-gray dark:text-sparrow-dark-gray">—</span>
        }
      </td>

      {/* Register Total */}
      <td className="py-2.5 pr-3 text-right text-sm text-sparrow-ink dark:text-sparrow-dark-ink whitespace-nowrap">
        {registerValue > 0 ? formatCost(registerValue) : <span className="text-sparrow-gray dark:text-sparrow-dark-gray">—</span>}
      </td>

      {/* Net (register - filed) */}
      <td className="py-2.5 pr-3 text-right whitespace-nowrap">
        {net != null ? (
          <span className={`text-sm font-medium ${
            Math.abs(net) < 25
              ? 'text-sparrow-gray dark:text-sparrow-dark-gray'
              : net > 0
                ? 'text-sparrow-green dark:text-sparrow-dark-green'
                : 'text-priority-p1'
          }`}>
            {net > 0 ? '+' : ''}{formatCost(net)}
          </span>
        ) : (
          <span className="text-sparrow-gray dark:text-sparrow-dark-gray text-sm">—</span>
        )}
      </td>

      {/* Decision */}
      <td className="py-2.5 pr-4">
        <div className="flex gap-1.5">
          {decisionBtn('Keep', 'keep', 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-ink dark:text-sparrow-dark-ink border border-sparrow-rule dark:border-sparrow-dark-border-dark')}
          {decisionBtn('Update', 'update', 'bg-sparrow-green/15 text-sparrow-green dark:text-sparrow-dark-green border border-sparrow-green/30')}
          {decisionBtn('Assess', 'assess', 'bg-sparrow-gold/15 text-sparrow-gold border border-sparrow-gold/30')}
        </div>
      </td>
    </tr>
  );
}

// ── Location group ─────────────────────────────────────────────────────────

function LocationGroup({
  locationName,
  tallies,
  activity,
  register,
  onSave,
}: {
  locationName: string;
  tallies: InvBatchTally[];
  activity: Record<string, number>;
  register: Record<string, number>;
  onSave: (locationId: string, category: string, patch: { filed_value?: number | null; decision?: 'keep' | 'update' | 'assess' | null }) => Promise<void>;
}) {
  const sorted = [...tallies].sort((a, b) => a.category.localeCompare(b.category));
  const totalFiled = tallies.reduce((s, t) => s + (t.filed_value ?? 0), 0);

  return (
    <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface overflow-hidden mb-4">
      <div className="flex items-center justify-between border-b border-sparrow-rule dark:border-sparrow-dark-border px-4 py-2.5 bg-sparrow-green/10">
        <span className="text-xs font-semibold uppercase tracking-wide text-sparrow-green dark:text-sparrow-dark-green">
          {locationName}
        </span>
        <span className="text-xs text-sparrow-green/70">
          {tallies.length} {tallies.length === 1 ? 'category' : 'categories'} · {formatCost(totalFiled)} filed
        </span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-sparrow-rule dark:border-sparrow-dark-border">
            <th className="py-2 pl-4 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Category</th>
            <th className="py-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Filed</th>
            <th className="py-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Added</th>
            <th className="py-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Register</th>
            <th className="py-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Net</th>
            <th className="py-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Jan Decision</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((tally) => (
            <TallyRow
              key={tally.id}
              tally={tally}
              addedValue={activity[tally.category] ?? 0}
              registerValue={register[tally.category] ?? 0}
              onSave={(patch) => onSave(tally.location_id, tally.category, patch)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────

export function BatchTalliesSection({ year }: { year: number }) {
  const [tallies, setTallies] = useState<InvBatchTally[]>([]);
  const [activity, setActivity] = useState<Record<string, Record<string, number>>>({});
  const [register, setRegister] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [t, a, r] = await Promise.all([
        fetchBatchTallies(year),
        fetchBatchActivity(year),
        fetchBatchRegisterValues(),
      ]);
      setTallies(t);
      setActivity(a);
      setRegister(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load batch tallies.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(
    locationId: string,
    category: string,
    patch: { filed_value?: number | null; decision?: 'keep' | 'update' | 'assess' | null },
  ) {
    setTallies((prev) =>
      prev.map((t) => t.location_id === locationId && t.category === category ? { ...t, ...patch } : t),
    );
    try {
      await upsertBatchTally(year, locationId, category, patch);
    } catch {
      void load();
    }
  }

  // Group by location, sorted by sort_order
  const byLocation = new Map<string, { name: string; sort_order: number; tallies: InvBatchTally[] }>();
  for (const t of tallies) {
    if (!byLocation.has(t.location_id)) {
      byLocation.set(t.location_id, { name: t.location.name, sort_order: t.location.sort_order, tallies: [] });
    }
    byLocation.get(t.location_id)!.tallies.push(t);
  }
  const locations = [...byLocation.entries()]
    .sort(([, a], [, b]) => a.sort_order - b.sort_order);

  const assessCount  = tallies.filter((t) => t.decision === 'assess').length;
  const updateCount  = tallies.filter((t) => t.decision === 'update').length;
  const missingCount = tallies.filter((t) => t.filed_value == null).length;

  return (
    <div>
      {/* Section heading */}
      <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface overflow-hidden mb-4">
        <div className="flex items-center justify-between gap-4 border-b border-sparrow-rule dark:border-sparrow-dark-border px-4 py-2.5 bg-sparrow-mist/40">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
              Batch Category Tallies
            </span>
            <InfoButton>
              <p>
                These are groups of similar small items (each under $50) that get reported
                to Benton County as a single dollar total per category, not item by item.
              </p>
              <p>
                <strong>Filed</strong> is what you reported to the county last year. Click to edit.
              </p>
              <p>
                <strong>Added</strong> is the value of batch items approved this year via monthly submissions.
              </p>
              <p>
                <strong>Register</strong> is the current total of active batch items in the inventory register.
              </p>
              <p>
                <strong>Net</strong> is the difference between the register and what was filed. Positive = you have more than you reported.
              </p>
              <p>
                <strong>In January:</strong> compare. If the gap is small, click Keep. If significant, click Update. If you're unsure, click Assess.
              </p>
            </InfoButton>
          </div>
          <div className="flex items-center gap-3 text-xs shrink-0">
            {missingCount > 0 && (
              <span className="text-sparrow-gold font-medium">{missingCount} need filed amounts</span>
            )}
            {assessCount > 0 && (
              <span className="text-sparrow-gold font-medium">{assessCount} to assess</span>
            )}
            {updateCount > 0 && (
              <span className="text-sparrow-green dark:text-sparrow-dark-green font-medium">{updateCount} to update</span>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24 text-sparrow-gray dark:text-sparrow-dark-gray text-sm rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">Loading…</div>
      ) : err ? (
        <p className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 text-sm text-priority-p1">{err}</p>
      ) : locations.length === 0 ? (
        <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-8 text-center">
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            No batch items recorded yet. Batch categories appear here after monthly submissions are approved.
          </p>
        </div>
      ) : (
        locations.map(([locationId, { name, tallies: locTallies }]) => (
          <LocationGroup
            key={locationId}
            locationName={name}
            tallies={locTallies}
            activity={activity[locationId] ?? {}}
            register={register[locationId] ?? {}}
            onSave={handleSave}
          />
        ))
      )}
    </div>
  );
}

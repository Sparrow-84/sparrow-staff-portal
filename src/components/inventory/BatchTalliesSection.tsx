import { useState, useEffect, useCallback } from 'react';
import {
  fetchBatchTallies, upsertBatchTally, ensureBatchTalliesExist,
} from '@/lib/inventory';
import {
  BATCH_CATEGORIES, BENTON_SCHEDULE_SHORT, formatCost,
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
        className="ml-1.5 text-sparrow-gray hover:text-sparrow-ink transition text-sm leading-none"
        aria-label="More information"
      >
        ⓘ
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 w-72 rounded-lg border border-sparrow-rule bg-white p-3 shadow-lg">
            <div className="text-xs text-sparrow-gray leading-relaxed space-y-1.5">
              {children}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-2.5 text-xs text-sparrow-green font-medium"
            >
              Got it
            </button>
          </div>
        </>
      )}
    </span>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────

function TallyRow({
  tally,
  registerValue,
  onSave,
}: {
  tally: InvBatchTally;
  registerValue: number;
  onSave: (patch: { filed_value?: number | null; decision?: 'keep' | 'update' | 'assess' | null; notes?: string | null }) => Promise<void>;
}) {
  const [editingValue, setEditingValue] = useState(false);
  const [draftValue, setDraftValue] = useState(String(tally.filed_value ?? ''));
  const [saving, setSaving] = useState(false);

  const filed = tally.filed_value;
  const gap = filed != null ? registerValue - filed : null;

  const valueId = `tally-value-${tally.category.replace(/[^a-z0-9]+/gi, '-')}`;
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

  async function setDecision(d: 'keep' | 'update' | 'assess' | null) {
    setSaving(true);
    try {
      await onSave({ decision: d });
    } finally {
      setSaving(false);
    }
  }

  const decisionBtn = (label: string, value: 'keep' | 'update' | 'assess', color: string) => (
    <button
      type="button"
      disabled={saving}
      onClick={() => void setDecision(tally.decision === value ? null : value)}
      className={`rounded px-2 py-1 text-xs font-medium transition disabled:opacity-40 ${
        tally.decision === value
          ? color
          : 'bg-sparrow-mist text-sparrow-gray hover:bg-sparrow-rule'
      }`}
    >
      {label}
    </button>
  );

  return (
    <tr className="border-b border-sparrow-rule last:border-0 hover:bg-sparrow-mist/30 transition-colors">
      {/* Category + schedule */}
      <td className="py-2.5 pl-4 pr-3">
        <p className="text-sm text-sparrow-ink">{tally.category}</p>
        <p className="text-xs text-sparrow-gray">{BENTON_SCHEDULE_SHORT[tally.schedule]}</p>
      </td>

      {/* Filed value */}
      <td className="py-2.5 pr-3 text-right whitespace-nowrap">
        {editingValue ? (
          <span className="inline-flex flex-col items-end gap-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-xs text-sparrow-gray">$</span>
              <input
                id={valueId}
                type="number"
                min={0}
                step={1}
                value={draftValue}
                onChange={(e) => { setDraftValue(e.target.value); clear(valueId); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void saveValue(); if (e.key === 'Escape') setEditingValue(false); }}
                className={`w-20 rounded border px-1.5 py-0.5 text-sm text-sparrow-ink focus:outline-none ${
                  fieldClass(valueId, '').includes('field-input-error')
                    ? 'border-priority-p1 focus:border-priority-p1'
                    : 'border-sparrow-green'
                }`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => void saveValue()}
                disabled={saving}
                className="text-xs text-sparrow-green font-medium disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingValue(false)}
                className="text-xs text-sparrow-gray"
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
              filed == null ? 'text-sparrow-gold italic' : 'text-sparrow-ink'
            }`}
            title="Click to edit"
          >
            {filed != null ? formatCost(filed) : 'Enter filed amount'}
          </button>
        )}
      </td>

      {/* Register value */}
      <td className="py-2.5 pr-3 text-right text-sm text-sparrow-ink whitespace-nowrap">
        {registerValue > 0 ? formatCost(registerValue) : <span className="text-sparrow-gray">—</span>}
      </td>

      {/* Gap */}
      <td className="py-2.5 pr-3 text-right whitespace-nowrap">
        {gap != null ? (
          <span className={`text-sm font-medium ${
            Math.abs(gap) < 25
              ? 'text-sparrow-gray'
              : gap > 0
                ? 'text-sparrow-green'
                : 'text-priority-p1'
          }`}>
            {gap > 0 ? '+' : ''}{formatCost(gap)}
          </span>
        ) : (
          <span className="text-sparrow-gray text-sm">—</span>
        )}
      </td>

      {/* Decision */}
      <td className="py-2.5 pr-4">
        <div className="flex gap-1.5">
          {decisionBtn('Keep', 'keep', 'bg-sparrow-mist text-sparrow-ink border border-sparrow-rule-dark')}
          {decisionBtn('Update', 'update', 'bg-sparrow-green/15 text-sparrow-green border border-sparrow-green/30')}
          {decisionBtn('Assess', 'assess', 'bg-sparrow-gold/15 text-sparrow-gold border border-sparrow-gold/30')}
        </div>
      </td>
    </tr>
  );
}

// ── Main section ──────────────────────────────────────────────────────────

export function BatchTalliesSection({
  year,
  batchValuesByCategory,
}: {
  year: number;
  batchValuesByCategory: Record<string, number>;
}) {
  const [tallies, setTallies] = useState<InvBatchTally[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      await ensureBatchTalliesExist(year, BATCH_CATEGORIES);
      const data = await fetchBatchTallies(year);
      // Show all 10 categories, fill in any missing with defaults
      const byCategory = Object.fromEntries(data.map((t) => [t.category, t]));
      const full = BATCH_CATEGORIES.map((cat) => byCategory[cat] ?? {
        id: '', category: cat, year, schedule: 'schedule_5a' as const,
        filed_value: null, decision: null, notes: null,
        updated_at: '', updated_by: null,
      });
      setTallies(full);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load batch tallies.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(
    category: string,
    patch: { filed_value?: number | null; decision?: 'keep' | 'update' | 'assess' | null; notes?: string | null },
  ) {
    setTallies((prev) =>
      prev.map((t) => t.category === category ? { ...t, ...patch } : t),
    );
    try {
      await upsertBatchTally(year, category, patch);
    } catch {
      void load();
    }
  }

  const pendingCount = tallies.filter((t) => t.decision === null && t.filed_value != null).length;
  const assessCount  = tallies.filter((t) => t.decision === 'assess').length;
  const updateCount  = tallies.filter((t) => t.decision === 'update').length;
  const missingCount = tallies.filter((t) => t.filed_value == null).length;

  return (
    <div className="rounded-xl border border-sparrow-rule bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-sparrow-rule px-4 py-2.5 bg-sparrow-mist/40">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
            Batch Category Tallies
          </span>
          <InfoButton>
            <p>
              These categories are groups of similar small items (each under $50) that get reported
              to Benton County as a single dollar total per category — not item by item.
            </p>
            <p>
              <strong>Filed value</strong> is what you reported to the county in your most recent
              filing. Click it to edit. Enter the value from your last Benton County return if it
              shows "Enter filed amount."
            </p>
            <p>
              <strong>Register</strong> is what your inventory system currently shows for that
              category (all locations combined).
            </p>
            <p>
              <strong>In January:</strong> compare the two. If the gap is significant, click Update.
              If losses roughly offset gains or the amount is too small to matter, click Keep. If
              you're not sure yet, click Assess.
            </p>
            <p className="text-sparrow-gray/80">
              Filed values are intentionally conservative — when audited, you can always account for
              what's present.
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
            <span className="text-sparrow-green font-medium">{updateCount} to update</span>
          )}
          {pendingCount > 0 && missingCount === 0 && assessCount === 0 && updateCount === 0 && (
            <span className="text-sparrow-gray">{pendingCount} need a decision</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24 text-sparrow-gray text-sm">Loading…</div>
      ) : err ? (
        <p className="p-4 text-sm text-priority-p1">{err}</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-sparrow-rule">
              <th className="py-2 pl-4 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">
                Category
              </th>
              <th className="py-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">
                Filed
              </th>
              <th className="py-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">
                Register
              </th>
              <th className="py-2 pr-3 text-right text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">
                Gap
              </th>
              <th className="py-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">
                January Decision
              </th>
            </tr>
          </thead>
          <tbody>
            {tallies.map((tally) => (
              <TallyRow
                key={tally.category}
                tally={tally}
                registerValue={batchValuesByCategory[tally.category] ?? 0}
                onSave={(patch) => handleSave(tally.category, patch)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

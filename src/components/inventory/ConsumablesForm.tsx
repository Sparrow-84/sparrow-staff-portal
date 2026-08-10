import { useState, useEffect, useCallback } from 'react';
import { fetchConsumablesSnapshot, upsertConsumablesSnapshot } from '@/lib/inventory';
import { CONSUMABLES_CATEGORIES, formatCost, type InvConsumablesSnapshot } from '@/lib/inventory-types';

type CategoryAmounts = Record<string, number>;
type CategoryNotes   = Record<string, string>;

function buildDefaults(): CategoryAmounts {
  return Object.fromEntries(CONSUMABLES_CATEGORIES.map((c) => [c, 0]));
}

function buildNoteDefaults(): CategoryNotes {
  return Object.fromEntries(CONSUMABLES_CATEGORIES.map((c) => [c, '']));
}

function snapshotToAmounts(rows: InvConsumablesSnapshot[]): CategoryAmounts {
  const result = buildDefaults();
  for (const row of rows) {
    if (row.category in result) result[row.category] = row.amount;
  }
  return result;
}

function snapshotToNotes(rows: InvConsumablesSnapshot[]): CategoryNotes {
  const result = buildNoteDefaults();
  for (const row of rows) {
    if (row.category in result) result[row.category] = row.notes ?? '';
  }
  return result;
}

export function ConsumablesForm() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [amounts, setAmounts] = useState<CategoryAmounts>(buildDefaults());
  const [notes, setNotes] = useState<CategoryNotes>(buildNoteDefaults());
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setDirty(false);
    setErr('');
    try {
      const rows = await fetchConsumablesSnapshot(year);
      setAmounts(snapshotToAmounts(rows));
      setNotes(snapshotToNotes(rows));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load consumables data.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { void load(); }, [load]);

  function handleAmountChange(category: string, raw: string) {
    const parsed = parseFloat(raw.replace(/[^0-9.]/g, ''));
    setAmounts(prev => ({ ...prev, [category]: isNaN(parsed) ? 0 : parsed }));
    setDirty(true);
    setSavedAt(null);
  }

  function handleNotesChange(category: string, value: string) {
    setNotes(prev => ({ ...prev, [category]: value }));
    setDirty(true);
    setSavedAt(null);
  }

  async function handleSave() {
    setSaving(true);
    setErr('');
    try {
      await Promise.all(
        CONSUMABLES_CATEGORIES.map((cat) =>
          upsertConsumablesSnapshot(year, cat, amounts[cat] ?? 0, notes[cat] || null),
        ),
      );
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyFromPrior() {
    try {
      const priorRows = await fetchConsumablesSnapshot(year - 1);
      if (priorRows.length === 0) return;
      setAmounts(snapshotToAmounts(priorRows));
      setNotes(snapshotToNotes(priorRows));
      setDirty(true);
      setSavedAt(null);
    } catch {
      // silently ignore
    }
  }

  const total = CONSUMABLES_CATEGORIES.reduce((sum, cat) => sum + (amounts[cat] ?? 0), 0);

  return (
    <div className="max-w-2xl space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Schedule 2 — Noninventory Supplies</p>
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray mt-0.5">
              Broad category estimates reported to Benton County annually. These are set by Andrew's directive — update only if he says to change them.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <label className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              min={2020}
              max={2030}
              className="w-20 rounded border border-sparrow-rule dark:border-sparrow-dark-border px-2 py-1 text-sm text-sparrow-ink dark:text-sparrow-dark-ink focus:outline-none focus:ring-1 focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
            />
          </div>
        </div>
      </div>

      {err && <p className="text-sm text-priority-p1">{err}</p>}

      {/* Category table */}
      <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sparrow-gray dark:text-sparrow-dark-gray text-sm">Loading…</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/40">
                <th className="py-2 pl-4 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
                  Category
                </th>
                <th className="py-2 pr-4 text-right text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray w-32">
                  Estimated Value
                </th>
              </tr>
            </thead>
            <tbody>
              {CONSUMABLES_CATEGORIES.map((cat) => (
                <tr key={cat} className="border-b border-sparrow-rule dark:border-sparrow-dark-border last:border-0">
                  <td className="py-3 pl-4 pr-3">
                    <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{cat}</p>
                    <input
                      type="text"
                      value={notes[cat] ?? ''}
                      onChange={(e) => handleNotesChange(cat, e.target.value)}
                      placeholder="Notes (optional)"
                      className="mt-1 w-full rounded border border-transparent bg-transparent px-0 text-xs text-sparrow-gray dark:text-sparrow-dark-gray placeholder:text-sparrow-rule dark:placeholder:text-sparrow-dark-border-dark focus:outline-none focus:border-sparrow-rule dark:focus:border-sparrow-dark-border focus:bg-sparrow-mist/50 focus:px-2 transition"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">$</span>
                      <input
                        type="number"
                        min={0}
                        step={50}
                        value={amounts[cat] ?? 0}
                        onChange={(e) => handleAmountChange(cat, e.target.value)}
                        className="w-24 rounded border border-sparrow-rule dark:border-sparrow-dark-border px-2 py-1 text-sm text-right text-sparrow-ink dark:text-sparrow-dark-ink focus:outline-none focus:ring-1 focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/40">
                <td className="py-2.5 pl-4 pr-3 text-xs font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">Total</td>
                <td className="py-2.5 pr-4 text-right text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">
                  {formatCost(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Footer actions */}
      {!loading && (
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => void handleCopyFromPrior()}
            className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink transition underline underline-offset-2"
          >
            Copy from {year - 1}
          </button>

          <div className="flex items-center gap-3">
            {savedAt && !dirty && (
              <span className="text-xs text-sparrow-green dark:text-sparrow-dark-green">Saved at {savedAt}</span>
            )}
            <button
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
              className="rounded-lg bg-sparrow-green px-4 py-1.5 text-sm font-medium text-white hover:bg-sparrow-green/90 transition disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

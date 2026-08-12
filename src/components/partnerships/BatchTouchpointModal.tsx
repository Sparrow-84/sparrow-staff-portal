import { useEffect, useMemo, useState } from 'react';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { localDate } from '@/lib/date';
import { logTouchpointBatch } from '@/lib/partnerships';
import {
  PARTNER_TYPE,
  TOUCHPOINT_METHOD,
  TOUCHPOINT_METHODS,
  type Partner,
  type TouchpointMethod,
} from '@/lib/partnerships-types';

export function BatchTouchpointModal({
  open,
  partners,
  currentUserId,
  onClose,
  onLogged,
}: {
  open: boolean;
  partners: Partner[];
  currentUserId: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [search, setSearch] = useState('');
  const [subscribersOnly, setSubscribersOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [method, setMethod] = useState<TouchpointMethod>('email');
  const [occurredOn, setOccurredOn] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggedCount, setLoggedCount] = useState<number | null>(null);

  const { fieldClass, fieldError, clear, validate, reset: resetValidation } = useRequiredFields([
    { key: 'btm-partners', label: 'Partners', valid: selectedIds.length > 0 },
    { key: 'btm-date', label: 'Date', valid: !!occurredOn },
  ]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setSubscribersOnly(false);
      setSelectedIds([]);
      setMethod('email');
      setOccurredOn(localDate());
      setSummary('');
      setError(null);
      setLoggedCount(null);
      resetValidation();
    }
  }, [open]);

  const sorted = useMemo(() => [...partners].sort((a, b) => a.name.localeCompare(b.name)), [partners]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((p) => {
      if (subscribersOnly && !p.newsletter_subscribed) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.organization ?? '').toLowerCase().includes(q) ||
        PARTNER_TYPE[p.type].label.toLowerCase().includes(q)
      );
    });
  }, [sorted, search, subscribersOnly]);

  const filteredIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  function toggle(id: string) {
    setLoggedCount(null);
    clear('btm-partners');
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  // Select-all only ever acts on the currently filtered results (Gmail-style) — it never
  // reaches into partners hidden by the search, so a broad search + select-all + narrower
  // search + deselect doesn't silently drop selections made under the earlier, broader filter.
  function toggleSelectAllFiltered() {
    setLoggedCount(null);
    clear('btm-partners');
    setSelectedIds((prev) =>
      allFilteredSelected
        ? prev.filter((id) => !filteredIds.includes(id))
        : Array.from(new Set([...prev, ...filteredIds])),
    );
  }

  async function submit() {
    if (!validate()) return;
    setBusy(true);
    setError(null);
    try {
      await logTouchpointBatch(selectedIds, method, occurredOn, summary.trim() || null, currentUserId);
      setLoggedCount(selectedIds.length);
      setSelectedIds([]);
      setSummary('');
      onLogged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log the touchpoints.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-sparrow-ink/40 px-4 py-12"
      onClick={onClose}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-sparrow-dark-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-sparrow-rule dark:border-sparrow-dark-border px-6 py-4">
          <div>
            <h2 className="font-serif text-lg font-semibold">Log a touchpoint for multiple partners</h2>
            <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
              Same method, date, and summary applied to everyone you pick below.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xl leading-none text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <span className="field-label field-label-required">Partners</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, organization, or type…"
              className="field-input mt-0"
            />
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              <input
                type="checkbox"
                checked={subscribersOnly}
                onChange={(e) => setSubscribersOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-sparrow-green"
              />
              Newsletter subscribers only
            </label>
            <div className="mt-2 max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border-b border-sparrow-rule/60 px-2 py-1.5 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                  className="h-4 w-4 rounded accent-sparrow-green"
                />
                Select all ({filtered.length})
              </label>
              {filtered.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sparrow-mist/60"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    className="h-4 w-4 rounded accent-sparrow-green"
                  />
                  <span className="text-sparrow-ink dark:text-sparrow-dark-ink">{PARTNER_TYPE[p.type].icon} {p.name}</span>
                </label>
              ))}
              {filtered.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No partners match that search.</p>
              )}
            </div>
            <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{selectedIds.length} selected</p>
            {fieldError('btm-partners') && <p className="mt-1 text-xs text-priority-p1">{fieldError('btm-partners')}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="field-label">Method</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as TouchpointMethod)}
                className="field-input mt-0"
              >
                {TOUCHPOINT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {TOUCHPOINT_METHOD[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="field-label field-label-required">Date</span>
              <input
                type="date"
                value={occurredOn}
                onChange={(e) => { setOccurredOn(e.target.value); clear('btm-date'); }}
                className={fieldClass('btm-date', 'field-input mt-0')}
              />
              {fieldError('btm-date') && <p className="mt-1 text-xs text-priority-p1">{fieldError('btm-date')}</p>}
            </div>
          </div>

          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="What was sent or discussed (optional) — applied to every partner selected above"
            className="field-input"
          />

          {loggedCount != null && (
            <p className="text-sm text-sparrow-green dark:text-sparrow-dark-green">
              Logged a touchpoint for {loggedCount} partner{loggedCount === 1 ? '' : 's'}.
            </p>
          )}
          {error && <p className="text-sm text-priority-p1">{error}</p>}

          <button
            onClick={submit}
            disabled={busy}
            className="btn-primary w-full"
          >
            {busy
              ? 'Logging…'
              : selectedIds.length === 0
                ? 'Log touchpoint'
                : `Log touchpoint for ${selectedIds.length} partner${selectedIds.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

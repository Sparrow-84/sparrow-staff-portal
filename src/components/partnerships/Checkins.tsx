// A record's check-ins (migration 0209): named, dated items like "MOU check-in". A record can
// have several; each is done, moved or deleted on its own and never touches the others.
import { useState } from 'react';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { addCheckin, completeCheckin, deleteCheckin, updateCheckin } from '@/lib/partnerships';
import { checkinDueLabel, daysUntil, type Partner, type PartnerCheckin } from '@/lib/partnerships-types';

/** Shown after clicking Done: closes this one check-in and asks when the next one of the
 *  same kind is due. Used in the record drawer and on Partnerships Home. */
export function CheckinDoneForm({
  checkin,
  onDone,
  onCancel,
}: {
  checkin: Pick<PartnerCheckin, 'id' | 'label'>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [nextDue, setNextDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(next: string | null) {
    setBusy(true);
    setError(null);
    try {
      await completeCheckin(checkin.id, next);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/40 dark:bg-sparrow-dark-surface2 p-3">
      <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">When's the next {checkin.label}?</p>
      <input
        type="date"
        value={nextDue}
        onChange={(e) => setNextDue(e.target.value)}
        className="field-input mt-0"
        disabled={busy}
      />
      {error && <p className="text-xs text-priority-p1">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void finish(nextDue)} disabled={busy || !nextDue} className="btn-primary px-3 py-1.5 text-xs">
          {busy ? 'Saving…' : 'Done + schedule next'}
        </button>
        <button
          onClick={() => void finish(null)}
          disabled={busy}
          className="rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border px-3 py-1.5 text-xs font-medium text-sparrow-ink dark:text-sparrow-dark-ink transition hover:bg-sparrow-mist/60 dark:hover:bg-sparrow-dark-surface disabled:opacity-50"
        >
          Done, no next one
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-2 py-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The record drawer's Check-ins section. */
export function CheckinList({ partner, onChanged }: { partner: Partner; onChanged: () => void }) {
  const [doneId, setDoneId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDue, setEditDue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDue, setNewDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { fieldClass, fieldError, clear, validate } = useRequiredFields([
    { key: 'checkin-new-label', label: "What's due", valid: !!newLabel.trim() },
    { key: 'checkin-new-due', label: 'Due date', valid: !!newDue },
  ]);

  const checkins = [...(partner.checkins ?? [])].sort((a, b) =>
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!validate()) return;
    const ok = await run(() => addCheckin(partner.id, newLabel.trim(), newDue));
    if (ok) {
      setAdding(false);
      setNewLabel('');
      setNewDue('');
    }
  }

  async function saveEdit(c: PartnerCheckin) {
    if (!editLabel.trim() || !editDue) return;
    const ok = await run(() => updateCheckin(c.id, { label: editLabel.trim(), due_date: editDue }));
    if (ok) setEditingId(null);
  }

  return (
    <div className="space-y-2 rounded-xl border border-sparrow-rule/70 p-3">
      <span className="field-label block">Check-ins</span>

      {checkins.length > 0 && (
        <ul className="space-y-2">
          {checkins.map((c) => {
            const overdue = c.due_date ? daysUntil(c.due_date) < 0 : false;
            return (
              <li key={c.id} className="rounded-lg border border-sparrow-rule/60 dark:border-sparrow-dark-border px-3 py-2">
                {editingId === c.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="field-input mt-0" disabled={busy} />
                      <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="field-input mt-0" disabled={busy} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => void saveEdit(c)} disabled={busy || !editLabel.trim() || !editDue} className="btn-primary px-3 py-1.5 text-xs">Save</button>
                      <button onClick={() => setEditingId(null)} disabled={busy} className="px-2 py-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:underline">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{c.label}</p>
                        <p className={`text-xs ${overdue ? 'font-medium text-priority-p1' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}>
                          {c.due_date ? checkinDueLabel(c.due_date) : 'No date set'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => { setDoneId(doneId === c.id ? null : c.id); setConfirmDeleteId(null); }}
                          disabled={busy}
                          className="rounded-lg bg-sparrow-green dark:bg-sparrow-dark-green px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                        >
                          Done
                        </button>
                        <button
                          onClick={() => { setEditingId(c.id); setEditLabel(c.label); setEditDue(c.due_date ?? ''); setDoneId(null); setConfirmDeleteId(null); }}
                          disabled={busy}
                          className="rounded-lg px-2 py-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray transition hover:bg-sparrow-mist/60 dark:hover:bg-sparrow-dark-surface2"
                        >
                          Edit
                        </button>
                        {confirmDeleteId === c.id ? (
                          <button
                            onClick={() => void run(() => deleteCheckin(c.id)).then(() => setConfirmDeleteId(null))}
                            disabled={busy}
                            className="rounded-lg bg-priority-p1 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Delete?
                          </button>
                        ) : (
                          <button
                            onClick={() => { setConfirmDeleteId(c.id); setDoneId(null); }}
                            disabled={busy}
                            aria-label={`Delete ${c.label}`}
                            className="rounded-lg px-2 py-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray transition hover:bg-sparrow-mist/60 hover:text-priority-p1 dark:hover:bg-sparrow-dark-surface2"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    {doneId === c.id && (
                      <CheckinDoneForm
                        checkin={c}
                        onDone={() => { setDoneId(null); onChanged(); }}
                        onCancel={() => setDoneId(null)}
                      />
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="space-y-2 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="field-label field-label-required">What's due</span>
              <input
                id="checkin-new-label"
                type="text"
                value={newLabel}
                onChange={(e) => { setNewLabel(e.target.value); clear('checkin-new-label'); }}
                placeholder="e.g. MOU check-in"
                className={fieldClass('checkin-new-label', 'field-input mt-0')}
                disabled={busy}
              />
              {fieldError('checkin-new-label') && <p className="mt-1 text-xs text-priority-p1">{fieldError('checkin-new-label')}</p>}
            </div>
            <div>
              <span className="field-label field-label-required">Due date</span>
              <input
                id="checkin-new-due"
                type="date"
                value={newDue}
                onChange={(e) => { setNewDue(e.target.value); clear('checkin-new-due'); }}
                className={fieldClass('checkin-new-due', 'field-input mt-0')}
                disabled={busy}
              />
              {fieldError('checkin-new-due') && <p className="mt-1 text-xs text-priority-p1">{fieldError('checkin-new-due')}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void add()} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">{busy ? 'Saving…' : 'Add'}</button>
            <button onClick={() => setAdding(false)} disabled={busy} className="px-2 py-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:underline">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline"
        >
          + Add a check-in
        </button>
      )}

      {error && <p className="text-xs text-priority-p1">{error}</p>}
    </div>
  );
}

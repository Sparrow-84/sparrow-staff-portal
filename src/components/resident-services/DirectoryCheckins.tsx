// An organization's check-ins, inside a Resident Services program (decided 2026-11-13).
//
//  * Upcoming check-ins: what Partnerships has scheduled. Read-only here -- scheduling stays
//    with Partnerships -- but it tells Resident Services staff a call is already coming up, so
//    they can pass a question along instead of calling separately.
//  * Check-in history: every logged check-in. Resident Services staff can log their own (a call
//    to the organization about a program), and edit or delete only the ones they logged, so
//    Partnerships sees it too. Same records as the Partnerships drawer.
//
// Needs migration 0227 for staff who only have Resident Services access; before it runs they
// see empty lists (Partnerships staff see everything either way).
import { useCallback, useEffect, useState } from 'react';
import { localDate } from '@/lib/date';
import { deleteTouchpoint, fetchTouchpoints, logTouchpoint, updateTouchpoint } from '@/lib/partnerships';
import {
  TOUCHPOINT_METHOD,
  TOUCHPOINT_METHODS,
  checkinDueLabel,
  daysUntil,
  shortDate,
  type Touchpoint,
  type TouchpointMethod,
} from '@/lib/partnerships-types';
import { fetchUpcomingCheckins } from '@/lib/resident-services';
import { RichTextView } from '../lcp/RichText';
import { RichTextEditor } from '../stories/RichTextEditor';

export function DirectoryCheckins({
  partnerId,
  currentUserId,
  isAdmin,
  nameFor,
}: {
  partnerId: string;
  currentUserId: string;
  isAdmin: boolean;
  nameFor: (id: string | null) => string | null;
}) {
  const [upcoming, setUpcoming] = useState<{ id: string; label: string; due_date: string | null }[]>([]);
  const [history, setHistory] = useState<Touchpoint[]>([]);
  const [logging, setLogging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [method, setMethod] = useState<TouchpointMethod>('phone');
  const [on, setOn] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [up, hist] = await Promise.all([
      fetchUpcomingCheckins(partnerId),
      fetchTouchpoints(partnerId).catch(() => [] as Touchpoint[]),
    ]);
    setUpcoming(up);
    setHistory(hist);
  }, [partnerId]);

  useEffect(() => {
    setLogging(false);
    setEditingId(null);
    setConfirmDeleteId(null);
    void load();
  }, [load]);

  const canEdit = (t: Touchpoint) => isAdmin || t.logged_by === currentUserId;

  const openForm = (t?: Touchpoint) => {
    setError(null);
    setConfirmDeleteId(null);
    if (t) {
      setEditingId(t.id); setLogging(false);
      setMethod(t.method); setOn(t.occurred_on); setNote(t.summary ?? '');
    } else {
      setLogging(true); setEditingId(null);
      setMethod('phone'); setOn(localDate()); setNote('');
    }
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try {
      await fn();
      setLogging(false); setEditingId(null); setConfirmDeleteId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  const save = () => {
    if (!on) { setError('Pick the date it happened.'); return; }
    const summary = note.trim() || null;
    void run(() => (editingId
      ? updateTouchpoint(editingId, { method, occurred_on: on, summary })
      : logTouchpoint({ partner_id: partnerId, method, occurred_on: on, summary }, currentUserId)));
  };

  const form = (
    <div className="space-y-2 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="field-label">How</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as TouchpointMethod)} className="field-input mt-0">
            {TOUCHPOINT_METHODS.map((m) => <option key={m} value={m}>{TOUCHPOINT_METHOD[m]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="field-label field-label-required">Date</span>
          <input type="date" value={on} onChange={(e) => setOn(e.target.value)} className="field-input mt-0" />
        </label>
      </div>
      <RichTextEditor value={note} onChange={setNote} placeholder="What you talked about (optional). Partnerships sees this too." className="min-h-[5rem]" />
      {error && <p className="text-xs text-priority-p1">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => { setLogging(false); setEditingId(null); }} className="btn-ghost text-xs">Cancel</button>
        <button type="button" onClick={save} disabled={busy} className="btn-primary text-xs">{busy ? 'Saving…' : editingId ? 'Save' : 'Log check-in'}</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Upcoming check-ins · scheduled by Partnerships</span>
        {upcoming.length === 0 ? (
          <p className="text-sm text-sparrow-gray/70 dark:text-sparrow-dark-gray/70">None scheduled.</p>
        ) : (
          <ul className="space-y-1">
            {upcoming.map((c) => {
              const overdue = c.due_date ? daysUntil(c.due_date) < 0 : false;
              return (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>{c.label}</span>
                  <span className={`text-xs ${overdue ? 'font-medium text-priority-p1' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}>
                    {c.due_date ? checkinDueLabel(c.due_date) : 'No date set'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Check-in history</span>
          {!logging && !editingId && (
            <button onClick={() => openForm()} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
              + Log a check-in
            </button>
          )}
        </div>
        {logging && form}
        {history.length === 0 && !logging && (
          <p className="text-sm text-sparrow-gray/70 dark:text-sparrow-dark-gray/70">No check-ins logged yet.</p>
        )}
        <ul className="space-y-2">
          {history.map((t) => (
            <li key={t.id} className="rounded-lg bg-white dark:bg-sparrow-dark-surface px-3 py-2">
              {editingId === t.id ? form : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                    <span>{TOUCHPOINT_METHOD[t.method]} · {shortDate(t.occurred_on)}{nameFor(t.logged_by) ? ` · ${nameFor(t.logged_by)}` : ''}</span>
                    {canEdit(t) && (
                      <span className="flex items-center gap-2">
                        <button onClick={() => openForm(t)} className="hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink hover:underline">Edit</button>
                        {confirmDeleteId === t.id ? (
                          <button
                            onClick={() => void run(() => deleteTouchpoint(t.id))}
                            disabled={busy}
                            className="rounded bg-priority-p1 px-1.5 py-0.5 font-semibold text-white disabled:opacity-50"
                          >
                            Delete?
                          </button>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(t.id)} className="hover:text-priority-p1 hover:underline">Delete</button>
                        )}
                      </span>
                    )}
                  </div>
                  {t.summary && <div className="mt-1 text-sm"><RichTextView html={t.summary} /></div>}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  createConnection,
  createEvent,
  fetchConnections,
  fetchEvents,
  syncOverdueConnectionFollowups,
  updateConnection,
  type ConnectionInput,
  type EventInput,
  type PartnershipConnection,
  type PartnershipEvent,
} from '@/lib/partnerships-tabs';

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(conn: PartnershipConnection): boolean {
  if (conn.followup_done || !conn.followup_due) return false;
  return conn.followup_due < new Date().toISOString().slice(0, 10);
}

const EMPTY_EVENT_FORM: EventInput = {
  event_name: '',
  event_date: '',
  location: null,
  attendees: null,
  notes: null,
};

const EMPTY_CONN_FORM: ConnectionInput = {
  event_id: null,
  name: '',
  organization: null,
  what_discussed: null,
  next_action: null,
  followup_due: null,
};

export function PartnershipEventsTab() {
  const [events, setEvents] = useState<PartnershipEvent[]>([]);
  const [connections, setConnections] = useState<PartnershipConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState<EventInput>(EMPTY_EVENT_FORM);
  const [savingEvent, setSavingEvent] = useState(false);

  const [showConnForm, setShowConnForm] = useState(false);
  const [connForm, setConnForm] = useState<ConnectionInput>(EMPTY_CONN_FORM);
  const [savingConn, setSavingConn] = useState(false);

  function load() {
    Promise.all([fetchEvents(), fetchConnections()])
      .then(([evts, conns]) => { setEvents(evts); setConnections(conns); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    syncOverdueConnectionFollowups().catch(console.error);
  }, []);

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!eventForm.event_name.trim() || !eventForm.event_date) return;
    setSavingEvent(true);
    try {
      await createEvent(eventForm);
      setEventForm(EMPTY_EVENT_FORM);
      setShowEventForm(false);
      load();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingEvent(false);
    }
  }

  function openConnFormForEvent(event: PartnershipEvent) {
    setConnForm({ ...EMPTY_CONN_FORM, event_id: event.id });
    setShowConnForm(true);
    setTimeout(() => {
      document.getElementById('conn-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  async function handleAddConn(e: React.FormEvent) {
    e.preventDefault();
    if (!connForm.name.trim()) return;
    setSavingConn(true);
    try {
      await createConnection(connForm);
      setConnForm(EMPTY_CONN_FORM);
      setShowConnForm(false);
      load();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingConn(false);
    }
  }

  async function handleToggleDone(conn: PartnershipConnection) {
    const next = !conn.followup_done;
    setConnections((prev) => prev.map((c) => (c.id === conn.id ? { ...c, followup_done: next } : c)));
    await updateConnection(conn.id, { followup_done: next }).catch(console.error);
  }

  function eventName(id: string | null): string {
    if (!id) return '—';
    return events.find((e) => e.id === id)?.event_name ?? '—';
  }

  const recentEvents = events.slice(0, 10);

  return (
    <div className="space-y-8">
      {/* ── Event Log ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-sparrow-ink">Event log</h3>
          <button onClick={() => setShowEventForm((v) => !v)} className="btn-primary text-xs">
            {showEventForm ? 'Cancel' : '+ Log event'}
          </button>
        </div>

        {showEventForm && (
          <form onSubmit={handleAddEvent} className="mb-4 rounded-xl border border-sparrow-rule bg-white p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="field-label">Event name *</label>
                <input
                  className="field-input w-full"
                  required
                  value={eventForm.event_name}
                  onChange={(e) => setEventForm((f) => ({ ...f, event_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label">Date *</label>
                <input
                  type="date"
                  className="field-input w-full"
                  required
                  value={eventForm.event_date}
                  onChange={(e) => setEventForm((f) => ({ ...f, event_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label">Location</label>
                <input
                  className="field-input w-full"
                  value={eventForm.location ?? ''}
                  onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="field-label">Sparrow attendees</label>
                <input
                  className="field-input w-full"
                  value={eventForm.attendees ?? ''}
                  onChange={(e) => setEventForm((f) => ({ ...f, attendees: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="field-label">Notes</label>
                <input
                  className="field-input w-full"
                  value={eventForm.notes ?? ''}
                  onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value || null }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowEventForm(false)} className="btn-ghost text-sm">Cancel</button>
              <button type="submit" disabled={savingEvent} className="btn-primary text-sm">
                {savingEvent ? 'Saving…' : 'Log event'}
              </button>
            </div>
          </form>
        )}

        {loading && <p className="py-8 text-center text-sm text-sparrow-gray">Loading…</p>}

        {!loading && events.length === 0 && (
          <p className="rounded-xl border border-dashed border-sparrow-rule p-8 text-center text-sm text-sparrow-gray">
            No events logged yet. Log within 24 hours of each event.
          </p>
        )}

        {!loading && events.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-sparrow-rule bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sparrow-rule text-left">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Date</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Event</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Location</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Attendees</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Notes</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sparrow-rule">
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-sparrow-gray">
                      {shortDate(ev.event_date)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-sparrow-ink">{ev.event_name}</td>
                    <td className="px-3 py-2.5 text-sparrow-gray">{ev.location ?? '—'}</td>
                    <td className="px-3 py-2.5 text-sparrow-gray">{ev.attendees ?? '—'}</td>
                    <td className="px-3 py-2.5 text-sparrow-gray">{ev.notes ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => openConnFormForEvent(ev)}
                        className="whitespace-nowrap text-xs font-medium text-sparrow-green hover:underline"
                      >
                        + Connections
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Meaningful Connections ── */}
      <section id="conn-form">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-sparrow-ink">Meaningful connections</h3>
          <button onClick={() => setShowConnForm((v) => !v)} className="btn-primary text-xs">
            {showConnForm ? 'Cancel' : '+ Add connection'}
          </button>
        </div>

        {showConnForm && (
          <form onSubmit={handleAddConn} className="mb-4 rounded-xl border border-sparrow-rule bg-white p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Name *</label>
                <input
                  className="field-input w-full"
                  required
                  value={connForm.name}
                  onChange={(e) => setConnForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label">Organization</label>
                <input
                  className="field-input w-full"
                  value={connForm.organization ?? ''}
                  onChange={(e) => setConnForm((f) => ({ ...f, organization: e.target.value || null }))}
                />
              </div>
              <div className="col-span-2">
                <label className="field-label">What was discussed</label>
                <textarea
                  className="field-input w-full resize-none"
                  rows={2}
                  value={connForm.what_discussed ?? ''}
                  onChange={(e) => setConnForm((f) => ({ ...f, what_discussed: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="field-label">Next action</label>
                <input
                  className="field-input w-full"
                  value={connForm.next_action ?? ''}
                  onChange={(e) => setConnForm((f) => ({ ...f, next_action: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="field-label">Follow-up due</label>
                <input
                  type="date"
                  className="field-input w-full"
                  value={connForm.followup_due ?? ''}
                  onChange={(e) => setConnForm((f) => ({ ...f, followup_due: e.target.value || null }))}
                />
              </div>
              <div className="col-span-2">
                <label className="field-label">Linked event (optional)</label>
                <select
                  className="field-input w-full"
                  value={connForm.event_id ?? ''}
                  onChange={(e) => setConnForm((f) => ({ ...f, event_id: e.target.value || null }))}
                >
                  <option value="">— No event —</option>
                  {recentEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {shortDate(ev.event_date)} · {ev.event_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowConnForm(false)} className="btn-ghost text-sm">Cancel</button>
              <button type="submit" disabled={savingConn} className="btn-primary text-sm">
                {savingConn ? 'Saving…' : 'Add connection'}
              </button>
            </div>
          </form>
        )}

        {!loading && connections.length === 0 && (
          <p className="rounded-xl border border-dashed border-sparrow-rule p-8 text-center text-sm text-sparrow-gray">
            No connections logged yet.
          </p>
        )}

        {!loading && connections.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-sparrow-rule bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sparrow-rule text-left">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Name</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Org</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Discussed</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Next action</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Follow-up due</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Done</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">Event</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sparrow-rule">
                {connections.map((conn) => {
                  const overdue = isOverdue(conn);
                  return (
                    <tr
                      key={conn.id}
                      className={overdue ? 'border-l-4 border-l-priority-p1' : ''}
                    >
                      <td className="px-4 py-2.5 font-medium text-sparrow-ink">{conn.name}</td>
                      <td className="px-3 py-2.5 text-sparrow-gray">{conn.organization ?? '—'}</td>
                      <td className="px-3 py-2.5 max-w-[180px]">
                        <p className="truncate text-sparrow-gray" title={conn.what_discussed ?? undefined}>
                          {conn.what_discussed ?? '—'}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 max-w-[160px]">
                        <p className="truncate text-sparrow-gray" title={conn.next_action ?? undefined}>
                          {conn.next_action ?? '—'}
                        </p>
                      </td>
                      <td className={`px-3 py-2.5 whitespace-nowrap text-xs ${overdue ? 'font-semibold text-priority-p1' : 'text-sparrow-gray'}`}>
                        {shortDate(conn.followup_due)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={conn.followup_done}
                          onChange={() => handleToggleDone(conn)}
                          className="h-4 w-4 rounded accent-sparrow-green"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-sparrow-gray whitespace-nowrap">
                        {eventName(conn.event_id)}
                      </td>
                      <td className="px-3 py-2.5">
                        <a
                          href={`/partnerships?action=add&name=${encodeURIComponent(conn.name)}&org=${encodeURIComponent(conn.organization ?? '')}`}
                          className="whitespace-nowrap text-xs font-medium text-sparrow-green hover:underline"
                          title="Open Add Partner panel with this person's details"
                        >
                          Become a partner →
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

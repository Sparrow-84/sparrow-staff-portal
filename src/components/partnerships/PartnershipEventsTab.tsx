// Partnerships Room — Events tab: the event log, and the Meaningful Connections met there.
// Same table engine and look as the Directory; most cells edit in place, and clicking a row
// opens its side panel. Every connection always has a next step (migration 0215): a
// follow-up date, a Directory record, or the archive. Done asks which, and a connection with
// no next step shows on Home until someone picks one.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { localDate } from '@/lib/date';
import { fetchProfiles } from '@/lib/data';
import { assignAvatarColors } from '@/lib/avatarColors';
import type { Profile } from '@/lib/types';
import {
  addConnectionToExistingRecord,
  archiveConnection,
  connectionNeedsNextStep,
  createConnection,
  createEvent,
  fetchConnections,
  fetchEvents,
  syncOverdueConnectionFollowups,
  updateConnection,
  updateEvent,
  type ConnectionInput,
  type EventInput,
  type PartnershipConnection,
  type PartnershipEvent,
} from '@/lib/partnerships-tabs';
import {
  useColumnLayout, useHeaderInteractions, GridTableShell,
  InlineText, InlineSelect, ExpandableText,
  type GridColumn,
} from '@/components/gridtable/GridTable';
import { stripHtml } from '../lcp/RichText';
import { EventDetailPanel } from './EventDetailPanel';
import { ConnectionDetailPanel } from './ConnectionDetailPanel';
import { ConnectionNextStep } from './ConnectionNextStep';
import { DirectoryRecordPicker } from './DirectoryRecordPicker';

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Clicks inside an editable cell shouldn't open the row's side panel. */
function Stop({ children }: { children: ReactNode }) {
  return <div className="w-full" onClick={(e) => e.stopPropagation()}>{children}</div>;
}

// ── Event log columns ──
type EventCol = 'date' | 'event' | 'location' | 'attendees' | 'notes' | 'connections';
const EVENT_COLUMNS: GridColumn<EventCol>[] = [
  { key: 'date', label: 'Date', defaultWidth: 150 },
  { key: 'event', label: 'Event', defaultWidth: 260 },
  { key: 'location', label: 'Location', defaultWidth: 180 },
  { key: 'attendees', label: 'Sparrow attendees', defaultWidth: 200 },
  { key: 'notes', label: 'Notes', defaultWidth: 260 },
  { key: 'connections', label: 'Connections', defaultWidth: 150 },
];
const EVENT_SORTABLE: EventCol[] = ['date', 'event', 'location', 'connections'];

// ── Connection columns ──
type ConnCol = 'name' | 'organization' | 'role' | 'email' | 'phone' | 'discussed' | 'next_action' | 'followup' | 'next_step' | 'owner' | 'event';
const CONN_COLUMNS: GridColumn<ConnCol>[] = [
  { key: 'name', label: 'Name', defaultWidth: 170 },
  { key: 'organization', label: 'Organization', defaultWidth: 170 },
  { key: 'role', label: 'Role / title', defaultWidth: 140 },
  { key: 'email', label: 'Email', defaultWidth: 190 },
  { key: 'phone', label: 'Phone', defaultWidth: 130 },
  { key: 'discussed', label: 'What was discussed', defaultWidth: 220 },
  { key: 'next_action', label: 'Next action', defaultWidth: 200 },
  { key: 'followup', label: 'Follow up by', defaultWidth: 150 },
  { key: 'next_step', label: 'Next step', defaultWidth: 140 },
  { key: 'owner', label: 'Owner', defaultWidth: 180 },
  { key: 'event', label: 'Met at', defaultWidth: 200 },
];
const CONN_SORTABLE: ConnCol[] = ['name', 'organization', 'followup', 'owner', 'event'];

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
  role: null,
  phone: null,
  email: null,
  website: null,
  what_discussed: null,
  next_action: null,
  followup_due: null,
  owner_id: null,
};

type NewNextStep = 'followup' | 'existing' | 'directory' | 'archive';

export function PartnershipEventsTab({ onBecomePartner }: { onBecomePartner: (conn: PartnershipConnection) => void }) {
  const { profile } = useAuth();
  const [events, setEvents] = useState<PartnershipEvent[]>([]);
  const [connections, setConnections] = useState<PartnershipConnection[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState<EventInput>(EMPTY_EVENT_FORM);
  const [savingEvent, setSavingEvent] = useState(false);

  const [showConnForm, setShowConnForm] = useState(false);
  const [connForm, setConnForm] = useState<ConnectionInput>(EMPTY_CONN_FORM);
  const [newNextStep, setNewNextStep] = useState<NewNextStep | null>(null);
  const [newRecordId, setNewRecordId] = useState<string | null>(null);
  const [savingConn, setSavingConn] = useState(false);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const eventFields = useRequiredFields([
    { key: 'pet-event-name', label: 'Event name', valid: eventForm.event_name.trim().length > 0 },
    { key: 'pet-event-date', label: 'Date', valid: !!eventForm.event_date },
  ]);

  const connFields = useRequiredFields([
    { key: 'pet-conn-name', label: 'Name', valid: connForm.name.trim().length > 0 },
    { key: 'pet-conn-next', label: "What's next", valid: newNextStep !== null },
    { key: 'pet-conn-due', label: 'Follow up by', valid: newNextStep !== 'followup' || !!connForm.followup_due },
    { key: 'pet-conn-record', label: 'Directory record', valid: newNextStep !== 'existing' || !!newRecordId },
  ]);

  // Exec is excluded even if flagged with partnerships_access — same standing-owner
  // exclusion used for partner records (AddPartnerPanel/PartnerTableView).
  const ownerProfiles = profiles.filter(
    (p) => (p.department === 'partnerships' || p.partnerships_access) && p.department !== 'exec',
  );
  const ownerColors = useMemo(() => assignAvatarColors(profiles), [profiles]);

  function load() {
    Promise.all([fetchEvents(), fetchConnections(), fetchProfiles()])
      .then(([evts, conns, profs]) => { setEvents(evts); setConnections(conns); setProfiles(profs); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    syncOverdueConnectionFollowups().catch(console.error);
  }, []);

  // ── Events ──
  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!eventFields.validate()) return;
    setSavingEvent(true);
    try {
      await createEvent(eventForm);
      setEventForm(EMPTY_EVENT_FORM);
      setShowEventForm(false);
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not log the event.');
    } finally {
      setSavingEvent(false);
    }
  }

  async function patchEvent(ev: PartnershipEvent, update: Partial<EventInput>) {
    setSaveError(null);
    setEvents((prev) => prev.map((x) => (x.id === ev.id ? { ...x, ...update } : x)));
    try {
      await updateEvent(ev.id, update);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save that change.');
      load();
    }
  }

  // ── Connections ──
  function openConnForm(eventId: string | null) {
    setConnForm({ ...EMPTY_CONN_FORM, event_id: eventId, owner_id: profile?.id ?? null });
    setNewNextStep(null);
    setNewRecordId(null);
    setShowConnForm(true);
    setShowArchived(false);
    setTimeout(() => {
      document.getElementById('conn-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function chooseNewNextStep(step: NewNextStep) {
    setNewNextStep(step);
    connFields.clear('pet-conn-next');
    setConnForm((f) => ({
      ...f,
      followup_due: step === 'followup' ? f.followup_due : null,
    }));
  }

  async function handleAddConn(e: React.FormEvent) {
    e.preventDefault();
    if (!connFields.validate()) return;
    setSavingConn(true);
    setSaveError(null);
    try {
      const created = await createConnection({
        ...connForm,
        name: connForm.name.trim(),
        followup_due: newNextStep === 'followup' ? connForm.followup_due : null,
      });
      if (newNextStep === 'archive' && profile) await archiveConnection(created.id, profile.id);
      if (newNextStep === 'existing' && newRecordId && profile) await addConnectionToExistingRecord(created, newRecordId, profile.id);
      setConnForm(EMPTY_CONN_FORM);
      setNewNextStep(null);
      setNewRecordId(null);
      setShowConnForm(false);
      load();
      if (newNextStep === 'followup') syncOverdueConnectionFollowups().catch(console.error);
      if (newNextStep === 'directory') onBecomePartner(created);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not add the connection.');
    } finally {
      setSavingConn(false);
    }
  }

  type ConnPatch = Parameters<typeof updateConnection>[1];
  async function patchConn(conn: PartnershipConnection, update: ConnPatch) {
    setSaveError(null);
    setConnections((prev) => prev.map((c) => (c.id === conn.id ? { ...c, ...update } : c)));
    try {
      await updateConnection(conn.id, update);
      if ('followup_due' in update || 'owner_id' in update) await syncOverdueConnectionFollowups();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save that change.');
      load();
    }
  }

  // Lists
  const today = localDate();
  const archivedCount = connections.filter((c) => c.archived_at).length;
  const visibleConnections = connections.filter((c) => (showArchived ? !!c.archived_at : !c.archived_at));
  const needsNextStepCount = connections.filter((c) => connectionNeedsNextStep(c)).length;
  const connCountByEvent = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of connections) if (c.event_id) m.set(c.event_id, (m.get(c.event_id) ?? 0) + 1);
    return m;
  }, [connections]);
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const ownerName = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name ?? '' : '');

  // ── Event table layout + sort ──
  const eventLayout = useColumnLayout(EVENT_COLUMNS, 'sparrow-partnerships-events-table');
  const [eventSortKey, setEventSortKey] = useState<EventCol>('date');
  const [eventSortDir, setEventSortDir] = useState<'asc' | 'desc'>('desc');
  const eventHeader = useHeaderInteractions(
    eventLayout.colWidths, eventLayout.setColWidths, eventSortKey, setEventSortKey, eventSortDir, setEventSortDir,
  );

  const eventRows = useMemo(() => {
    const dir = eventSortDir === 'asc' ? 1 : -1;
    return [...events].sort((a, b) => {
      let cmp = 0;
      switch (eventSortKey) {
        case 'event': cmp = a.event_name.localeCompare(b.event_name); break;
        case 'location': cmp = (a.location ?? '').localeCompare(b.location ?? ''); break;
        case 'connections': cmp = (connCountByEvent.get(a.id) ?? 0) - (connCountByEvent.get(b.id) ?? 0); break;
        default: cmp = a.event_date.localeCompare(b.event_date);
      }
      return cmp * dir;
    });
  }, [events, eventSortKey, eventSortDir, connCountByEvent]);

  function renderEventCell(ev: PartnershipEvent, key: EventCol): ReactNode {
    switch (key) {
      case 'date':
        return <Stop><InlineText type="date" value={ev.event_date} onSave={(v) => { if (v) void patchEvent(ev, { event_date: v }); else load(); }} /></Stop>;
      case 'event':
        return <Stop><InlineText value={ev.event_name} onSave={(v) => { if (v.trim()) void patchEvent(ev, { event_name: v.trim() }); else load(); }} /></Stop>;
      case 'location':
        return <Stop><InlineText value={ev.location ?? ''} placeholder="—" onSave={(v) => void patchEvent(ev, { location: v.trim() || null })} /></Stop>;
      case 'attendees':
        return <Stop><InlineText value={ev.attendees ?? ''} placeholder="—" onSave={(v) => void patchEvent(ev, { attendees: v.trim() || null })} /></Stop>;
      case 'notes': {
        // Notes keep their formatting, so they're edited in the side panel; this is a preview.
        const plain = ev.notes ? stripHtml(ev.notes) : '';
        return <span className="truncate text-sm text-sparrow-gray dark:text-sparrow-dark-gray" title={plain || undefined}>{plain || '—'}</span>;
      }
      case 'connections': {
        const n = connCountByEvent.get(ev.id) ?? 0;
        return (
          <Stop>
            <div className="flex items-center gap-2">
              <span className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{n}</span>
              <button
                onClick={() => openConnForm(ev.id)}
                className="whitespace-nowrap text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline"
              >
                + Add
              </button>
            </div>
          </Stop>
        );
      }
      default:
        return null;
    }
  }

  // ── Connection table layout + sort ──
  const connLayout = useColumnLayout(CONN_COLUMNS, 'sparrow-partnerships-connections-table');
  const [connSortKey, setConnSortKey] = useState<ConnCol>('followup');
  const [connSortDir, setConnSortDir] = useState<'asc' | 'desc'>('asc');
  const connHeader = useHeaderInteractions(
    connLayout.colWidths, connLayout.setColWidths, connSortKey, setConnSortKey, connSortDir, setConnSortDir,
  );

  const connRows = useMemo(() => {
    const dir = connSortDir === 'asc' ? 1 : -1;
    return [...visibleConnections].sort((a, b) => {
      let cmp = 0;
      switch (connSortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'organization': cmp = (a.organization ?? '').localeCompare(b.organization ?? ''); break;
        case 'owner': cmp = ownerName(a.owner_id).localeCompare(ownerName(b.owner_id)); break;
        case 'event': cmp = (eventById.get(a.event_id ?? '')?.event_date ?? '').localeCompare(eventById.get(b.event_id ?? '')?.event_date ?? ''); break;
        default: {
          // No next step first: those are the ones that need attention.
          const an = connectionNeedsNextStep(a), bn = connectionNeedsNextStep(b);
          if (an !== bn) return an ? -1 : 1;
          cmp = (a.followup_due ?? '').localeCompare(b.followup_due ?? '');
        }
      }
      return cmp * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleConnections, connSortKey, connSortDir, profiles, eventById]);

  function renderConnCell(conn: PartnershipConnection, key: ConnCol): ReactNode {
    const locked = !!conn.archived_at;
    const text = (v: string | null) => <span className="truncate text-sm text-sparrow-gray dark:text-sparrow-dark-gray" title={v ?? undefined}>{v || '—'}</span>;
    switch (key) {
      case 'name':
        return locked
          ? <span className="truncate text-sm font-medium">{conn.name}</span>
          : <Stop><InlineText value={conn.name} onSave={(v) => { if (v.trim()) void patchConn(conn, { name: v.trim() }); else load(); }} /></Stop>;
      case 'organization':
        return locked ? text(conn.organization) : <Stop><InlineText value={conn.organization ?? ''} placeholder="—" onSave={(v) => void patchConn(conn, { organization: v.trim() || null })} /></Stop>;
      case 'role':
        return locked ? text(conn.role) : <Stop><InlineText value={conn.role ?? ''} placeholder="—" onSave={(v) => void patchConn(conn, { role: v.trim() || null })} /></Stop>;
      case 'email':
        return locked ? text(conn.email) : <Stop><InlineText type="email" value={conn.email ?? ''} placeholder="—" onSave={(v) => void patchConn(conn, { email: v.trim() || null })} /></Stop>;
      case 'phone':
        return locked ? text(conn.phone) : <Stop><InlineText value={conn.phone ?? ''} placeholder="—" onSave={(v) => void patchConn(conn, { phone: v.trim() || null })} /></Stop>;
      case 'discussed':
        return locked ? text(conn.what_discussed) : <ExpandableText value={conn.what_discussed} placeholder="—" onSave={(v) => void patchConn(conn, { what_discussed: v })} />;
      case 'next_action':
        return locked ? text(conn.next_action) : <ExpandableText value={conn.next_action} placeholder="—" onSave={(v) => void patchConn(conn, { next_action: v })} />;
      case 'followup': {
        if (locked) return text(conn.converted_to_partner_id ? 'In Directory' : 'Archived');
        if (conn.followup_done || !conn.followup_due) {
          return <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{conn.followup_done ? 'Followed up' : 'No follow-up set'}</span>;
        }
        const overdue = conn.followup_due < today;
        return (
          <Stop>
            <div className="flex w-full flex-col gap-0.5">
              <InlineText type="date" value={conn.followup_due} onSave={(v) => { if (v) void patchConn(conn, { followup_due: v }); else load(); }} />
              {overdue && <span className="px-1 text-xs font-medium text-priority-p1">Overdue</span>}
            </div>
          </Stop>
        );
      }
      case 'next_step':
        return locked ? null : (
          <Stop>
            <ConnectionNextStep connection={conn} onAddToDirectory={onBecomePartner} onDone={load} />
          </Stop>
        );
      case 'owner': {
        const options = [
          { value: '', label: 'No owner (room admin)' },
          ...(ownerProfiles.some((p) => p.id === conn.owner_id) || !conn.owner_id
            ? ownerProfiles
            : [...ownerProfiles, ...profiles.filter((p) => p.id === conn.owner_id)]
          ).map((p) => ({ value: p.id, label: p.full_name })),
        ];
        return (
          <Stop>
            <div className="flex w-full items-center gap-1.5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${conn.owner_id ? ownerColors[conn.owner_id] ?? 'bg-sparrow-gray dark:bg-sparrow-dark-border' : 'bg-sparrow-rule dark:bg-sparrow-dark-border'}`} />
              <InlineSelect
                value={conn.owner_id ?? ''}
                disabled={locked}
                options={options}
                onSave={(v) => void patchConn(conn, { owner_id: v || null })}
              />
            </div>
          </Stop>
        );
      }
      case 'event': {
        const options = [
          { value: '', label: 'No event' },
          ...events.map((ev) => ({ value: ev.id, label: `${shortDate(ev.event_date)} · ${ev.event_name}` })),
        ];
        return (
          <Stop>
            <InlineSelect value={conn.event_id ?? ''} disabled={locked} options={options} onSave={(v) => void patchConn(conn, { event_id: v || null })} />
          </Stop>
        );
      }
      default:
        return null;
    }
  }

  return (
    <div className="space-y-8">
      {saveError && <p className="text-sm text-priority-p1">{saveError}</p>}

      {/* ── Event Log ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl space-y-1">
            <h3 className="text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">Event log</h3>
            <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
              Log each event, and the people you met there, within 24 hours.
            </p>
          </div>
          <button onClick={() => setShowEventForm((v) => !v)} className="btn-primary shrink-0 text-xs">
            {showEventForm ? 'Cancel' : '+ Log event'}
          </button>
        </div>

        {showEventForm && (
          <form onSubmit={handleAddEvent} className="max-w-3xl rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="field-label field-label-required" htmlFor="pet-event-name">Event name</label>
                <input
                  id="pet-event-name"
                  className={eventFields.fieldClass('pet-event-name', 'field-input w-full')}
                  value={eventForm.event_name}
                  onChange={(e) => { setEventForm((f) => ({ ...f, event_name: e.target.value })); eventFields.clear('pet-event-name'); }}
                />
                {eventFields.fieldError('pet-event-name') && <p className="mt-1 text-xs text-priority-p1">{eventFields.fieldError('pet-event-name')}</p>}
              </div>
              <div>
                <label className="field-label field-label-required" htmlFor="pet-event-date">Date</label>
                <input
                  id="pet-event-date"
                  type="date"
                  className={eventFields.fieldClass('pet-event-date', 'field-input w-full')}
                  value={eventForm.event_date}
                  onChange={(e) => { setEventForm((f) => ({ ...f, event_date: e.target.value })); eventFields.clear('pet-event-date'); }}
                />
                {eventFields.fieldError('pet-event-date') && <p className="mt-1 text-xs text-priority-p1">{eventFields.fieldError('pet-event-date')}</p>}
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

        {loading ? (
          <p className="py-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
        ) : (
          <GridTableShell
            layout={eventLayout}
            sortKey={eventSortKey}
            sortDir={eventSortDir}
            onHeaderClick={(k) => { if (EVENT_SORTABLE.includes(k)) eventHeader.handleHeaderClick(k); }}
            startResize={eventHeader.startResize}
            items={eventRows}
            rowKey={(ev) => ev.id}
            renderCell={renderEventCell}
            onRowClick={(ev) => setSelectedEventId(ev.id)}
            rowClassName={() => 'cursor-pointer hover:bg-sparrow-mist/40 dark:hover:bg-sparrow-dark-surface2'}
            emptyMessage="No events logged yet."
            toolbar={
              <span className="mr-auto self-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
                {events.length} event{events.length !== 1 ? 's' : ''}
              </span>
            }
          />
        )}
      </section>

      {/* ── Meaningful Connections ── */}
      <section id="conn-form" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl space-y-1">
            <h3 className="text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">
              {showArchived ? 'Archived connections' : 'Meaningful connections'}
            </h3>
            {!showArchived && (
              <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
                Every connection needs a next step: a follow-up date, adding them to the Directory
                (as a new record, or as a contact on one already there), or Archive
                when there's nothing more to do. Follow-ups come up on Home and in the owner's
                tasks a week before their date.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {(archivedCount > 0 || showArchived) && (
              <button onClick={() => setShowArchived((v) => !v)} className="btn-secondary text-xs">
                {showArchived ? '← Back to current' : `Archived (${archivedCount})`}
              </button>
            )}
            {!showArchived && (
              <button
                onClick={() => (showConnForm ? setShowConnForm(false) : openConnForm(null))}
                className="btn-primary text-xs"
              >
                {showConnForm ? 'Cancel' : '+ Add connection'}
              </button>
            )}
          </div>
        </div>

        {!showArchived && needsNextStepCount > 0 && (
          <div className="rounded-xl border border-sparrow-gold/40 bg-sparrow-gold/5 px-4 py-3 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
            {needsNextStepCount === 1 ? '1 connection has' : `${needsNextStepCount} connections have`} no next
            step. Click <strong>Choose next step</strong> on {needsNextStepCount === 1 ? 'it' : 'each'}. Until then,
            {needsNextStepCount === 1 ? ' it shows' : ' they show'} on Home.
          </div>
        )}

        {showConnForm && (
          <form onSubmit={handleAddConn} className="max-w-3xl rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label field-label-required" htmlFor="pet-conn-name">Name</label>
                <input
                  id="pet-conn-name"
                  className={connFields.fieldClass('pet-conn-name', 'field-input w-full')}
                  value={connForm.name}
                  onChange={(e) => { setConnForm((f) => ({ ...f, name: e.target.value })); connFields.clear('pet-conn-name'); }}
                />
                {connFields.fieldError('pet-conn-name') && <p className="mt-1 text-xs text-priority-p1">{connFields.fieldError('pet-conn-name')}</p>}
              </div>
              <div>
                <label className="field-label">Organization</label>
                <input
                  className="field-input w-full"
                  value={connForm.organization ?? ''}
                  onChange={(e) => setConnForm((f) => ({ ...f, organization: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="field-label">Role / title</label>
                <input
                  className="field-input w-full"
                  value={connForm.role ?? ''}
                  onChange={(e) => setConnForm((f) => ({ ...f, role: e.target.value || null }))}
                  placeholder="Their title at the organization"
                />
              </div>
              <div>
                <label className="field-label">Phone</label>
                <input
                  className="field-input w-full"
                  value={connForm.phone ?? ''}
                  onChange={(e) => setConnForm((f) => ({ ...f, phone: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="field-label">Email</label>
                <input
                  type="email"
                  className="field-input w-full"
                  value={connForm.email ?? ''}
                  onChange={(e) => setConnForm((f) => ({ ...f, email: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="field-label">Website</label>
                <input
                  className="field-input w-full"
                  value={connForm.website ?? ''}
                  onChange={(e) => setConnForm((f) => ({ ...f, website: e.target.value || null }))}
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
                <label className="field-label">Met at (optional)</label>
                <select
                  className="field-input w-full"
                  value={connForm.event_id ?? ''}
                  onChange={(e) => setConnForm((f) => ({ ...f, event_id: e.target.value || null }))}
                >
                  <option value="">No event</option>
                  {events.slice(0, 10).map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {shortDate(ev.event_date)} · {ev.event_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Owner</label>
                <select
                  className="field-input w-full"
                  value={connForm.owner_id ?? ''}
                  onChange={(e) => setConnForm((f) => ({ ...f, owner_id: e.target.value || null }))}
                >
                  <option value="">No owner (room admin)</option>
                  {ownerProfiles.map((op) => (
                    <option key={op.id} value={op.id}>{op.full_name}</option>
                  ))}
                </select>
              </div>

              {/* What's next — required, nothing pre-selected. */}
              <fieldset id="pet-conn-next" className="col-span-2">
                <legend className="field-label field-label-required">What's next?</legend>
                <div className={connFields.fieldClass('pet-conn-next', 'mt-1 grid gap-1 rounded-lg sm:grid-cols-2')}>
                  {([
                    ['followup', 'Set a follow-up', 'There is something more to do with them.'],
                    ['existing', 'Add to an existing Directory record', 'Their organization is already in the Directory. They join its contacts.'],
                    ['directory', 'Add to Directory as a new record', 'An ongoing relationship. Opens the Add form next.'],
                    ['archive', 'Archive', 'Nothing more to do. Kept as a record.'],
                  ] as [NewNextStep, string, string][]).map(([value, label, hint]) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 ${
                        newNextStep === value
                          ? 'border-sparrow-green bg-sparrow-mist dark:border-sparrow-dark-green dark:bg-sparrow-dark-surface2'
                          : 'border-sparrow-rule dark:border-sparrow-dark-border hover:bg-sparrow-mist/50 dark:hover:bg-sparrow-dark-surface2'
                      }`}
                    >
                      <input
                        type="radio"
                        name="pet-conn-next"
                        checked={newNextStep === value}
                        onChange={() => chooseNewNextStep(value)}
                        className="mt-0.5 accent-sparrow-green"
                      />
                      <span>
                        <span className="block text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{label}</span>
                        <span className="block text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {connFields.fieldError('pet-conn-next') && <p className="mt-1 text-xs text-priority-p1">{connFields.fieldError('pet-conn-next')}</p>}
              </fieldset>

              {newNextStep === 'followup' && (
                <>
                  <div>
                    <label className="field-label field-label-required" htmlFor="pet-conn-due">Follow up by</label>
                    <input
                      id="pet-conn-due"
                      type="date"
                      className={connFields.fieldClass('pet-conn-due', 'field-input w-full')}
                      value={connForm.followup_due ?? ''}
                      onChange={(e) => { setConnForm((f) => ({ ...f, followup_due: e.target.value || null })); connFields.clear('pet-conn-due'); }}
                    />
                    {connFields.fieldError('pet-conn-due') && <p className="mt-1 text-xs text-priority-p1">{connFields.fieldError('pet-conn-due')}</p>}
                  </div>
                  <div>
                    <label className="field-label">Next action</label>
                    <input
                      className="field-input w-full"
                      value={connForm.next_action ?? ''}
                      onChange={(e) => setConnForm((f) => ({ ...f, next_action: e.target.value || null }))}
                      placeholder="e.g. Send the volunteer info packet"
                    />
                  </div>
                </>
              )}

              {newNextStep === 'existing' && (
                <div id="pet-conn-record" className="col-span-2">
                  <label className="field-label field-label-required">Which Directory record?</label>
                  <div className={connFields.fieldClass('pet-conn-record', 'rounded-lg')}>
                    <DirectoryRecordPicker
                      value={newRecordId}
                      onChange={(id) => { setNewRecordId(id); connFields.clear('pet-conn-record'); }}
                      initialSearch={connForm.organization}
                    />
                  </div>
                  {connFields.fieldError('pet-conn-record') && <p className="mt-1 text-xs text-priority-p1">{connFields.fieldError('pet-conn-record')}</p>}
                  <p className="mt-1 text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
                    Their name, role, phone and email are added to the record's contacts, with where
                    you met and what you discussed in the contact's notes.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowConnForm(false)} className="btn-ghost text-sm">Cancel</button>
              <button type="submit" disabled={savingConn} className="btn-primary text-sm">
                {savingConn ? 'Saving…' : newNextStep === 'directory' ? 'Add and continue' : 'Add connection'}
              </button>
            </div>
          </form>
        )}

        {!loading && (
          <GridTableShell
            layout={connLayout}
            sortKey={connSortKey}
            sortDir={connSortDir}
            onHeaderClick={(k) => { if (CONN_SORTABLE.includes(k)) connHeader.handleHeaderClick(k); }}
            startResize={connHeader.startResize}
            items={connRows}
            rowKey={(c) => c.id}
            renderCell={renderConnCell}
            onRowClick={(c) => setSelectedConnId(c.id)}
            rowClassName={(c) => `cursor-pointer ${c.archived_at ? 'opacity-70' : ''} hover:bg-sparrow-mist/40 dark:hover:bg-sparrow-dark-surface2`}
            firstColClassName={(c) => (!c.archived_at && (connectionNeedsNextStep(c) || (c.followup_due ?? '9999') < today) ? 'border-l-4 border-l-priority-p1' : '')}
            emptyMessage={showArchived ? 'No archived connections.' : 'No connections logged yet.'}
            toolbar={
              <span className="mr-auto self-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
                {visibleConnections.length} {showArchived ? 'archived' : 'current'} connection{visibleConnections.length !== 1 ? 's' : ''}
              </span>
            }
          />
        )}
      </section>

      <EventDetailPanel
        open={selectedEventId !== null}
        event={events.find((e) => e.id === selectedEventId) ?? null}
        connectionCount={selectedEventId ? connCountByEvent.get(selectedEventId) ?? 0 : 0}
        onClose={() => setSelectedEventId(null)}
        onChanged={load}
      />
      <ConnectionDetailPanel
        open={selectedConnId !== null}
        connection={connections.find((c) => c.id === selectedConnId) ?? null}
        events={events}
        profiles={profiles}
        currentUserId={profile?.id ?? ''}
        onClose={() => setSelectedConnId(null)}
        onChanged={load}
        onAddToDirectory={onBecomePartner}
      />
    </div>
  );
}

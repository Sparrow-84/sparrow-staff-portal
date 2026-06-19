import { useCallback, useEffect, useState, useTransition } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  INCIDENT_SEVERITIES,
  INCIDENT_TYPES,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentWithLogger,
} from '@/lib/incident-types';
import {
  createIncident,
  deleteIncident,
  fetchIncidents,
  updateIncident,
} from '@/lib/incidents';
import type { Space } from '@/lib/housing-types';

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Slide-over panel ─────────────────────────────────────────────────────────

interface PanelProps {
  open: boolean;
  incident: IncidentWithLogger | null;
  spaces: Space[];
  onClose: () => void;
  onChanged: () => void;
}

function IncidentPanel({ open, incident, spaces, onClose, onChanged }: PanelProps) {
  const { profile } = useAuth();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [incidentDate, setIncidentDate] = useState(nowLocal());
  const [lotId, setLotId] = useState('');
  const [incidentType, setIncidentType] = useState<string>(INCIDENT_TYPES[0]);
  const [severity, setSeverity] = useState<IncidentSeverity>('low');
  const [description, setDescription] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [status, setStatus] = useState<IncidentStatus>('open');

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (incident) {
      const local = new Date(incident.incident_date);
      const pad = (n: number) => String(n).padStart(2, '0');
      setIncidentDate(
        `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`,
      );
      setLotId(incident.lot_id ?? '');
      setIncidentType(incident.incident_type);
      setSeverity(incident.severity);
      setDescription(incident.description);
      setFollowUp(incident.follow_up ?? '');
      setStatus(incident.status);
    } else {
      setIncidentDate(nowLocal());
      setLotId('');
      setIncidentType(INCIDENT_TYPES[0]);
      setSeverity('low');
      setDescription('');
      setFollowUp('');
      setStatus('open');
    }
  }, [open, incident]);

  const canEdit = !incident || profile?.role === 'admin' || incident.logged_by === profile?.id;
  const canDelete = profile?.role === 'admin';

  function save() {
    if (!description.trim()) {
      setError('A description is required.');
      return;
    }
    const selectedSpace = spaces.find((s) => s.id === lotId);
    const iso = new Date(incidentDate).toISOString();
    startTransition(async () => {
      try {
        if (incident) {
          await updateIncident(incident.id, {
            incident_date: iso,
            lot_id: lotId || null,
            lot_label: selectedSpace?.label ?? null,
            incident_type: incidentType,
            severity,
            description: description.trim(),
            follow_up: followUp.trim() || null,
            status,
          });
        } else {
          if (!profile) return;
          await createIncident({
            incident_date: iso,
            lot_id: lotId || null,
            lot_label: selectedSpace?.label ?? null,
            incident_type: incidentType,
            severity,
            description: description.trim(),
            follow_up: followUp.trim() || null,
            status: 'open',
            logged_by: profile.id,
          });
        }
        onChanged();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });
  }

  function remove() {
    if (!incident) return;
    startTransition(async () => {
      try {
        await deleteIncident(incident.id);
        onChanged();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete.');
      }
    });
  }

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-sparrow-ink/30 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl transition-transform ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-sparrow-rule px-5 py-4">
          <h2 className="font-serif text-lg font-semibold">
            {incident ? 'Incident detail' : 'Log incident'}
          </h2>
          <button onClick={onClose} className="btn-ghost" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="i-date">
                Date &amp; time
              </label>
              <input
                id="i-date"
                type="datetime-local"
                className="field-input"
                value={incidentDate}
                onChange={(e) => setIncidentDate(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="i-lot">
                Lot
              </label>
              <select
                id="i-lot"
                className="field-input"
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
                disabled={!canEdit}
              >
                <option value="">No specific lot</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    Lot {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="i-type">
                Incident type
              </label>
              <select
                id="i-type"
                className="field-input"
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value)}
                disabled={!canEdit}
              >
                {INCIDENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="i-sev">
                Severity
              </label>
              <select
                id="i-sev"
                className="field-input"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                disabled={!canEdit}
              >
                {INCIDENT_SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="i-desc">
              Description
            </label>
            <textarea
              id="i-desc"
              className="field-input"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened?"
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="i-followup">
              Follow-up action
            </label>
            <textarea
              id="i-followup"
              className="field-input"
              rows={2}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder="Steps taken or planned (optional)"
              disabled={!canEdit}
            />
          </div>

          {incident && (
            <div>
              <label className="field-label" htmlFor="i-status">
                Status
              </label>
              <select
                id="i-status"
                className="field-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as IncidentStatus)}
                disabled={!canEdit}
              >
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          )}

          {incident?.logger && (
            <p className="text-xs text-sparrow-gray">
              Logged by {incident.logger.full_name}
            </p>
          )}

          {error && <p className="text-sm text-priority-p1">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-sparrow-rule px-5 py-4">
          {incident && canDelete ? (
            <button onClick={remove} disabled={pending} className="btn-ghost text-priority-p1">
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            {canEdit && (
              <button onClick={save} disabled={pending} className="btn-primary">
                {pending ? 'Saving…' : incident ? 'Save' : 'Log incident'}
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

// ── Tab ───────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | IncidentStatus;
type SeverityFilter = 'all' | IncidentSeverity;

interface TabProps {
  spaces: Space[];
}

export function IncidentLogTab({ spaces }: TabProps) {
  const [incidents, setIncidents] = useState<IncidentWithLogger[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const [panelOpen, setPanelOpen] = useState(false);
  const [editIncident, setEditIncident] = useState<IncidentWithLogger | null>(null);

  const load = useCallback(async () => {
    try {
      setIncidents(await fetchIncidents());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load incidents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setEditIncident(null);
    setPanelOpen(true);
  }

  function openIncident(i: IncidentWithLogger) {
    setEditIncident(i);
    setPanelOpen(true);
  }

  const filtered = incidents.filter((i) => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (severityFilter !== 'all' && i.severity !== severityFilter) return false;
    return true;
  });

  const openCount = incidents.filter((i) => i.status === 'open').length;

  if (loading) return <p className="py-8 text-sm text-sparrow-gray">Loading incidents…</p>;
  if (err) return <p className="py-8 text-sm text-priority-p1">{err}</p>;

  return (
    <>
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-sparrow-gray">
            {openCount} open · {incidents.length} total
          </p>
          <button onClick={openNew} className="btn-primary">
            + Log incident
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap gap-4">
          <div className="flex items-center gap-1 text-sm">
            {(['all', 'open', 'resolved'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1 font-medium transition ${
                  statusFilter === s
                    ? 'bg-sparrow-green text-white'
                    : 'text-sparrow-gray hover:text-sparrow-ink'
                }`}
              >
                {s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-sm">
            <button
              onClick={() => setSeverityFilter('all')}
              className={`rounded-lg px-3 py-1 font-medium transition ${
                severityFilter === 'all'
                  ? 'bg-sparrow-green text-white'
                  : 'text-sparrow-gray hover:text-sparrow-ink'
              }`}
            >
              All severities
            </button>
            {INCIDENT_SEVERITIES.map((s) => (
              <button
                key={s.value}
                onClick={() => setSeverityFilter(s.value)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-medium transition ${
                  severityFilter === s.value
                    ? 'bg-sparrow-green text-white'
                    : 'text-sparrow-gray hover:text-sparrow-ink'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-sparrow-rule bg-white p-8 text-center text-sm text-sparrow-gray">
            {incidents.length === 0 ? 'No incidents logged yet.' : 'No incidents match this filter.'}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
            {filtered.map((i) => {
              const sev = INCIDENT_SEVERITIES.find((s) => s.value === i.severity);
              return (
                <li key={i.id}>
                  <button
                    onClick={() => openIncident(i)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-sparrow-mist"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sev?.dot ?? 'bg-sparrow-gray'}`}
                      aria-hidden
                    />
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold text-sparrow-ink">
                          {i.incident_type}
                        </span>
                        {i.lot_label && (
                          <span className="text-xs text-sparrow-gray">Lot {i.lot_label}</span>
                        )}
                        <span className="text-xs text-sparrow-gray">{fmtDate(i.incident_date)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-sparrow-gray">
                        {i.description}
                      </span>
                      {i.logger && (
                        <span className="mt-0.5 block text-xs text-sparrow-gray/70">
                          {i.logger.full_name}
                        </span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium ring-1 ${
                        i.status === 'open'
                          ? 'bg-amber-50 text-amber-700 ring-amber-200'
                          : 'bg-sparrow-mist text-sparrow-gray ring-sparrow-rule'
                      }`}
                    >
                      {i.status === 'open' ? 'Open' : 'Resolved'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <IncidentPanel
        open={panelOpen}
        incident={editIncident}
        spaces={spaces}
        onClose={() => setPanelOpen(false)}
        onChanged={load}
      />
    </>
  );
}

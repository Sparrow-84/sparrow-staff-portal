import { useState, useEffect, useCallback } from 'react';
import {
  fetchAllLocations, fetchAllCurrentPeriodSubmissions,
  fetchAllLocationAssignments, addLocationAssignment, removeLocationAssignment,
  type LocationAssignees,
} from '@/lib/inventory';
import { fetchProfiles } from '@/lib/data';
import type { Profile } from '@/lib/types';
import {
  SUBMISSION_STATUS_META,
  type InvLocation, type InvMonthlySubmission,
} from '@/lib/inventory-types';
import { SubmissionReviewPanel } from './SubmissionReviewPanel';
import { MonthlySubmissionForm } from './MonthlySubmissionForm';

interface ActiveForm {
  locationId: string;
  locationName: string;
  month: number;
  year: number;
}

export function OpsSubmissionsView({ month, year }: { month: number; year: number }) {
  const [locations,    setLocations]    = useState<InvLocation[]>([]);
  const [submissions,  setSubmissions]  = useState<InvMonthlySubmission[]>([]);
  const [assignees,    setAssignees]    = useState<LocationAssignees>({});
  const [allProfiles,  setAllProfiles]  = useState<Profile[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [err,          setErr]          = useState('');
  const [panelId,      setPanelId]      = useState<string | null>(null);
  const [activeForm,   setActiveForm]   = useState<ActiveForm | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locs, subs, assigns, profiles] = await Promise.all([
        fetchAllLocations(),
        fetchAllCurrentPeriodSubmissions(month, year),
        fetchAllLocationAssignments(),
        fetchProfiles(),
      ]);
      setLocations(locs);
      setSubmissions(subs);
      setAssignees(assigns);
      // Exclude system accounts from the picker
      setAllProfiles(profiles.filter(
        (p) => p.email !== 'it@sparrowinc.org' && p.email !== 'systems@sparrowinc.org' && p.email !== 'ryanlhanson@gmail.com',
      ));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load.');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd(locationId: string, userId: string) {
    await addLocationAssignment(locationId, userId);
    setAssignees((prev) => {
      const person = allProfiles.find((p) => p.id === userId);
      if (!person) return prev;
      return {
        ...prev,
        [locationId]: [...(prev[locationId] ?? []), { id: person.id, full_name: person.full_name }],
      };
    });
  }

  async function handleRemove(locationId: string, userId: string) {
    await removeLocationAssignment(locationId, userId);
    setAssignees((prev) => ({
      ...prev,
      [locationId]: (prev[locationId] ?? []).filter((u) => u.id !== userId),
    }));
  }

  function getSubmission(locationId: string): InvMonthlySubmission | undefined {
    return submissions.find((s) => s.location_id === locationId);
  }

  function handleRowClick(loc: InvLocation) {
    const sub = getSubmission(loc.id);
    if (sub?.status === 'submitted' || sub?.status === 'approved') {
      setPanelId(sub.id);
    } else {
      setActiveForm({ locationId: loc.id, locationName: loc.name, month, year });
    }
  }

  if (activeForm) {
    return (
      <MonthlySubmissionForm
        locationId={activeForm.locationId}
        locationName={activeForm.locationName}
        month={activeForm.month}
        year={activeForm.year}
        onSubmitted={() => { void load(); setActiveForm(null); }}
        onBack={() => setActiveForm(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-sparrow-gray text-sm">
        Loading…
      </div>
    );
  }

  if (err) {
    return <p className="p-4 text-sm text-priority-p1">{err}</p>;
  }

  const physicalLocations = locations.filter((l) => !l.is_remote);
  const remoteLocations   = locations.filter((l) => l.is_remote);
  const allLocs   = [...physicalLocations, ...remoteLocations];
  const pending   = submissions.filter((s) => s.status === 'submitted').length;
  const approved  = submissions.filter((s) => s.status === 'approved').length;
  const missing   = allLocs.length - submissions.length;

  return (
    <>
      {/* Summary bar */}
      <div className="flex flex-wrap gap-4 mb-5">
        {pending > 0 && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="h-2 w-2 rounded-full bg-priority-p3" />
            <span className="font-medium text-priority-p3">{pending} awaiting review</span>
          </div>
        )}
        {approved > 0 && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="h-2 w-2 rounded-full bg-sparrow-green" />
            <span className="text-sparrow-gray">{approved} approved</span>
          </div>
        )}
        {missing > 0 && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="h-2 w-2 rounded-full bg-sparrow-rule" />
            <span className="text-sparrow-gray">{missing} not yet started</span>
          </div>
        )}
      </div>

      {/* Physical locations */}
      <LocationSection
        locations={physicalLocations}
        submissions={submissions}
        assignees={assignees}
        allProfiles={allProfiles}
        onRowClick={handleRowClick}
        onAdd={handleAdd}
        onRemove={handleRemove}
      />

      {/* Remote staff */}
      {remoteLocations.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray mb-2">
            Remote Staff Submissions
          </p>
          <p className="text-xs text-sparrow-gray mb-3">
            Items in staff possession outside of a fixed Sparrow location.
          </p>
          <LocationSection
            locations={remoteLocations}
            submissions={submissions}
            assignees={assignees}
            allProfiles={allProfiles}
            onRowClick={handleRowClick}
            onAdd={handleAdd}
            onRemove={handleRemove}
          />
        </div>
      )}

      <SubmissionReviewPanel
        submissionId={panelId}
        open={!!panelId}
        onClose={() => setPanelId(null)}
        onApproved={() => { void load(); setPanelId(null); }}
      />
    </>
  );
}

// ── Location section ──────────────────────────────────────────────────────

function LocationSection({
  locations,
  submissions,
  assignees,
  allProfiles,
  onRowClick,
  onAdd,
  onRemove,
}: {
  locations: InvLocation[];
  submissions: InvMonthlySubmission[];
  assignees: LocationAssignees;
  allProfiles: Profile[];
  onRowClick: (loc: InvLocation) => void;
  onAdd: (locationId: string, userId: string) => Promise<void>;
  onRemove: (locationId: string, userId: string) => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-sparrow-rule bg-white overflow-hidden divide-y divide-sparrow-rule">
      {locations.map((loc) => (
        <LocationRow
          key={loc.id}
          loc={loc}
          sub={submissions.find((s) => s.location_id === loc.id)}
          assigned={assignees[loc.id] ?? []}
          allProfiles={allProfiles}
          onRowClick={onRowClick}
          onAdd={(userId) => onAdd(loc.id, userId)}
          onRemove={(userId) => onRemove(loc.id, userId)}
        />
      ))}
    </div>
  );
}

// ── Location row ──────────────────────────────────────────────────────────

function LocationRow({
  loc,
  sub,
  assigned,
  allProfiles,
  onRowClick,
  onAdd,
  onRemove,
}: {
  loc: InvLocation;
  sub: InvMonthlySubmission | undefined;
  assigned: { id: string; full_name: string }[];
  allProfiles: Profile[];
  onRowClick: (loc: InvLocation) => void;
  onAdd: (userId: string) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
}) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [adding,     setAdding]     = useState(false);
  const [removing,   setRemoving]   = useState<string | null>(null);

  const assignedIds  = new Set(assigned.map((u) => u.id));
  const unassigned   = allProfiles.filter((p) => !assignedIds.has(p.id));
  const status       = sub?.status;

  async function handleAdd(userId: string) {
    setAdding(true);
    try { await onAdd(userId); } finally { setAdding(false); }
  }

  async function handleRemove(userId: string) {
    setRemoving(userId);
    try { await onRemove(userId); } finally { setRemoving(null); }
  }

  return (
    <div>
      {/* Main row — two sibling clickable zones, no nesting */}
      <div className="flex items-stretch">
        {/* Left: click to open form/panel */}
        <button
          onClick={() => onRowClick(loc)}
          className="flex-1 flex items-center gap-4 px-4 py-3.5 text-left hover:bg-sparrow-mist transition min-w-0"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sparrow-ink">{loc.name}</p>
            {/* Assignee names */}
            {assigned.length > 0 ? (
              <p className="text-xs text-sparrow-gray mt-0.5">
                {assigned.map((u) => u.full_name.split(' ')[0]).join(' · ')}
              </p>
            ) : (
              <p className="text-xs text-priority-p1 mt-0.5">No one assigned</p>
            )}
            {/* Submission hint */}
            {sub?.submitter && (
              <p className="text-xs text-sparrow-gray">
                {sub.submitter.full_name}
                {sub.submitted_at &&
                  ` · ${new Date(sub.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </p>
            )}
            {!sub && <p className="text-xs text-sparrow-gray/70">Click to enter on their behalf</p>}
            {sub?.status === 'draft' && (
              <p className="text-xs text-sparrow-gray/70">Draft in progress — click to review</p>
            )}
          </div>

          {status ? (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SUBMISSION_STATUS_META[status].chip}`}>
              {SUBMISSION_STATUS_META[status].label}
            </span>
          ) : (
            <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium bg-sparrow-mist text-sparrow-gray">
              Not started
            </span>
          )}
          <span className="text-sparrow-gray shrink-0">›</span>
        </button>

        {/* Right: assign toggle button */}
        <button
          onClick={() => setAssignOpen((v) => !v)}
          title="Manage assignees"
          className={`shrink-0 px-3 border-l border-sparrow-rule hover:bg-sparrow-mist transition ${
            assignOpen ? 'text-sparrow-green bg-sparrow-sage' : 'text-sparrow-gray'
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-7 9a7 7 0 1 1 14 0H3zm14.5-9.5a.5.5 0 0 1 .5.5v1h1a.5.5 0 0 1 0 1h-1v1a.5.5 0 0 1-1 0v-1h-1a.5.5 0 0 1 0-1h1v-1a.5.5 0 0 1 .5-.5z"/>
          </svg>
        </button>
      </div>

      {/* Inline assignment editor */}
      {assignOpen && (
        <div className="border-t border-sparrow-rule bg-sparrow-mist/30 px-4 py-3 space-y-2">
          {/* Current assignees */}
          {assigned.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {assigned.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 rounded-full bg-sparrow-sage px-2.5 py-1 text-xs font-medium text-sparrow-green"
                >
                  {u.full_name.split(' ')[0]}
                  <button
                    onClick={() => void handleRemove(u.id)}
                    disabled={removing === u.id}
                    className="ml-0.5 hover:text-priority-p1 transition disabled:opacity-50"
                    aria-label={`Remove ${u.full_name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-sparrow-gray italic">Nobody assigned yet</p>
          )}

          {/* Add person */}
          {unassigned.length > 0 && (
            <select
              defaultValue=""
              disabled={adding}
              onChange={(e) => {
                if (e.target.value) void handleAdd(e.target.value);
                e.target.value = '';
              }}
              className="rounded-lg border border-sparrow-rule bg-white px-2.5 py-1.5 text-sm text-sparrow-ink focus:outline-none focus:ring-1 focus:ring-sparrow-green disabled:opacity-50"
            >
              <option value="" disabled>{adding ? 'Adding…' : '+ Add person'}</option>
              {unassigned.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

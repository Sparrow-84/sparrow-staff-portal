import { useState, useEffect, useCallback } from 'react';
import { fetchAllLocations, fetchAllCurrentPeriodSubmissions } from '@/lib/inventory';
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
  const [locations, setLocations]   = useState<InvLocation[]>([]);
  const [submissions, setSubmissions] = useState<InvMonthlySubmission[]>([]);
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState('');
  const [panelId, setPanelId]       = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<ActiveForm | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locs, subs] = await Promise.all([
        fetchAllLocations(),
        fetchAllCurrentPeriodSubmissions(month, year),
      ]);
      setLocations(locs);
      setSubmissions(subs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load.');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { void load(); }, [load]);

  function getSubmission(locationId: string): InvMonthlySubmission | undefined {
    return submissions.find((s) => s.location_id === locationId);
  }

  function handleRowClick(loc: InvLocation) {
    const sub = getSubmission(loc.id);
    if (sub?.status === 'submitted' || sub?.status === 'approved') {
      setPanelId(sub.id);
    } else {
      // Draft or not started — open the form (ops enters on behalf)
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
        onRowClick={handleRowClick}
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
            onRowClick={handleRowClick}
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

function LocationSection({
  locations,
  submissions,
  onRowClick,
}: {
  locations: InvLocation[];
  submissions: InvMonthlySubmission[];
  onRowClick: (loc: InvLocation) => void;
}) {
  function getSub(locationId: string) {
    return submissions.find((s) => s.location_id === locationId);
  }

  return (
    <ul className="divide-y divide-sparrow-rule rounded-xl border border-sparrow-rule bg-white overflow-hidden">
      {locations.map((loc) => {
        const sub    = getSub(loc.id);
        const status = sub?.status;

        return (
          <li key={loc.id}>
            <button
              onClick={() => onRowClick(loc)}
              className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-sparrow-mist transition"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sparrow-ink">{loc.name}</p>
                {sub?.submitter && (
                  <p className="text-xs text-sparrow-gray mt-0.5">
                    {sub.submitter.full_name}
                    {sub.submitted_at &&
                      ` · ${new Date(sub.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  </p>
                )}
                {!sub && (
                  <p className="text-xs text-sparrow-gray mt-0.5">Click to enter on their behalf</p>
                )}
                {sub?.status === 'draft' && (
                  <p className="text-xs text-sparrow-gray mt-0.5">Draft in progress — click to review</p>
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
          </li>
        );
      })}
    </ul>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchMyLocations, fetchSubmissions, fetchActiveFlipForLocation, fetchLocationOwners,
  type MyLocationAssignment,
} from '@/lib/inventory';
import {
  SUBMISSION_STATUS_META, FLIP_STATUS_LABELS, monthName,
  type InvLocation, type InvMonthlySubmission, type InvHouseFlip,
} from '@/lib/inventory-types';
import { MonthlySubmissionForm } from './MonthlySubmissionForm';
import { HouseFlipWorkflow } from './HouseFlipWorkflow';

interface ActiveForm {
  locationId: string;
  locationName: string;
  month: number;
  year: number;
}

export function StaffSubmissionView({ month, year }: { month: number; year: number }) {
  const { profile } = useAuth();
  const [assignments,  setAssignments]  = useState<MyLocationAssignment[]>([]);
  const [submissions,  setSubmissions]  = useState<InvMonthlySubmission[]>([]);
  const [activeFlips,  setActiveFlips]  = useState<Record<string, InvHouseFlip | null>>({});
  const [ownerMap,     setOwnerMap]     = useState<Record<string, { id: string; full_name: string } | null>>({});
  const [loading,      setLoading]      = useState(true);
  const [err,          setErr]          = useState('');
  const [activeForm,   setActiveForm]   = useState<ActiveForm | null>(null);
  const [flipLocId,    setFlipLocId]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const myAssignments = await fetchMyLocations();
      if (myAssignments.length === 0) {
        setAssignments([]);
        setLoading(false);
        return;
      }
      const locs = myAssignments.map((a) => a.location);
      const locIds = locs.map((l) => l.id);
      const [allSubs, owners, ...flipResults] = await Promise.all([
        Promise.all(locs.map((l) => fetchSubmissions(l.id))).then((r) => r.flat()),
        fetchLocationOwners(locIds),
        ...locs
          .filter((l) => l.is_lcp_house)
          .map((l) => fetchActiveFlipForLocation(l.id).then((f) => ({ locationId: l.id, flip: f }))),
      ]);
      setAssignments(myAssignments);
      setSubmissions(allSubs);
      setOwnerMap(owners);
      const flipMap: Record<string, InvHouseFlip | null> = {};
      (flipResults as { locationId: string; flip: InvHouseFlip | null }[]).forEach(
        ({ locationId, flip }) => { flipMap[locationId] = flip; },
      );
      setActiveFlips(flipMap);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function getCurrentSub(locationId: string): InvMonthlySubmission | undefined {
    return submissions.find(
      (s) => s.location_id === locationId && s.period_month === month && s.period_year === year,
    );
  }

  function getRecentSubs(locationId: string): InvMonthlySubmission[] {
    return submissions
      .filter((s) => s.location_id === locationId && !(s.period_month === month && s.period_year === year))
      .slice(0, 3);
  }

  if (flipLocId) {
    const loc = assignments.find((a) => a.location.id === flipLocId)?.location;
    return (
      <HouseFlipWorkflow
        locationId={flipLocId}
        locationName={loc?.name ?? ''}
        onBack={() => { setFlipLocId(null); void load(); }}
      />
    );
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
      <div className="flex items-center justify-center h-40 text-sparrow-gray dark:text-sparrow-dark-gray text-sm">
        Loading…
      </div>
    );
  }

  if (err) {
    return <p className="p-4 text-sm text-priority-p1">{err}</p>;
  }

  if (assignments.length === 0) {
    return (
      <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-6 text-center">
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          You don't have any inventory locations assigned yet. Contact operations.
        </p>
      </div>
    );
  }

  const physicalAssignments = assignments.filter((a) => !a.location.is_remote);
  const remoteAssignments   = assignments.filter((a) => a.location.is_remote);
  const myId = profile?.id ?? '';

  return (
    <div className="space-y-8">
      {/* Physical locations */}
      {physicalAssignments.length > 0 && (
        <div className="space-y-6">
          {physicalAssignments.map(({ location: loc, is_owner }) => {
            const owner = ownerMap[loc.id] ?? null;
            return (
              <LocationCard
                key={loc.id}
                loc={loc}
                currentSub={getCurrentSub(loc.id)}
                recentSubs={getRecentSubs(loc.id)}
                activeFlip={activeFlips[loc.id] ?? null}
                month={month}
                year={year}
                isOwner={is_owner}
                ownerName={owner && owner.id !== myId ? owner.full_name.split(' ')[0] : null}
                onOpenForm={() => setActiveForm({ locationId: loc.id, locationName: loc.name, month, year })}
                onOpenFlip={() => setFlipLocId(loc.id)}
              />
            );
          })}
        </div>
      )}

      {/* Remote items */}
      {remoteAssignments.length > 0 && (
        <div>
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
              Remote Items
            </p>
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray mt-0.5">
              Items in your possession outside of a fixed Sparrow location. Same submission rules apply.
            </p>
          </div>
          <div className="space-y-4">
            {remoteAssignments.map(({ location: loc, is_owner }) => (
              <LocationCard
                key={loc.id}
                loc={loc}
                currentSub={getCurrentSub(loc.id)}
                recentSubs={getRecentSubs(loc.id)}
                activeFlip={null}
                month={month}
                year={year}
                isOwner={is_owner}
                ownerName={null}
                onOpenForm={() => setActiveForm({ locationId: loc.id, locationName: loc.name, month, year })}
                onOpenFlip={() => {}}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LocationCard({
  loc,
  currentSub,
  recentSubs,
  activeFlip,
  month,
  year,
  isOwner,
  ownerName,
  onOpenForm,
  onOpenFlip,
}: {
  loc: InvLocation;
  currentSub: InvMonthlySubmission | undefined;
  recentSubs: InvMonthlySubmission[];
  activeFlip: InvHouseFlip | null;
  month: number;
  year: number;
  isOwner: boolean;
  ownerName: string | null;
  onOpenForm: () => void;
  onOpenFlip: () => void;
}) {
  return (
    <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface overflow-hidden">
      {/* Location header */}
      <div className="border-b border-sparrow-rule dark:border-sparrow-dark-border px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink text-sm">{loc.name}</h2>
          {ownerName && (
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray mt-0.5">
              Submitter: {ownerName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOwner && ownerName === null && (
            <span className="text-xs text-sparrow-green dark:text-sparrow-dark-green bg-sparrow-sage rounded-full px-2 py-0.5 font-medium">
              You submit
            </span>
          )}
          {loc.is_remote && (
            <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray bg-sparrow-mist dark:bg-sparrow-dark-surface2 rounded-full px-2 py-0.5">
              Remote
            </span>
          )}
        </div>
      </div>

      {/* Monthly submission */}
      <div className="px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray mb-2">
          {monthName(month)} {year}
        </p>
        {currentSub ? (
          <button
            onClick={onOpenForm}
            className="w-full flex items-center justify-between rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border px-3 py-2.5 text-left hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 transition"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SUBMISSION_STATUS_META[currentSub.status].chip}`}>
                  {SUBMISSION_STATUS_META[currentSub.status].label}
                </span>
              </div>
              <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                {currentSub.status === 'draft'     && 'Continue filling out your sheet'}
                {currentSub.status === 'submitted' && 'Awaiting review by Susanna'}
                {currentSub.status === 'approved'  && 'Approved — no action needed'}
              </p>
            </div>
            <span className="text-sparrow-gray dark:text-sparrow-dark-gray">›</span>
          </button>
        ) : (
          <button
            onClick={onOpenForm}
            className="w-full rounded-lg border border-dashed border-sparrow-rule dark:border-sparrow-dark-border px-3 py-2.5 text-sm text-sparrow-gray dark:text-sparrow-dark-gray hover:border-sparrow-green/50 hover:text-sparrow-green dark:hover:text-sparrow-dark-green transition text-left"
          >
            Start {monthName(month)} submission →
          </button>
        )}
      </div>

      {/* House flip trigger — only for LCP houses */}
      {loc.is_lcp_house && (
        <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray mb-2">
            House Flip
          </p>
          {activeFlip ? (
            <button
              onClick={onOpenFlip}
              className="w-full flex items-center justify-between rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border px-3 py-2.5 text-left hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 transition"
            >
              <div>
                <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">Continue house flip</p>
                <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray mt-0.5">
                  {FLIP_STATUS_LABELS[activeFlip.status]}
                </p>
              </div>
              <span className="text-sparrow-gray dark:text-sparrow-dark-gray">›</span>
            </button>
          ) : (
            <button
              onClick={onOpenFlip}
              className="w-full rounded-lg border border-dashed border-sparrow-rule dark:border-sparrow-dark-border px-3 py-2.5 text-sm text-sparrow-gray dark:text-sparrow-dark-gray hover:border-sparrow-green/50 hover:text-sparrow-green dark:hover:text-sparrow-dark-green transition text-left"
            >
              Start house flip →
            </button>
          )}
        </div>
      )}

      {/* Recent history */}
      {recentSubs.length > 0 && (
        <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border px-4 py-2.5">
          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray mb-1.5">Recent</p>
          <div className="space-y-1">
            {recentSubs.map((s) => (
              <button
                key={s.id}
                onClick={onOpenForm}
                className="w-full flex items-center justify-between text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink transition py-0.5"
              >
                <span>{monthName(s.period_month)} {s.period_year}</span>
                <span className={`rounded-full px-1.5 py-0.5 ${SUBMISSION_STATUS_META[s.status].chip}`}>
                  {SUBMISSION_STATUS_META[s.status].label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

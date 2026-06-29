import { useState, useEffect, useCallback } from 'react';
import { fetchMyLocations, fetchSubmissions, fetchActiveFlipForLocation } from '@/lib/inventory';
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
  const [locations,   setLocations]   = useState<InvLocation[]>([]);
  const [submissions, setSubmissions] = useState<InvMonthlySubmission[]>([]);
  const [activeFlips, setActiveFlips] = useState<Record<string, InvHouseFlip | null>>({});
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState('');
  const [activeForm,  setActiveForm]  = useState<ActiveForm | null>(null);
  const [flipLocId,   setFlipLocId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const locs = await fetchMyLocations();
      if (locs.length === 0) {
        setLocations([]);
        setLoading(false);
        return;
      }
      const [allSubs, ...flipResults] = await Promise.all([
        Promise.all(locs.map((l) => fetchSubmissions(l.id))).then((r) => r.flat()),
        ...locs
          .filter((l) => l.is_lcp_house)
          .map((l) => fetchActiveFlipForLocation(l.id).then((f) => ({ locationId: l.id, flip: f }))),
      ]);
      setLocations(locs);
      setSubmissions(allSubs);
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
    const loc = locations.find((l) => l.id === flipLocId);
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
      <div className="flex items-center justify-center h-40 text-sparrow-gray text-sm">
        Loading…
      </div>
    );
  }

  if (err) {
    return <p className="p-4 text-sm text-priority-p1">{err}</p>;
  }

  if (locations.length === 0) {
    return (
      <div className="rounded-xl border border-sparrow-rule bg-sparrow-mist p-6 text-center">
        <p className="text-sm text-sparrow-gray">
          You don't have any inventory locations assigned yet. Contact operations.
        </p>
      </div>
    );
  }

  const physicalLocations = locations.filter((l) => !l.is_remote);
  const remoteLocations   = locations.filter((l) => l.is_remote);

  return (
    <div className="space-y-8">
      {/* Physical locations */}
      {physicalLocations.length > 0 && (
        <div className="space-y-6">
          {physicalLocations.map((loc) => (
            <LocationCard
              key={loc.id}
              loc={loc}
              currentSub={getCurrentSub(loc.id)}
              recentSubs={getRecentSubs(loc.id)}
              activeFlip={activeFlips[loc.id] ?? null}
              month={month}
              year={year}
              onOpenForm={() => setActiveForm({ locationId: loc.id, locationName: loc.name, month, year })}
              onOpenFlip={() => setFlipLocId(loc.id)}
            />
          ))}
        </div>
      )}

      {/* Remote items */}
      {remoteLocations.length > 0 && (
        <div>
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Remote Items
            </p>
            <p className="text-xs text-sparrow-gray mt-0.5">
              Items in your possession outside of a fixed Sparrow location. Same submission rules apply.
            </p>
          </div>
          <div className="space-y-4">
            {remoteLocations.map((loc) => (
              <LocationCard
                key={loc.id}
                loc={loc}
                currentSub={getCurrentSub(loc.id)}
                recentSubs={getRecentSubs(loc.id)}
                activeFlip={null}
                month={month}
                year={year}
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
  onOpenForm,
  onOpenFlip,
}: {
  loc: InvLocation;
  currentSub: InvMonthlySubmission | undefined;
  recentSubs: InvMonthlySubmission[];
  activeFlip: InvHouseFlip | null;
  month: number;
  year: number;
  onOpenForm: () => void;
  onOpenFlip: () => void;
}) {
  return (
    <div className="rounded-xl border border-sparrow-rule bg-white overflow-hidden">
      {/* Location header */}
      <div className="border-b border-sparrow-rule px-4 py-3 flex items-center justify-between">
        <h2 className="font-medium text-sparrow-ink text-sm">{loc.name}</h2>
        {loc.is_remote && (
          <span className="text-xs text-sparrow-gray bg-sparrow-mist rounded-full px-2 py-0.5">
            Remote
          </span>
        )}
      </div>

      {/* Monthly submission */}
      <div className="px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray mb-2">
          {monthName(month)} {year}
        </p>
        {currentSub ? (
          <button
            onClick={onOpenForm}
            className="w-full flex items-center justify-between rounded-lg border border-sparrow-rule px-3 py-2.5 text-left hover:bg-sparrow-mist transition"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SUBMISSION_STATUS_META[currentSub.status].chip}`}>
                  {SUBMISSION_STATUS_META[currentSub.status].label}
                </span>
              </div>
              <p className="text-xs text-sparrow-gray">
                {currentSub.status === 'draft'     && 'Continue filling out your sheet'}
                {currentSub.status === 'submitted' && 'Awaiting review by Susanna'}
                {currentSub.status === 'approved'  && 'Approved — no action needed'}
              </p>
            </div>
            <span className="text-sparrow-gray">›</span>
          </button>
        ) : (
          <button
            onClick={onOpenForm}
            className="w-full rounded-lg border border-dashed border-sparrow-rule px-3 py-2.5 text-sm text-sparrow-gray hover:border-sparrow-green/50 hover:text-sparrow-green transition text-left"
          >
            Start {monthName(month)} submission →
          </button>
        )}
      </div>

      {/* House flip trigger — only for LCP houses */}
      {loc.is_lcp_house && (
        <div className="border-t border-sparrow-rule px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray mb-2">
            House Flip
          </p>
          {activeFlip ? (
            <button
              onClick={onOpenFlip}
              className="w-full flex items-center justify-between rounded-lg border border-sparrow-rule px-3 py-2.5 text-left hover:bg-sparrow-mist transition"
            >
              <div>
                <p className="text-sm text-sparrow-ink">Continue house flip</p>
                <p className="text-xs text-sparrow-gray mt-0.5">
                  {FLIP_STATUS_LABELS[activeFlip.status]}
                </p>
              </div>
              <span className="text-sparrow-gray">›</span>
            </button>
          ) : (
            <button
              onClick={onOpenFlip}
              className="w-full rounded-lg border border-dashed border-sparrow-rule px-3 py-2.5 text-sm text-sparrow-gray hover:border-sparrow-green/50 hover:text-sparrow-green transition text-left"
            >
              Start house flip →
            </button>
          )}
        </div>
      )}

      {/* Recent history */}
      {recentSubs.length > 0 && (
        <div className="border-t border-sparrow-rule px-4 py-2.5">
          <p className="text-xs text-sparrow-gray mb-1.5">Recent</p>
          <div className="space-y-1">
            {recentSubs.map((s) => (
              <button
                key={s.id}
                onClick={onOpenForm}
                className="w-full flex items-center justify-between text-xs text-sparrow-gray hover:text-sparrow-ink transition py-0.5"
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

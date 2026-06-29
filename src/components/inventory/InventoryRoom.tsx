import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchRecentFlips, fetchAllLocations } from '@/lib/inventory';
import {
  FLIP_STATUS_LABELS,
  type InvHouseFlip, type InvLocation,
} from '@/lib/inventory-types';
import { StaffSubmissionView } from './StaffSubmissionView';
import { OpsSubmissionsView } from './OpsSubmissionsView';
import { FilingView } from './FilingView';
import { ConsumablesForm } from './ConsumablesForm';
import { HouseFlipWorkflow } from './HouseFlipWorkflow';

type OpsTab = 'submissions' | 'flips' | 'filing' | 'consumables' | 'register';

export function InventoryRoom() {
  const { profile } = useAuth();
  const isOps = profile?.ops_access ?? false;

  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const [opsTab,     setOpsTab]     = useState<OpsTab>('submissions');
  const [openFlipId, setOpenFlipId] = useState<{ locationId: string; locationName: string } | null>(null);

  const tabBase   = 'px-4 py-2 text-sm font-medium border-b-2 transition';
  const tabActive = 'border-sparrow-green text-sparrow-green';
  const tabIdle   = 'border-transparent text-sparrow-gray hover:text-sparrow-ink';

  return (
    <div className="flex flex-col h-full">
      {/* Room header */}
      <div className="border-b border-sparrow-rule px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-semibold">Property Inventory</h1>
            <p className="text-sm text-sparrow-gray mt-0.5">
              {isOps
                ? 'Review and approve monthly submissions · Manage the asset register'
                : 'Log additions and removals for your area each month'}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-sparrow-rule px-3 py-1 text-xs text-sparrow-gray">
            {new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
        </div>

        {isOps && !openFlipId && (
          <div className="flex gap-1 mt-4 -mb-[1px] overflow-x-auto">
            <button
              onClick={() => setOpsTab('submissions')}
              className={`${tabBase} whitespace-nowrap ${opsTab === 'submissions' ? tabActive : tabIdle}`}
            >
              Submissions
            </button>
            <button
              onClick={() => setOpsTab('flips')}
              className={`${tabBase} whitespace-nowrap ${opsTab === 'flips' ? tabActive : tabIdle}`}
            >
              House Flips
            </button>
            <button
              onClick={() => setOpsTab('filing')}
              className={`${tabBase} whitespace-nowrap ${opsTab === 'filing' ? tabActive : tabIdle}`}
            >
              Benton County Filing
            </button>
            <button
              onClick={() => setOpsTab('consumables')}
              className={`${tabBase} whitespace-nowrap ${opsTab === 'consumables' ? tabActive : tabIdle}`}
            >
              Consumables
            </button>
            <button
              onClick={() => setOpsTab('register')}
              className={`${tabBase} whitespace-nowrap ${opsTab === 'register' ? tabActive : tabIdle}`}
            >
              Asset Register
              <span className="ml-2 rounded-full bg-sparrow-rule/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-sparrow-gray">
                Soon
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Room content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isOps ? (
          openFlipId ? (
            <HouseFlipWorkflow
              locationId={openFlipId.locationId}
              locationName={openFlipId.locationName}
              onBack={() => setOpenFlipId(null)}
            />
          ) : opsTab === 'submissions' ? (
            <OpsSubmissionsView month={month} year={year} />
          ) : opsTab === 'flips' ? (
            <HouseFlipsOpsView
              onOpenFlip={(locationId, locationName) => setOpenFlipId({ locationId, locationName })}
            />
          ) : opsTab === 'filing' ? (
            <FilingView />
          ) : opsTab === 'consumables' ? (
            <ConsumablesForm />
          ) : (
            <div className="rounded-xl border border-sparrow-rule bg-sparrow-mist p-8 text-center">
              <p className="text-sm text-sparrow-gray">The full asset register view is coming soon.</p>
            </div>
          )
        ) : (
          <StaffSubmissionView month={month} year={year} />
        )}
      </div>
    </div>
  );
}

// ── House Flips ops view ──────────────────────────────────────────────────

function HouseFlipsOpsView({
  onOpenFlip,
}: {
  onOpenFlip: (locationId: string, locationName: string) => void;
}) {
  const [flips,     setFlips]     = useState<InvHouseFlip[]>([]);
  const [locations, setLocations] = useState<InvLocation[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, locs] = await Promise.all([
        fetchRecentFlips(20),
        fetchAllLocations(),
      ]);
      setFlips(f);
      setLocations(locs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const lcpHouses    = locations.filter((l) => l.is_lcp_house);
  const activeFlips  = flips.filter((f) => f.status !== 'submitted');
  const activeLocIds = new Set(activeFlips.map((f) => f.location_id));

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-sparrow-gray text-sm">Loading…</div>;
  }
  if (err) {
    return <p className="text-sm text-priority-p1">{err}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Active flips */}
      {activeFlips.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray mb-2">
            Active Flips
          </p>
          <ul className="divide-y divide-sparrow-rule rounded-xl border border-sparrow-rule bg-white overflow-hidden">
            {activeFlips.map((flip) => (
              <li key={flip.id}>
                <button
                  onClick={() => onOpenFlip(flip.location_id, flip.location?.name ?? '')}
                  className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-sparrow-mist transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-sparrow-ink">
                      {flip.location?.name ?? 'Unknown house'}
                    </p>
                    <p className="text-xs text-sparrow-gray mt-0.5">
                      {flip.initiator?.full_name}
                      {' · '}
                      {new Date(flip.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium bg-sparrow-gold/20 text-sparrow-gold">
                    {FLIP_STATUS_LABELS[flip.status]}
                  </span>
                  <span className="text-sparrow-gray shrink-0">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* LCP houses without active flips */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray mb-2">
          {activeFlips.length > 0 ? 'Other LCP Houses' : 'LCP Houses'}
        </p>
        <ul className="divide-y divide-sparrow-rule rounded-xl border border-sparrow-rule bg-white overflow-hidden">
          {lcpHouses
            .filter((l) => !activeLocIds.has(l.id))
            .map((loc) => (
              <li key={loc.id}>
                <button
                  onClick={() => onOpenFlip(loc.id, loc.name)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-sparrow-mist transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-sparrow-ink">{loc.name}</p>
                    <p className="text-xs text-sparrow-gray mt-0.5">No active flip</p>
                  </div>
                  <span className="shrink-0 text-xs text-sparrow-gray">Start flip →</span>
                </button>
              </li>
            ))}
          {lcpHouses.filter((l) => !activeLocIds.has(l.id)).length === 0 && (
            <li className="px-4 py-4 text-sm text-sparrow-gray text-center">
              All LCP houses have active flips in progress.
            </li>
          )}
        </ul>
      </div>

      {/* Recent completed flips */}
      {flips.filter((f) => f.status === 'submitted').length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray mb-2">
            Recently Completed
          </p>
          <ul className="divide-y divide-sparrow-rule rounded-xl border border-sparrow-rule bg-white overflow-hidden">
            {flips
              .filter((f) => f.status === 'submitted')
              .slice(0, 5)
              .map((flip) => (
                <li key={flip.id} className="flex items-center gap-4 px-4 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-sparrow-ink">{flip.location?.name ?? 'Unknown house'}</p>
                    <p className="text-xs text-sparrow-gray mt-0.5">
                      {flip.submitted_at &&
                        new Date(flip.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium bg-sparrow-green/10 text-sparrow-green">
                    Complete
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

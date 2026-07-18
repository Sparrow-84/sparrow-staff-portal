import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchProfiles } from '@/lib/data';
import type { Profile } from '@/lib/types';
import { fetchActiveChecklists, fetchAllReviews, fetchAllTouchpoints, fetchOpenIssues } from '@/lib/ops';
import { daysSince, touchpointTone, type Checklist, type Issue, type Review, type Touchpoint } from '@/lib/ops-types';
import { RoomTour, useRoomTour, type TourStep } from '@/components/RoomTour';
import { StaffMemberPanel } from './StaffMemberPanel';
import { InventoryRoom } from '@/components/inventory/InventoryRoom';
import { DeptCalendar } from '@/components/calendar/DeptCalendar';
import { GrantsRoom } from './GrantsRoom';

const OPS_TOUR_STEPS: TourStep[] = [
  {
    icon: '⚙️',
    title: 'Operations',
    body: "This room handles the internal side of Sparrow — managing staff, tracking inventory, and handling the Benton County filing system. It runs quietly in the background so everything else can run well.",
    tag: null,
  },
  {
    icon: '👥',
    title: 'Staff tab',
    body: "See all staff, when you last met with each person, any open performance issues, scheduled reviews, and active onboarding checklists for new team members. Click any person to open their full record.",
    tag: { icon: '👥', label: 'Staff' },
  },
  {
    icon: '📦',
    title: 'Inventory tab',
    body: "Track all supplies and assets across Sparrow locations. Log what comes in and goes out. The Benton County filing batches — monthly consumables, December reporting, house flips — are managed here too.",
    tag: { icon: '📦', label: 'Inventory' },
  },
  {
    icon: '📜',
    title: 'Grants tab',
    body: "Track every active grant — funder details, the annual OHCS certification deadline, and every funder notification actually sent (insurance, management, ownership, or debt changes). Grants marked \"prior consent required\" are flagged so nobody acts without sign-off first.",
    tag: { icon: '📜', label: 'Grants' },
  },
  {
    icon: '✨',
    title: "You're all set",
    body: "Check the Staff tab when you have a new team member, a review to schedule, or a check-in overdue. Inventory is your source of truth for supplies and county filing. Grants keeps the long-term compliance obligations from slipping.",
    tag: null,
  },
];

export function OperationsRoom() {
  const { tourOpen, dismissTour } = useRoomTour('sparrow_ops_toured_v1');
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>([]);
  const [openIssues, setOpenIssues] = useState<Issue[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [opsTab, setOpsTab] = useState<'staff' | 'inventory' | 'calendar' | 'grants'>('staff');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [st, tp, iss, rv, ck] = await Promise.all([
        fetchProfiles(),
        fetchAllTouchpoints(),
        fetchOpenIssues(),
        fetchAllReviews(),
        fetchActiveChecklists(),
      ]);
      setStaff(st);
      setTouchpoints(tp);
      setOpenIssues(iss);
      setReviews(rv);
      setChecklists(ck);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Operations data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lastMet = useMemo(() => {
    const map = new Map<string, string>(); // touchpoints arrive newest-first
    for (const t of touchpoints) if (!map.has(t.staff_id)) map.set(t.staff_id, t.met_on);
    return map;
  }, [touchpoints]);

  const openIssueCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of openIssues) map.set(i.staff_id, (map.get(i.staff_id) ?? 0) + 1);
    return map;
  }, [openIssues]);

  const activeChecklist = useMemo(() => {
    const map = new Map<string, Checklist>();
    for (const c of checklists) map.set(c.staff_id, c);
    return map;
  }, [checklists]);

  const overdueReviews = reviews.filter((r) => r.status === 'scheduled' && (daysSince(r.due_date) ?? 0) > 0);
  const overdueTouchpoints = staff.filter((s) => {
    const d = daysSince(lastMet.get(s.id) ?? null);
    return d !== null && d >= 60;
  });

  function openStaff(id: string) {
    setSelectedId(id);
    setPanelOpen(true);
  }

  if (loading) return <p className="p-8 text-sm text-sparrow-gray">Loading Operations…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <RoomTour steps={OPS_TOUR_STEPS} open={tourOpen} onDismiss={dismissTour} />
      <div>
        <h1 className="font-serif text-2xl font-semibold">Operations</h1>
        <p className="mt-1 text-sm text-sparrow-gray">Staff management · {staff.length} people</p>
      </div>

      {/* Tabs */}
      <div className="mt-6 inline-flex rounded-xl border border-sparrow-rule bg-white p-1 text-sm">
        {(['staff', 'inventory', 'calendar', 'grants'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setOpsTab(t)}
            className={`rounded-lg px-3 py-1.5 font-medium capitalize transition ${
              opsTab === t ? 'bg-sparrow-green text-white' : 'text-sparrow-gray hover:text-sparrow-ink'
            }`}
          >
            {t === 'staff' ? 'Staff' : t === 'inventory' ? 'Inventory' : t === 'calendar' ? 'Calendar' : 'Grants'}
          </button>
        ))}
      </div>

      {opsTab === 'inventory' ? (
        <div className="mt-6">
          <InventoryRoom />
        </div>
      ) : opsTab === 'calendar' ? (
        <div className="mt-6" style={{ height: '70vh' }}>
          <DeptCalendar department="ops" />
        </div>
      ) : opsTab === 'grants' ? (
        <div className="mt-6">
          <GrantsRoom />
        </div>
      ) : null}

      {opsTab === 'staff' && (overdueReviews.length > 0 || overdueTouchpoints.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-3 rounded-xl border border-sparrow-gold/40 bg-sparrow-cream px-4 py-3 text-sm">
          {overdueReviews.length > 0 && <span>📋 {overdueReviews.length} review{overdueReviews.length > 1 ? 's' : ''} overdue</span>}
          {overdueTouchpoints.length > 0 && (
            <span>🤝 {overdueTouchpoints.length} {overdueTouchpoints.length > 1 ? 'people' : 'person'} need a touch-base</span>
          )}
        </div>
      )}

      {opsTab === 'staff' && (
        <>
          <ul className="mt-6 space-y-2">
            {staff.map((s) => {
              const tone = touchpointTone(daysSince(lastMet.get(s.id) ?? null));
              const issues = openIssueCount.get(s.id) ?? 0;
              const ck = activeChecklist.get(s.id);
              return (
                <li key={s.id}>
                  <button
                    onClick={() => openStaff(s.id)}
                    className="flex w-full items-center gap-4 rounded-2xl border border-sparrow-rule bg-white p-4 text-left shadow-card transition hover:border-sparrow-green/40"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-sparrow-ink">{s.full_name}</span>
                      <p className="text-xs capitalize text-sparrow-gray">
                        {s.role} · {s.department}
                      </p>
                    </div>
                    {ck && (
                      <span className="rounded-full bg-sparrow-green/10 px-2 py-0.5 text-[10px] font-medium capitalize text-sparrow-green">
                        {ck.kind}
                      </span>
                    )}
                    {issues > 0 && (
                      <span className="rounded-full bg-priority-p1/15 px-2 py-0.5 text-[10px] font-medium text-priority-p1">
                        {issues} issue{issues > 1 ? 's' : ''}
                      </span>
                    )}
                    {tone.label && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.chip}`} title="Last check-in">
                        {tone.label}
                      </span>
                    )}
                    <span className="shrink-0 text-sparrow-gray">›</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <StaffMemberPanel
            open={panelOpen}
            staff={selectedId ? staff.find((s) => s.id === selectedId) ?? null : null}
            currentUserId={profile?.id ?? ''}
            onClose={() => setPanelOpen(false)}
            onChanged={load}
          />
        </>
      )}
    </div>
  );
}

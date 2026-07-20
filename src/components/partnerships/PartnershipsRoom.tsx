import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { localDate } from '@/lib/date';
import { fetchProfiles } from '@/lib/data';
import type { Profile } from '@/lib/types';
import { fetchArchivedPartners, fetchDonorStats, fetchPartners, syncDueTouchpointTasks, syncLapsedDonorTiers, syncLapsedPartnerTasks } from '@/lib/partnerships';
import {
  stewardshipStatus,
  type DonorStat,
  type Partner,
  type PartnerType,
} from '@/lib/partnerships-types';
import { PartnerDetailPanel } from './PartnerDetailPanel';
import { AddPartnerPanel } from './AddPartnerPanel';
import { PartnershipsHelpModal } from './PartnershipsHelpModal';
import { RoomTour, useRoomTour, type TourStep } from '@/components/RoomTour';
import { PartnerTableView } from './PartnerTableView';
import { PartnerTileView } from './PartnerTileView';
import { PartnershipsHomeTab } from './PartnershipsHomeTab';
import type { HomeNavTarget } from '@/lib/partnerships-home';

// Stub imports for tabs built in the parallel terminal
import { PartnershipCommsTab } from './PartnershipCommsTab';
import { PartnershipCollateralTab } from './PartnershipCollateralTab';
import { PartnershipSocialTab } from './PartnershipSocialTab';
import { PartnershipEventsTab } from './PartnershipEventsTab';
import { PrayerMeetingTab } from './PrayerMeetingTab';
import { fetchComms } from '@/lib/partnerships-tabs';
import { DeptCalendar } from '@/components/calendar/DeptCalendar';

const PARTNERSHIPS_TOUR_STEPS: TourStep[] = [
  {
    icon: '🤝',
    title: 'Partnerships',
    body: "This room is where Sparrow manages its donor and partner relationships. The goal isn't just data — it's staying genuinely connected to the people who support this work.",
    tag: null,
  },
  {
    icon: '📋',
    title: 'Directory',
    body: "Every donor, church, community partner, volunteer, and foundation lives in the Directory. The list sorts by relationship health — overdue contacts rise to the top so nothing slips through. Switch between table and tile views.",
    tag: { icon: '📋', label: 'Directory' },
  },
  {
    icon: '👤',
    title: 'Contact detail panel',
    body: "Click any contact to open their panel: giving history, stewardship cadence, when you last connected, notes, and linked collateral. This is where relationship work actually happens.",
    tag: { icon: '👤', label: 'Contact Detail' },
  },
  {
    icon: '💬',
    title: 'Comms & stewardship',
    body: "The Comms tab tracks every touchpoint — calls, emails, meetings, notes. The system flags when someone is overdue for contact based on their cadence, so you always know who needs attention.",
    tag: { icon: '💬', label: 'Comms' },
  },
  {
    icon: '📊',
    title: 'Other tabs',
    body: "Collateral tracks what materials have been sent to whom. Social keeps social media plans organized. Events ties partners to specific Sparrow gatherings. Prayer keeps your prayer list current.",
    tag: null,
  },
  {
    icon: '✨',
    title: "You're all set",
    body: "Start in the Directory. If someone is flagged overdue, open their panel and log a touchpoint. Small, consistent contact is what this room is built to support.",
    tag: null,
  },
];

type Tab = 'home' | 'directory' | 'comms' | 'collateral' | 'social' | 'events' | 'prayer' | 'calendar';
type View = 'table' | 'tile';
type Filter = 'all' | 'archived' | PartnerType;

const TABS: { key: Tab; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'directory', label: 'Directory' },
  { key: 'comms', label: 'Comms' },
  { key: 'collateral', label: 'Collateral' },
  { key: 'social', label: 'Social' },
  { key: 'events', label: 'Events' },
  { key: 'prayer', label: 'Prayer' },
  { key: 'calendar', label: 'Calendar' },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'donor', label: 'Donors' },
  { key: 'church', label: 'Churches' },
  { key: 'community', label: 'Community' },
  { key: 'volunteer', label: 'Volunteers' },
  { key: 'prayer', label: 'Prayer' },
  { key: 'fst', label: 'FST' },
  { key: 'foundation', label: 'Foundations' },
  { key: 'advisory', label: 'Advisory' },
];

// Order the directory by how badly each relationship needs attention.
const STATUS_RANK = { overdue: 0, lapsed: 1, due_soon: 2, no_cadence: 3, on_cadence: 4, inactive: 5 } as const;

export function PartnershipsRoom() {
  const { tourOpen, dismissTour } = useRoomTour('sparrow_partnerships_toured_v1');
  const { profile } = useAuth();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [archivedPartners, setArchivedPartners] = useState<Partner[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>(
    () => {
      const stored = localStorage.getItem('partnerships_view');
      return (stored === 'table' || stored === 'tile') ? stored : 'table';
    },
  );

  const [nextCommLabel, setNextCommLabel] = useState<string | undefined>(undefined);
  const [donorStatMap, setDonorStatMap] = useState<Map<string, DonorStat>>(new Map());
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Deep-link: open a partner panel on load via ?partner=<id>
  const deepId = useMemo(() => new URLSearchParams(window.location.search).get('partner'), []);
  const deepLinked = useRef(false);

  const load = useCallback(async () => {
    try {
      const year = new Date().getFullYear();
      const [pp, pr, archived, comms, stats] = await Promise.all([
        fetchPartners(),
        fetchProfiles(),
        fetchArchivedPartners(),
        fetchComms(year),
        fetchDonorStats(),
      ]);
      setPartners(pp);
      setProfiles(pr);
      setArchivedPartners(archived);
      setDonorStatMap(new Map(stats.map((s) => [s.partner_id, s])));
      // Find the next upcoming comm that hasn't been sent — shown for donors/prayer in place of "No cadence"
      const today = localDate();
      const next = comms
        .filter((c) => c.status !== 'sent' && c.publish_date >= today)
        .sort((a, b) => a.publish_date.localeCompare(b.publish_date))[0];
      if (next) {
        const d = new Date(`${next.publish_date}T12:00:00`);
        setNextCommLabel(`${next.title} — ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`);
      }
      // Best-effort background syncs — overdue tasks, lapsed stages, lapsed donor tiers.
      void syncDueTouchpointTasks().catch(() => undefined);
      void syncLapsedPartnerTasks().catch(() => undefined);
      void syncLapsedDonorTiers(pp, stats).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load partnerships.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep link: after partners load, auto-open the panel once
  useEffect(() => {
    if (deepLinked.current || !deepId || partners.length === 0) return;
    deepLinked.current = true;
    openPartner(deepId);
  }, [partners, deepId]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let noCadence = 0;
    let lapsed = 0;
    for (const p of partners) {
      const s = stewardshipStatus(p);
      if (s === 'overdue') overdue++;
      else if (s === 'due_soon') dueSoon++;
      else if (s === 'no_cadence') noCadence++;
      else if (s === 'lapsed') lapsed++;
    }
    return { total: partners.length, overdue, dueSoon, noCadence, lapsed };
  }, [partners]);

  const visible = useMemo(() => {
    if (filter === 'archived') {
      const list = search.trim()
        ? archivedPartners.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
        : archivedPartners;
      return [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    let list = filter === 'all' ? partners : partners.filter((p) => p.type === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const ra = STATUS_RANK[stewardshipStatus(a)];
      const rb = STATUS_RANK[stewardshipStatus(b)];
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  }, [partners, archivedPartners, filter, search]);

  function openPartner(id: string) {
    setPartnerId(id);
    setDetailOpen(true);
  }

  function setViewAndPersist(v: View) {
    setView(v);
    localStorage.setItem('partnerships_view', v);
  }

  const firstOverdue = useMemo(
    () => visible.find((p) => stewardshipStatus(p) === 'overdue'),
    [visible],
  );

  if (loading) return <p className="p-8 text-sm text-sparrow-gray">Loading partnerships…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  const selected = partnerId
    ? (partners.find((p) => p.id === partnerId) ?? archivedPartners.find((p) => p.id === partnerId) ?? null)
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <RoomTour steps={PARTNERSHIPS_TOUR_STEPS} open={tourOpen} onDismiss={dismissTour} />
      {/* Room header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Partnerships</h1>
          <p className="mt-1 text-sm text-sparrow-gray">
            {stats.total} relationships · {stats.overdue} overdue · {stats.dueSoon} due soon
            {stats.noCadence > 0 && ` · ${stats.noCadence} without a cadence`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setHelpOpen(true)}
            title="How this room works"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-sparrow-rule text-sm font-medium text-sparrow-gray transition hover:border-sparrow-green hover:text-sparrow-green"
          >
            ?
          </button>
          <button onClick={() => setAddOpen(true)} className="btn-primary">
            + Add partner
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="mt-6 flex border-b border-sparrow-rule">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === t.key
                ? '-mb-px border-b-2 border-sparrow-green text-sparrow-green'
                : 'text-sparrow-gray hover:text-sparrow-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab !== 'directory' && (
        <div className="mt-6">
          {activeTab === 'home' && (
            <PartnershipsHomeTab
              profiles={profiles}
              onOpenPartner={openPartner}
              onNavigateTab={(t: HomeNavTarget) => setActiveTab(t)}
            />
          )}
          {activeTab === 'comms' && <PartnershipCommsTab profiles={profiles} />}
          {activeTab === 'collateral' && <PartnershipCollateralTab profiles={profiles} />}
          {activeTab === 'social' && <PartnershipSocialTab profiles={profiles} />}
          {activeTab === 'events' && <PartnershipEventsTab />}
          {activeTab === 'prayer' && <PrayerMeetingTab />}
          {activeTab === 'calendar' && (
            <div style={{ height: '70vh' }}>
              <DeptCalendar department="partnerships" />
            </div>
          )}
        </div>
      )}

      {activeTab === 'directory' && (
        <>
          {/* Alert banners */}
          {stats.overdue > 0 && firstOverdue && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-priority-p1/30 bg-priority-p1/5 px-4 py-3 text-sm">
              <span>
                🔴 {stats.overdue} relationship{stats.overdue > 1 ? 's are' : ' is'} overdue for a touchpoint.
                They've been added to each owner's Incoming Tasks.
              </span>
              <button onClick={() => openPartner(firstOverdue.id)} className="shrink-0 font-medium text-sparrow-green">
                Open {firstOverdue.name} →
              </button>
            </div>
          )}

          {stats.noCadence > 0 && (
            <p className="mt-2 rounded-xl border border-slate-300/60 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              {stats.noCadence} relationship{stats.noCadence > 1 ? 's have' : ' has'} no stewardship cadence set — a
              record without a rhythm isn't stewarded. Open it to set one.
            </p>
          )}

          {/* Search bar */}
          <div className="relative mt-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="field-input pr-8"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-lg leading-none text-sparrow-gray hover:text-sparrow-ink"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {/* Type filters + view toggle */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5 text-sm">
              {FILTERS.map((f) => {
                const count = f.key === 'all' ? partners.length : partners.filter((p) => p.type === f.key).length;
                if (count === 0 && f.key !== 'all') return null;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-lg border px-3 py-1.5 font-medium transition ${
                      filter === f.key
                        ? 'border-sparrow-green bg-sparrow-green text-white'
                        : 'border-sparrow-rule bg-white text-sparrow-gray hover:text-sparrow-ink'
                    }`}
                  >
                    {f.label} <span className="opacity-70">{count}</span>
                  </button>
                );
              })}
              {archivedPartners.length > 0 && (
                <button
                  onClick={() => setFilter(filter === 'archived' ? 'all' : 'archived')}
                  className={`rounded-lg border px-3 py-1.5 font-medium transition ${
                    filter === 'archived'
                      ? 'border-sparrow-gray bg-sparrow-gray text-white'
                      : 'border-sparrow-rule bg-white text-sparrow-gray hover:text-sparrow-ink'
                  }`}
                >
                  Archived <span className="opacity-70">{archivedPartners.length}</span>
                </button>
              )}
            </div>

            {/* View toggle */}
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-sparrow-rule bg-white p-0.5">
              {(['table', 'tile'] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setViewAndPersist(v)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition ${
                    view === v
                      ? 'bg-sparrow-green text-white'
                      : 'text-sparrow-gray hover:text-sparrow-ink'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Partner directory */}
          <div className="mt-5">
            {view === 'table' && (
              <PartnerTableView
                partners={visible}
                profiles={profiles}
                onOpenPartner={openPartner}
                onChanged={load}
                nextCommLabel={nextCommLabel}
                isDonorView={filter === 'donor'}
                donorStatMap={donorStatMap}
              />
            )}
            {view === 'tile' && (
              <PartnerTileView
                partners={visible}
                profiles={profiles}
                onOpenPartner={openPartner}
                nextCommLabel={nextCommLabel}
                donorStatMap={donorStatMap}
              />
            )}
          </div>
        </>
      )}

      <PartnerDetailPanel
        open={detailOpen}
        partner={selected}
        partners={[...partners, ...archivedPartners]}
        profiles={profiles}
        currentUserId={profile?.id ?? ''}
        onClose={() => setDetailOpen(false)}
        onChanged={load}
        donorStat={selected ? (donorStatMap.get(selected.id) ?? null) : null}
      />
      <AddPartnerPanel
        open={addOpen}
        profiles={profiles}
        defaultOwnerId={profile?.id ?? null}
        onClose={() => setAddOpen(false)}
        onCreated={load}
      />
      <PartnershipsHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}


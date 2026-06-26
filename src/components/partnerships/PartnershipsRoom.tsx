import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchProfiles } from '@/lib/data';
import type { Profile } from '@/lib/types';
import { fetchPartners, syncDueTouchpointTasks, syncLapsedPartnerTasks } from '@/lib/partnerships';
import {
  stewardshipStatus,
  type Partner,
  type PartnerType,
} from '@/lib/partnerships-types';
import { PartnerDetailPanel } from './PartnerDetailPanel';
import { AddPartnerPanel } from './AddPartnerPanel';
import { PartnerTableView } from './PartnerTableView';
import { PartnerTileView } from './PartnerTileView';

// Stub imports for tabs built in the parallel terminal
import { PartnershipCommsTab } from './PartnershipCommsTab';
import { PartnershipCollateralTab } from './PartnershipCollateralTab';
import { PartnershipSocialTab } from './PartnershipSocialTab';
import { PartnershipEventsTab } from './PartnershipEventsTab';

type Tab = 'directory' | 'comms' | 'collateral' | 'social' | 'events';
type View = 'table' | 'tile';
type Filter = 'all' | PartnerType;

const TABS: { key: Tab; label: string }[] = [
  { key: 'directory', label: 'Directory' },
  { key: 'comms', label: 'Comms' },
  { key: 'collateral', label: 'Collateral' },
  { key: 'social', label: 'Social' },
  { key: 'events', label: 'Events' },
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
  const { profile } = useAuth();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('directory');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>(
    () => {
      const stored = localStorage.getItem('partnerships_view');
      return (stored === 'table' || stored === 'tile') ? stored : 'table';
    },
  );

  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Deep-link: open a partner panel on load via ?partner=<id>
  const deepId = useMemo(() => new URLSearchParams(window.location.search).get('partner'), []);
  const deepLinked = useRef(false);

  const load = useCallback(async () => {
    try {
      const [pp, pr] = await Promise.all([fetchPartners(), fetchProfiles()]);
      setPartners(pp);
      setProfiles(pr);
      // Best-effort: fan overdue touchpoints + lapsed partners to owners' triage inboxes.
      void syncDueTouchpointTasks().catch(() => undefined);
      void syncLapsedPartnerTasks().catch(() => undefined);
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
  }, [partners, filter, search]);

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

  const selected = partnerId ? partners.find((p) => p.id === partnerId) ?? null : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Room header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Partnerships</h1>
          <p className="mt-1 text-sm text-sparrow-gray">
            {stats.total} relationships · {stats.overdue} overdue · {stats.dueSoon} due soon
            {stats.noCadence > 0 && ` · ${stats.noCadence} without a cadence`}
          </p>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn-primary shrink-0">
          + Add partner
        </button>
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
          {activeTab === 'comms' && <PartnershipCommsTab />}
          {activeTab === 'collateral' && <PartnershipCollateralTab />}
          {activeTab === 'social' && <PartnershipSocialTab />}
          {activeTab === 'events' && <PartnershipEventsTab />}
        </div>
      )}

      {activeTab === 'directory' && (
        <>
          {/* Alert banners */}
          {stats.overdue > 0 && firstOverdue && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-priority-p1/30 bg-priority-p1/5 px-4 py-3 text-sm">
              <span>
                🔴 {stats.overdue} relationship{stats.overdue > 1 ? 's are' : ' is'} overdue for a touchpoint.
                They've been pushed to each owner's triage inbox.
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
              />
            )}
            {view === 'tile' && (
              <PartnerTileView
                partners={visible}
                profiles={profiles}
                onOpenPartner={openPartner}
              />
            )}
          </div>
        </>
      )}

      <PartnerDetailPanel
        open={detailOpen}
        partner={selected}
        profiles={profiles}
        currentUserId={profile?.id ?? ''}
        onClose={() => setDetailOpen(false)}
        onChanged={load}
      />
      <AddPartnerPanel
        open={addOpen}
        profiles={profiles}
        defaultOwnerId={profile?.id ?? null}
        onClose={() => setAddOpen(false)}
        onCreated={load}
      />
    </div>
  );
}


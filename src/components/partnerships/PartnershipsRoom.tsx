import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { RoomSopsButton } from '@/components/documents/RoomSops';
import { fetchProfiles } from '@/lib/data';
import type { Profile } from '@/lib/types';
import { fetchArchivedPartners, fetchDonorStats, fetchPartners, syncDueTouchpointTasks, syncLapsedDonorTiers } from '@/lib/partnerships';
import {
  displayPartnerName,
  partnerMatchesType,
  stewardshipStatus,
  type DonorStat,
  type Partner,
  type PartnerType,
} from '@/lib/partnerships-types';
import { fetchInterests, fetchPartnerInterestMap, type PartnershipInterest } from '@/lib/partnership-interests';
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
import { markConnectionMoved } from '@/lib/partnerships-tabs';
import { PrayerMeetingTab } from './PrayerMeetingTab';
import { PartnershipContactsTab } from './PartnershipContactsTab';
import { CommsProductionCalendar } from './CommsProductionCalendar';

const PARTNERSHIPS_TOUR_STEPS: TourStep[] = [
  {
    icon: '🤝',
    title: 'Partnerships',
    body: "This room is where Sparrow manages its donor, community partner, and volunteer relationships. The goal isn't just data — it's staying genuinely connected to the people who support this work.",
    tag: null,
  },
  {
    icon: '📋',
    title: 'Directory',
    body: "Every Donor, Community Partner, and Volunteer lives in the Directory — one record per person or organization, even when they're more than one category. Switch between table and tile views, and filter any column.",
    tag: { icon: '📋', label: 'Directory' },
  },
  {
    icon: '👤',
    title: 'Record drawer',
    body: "Click any record to open its drawer: contacts, giving history, notes, and the touchpoints you've logged. Log a touchpoint for a personal, 1:1 contact — a call, a personal email, a visit.",
    tag: { icon: '👤', label: 'Record drawer' },
  },
  {
    icon: '💬',
    title: 'Stewardship',
    body: "Most relationships need nothing extra beyond TSM and the regular thank-yous. When one needs a specific, dated check-in (often a Community Partner's MOU), add it under Check-ins in the record. A record can have more than one. Each shows on Home when it's due; click Done and it asks when the next one is.",
    tag: null,
  },
  {
    icon: '📊',
    title: 'Other tabs',
    body: "Calendar and Comms plan the newsletters and other mass sends. Collateral tracks when printed materials are due for review. Social Media plans posts. Events holds events and the Meaningful Connections made at them. Prayer Team keeps the prayer roster and meeting attendance.",
    tag: null,
  },
  {
    icon: '✨',
    title: "You're all set",
    body: "Start on Home to see everything due across the room, then the Directory. A red dot means a check-in is overdue or someone unsubscribed from TSM — open the record to take a look.",
    tag: null,
  },
];

type Tab = 'home' | 'directory' | 'comms' | 'collateral' | 'social' | 'events' | 'prayer' | 'calendar' | 'contacts';
type View = 'table' | 'tile';
type Filter = 'all' | 'archived' | PartnerType;

const TABS: { key: Tab; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'directory', label: 'Directory' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'comms', label: 'Comms' },
  { key: 'collateral', label: 'Collateral' },
  { key: 'social', label: 'Social Media' },
  { key: 'events', label: 'Events' },
  { key: 'prayer', label: 'Prayer Team' },
  { key: 'contacts', label: 'All Staff Contacts' },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'donor', label: 'Donors' },
  { key: 'community', label: 'Community Partners' },
  { key: 'volunteer', label: 'Volunteers' },
];

// Order the directory by how badly each relationship needs attention.
const STATUS_RANK = { needs_attention: 0, ok: 1, inactive: 2 } as const;

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

  const [donorStatMap, setDonorStatMap] = useState<Map<string, DonorStat>>(new Map());
  const [interests, setInterests] = useState<PartnershipInterest[]>([]);
  const [interestMap, setInterestMap] = useState<Map<string, PartnershipInterest[]>>(new Map());
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Bumped after a connection moves to the Directory, so the Events tab reloads its list.
  const [eventsTabKey, setEventsTabKey] = useState(0);
  const [addPrefill, setAddPrefill] = useState<{
    name: string;
    organization: string | null;
    role: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    notes: string | null;
    connectionId?: string;
    ownerId?: string | null;
  } | null>(null);
  // Memoized: AddPartnerPanel resets its form whenever this reference changes, so a fresh
  // literal on every render would wipe in-progress edits (incl. the org/person choice).
  const addInitialValues = useMemo(
    () => addPrefill
      ? {
          name: addPrefill.name,
          phone: addPrefill.phone ?? '',
          email: addPrefill.email ?? '',
          notes: addPrefill.notes,
          organization: addPrefill.organization,
          role: addPrefill.role,
          website: addPrefill.website,
          originLabel: 'meaningful connection',
        }
      : undefined,
    [addPrefill],
  );
  const [helpOpen, setHelpOpen] = useState(false);

  // Deep-link: open a partner panel on load via ?partner=<id>
  const deepId = useMemo(() => new URLSearchParams(window.location.search).get('partner'), []);
  const deepLinked = useRef(false);

  const load = useCallback(async () => {
    try {
      const [pp, pr, archived, stats, interestList, partnerInterests] = await Promise.all([
        fetchPartners(),
        fetchProfiles(),
        fetchArchivedPartners(),
        fetchDonorStats(),
        fetchInterests(),
        fetchPartnerInterestMap(),
      ]);
      setPartners(pp);
      setProfiles(pr);
      setArchivedPartners(archived);
      setDonorStatMap(new Map(stats.map((s) => [s.partner_id, s])));
      setInterests(interestList);
      setInterestMap(partnerInterests);
      // Best-effort background syncs — overdue named check-ins, "Stopped giving" donor tiers.
      void syncDueTouchpointTasks().catch(() => undefined);
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
    let needsAttention = 0;
    for (const p of partners) {
      if (stewardshipStatus(p) === 'needs_attention') needsAttention++;
    }
    return { total: partners.length, overdue: needsAttention };
  }, [partners]);

  // Search matches a partner's name OR any of their assigned Interest labels — so typing
  // "kids" surfaces everyone tagged with a "Kids" interest even if their name doesn't
  // contain "kids" (Andrew's targeted-outreach use case, e.g. a playground announcement).
  function matchesSearch(p: Partner, q: string): boolean {
    if (p.name.toLowerCase().includes(q)) return true;
    return (interestMap.get(p.id) ?? []).some((i) => i.label.toLowerCase().includes(q));
  }

  const visible = useMemo(() => {
    if (filter === 'archived') {
      const list = search.trim()
        ? archivedPartners.filter((p) => matchesSearch(p, search.trim().toLowerCase()))
        : archivedPartners;
      return [...list].sort((a, b) => displayPartnerName(a).localeCompare(displayPartnerName(b)));
    }
    let list = filter === 'all' ? partners : partners.filter((p) => partnerMatchesType(p, filter));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => matchesSearch(p, q));
    }
    return [...list].sort((a, b) => {
      const ra = STATUS_RANK[stewardshipStatus(a)];
      const rb = STATUS_RANK[stewardshipStatus(b)];
      if (ra !== rb) return ra - rb;
      return displayPartnerName(a).localeCompare(displayPartnerName(b));
    });
  }, [partners, archivedPartners, filter, search, interestMap]);

  // "Copy emails" — copies every email in whatever the Directory is showing right now
  // (filter tab + search), comma-separated so it pastes straight into BCC. Names anyone
  // without an email so whoever's sending knows who'll be missed.
  const [copyResult, setCopyResult] = useState<
    { copied: number; missing: string[]; failedText?: string } | null
  >(null);
  useEffect(() => setCopyResult(null), [filter, search]);

  async function copyVisibleEmails() {
    const seen = new Set<string>();
    const emails: string[] = [];
    const missing: string[] = [];
    for (const p of visible) {
      const email = p.email?.trim();
      if (!email) { missing.push(p.name); continue; }
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      emails.push(email);
    }
    if (emails.length === 0) { setCopyResult({ copied: 0, missing }); return; }
    const text = emails.join(', ');
    try {
      await navigator.clipboard.writeText(text);
      setCopyResult({ copied: emails.length, missing });
    } catch {
      // Clipboard blocked (older browser / permissions) — show the list to copy by hand.
      setCopyResult({ copied: emails.length, missing, failedText: text });
    }
  }

  function openPartner(id: string) {
    setPartnerId(id);
    setDetailOpen(true);
  }

  function setViewAndPersist(v: View) {
    setView(v);
    localStorage.setItem('partnerships_view', v);
  }

  const firstOverdue = useMemo(
    () => visible.find((p) => stewardshipStatus(p) === 'needs_attention'),
    [visible],
  );

  if (loading) return <p className="p-8 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading partnerships…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  const selected = partnerId
    ? (partners.find((p) => p.id === partnerId) ?? archivedPartners.find((p) => p.id === partnerId) ?? null)
    : null;

  return (
    <div className={`mx-auto px-4 py-8 sm:px-6 ${['directory', 'contacts', 'events', 'collateral', 'social'].includes(activeTab) ? 'max-w-[1800px]' : 'max-w-4xl'}`}>
      <RoomTour steps={PARTNERSHIPS_TOUR_STEPS} open={tourOpen} onDismiss={dismissTour} />
      {/* Room header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Partnerships</h1>
          <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            {stats.total} relationships · {stats.overdue} need attention
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setHelpOpen(true)}
            title="How this room works"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-sparrow-rule dark:border-sparrow-dark-border text-sm font-medium text-sparrow-gray dark:text-sparrow-dark-gray transition hover:border-sparrow-green dark:hover:border-sparrow-dark-green hover:text-sparrow-green dark:hover:text-sparrow-dark-green"
          >
            ?
          </button>
          <RoomSopsButton room="partnerships" />
          <button onClick={() => setAddOpen(true)} className="btn-primary">
            + Add partner
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="mt-6 flex border-b border-sparrow-rule dark:border-sparrow-dark-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === t.key
                ? '-mb-px border-b-2 border-sparrow-green dark:border-sparrow-dark-green text-sparrow-green dark:text-sparrow-dark-green'
                : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
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
          {activeTab === 'events' && (
            <PartnershipEventsTab
              key={eventsTabKey}
              onBecomePartner={(conn) => {
                const notesParts = [conn.what_discussed, conn.next_action ? `Next action: ${conn.next_action}` : null].filter(Boolean);
                setAddPrefill({
                  name: conn.name,
                  organization: conn.organization,
                  role: conn.role,
                  phone: conn.phone,
                  email: conn.email,
                  website: conn.website,
                  notes: notesParts.length ? notesParts.join('\n\n') : null,
                  connectionId: conn.id,
                  ownerId: conn.owner_id,
                });
                setAddOpen(true);
              }}
            />
          )}
          {activeTab === 'prayer' && <PrayerMeetingTab />}
          {activeTab === 'contacts' && <PartnershipContactsTab profiles={profiles} />}
          {activeTab === 'calendar' && (
            <div>
              <CommsProductionCalendar profiles={profiles} />
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
                🔴 {stats.overdue} record{stats.overdue > 1 ? 's need' : ' needs'} attention: an overdue
                check-in, or a TSM unsubscribe to look at.
              </span>
              <button onClick={() => openPartner(firstOverdue.id)} className="shrink-0 font-medium text-sparrow-green dark:text-sparrow-dark-green">
                Open {firstOverdue.name} →
              </button>
            </div>
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-lg leading-none text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
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
                const count = f.key === 'all' ? partners.length : partners.filter((p) => partnerMatchesType(p, f.key as PartnerType)).length;
                if (count === 0 && f.key !== 'all') return null;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-lg border px-3 py-1.5 font-medium transition ${
                      filter === f.key
                        ? 'border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green text-white'
                        : 'border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
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
                      ? 'border-sparrow-gray dark:border-sparrow-dark-border bg-sparrow-gray dark:bg-sparrow-dark-border text-white'
                      : 'border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
                  }`}
                >
                  Archived <span className="opacity-70">{archivedPartners.length}</span>
                </button>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => void copyVisibleEmails()}
              disabled={visible.length === 0}
              title="Copy the email address of every partner shown below, ready to paste into BCC"
              className="rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-3 py-1.5 text-xs font-medium text-sparrow-ink dark:text-sparrow-dark-ink transition hover:border-sparrow-green dark:hover:border-sparrow-dark-green disabled:opacity-50"
            >
              Copy emails
            </button>
            {/* View toggle */}
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-0.5">
              {(['table', 'tile'] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setViewAndPersist(v)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition ${
                    view === v
                      ? 'bg-sparrow-green text-white'
                      : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            </div>
          </div>

          {copyResult && (
            <div className="mt-3 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-4 py-2.5 text-xs text-sparrow-ink dark:text-sparrow-dark-ink">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  {copyResult.copied === 0 ? (
                    <p>No one shown here has an email on file — nothing copied.</p>
                  ) : copyResult.failedText ? (
                    <p>Your browser blocked copying — select the {copyResult.copied} email{copyResult.copied === 1 ? '' : 's'} below and copy them by hand.</p>
                  ) : (
                    <p>
                      <span className="font-medium text-sparrow-green dark:text-sparrow-dark-green">
                        Copied {copyResult.copied} email{copyResult.copied === 1 ? '' : 's'}.
                      </span>{' '}
                      Paste into the BCC line of your email.
                    </p>
                  )}
                  {copyResult.missing.length > 0 && (
                    <p className="text-sparrow-gray dark:text-sparrow-dark-gray">
                      {copyResult.missing.length} partner{copyResult.missing.length === 1 ? ' has' : 's have'} no email on file: {copyResult.missing.join(', ')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setCopyResult(null)}
                  className="text-lg leading-none text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
              {copyResult.failedText && (
                <textarea
                  readOnly
                  value={copyResult.failedText}
                  onFocus={(e) => e.currentTarget.select()}
                  rows={3}
                  className="field-input mt-2 text-xs"
                />
              )}
            </div>
          )}

          {/* Partner directory */}
          <div className="mt-5">
            {view === 'table' && (
              <PartnerTableView
                partners={visible}
                profiles={profiles}
                onOpenPartner={openPartner}
                onChanged={load}
                donorStatMap={donorStatMap}
                interestMap={interestMap}
              />
            )}
            {view === 'tile' && (
              <PartnerTileView
                partners={visible}
                profiles={profiles}
                onOpenPartner={openPartner}
                donorStatMap={donorStatMap}
                interestMap={interestMap}
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
        interests={interests}
        selectedInterestIds={selected ? (interestMap.get(selected.id) ?? []).map((i) => i.id) : []}
        onInterestsCreated={load}
      />
      <AddPartnerPanel
        open={addOpen}
        profiles={profiles}
        // From a connection: keep whoever logged it as owner (e.g. Resident Services staff), not whoever clicks.
        defaultOwnerId={addPrefill?.connectionId ? (addPrefill.ownerId ?? profile?.id ?? null) : (profile?.id ?? null)}
        onClose={() => { setAddOpen(false); setAddPrefill(null); }}
        onCreated={async (id) => {
          // Moving a connection into the Directory archives it, with a pointer to the new record.
          if (addPrefill?.connectionId && profile) {
            await markConnectionMoved(addPrefill.connectionId, id, profile.id);
            setEventsTabKey((k) => k + 1);
          }
          await load();
          openPartner(id);
        }}
        interests={interests}
        onInterestsCreated={load}
        initialValues={addInitialValues}
      />
      <PartnershipsHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}


import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchProfiles } from '@/lib/data';
import type { Profile } from '@/lib/types';
import { assignAvatarColors } from '@/lib/avatarColors';
import { createGrant, fetchGrants } from '@/lib/grants';
import { certificationTone, daysSince, formatDate, formatMoney, notificationCategoryLabel, type Grant } from '@/lib/grants-types';
import { EMPTY_EXTRAS, fetchGrantTableExtras, fetchProspectTableExtras, type GrantRowExtras } from '@/lib/grants-table-extras';
import { createProspect, fetchProspectLabels, fetchProspects } from '@/lib/grant-prospects';
import {
  PROSPECT_ACTIVE_STATUSES,
  prospectAwardRange,
  prospectNotes,
  prospectStatusChip,
  prospectStatusLabel,
  type GrantProspect,
  type GrantProspectLabel,
} from '@/lib/grant-prospects-types';
import { LabelPill } from '@/components/LabelPill';
import { useColumnLayout, useHeaderInteractions, GridTableShell, type GridColumn } from '@/components/gridtable/GridTable';
import { GrantPanel } from './GrantPanel';
import { GrantProspectPanel } from './GrantProspectPanel';
import { GrantsHelpModal } from './GrantsHelpModal';
import { stripHtml } from '@/components/lcp/RichText';

/** Notes can hold formatting now — the table shows them as one plain line. */
const plainNotes = (text: string | null) => (text ? stripHtml(text) : '');

const DEFAULT_LEAD_TIME_DAYS = 30;

type ModuleTab = 'active' | 'prospects' | 'no' | 'past';
const MODULE_TABS: { key: ModuleTab; label: string; desc: string }[] = [
  { key: 'active', label: 'Active Grants', desc: 'Grants Sparrow currently holds. Dot = certification health (green ok, amber due soon, red overdue).' },
  { key: 'prospects', label: 'Being Pursued', desc: 'Still in motion. Status column shows where each one stands — not researched, researching, decided to pursue, or applied.' },
  { key: 'no', label: 'Not Moving Forward', desc: 'Ended without funding, whether Sparrow passed or applied and was declined. No due dates here — the record of why matters more.' },
  { key: 'past', label: 'Past Grants', desc: 'Wrapped up. Every field, link, and document from when it was active stays intact.' },
];

/** Dot color for a certification-due tone — same day math as certificationTone(), just a
 * plain dot instead of a text chip, so the leftmost column can be scanned by color alone. */
function certificationDotColor(dueDateIso: string | null): string {
  const d = daysSince(dueDateIso);
  if (d === null) return '#D8D8D8';
  if (d > 0) return '#DC2626'; // overdue
  if (d >= -60) return '#F0A500'; // due soon
  return '#2563EB'; // fine
}

export function GrantsRoom() {
  const { profile } = useAuth();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [prospects, setProspects] = useState<GrantProspect[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tierLabels, setTierLabels] = useState<GrantProspectLabel[]>([]);
  const [sourceLabels, setSourceLabels] = useState<GrantProspectLabel[]>([]);
  const [grantExtras, setGrantExtras] = useState<Map<string, GrantRowExtras>>(new Map());
  const [prospectExtras, setProspectExtras] = useState<Map<string, GrantRowExtras>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [moduleTab, setModuleTab] = useState<ModuleTab>('active');
  const [helpOpen, setHelpOpen] = useState(false);

  const [selectedGrantId, setSelectedGrantId] = useState<string | null>(null);
  const [grantPanelOpen, setGrantPanelOpen] = useState(false);
  const [showNewGrant, setShowNewGrant] = useState(false);
  const [newFunder, setNewFunder] = useState('');

  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [prospectPanelOpen, setProspectPanelOpen] = useState(false);
  const [showNewProspect, setShowNewProspect] = useState(false);
  const [newProspectName, setNewProspectName] = useState('');

  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, p, pr, tl, sl, ge, pe] = await Promise.all([
        fetchGrants(),
        fetchProspects(),
        fetchProfiles(),
        fetchProspectLabels('tier'),
        fetchProspectLabels('source'),
        // Only feed the optional Contacts/Links/Documents/Latest update columns — if one
        // of these fails, those columns show blank rather than the whole room erroring.
        fetchGrantTableExtras().catch(() => new Map<string, GrantRowExtras>()),
        fetchProspectTableExtras().catch(() => new Map<string, GrantRowExtras>()),
      ]);
      setGrantExtras(ge);
      setProspectExtras(pe);
      setGrants(g);
      setProspects(p);
      setProfiles(pr.filter((x) => x.ops_access));
      setTierLabels(tl);
      setSourceLabels(sl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load grants.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ownerColors = useMemo(() => assignAvatarColors(profiles), [profiles]);

  function openGrant(id: string) {
    setSelectedGrantId(id);
    setGrantPanelOpen(true);
  }

  function openProspect(id: string) {
    setSelectedProspectId(id);
    setProspectPanelOpen(true);
  }

  async function addGrant() {
    if (!newFunder.trim() || !profile?.id) return;
    setBusy(true);
    try {
      const grant = await createGrant(
        {
          funder_name: newFunder.trim(),
          amount: null,
          placed_in_service_date: null,
          affordability_period_end: null,
          certification_due_date: null,
          prior_consent_required: false,
          notes: null,
          owner_id: profile.id, // default to whoever creates it — reassignable via the Owner dropdown
          lead_time_days: DEFAULT_LEAD_TIME_DAYS,
        },
        profile.id,
      );
      setNewFunder('');
      setShowNewGrant(false);
      await load();
      openGrant(grant.id);
    } finally {
      setBusy(false);
    }
  }

  async function addProspect() {
    if (!newProspectName.trim() || !profile?.id) return;
    setBusy(true);
    try {
      const prospect = await createProspect(
        {
          name: newProspectName.trim(),
          tier_label_id: null,
          source_label_id: null,
          status: 'not_researched',
          application_opens: null,
          application_deadline: null,
          est_amount: null,
          findings: null,
          decision_reasoning: null,
          action_steps: null,
          owner_id: profile.id, // default to whoever creates it — reassignable via the Owner dropdown
          lead_time_days: DEFAULT_LEAD_TIME_DAYS,
        },
        profile.id,
      );
      setNewProspectName('');
      setShowNewProspect(false);
      await load();
      openProspect(prospect.id);
    } finally {
      setBusy(false);
    }
  }

  function handleAwarded(newGrantId: string) {
    setProspectPanelOpen(false);
    void load().then(() => {
      setModuleTab('active');
      openGrant(newGrantId);
    });
  }

  if (loading) return <p className="p-4 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading grants…</p>;
  if (error) return <p className="p-4 text-sm text-priority-p1">{error}</p>;

  const activeGrants = grants.filter((g) => g.status === 'active');
  const pastGrants = grants.filter((g) => g.status === 'past');
  const pursuedProspects = prospects.filter((p) => PROSPECT_ACTIVE_STATUSES.includes(p.status));
  const notMovingProspects = prospects.filter((p) => p.status === 'decided_no');

  const overdueCount = activeGrants.filter((g) => (certificationTone(g.certification_due_date).chip ?? '').includes('priority-p1')).length;
  const currentTab = MODULE_TABS.find((t) => t.key === moduleTab)!;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-1 text-xs">
          {MODULE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setModuleTab(t.key)}
              className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
                moduleTab === t.key ? 'bg-white dark:bg-sparrow-dark-surface text-sparrow-green dark:text-sparrow-dark-green shadow-sm' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
              }`}
            >
              {t.label}{' '}
              <span className="opacity-70">
                {t.key === 'active' ? activeGrants.length : t.key === 'prospects' ? pursuedProspects.length : t.key === 'no' ? notMovingProspects.length : pastGrants.length}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setHelpOpen(true)}
          title="How this module works"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sparrow-rule dark:border-sparrow-dark-border text-sm font-medium text-sparrow-gray dark:text-sparrow-dark-gray transition hover:border-sparrow-green dark:hover:border-sparrow-dark-green hover:text-sparrow-green dark:hover:text-sparrow-dark-green"
        >
          ?
        </button>
      </div>
      <p className="mt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{currentTab.desc}</p>

      {moduleTab === 'active' && overdueCount > 0 && (
        <div className="mt-3 rounded-xl border border-priority-p1/40 bg-priority-p1/10 px-4 py-2 text-sm text-priority-p1">
          📋 {overdueCount} annual certification{overdueCount > 1 ? 's' : ''} overdue
        </div>
      )}

      {moduleTab === 'active' && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{activeGrants.length} active grant{activeGrants.length === 1 ? '' : 's'}</p>
            <button onClick={() => setShowNewGrant((v) => !v)} className="btn-primary">
              + Add grant
            </button>
          </div>
          {showNewGrant && (
            <div className="mt-4 flex gap-2 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3 shadow-card">
              <input value={newFunder} onChange={(e) => setNewFunder(e.target.value)} placeholder="Funder name" className="field-input mt-0 flex-1" />
              <button onClick={addGrant} disabled={busy || !newFunder.trim()} className="btn-primary shrink-0">
                Create
              </button>
            </div>
          )}
          <ActiveGrantsTable grants={activeGrants} extras={grantExtras} profiles={profiles} ownerColors={ownerColors} onOpen={openGrant} />
        </>
      )}

      {moduleTab === 'past' && (
        <div className="mt-4">
          <PastGrantsTable grants={pastGrants} extras={grantExtras} profiles={profiles} ownerColors={ownerColors} onOpen={openGrant} />
        </div>
      )}

      {moduleTab === 'prospects' && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{pursuedProspects.length} prospect{pursuedProspects.length === 1 ? '' : 's'} still in motion</p>
            <button onClick={() => setShowNewProspect((v) => !v)} className="btn-primary">
              + Add prospect
            </button>
          </div>
          {showNewProspect && (
            <div className="mt-4 flex gap-2 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3 shadow-card">
              <input value={newProspectName} onChange={(e) => setNewProspectName(e.target.value)} placeholder="Funder / opportunity name" className="field-input mt-0 flex-1" />
              <button onClick={addProspect} disabled={busy || !newProspectName.trim()} className="btn-primary shrink-0">
                Create
              </button>
            </div>
          )}
          <ProspectsTable
            prospects={pursuedProspects}
            extras={prospectExtras}
            profiles={profiles}
            ownerColors={ownerColors}
            tierLabels={tierLabels}
            sourceLabels={sourceLabels}
            onOpen={openProspect}
          />
        </>
      )}

      {moduleTab === 'no' && (
        <div className="mt-4">
          <NotMovingTable
            prospects={notMovingProspects}
            extras={prospectExtras}
            profiles={profiles}
            ownerColors={ownerColors}
            tierLabels={tierLabels}
            sourceLabels={sourceLabels}
            onOpen={openProspect}
          />
        </div>
      )}

      <GrantPanel
        open={grantPanelOpen}
        grant={selectedGrantId ? grants.find((g) => g.id === selectedGrantId) ?? null : null}
        currentUserId={profile?.id ?? ''}
        profiles={profiles}
        onClose={() => setGrantPanelOpen(false)}
        onChanged={load}
      />
      <GrantProspectPanel
        open={prospectPanelOpen}
        prospect={selectedProspectId ? prospects.find((p) => p.id === selectedProspectId) ?? null : null}
        currentUserId={profile?.id ?? ''}
        profiles={profiles}
        onClose={() => setProspectPanelOpen(false)}
        onChanged={load}
        onAwarded={handleAwarded}
      />
      <GrantsHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

// ── Shared table bits ────────────────────────────────────────────────────────────────
// Every Grants tab uses the same spreadsheet engine as the Partnerships Directory:
// resize/drag-reorder/click-to-sort columns, plus a "Columns" menu to hide or bring back
// columns. There's a column for everything the detail panel holds. Layout is a per-browser
// view preference (localStorage) — hiding a column never touches the data. Extra columns
// start hidden so each tab opens looking the way it did.
type SortDir = 'asc' | 'desc';

const ROW_CLASS = 'cursor-pointer hover:bg-sparrow-mist/40 dark:hover:bg-sparrow-dark-surface2';
const MUTED = 'text-sparrow-gray dark:text-sparrow-dark-gray';

function useGrantGrid<K extends string, T>(
  columns: GridColumn<K>[],
  storagePrefix: string,
  defaultHidden: K[],
  initialSort: K,
  items: T[],
  compare: (a: T, b: T, key: K) => number,
) {
  const layout = useColumnLayout(columns, storagePrefix, defaultHidden);
  const [sortKey, setSortKey] = useState<K>(initialSort);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const { startResize, handleHeaderClick } = useHeaderInteractions(
    layout.colWidths, layout.setColWidths, sortKey, setSortKey, sortDir, setSortDir,
  );
  const dir = sortDir === 'asc' ? 1 : -1;
  const sorted = [...items].sort((a, b) => compare(a, b, sortKey) * dir);
  return { layout, sortKey, sortDir, startResize, onHeaderClick: handleHeaderClick, sorted };
}

/** Pull a subset of a column list (in the given order), optionally relabelling some. */
function pickColumns<K extends string>(all: GridColumn<K>[], keys: K[], labels: Partial<Record<K, string>> = {}): GridColumn<K>[] {
  return keys.map((k) => {
    const col = all.find((c) => c.key === k)!;
    return labels[k] ? { ...col, label: labels[k]! } : col;
  });
}

/** Every column key except the ones listed — for "everything else starts hidden". */
function allExcept<K extends string>(columns: GridColumn<K>[], shown: K[]): K[] {
  return columns.map((c) => c.key).filter((k) => !shown.includes(k));
}

function Dash() {
  return <span className="text-sparrow-rule dark:text-sparrow-dark-border">—</span>;
}

function TextCell({ value }: { value: string | null }) {
  if (!value) return <Dash />;
  return <span className={`truncate text-xs ${MUTED}`} title={value}>{value}</span>;
}

function DateCell({ iso }: { iso: string | null }) {
  if (!iso) return <Dash />;
  return <span className={`whitespace-nowrap ${MUTED}`}>{formatDate(iso)}</span>;
}

function CountCell({ n, noun }: { n: number; noun: string }) {
  if (!n) return <Dash />;
  return <span className={`whitespace-nowrap ${MUTED}`}>{n} {noun}{n === 1 ? '' : 's'}</span>;
}

function LatestUpdateCell({ update }: { update: GrantRowExtras['latestUpdate'] }) {
  if (!update) return <Dash />;
  const text = `${formatDate(update.created_at)} — ${update.body}`;
  return <span className={`truncate text-xs ${MUTED}`} title={text}>{text}</span>;
}

/** Nulls sort last when ascending. */
function cmpDate(a: string | null | undefined, b: string | null | undefined): number {
  return (daysSince(a ?? null) ?? 9999) - (daysSince(b ?? null) ?? 9999);
}

function OwnerCell({ owner, ownerColors }: { owner: Profile | undefined; ownerColors: Record<string, string> }) {
  return (
    <span className={`flex items-center gap-1.5 truncate whitespace-nowrap ${MUTED}`}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${owner ? (ownerColors[owner.id] ?? 'bg-sparrow-gray dark:bg-sparrow-dark-border') : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2'}`} />
      {owner ? owner.full_name : 'Unassigned'}
    </span>
  );
}

function LabelCell({ label }: { label: GrantProspectLabel | undefined }) {
  if (!label) return <Dash />;
  return <LabelPill label={label.name} color={label.color} />;
}

// ── Active + Past Grants ──────────────────────────────────────────────────────────────
type GrantColKey =
  | 'funder' | 'amount' | 'owner' | 'lead_time' | 'due' | 'last_certified'
  | 'placed_in_service' | 'affordability_end' | 'prior_consent' | 'notes'
  | 'contacts' | 'links' | 'documents' | 'last_notice' | 'latest_update' | 'updated';

const GRANT_COLUMNS: GridColumn<GrantColKey>[] = [
  { key: 'funder', label: 'Funder', defaultWidth: 260 },
  { key: 'amount', label: 'Amount', defaultWidth: 110 },
  { key: 'owner', label: 'Owner', defaultWidth: 160 },
  { key: 'due', label: 'Certification due', defaultWidth: 170 },
  { key: 'last_certified', label: 'Last certified', defaultWidth: 130 },
  { key: 'lead_time', label: 'Reminder lead time', defaultWidth: 150 },
  { key: 'placed_in_service', label: 'Placed in service', defaultWidth: 140 },
  { key: 'affordability_end', label: 'Affordability ends', defaultWidth: 150 },
  { key: 'prior_consent', label: 'Prior consent', defaultWidth: 120 },
  { key: 'notes', label: 'Notes', defaultWidth: 280 },
  { key: 'contacts', label: 'Contacts', defaultWidth: 200 },
  { key: 'links', label: 'Links', defaultWidth: 90 },
  { key: 'documents', label: 'Documents', defaultWidth: 110 },
  { key: 'last_notice', label: 'Last notice to funder', defaultWidth: 220 },
  { key: 'latest_update', label: 'Latest update', defaultWidth: 300 },
  { key: 'updated', label: 'Last edited', defaultWidth: 130 },
];
const ACTIVE_HIDDEN = allExcept(GRANT_COLUMNS, ['funder', 'amount', 'owner', 'due']);

const PAST_COLUMNS = GRANT_COLUMNS;
const PAST_HIDDEN = allExcept(GRANT_COLUMNS, ['funder', 'amount', 'owner']);

function useGrantRenderers(
  profiles: Profile[],
  ownerColors: Record<string, string>,
  extras: Map<string, GrantRowExtras>,
  showHealthDot: boolean,
) {
  const ownerName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? '';
  const x = (id: string) => extras.get(id) ?? EMPTY_EXTRAS;

  function compare(a: Grant, b: Grant, key: GrantColKey): number {
    switch (key) {
      case 'funder': return a.funder_name.localeCompare(b.funder_name);
      case 'amount': return (a.amount ?? 0) - (b.amount ?? 0);
      case 'owner': return ownerName(a.owner_id).localeCompare(ownerName(b.owner_id));
      case 'lead_time': return a.lead_time_days - b.lead_time_days;
      case 'due': return cmpDate(a.certification_due_date, b.certification_due_date);
      case 'last_certified': return cmpDate(a.last_certified_on, b.last_certified_on);
      case 'placed_in_service': return cmpDate(a.placed_in_service_date, b.placed_in_service_date);
      case 'affordability_end': return cmpDate(a.affordability_period_end, b.affordability_period_end);
      case 'prior_consent': return Number(a.prior_consent_required) - Number(b.prior_consent_required);
      case 'notes': return plainNotes(a.notes).localeCompare(plainNotes(b.notes));
      case 'contacts': return x(a.id).contacts.join(', ').localeCompare(x(b.id).contacts.join(', '));
      case 'links': return x(a.id).linkCount - x(b.id).linkCount;
      case 'documents': return x(a.id).docCount - x(b.id).docCount;
      case 'last_notice': return cmpDate(x(a.id).latestNotice?.sent_on, x(b.id).latestNotice?.sent_on);
      case 'latest_update': return cmpDate(x(a.id).latestUpdate?.created_at, x(b.id).latestUpdate?.created_at);
      case 'updated': return a.updated_at.localeCompare(b.updated_at);
    }
  }

  function renderCell(g: Grant, key: GrantColKey) {
    const e = x(g.id);
    switch (key) {
      case 'funder':
        return (
          <span className="flex min-w-0 items-center gap-2 font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
            {showHealthDot && (
              <span title="Certification health" className="block h-2 w-2 shrink-0 rounded-full" style={{ background: certificationDotColor(g.certification_due_date) }} />
            )}
            <span className="truncate" title={g.funder_name}>{g.funder_name}</span>
            {g.prior_consent_required && <span title="Prior consent required">⚠️</span>}
          </span>
        );
      case 'amount':
        return <span className={`whitespace-nowrap ${MUTED}`}>{formatMoney(g.amount)}</span>;
      case 'owner':
        return <OwnerCell owner={profiles.find((p) => p.id === g.owner_id)} ownerColors={ownerColors} />;
      case 'lead_time':
        return <span className={`whitespace-nowrap ${MUTED}`}>{g.lead_time_days} days</span>;
      case 'due': {
        const tone = certificationTone(g.certification_due_date);
        // The actual date, still color-coded (green fine / amber due soon / red overdue);
        // the "Due in Nd" countdown is on hover.
        return tone.label ? (
          <span title={tone.label} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.chip}`}>
            {formatDate(g.certification_due_date)}
          </span>
        ) : <Dash />;
      }
      case 'last_certified': return <DateCell iso={g.last_certified_on} />;
      case 'placed_in_service': return <DateCell iso={g.placed_in_service_date} />;
      case 'affordability_end': return <DateCell iso={g.affordability_period_end} />;
      case 'prior_consent':
        return g.prior_consent_required ? <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Required</span> : <Dash />;
      case 'notes': return <TextCell value={plainNotes(g.notes) || null} />;
      case 'contacts': return <TextCell value={e.contacts.join(', ') || null} />;
      case 'links': return <CountCell n={e.linkCount} noun="link" />;
      case 'documents': return <CountCell n={e.docCount} noun="doc" />;
      case 'last_notice':
        return e.latestNotice
          ? <TextCell value={`${formatDate(e.latestNotice.sent_on)} — ${notificationCategoryLabel(e.latestNotice.category)}`} />
          : <Dash />;
      case 'latest_update': return <LatestUpdateCell update={e.latestUpdate} />;
      case 'updated': return <DateCell iso={g.updated_at} />;
    }
  }

  return { compare, renderCell };
}

function ActiveGrantsTable({
  grants,
  extras,
  profiles,
  ownerColors,
  onOpen,
}: {
  grants: Grant[];
  extras: Map<string, GrantRowExtras>;
  profiles: Profile[];
  ownerColors: Record<string, string>;
  onOpen: (id: string) => void;
}) {
  const { compare, renderCell } = useGrantRenderers(profiles, ownerColors, extras, true);
  const grid = useGrantGrid(GRANT_COLUMNS, 'sparrow-grants-active-table', ACTIVE_HIDDEN, 'funder', grants, compare);

  if (grants.length === 0) return <p className={`mt-4 text-sm ${MUTED}`}>No active grants yet.</p>;

  return (
    <div className="mt-4">
      <GridTableShell
        layout={grid.layout}
        sortKey={grid.sortKey}
        sortDir={grid.sortDir}
        onHeaderClick={grid.onHeaderClick}
        startResize={grid.startResize}
        items={grid.sorted}
        rowKey={(g) => g.id}
        renderCell={renderCell}
        onRowClick={(g) => onOpen(g.id)}
        rowClassName={() => ROW_CLASS}
      />
    </div>
  );
}

function PastGrantsTable({
  grants,
  extras,
  profiles,
  ownerColors,
  onOpen,
}: {
  grants: Grant[];
  extras: Map<string, GrantRowExtras>;
  profiles: Profile[];
  ownerColors: Record<string, string>;
  onOpen: (id: string) => void;
}) {
  const { compare, renderCell } = useGrantRenderers(profiles, ownerColors, extras, false);
  const grid = useGrantGrid(PAST_COLUMNS, 'sparrow-grants-past-table', PAST_HIDDEN, 'funder', grants, compare);

  if (grants.length === 0) {
    return <p className={`text-sm ${MUTED}`}>No past grants yet — nothing's wrapped up so far. When one does, it lands here with every field, link, and document intact.</p>;
  }
  return (
    <GridTableShell
      layout={grid.layout}
      sortKey={grid.sortKey}
      sortDir={grid.sortDir}
      onHeaderClick={grid.onHeaderClick}
      startResize={grid.startResize}
      items={grid.sorted}
      rowKey={(g) => g.id}
      renderCell={renderCell}
      onRowClick={(g) => onOpen(g.id)}
      rowClassName={() => ROW_CLASS}
    />
  );
}

// ── Prospects (Being Pursued + Not Moving Forward) ────────────────────────────────────
type ProspectColKey =
  | 'name' | 'status' | 'tier' | 'source' | 'award_range' | 'owner' | 'lead_time'
  | 'opens' | 'deadline' | 'applied' | 'outcome' | 'notes' | 'action_steps'
  | 'contacts' | 'links' | 'documents' | 'latest_update' | 'updated';

const PROSPECT_COLUMNS: GridColumn<ProspectColKey>[] = [
  { key: 'name', label: 'Name', defaultWidth: 280 },
  { key: 'status', label: 'Status', defaultWidth: 150 },
  { key: 'tier', label: 'Tier', defaultWidth: 110 },
  { key: 'award_range', label: 'Award range', defaultWidth: 150 },
  { key: 'owner', label: 'Owner', defaultWidth: 160 },
  { key: 'opens', label: 'Application opens', defaultWidth: 150 },
  { key: 'deadline', label: 'Application deadline', defaultWidth: 160 },
  { key: 'applied', label: 'Applied', defaultWidth: 140 },
  { key: 'action_steps', label: 'Action steps', defaultWidth: 280 },
  { key: 'outcome', label: 'Outcome', defaultWidth: 180 },
  { key: 'source', label: 'Source', defaultWidth: 130 },
  { key: 'lead_time', label: 'Reminder lead time', defaultWidth: 150 },
  { key: 'notes', label: 'Notes', defaultWidth: 320 },
  { key: 'contacts', label: 'Contacts', defaultWidth: 200 },
  { key: 'links', label: 'Links', defaultWidth: 90 },
  { key: 'documents', label: 'Documents', defaultWidth: 110 },
  { key: 'latest_update', label: 'Latest update', defaultWidth: 300 },
  { key: 'updated', label: 'Last edited', defaultWidth: 130 },
];
const PURSUED_HIDDEN = allExcept(PROSPECT_COLUMNS, ['name', 'status', 'tier', 'award_range', 'owner', 'deadline', 'applied', 'action_steps']);

// Not Moving Forward leads with the notes (the "why") instead of due dates.
const NOT_MOVING_SHOWN: ProspectColKey[] = ['name', 'tier', 'owner', 'notes'];
const NOT_MOVING_COLUMNS = pickColumns(PROSPECT_COLUMNS, [
  ...NOT_MOVING_SHOWN,
  ...PROSPECT_COLUMNS.map((c) => c.key).filter((k) => !NOT_MOVING_SHOWN.includes(k)),
]);
const NOT_MOVING_HIDDEN = allExcept(PROSPECT_COLUMNS, NOT_MOVING_SHOWN);

function useProspectRenderers(
  profiles: Profile[],
  ownerColors: Record<string, string>,
  tierLabels: GrantProspectLabel[],
  sourceLabels: GrantProspectLabel[],
  extras: Map<string, GrantRowExtras>,
) {
  const ownerName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? '';
  const tierName = (id: string | null) => tierLabels.find((l) => l.id === id)?.name ?? '';
  const sourceName = (id: string | null) => sourceLabels.find((l) => l.id === id)?.name ?? '';
  const x = (id: string) => extras.get(id) ?? EMPTY_EXTRAS;

  function compare(a: GrantProspect, b: GrantProspect, key: ProspectColKey): number {
    switch (key) {
      case 'name': return a.name.localeCompare(b.name);
      case 'status': return PROSPECT_ACTIVE_STATUSES.indexOf(a.status) - PROSPECT_ACTIVE_STATUSES.indexOf(b.status);
      case 'tier': return tierName(a.tier_label_id).localeCompare(tierName(b.tier_label_id));
      case 'source': return sourceName(a.source_label_id).localeCompare(sourceName(b.source_label_id));
      case 'award_range': return (prospectAwardRange(a) ?? '').localeCompare(prospectAwardRange(b) ?? '', undefined, { numeric: true });
      case 'owner': return ownerName(a.owner_id).localeCompare(ownerName(b.owner_id));
      case 'lead_time': return a.lead_time_days - b.lead_time_days;
      case 'opens': return cmpDate(a.application_opens, b.application_opens);
      case 'deadline': return cmpDate(a.application_deadline, b.application_deadline);
      case 'applied': return cmpDate(a.applied_date, b.applied_date);
      case 'outcome': return cmpDate(a.outcome_date, b.outcome_date);
      case 'notes': return plainNotes(prospectNotes(a)).localeCompare(plainNotes(prospectNotes(b)));
      case 'action_steps': return (a.action_steps ?? '').localeCompare(b.action_steps ?? '');
      case 'contacts': return x(a.id).contacts.join(', ').localeCompare(x(b.id).contacts.join(', '));
      case 'links': return x(a.id).linkCount - x(b.id).linkCount;
      case 'documents': return x(a.id).docCount - x(b.id).docCount;
      case 'latest_update': return cmpDate(x(a.id).latestUpdate?.created_at, x(b.id).latestUpdate?.created_at);
      case 'updated': return a.updated_at.localeCompare(b.updated_at);
    }
  }

  function renderCell(p: GrantProspect, key: ProspectColKey) {
    const e = x(p.id);
    switch (key) {
      case 'name':
        return <span className="truncate font-medium text-sparrow-ink dark:text-sparrow-dark-ink" title={p.name}>{p.name}</span>;
      case 'status':
        return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${prospectStatusChip(p.status)}`}>{prospectStatusLabel(p.status)}</span>;
      case 'tier': return <LabelCell label={tierLabels.find((l) => l.id === p.tier_label_id)} />;
      case 'source': return <LabelCell label={sourceLabels.find((l) => l.id === p.source_label_id)} />;
      case 'award_range': return <TextCell value={prospectAwardRange(p)} />;
      case 'owner': return <OwnerCell owner={profiles.find((o) => o.id === p.owner_id)} ownerColors={ownerColors} />;
      case 'lead_time': return <span className={`whitespace-nowrap ${MUTED}`}>{p.lead_time_days} days</span>;
      case 'opens': return <DateCell iso={p.application_opens} />;
      case 'deadline': {
        if (!p.application_deadline) return <span className={`whitespace-nowrap ${MUTED}`}>No deadline set</span>;
        const overdue = (daysSince(p.application_deadline) ?? -9999) > 0;
        return (
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${overdue ? 'bg-priority-p1/15 text-priority-p1' : 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300'}`}>
            {formatDate(p.application_deadline)}
          </span>
        );
      }
      case 'applied':
        return p.applied_date ? (
          <span className="whitespace-nowrap rounded-full bg-sparrow-cream dark:bg-sparrow-gold/15 px-2 py-0.5 text-[10px] font-medium text-sparrow-gold">
            📌 {formatDate(p.applied_date)}
          </span>
        ) : <Dash />;
      case 'outcome':
        return p.outcome_date
          ? <span className={`whitespace-nowrap ${MUTED}`}>{p.status === 'awarded' ? 'Awarded' : 'Declined'} — {formatDate(p.outcome_date)}</span>
          : <Dash />;
      case 'notes': return <TextCell value={plainNotes(prospectNotes(p)) || null} />;
      case 'action_steps': return <TextCell value={p.action_steps} />;
      case 'contacts': return <TextCell value={e.contacts.join(', ') || null} />;
      case 'links': return <CountCell n={e.linkCount} noun="link" />;
      case 'documents': return <CountCell n={e.docCount} noun="doc" />;
      case 'latest_update': return <LatestUpdateCell update={e.latestUpdate} />;
      case 'updated': return <DateCell iso={p.updated_at} />;
    }
  }

  return { compare, renderCell };
}

function ProspectsTable({
  prospects,
  extras,
  profiles,
  ownerColors,
  tierLabels,
  sourceLabels,
  onOpen,
}: {
  prospects: GrantProspect[];
  extras: Map<string, GrantRowExtras>;
  profiles: Profile[];
  ownerColors: Record<string, string>;
  tierLabels: GrantProspectLabel[];
  sourceLabels: GrantProspectLabel[];
  onOpen: (id: string) => void;
}) {
  const { compare, renderCell } = useProspectRenderers(profiles, ownerColors, tierLabels, sourceLabels, extras);
  const grid = useGrantGrid(PROSPECT_COLUMNS, 'sparrow-grants-pursued-table', PURSUED_HIDDEN, 'deadline', prospects, compare);

  if (prospects.length === 0) return <p className={`mt-4 text-sm ${MUTED}`}>No prospects yet.</p>;

  return (
    <div className="mt-4">
      <GridTableShell
        layout={grid.layout}
        sortKey={grid.sortKey}
        sortDir={grid.sortDir}
        onHeaderClick={grid.onHeaderClick}
        startResize={grid.startResize}
        items={grid.sorted}
        rowKey={(p) => p.id}
        renderCell={renderCell}
        onRowClick={(p) => onOpen(p.id)}
        rowClassName={() => ROW_CLASS}
      />
    </div>
  );
}

function NotMovingTable({
  prospects,
  extras,
  profiles,
  ownerColors,
  tierLabels,
  sourceLabels,
  onOpen,
}: {
  prospects: GrantProspect[];
  extras: Map<string, GrantRowExtras>;
  profiles: Profile[];
  ownerColors: Record<string, string>;
  tierLabels: GrantProspectLabel[];
  sourceLabels: GrantProspectLabel[];
  onOpen: (id: string) => void;
}) {
  const { compare, renderCell } = useProspectRenderers(profiles, ownerColors, tierLabels, sourceLabels, extras);
  const grid = useGrantGrid(NOT_MOVING_COLUMNS, 'sparrow-grants-not-moving-table', NOT_MOVING_HIDDEN, 'name', prospects, compare);

  if (prospects.length === 0) return <p className={`text-sm ${MUTED}`}>Nothing here yet.</p>;

  return (
    <GridTableShell
      layout={grid.layout}
      sortKey={grid.sortKey}
      sortDir={grid.sortDir}
      onHeaderClick={grid.onHeaderClick}
      startResize={grid.startResize}
      items={grid.sorted}
      rowKey={(p) => p.id}
      renderCell={renderCell}
      onRowClick={(p) => onOpen(p.id)}
      rowClassName={() => ROW_CLASS}
    />
  );
}

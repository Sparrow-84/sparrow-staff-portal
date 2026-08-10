import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchProfiles } from '@/lib/data';
import type { Profile } from '@/lib/types';
import { assignAvatarColors } from '@/lib/avatarColors';
import { createGrant, fetchGrants } from '@/lib/grants';
import { certificationTone, daysSince, formatDate, formatMoney, type Grant } from '@/lib/grants-types';
import { createProspect, fetchProspectLabels, fetchProspects } from '@/lib/grant-prospects';
import {
  PROSPECT_ACTIVE_STATUSES,
  type GrantProspect,
  type GrantProspectLabel,
} from '@/lib/grant-prospects-types';
import { LabelPill } from '@/components/LabelPill';
import { GrantPanel } from './GrantPanel';
import { GrantProspectPanel } from './GrantProspectPanel';
import { GrantsHelpModal } from './GrantsHelpModal';

const DEFAULT_LEAD_TIME_DAYS = 30;

type ModuleTab = 'active' | 'prospects' | 'no' | 'past';
const MODULE_TABS: { key: ModuleTab; label: string; desc: string }[] = [
  { key: 'active', label: 'Active Grants', desc: 'Grants Sparrow currently holds. Dot = certification health (green ok, amber due soon, red overdue).' },
  { key: 'prospects', label: 'Being Pursued', desc: 'Still in motion. Dot = status (gray not researched, blue researching, green decided to pursue, amber applied).' },
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

const PROSPECT_DOT: Record<string, string> = {
  not_researched: '#9CA3AF',
  researching: '#2563EB',
  decided_pursue: '#1E4D30',
  applied: '#F0A500',
};

export function GrantsRoom() {
  const { profile } = useAuth();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [prospects, setProspects] = useState<GrantProspect[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tierLabels, setTierLabels] = useState<GrantProspectLabel[]>([]);
  const [sourceLabels, setSourceLabels] = useState<GrantProspectLabel[]>([]);
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
      const [g, p, pr, tl, sl] = await Promise.all([
        fetchGrants(),
        fetchProspects(),
        fetchProfiles(),
        fetchProspectLabels('tier'),
        fetchProspectLabels('source'),
      ]);
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
          funder_contact_name: null,
          funder_contact_email: null,
          funder_contact_phone: null,
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
          <ActiveGrantsTable grants={activeGrants} profiles={profiles} ownerColors={ownerColors} onOpen={openGrant} />
        </>
      )}

      {moduleTab === 'past' && (
        <div className="mt-4">
          <PastGrantsTable grants={pastGrants} profiles={profiles} ownerColors={ownerColors} onOpen={openGrant} />
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
type SortDir = 'asc' | 'desc';

function Th<K extends string>({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: K;
  sortKey: K;
  sortDir: SortDir;
  onSort: (k: K) => void;
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onSort(k)}
      className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
    >
      {label}
      {active && <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

function OwnerCell({ owner, ownerColors }: { owner: Profile | undefined; ownerColors: Record<string, string> }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-sparrow-gray dark:text-sparrow-dark-gray">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${owner ? (ownerColors[owner.id] ?? 'bg-sparrow-gray dark:bg-sparrow-dark-border') : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2'}`} />
      {owner ? owner.full_name : 'Unassigned'}
    </span>
  );
}

function LabelCell({ label }: { label: GrantProspectLabel | undefined }) {
  if (!label) return <span className="text-sparrow-rule dark:text-sparrow-dark-border">—</span>;
  return <LabelPill label={label.name} color={label.color} />;
}

// ── Active Grants ─────────────────────────────────────────────────────────────────────
function ActiveGrantsTable({
  grants,
  profiles,
  ownerColors,
  onOpen,
}: {
  grants: Grant[];
  profiles: Profile[];
  ownerColors: Record<string, string>;
  onOpen: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<'funder' | 'amount' | 'owner' | 'due'>('funder');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function onSort(k: typeof sortKey) {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  }

  const sorted = [...grants].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'funder') cmp = a.funder_name.localeCompare(b.funder_name);
    else if (sortKey === 'amount') cmp = (a.amount ?? 0) - (b.amount ?? 0);
    else if (sortKey === 'owner') cmp = (profiles.find((p) => p.id === a.owner_id)?.full_name ?? '').localeCompare(profiles.find((p) => p.id === b.owner_id)?.full_name ?? '');
    else cmp = (daysSince(a.certification_due_date) ?? 9999) - (daysSince(b.certification_due_date) ?? 9999);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  if (sorted.length === 0) return <p className="mt-4 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No active grants yet.</p>;

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/40">
            <th className="w-6 px-3 py-2" />
            <Th label="Funder" k="funder" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <Th label="Amount" k="amount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <Th label="Owner" k="owner" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <Th label="Certification due" k="due" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((g) => {
            const tone = certificationTone(g.certification_due_date);
            const owner = profiles.find((p) => p.id === g.owner_id);
            return (
              <tr key={g.id} onClick={() => onOpen(g.id)} className="cursor-pointer border-b border-sparrow-rule/60 bg-white dark:bg-sparrow-dark-surface hover:bg-sparrow-mist/40">
                <td className="px-3 py-2.5"><span className="block h-2 w-2 rounded-full" style={{ background: certificationDotColor(g.certification_due_date) }} /></td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className="flex items-center gap-1.5 font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
                    {g.funder_name}
                    {g.prior_consent_required && <span title="Prior consent required">⚠️</span>}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sparrow-gray dark:text-sparrow-dark-gray">{formatMoney(g.amount)}</td>
                <td className="px-3 py-2.5"><OwnerCell owner={owner} ownerColors={ownerColors} /></td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {tone.label ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.chip}`}>{tone.label}</span> : <span className="text-sparrow-gray dark:text-sparrow-dark-gray">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PastGrantsTable({
  grants,
  profiles,
  ownerColors,
  onOpen,
}: {
  grants: Grant[];
  profiles: Profile[];
  ownerColors: Record<string, string>;
  onOpen: (id: string) => void;
}) {
  if (grants.length === 0) {
    return <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No past grants yet — nothing's wrapped up so far. When one does, it lands here with every field, link, and document intact.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/40">
            <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Funder</th>
            <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Amount</th>
            <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Owner</th>
          </tr>
        </thead>
        <tbody>
          {grants.map((g) => {
            const owner = profiles.find((p) => p.id === g.owner_id);
            return (
              <tr key={g.id} onClick={() => onOpen(g.id)} className="cursor-pointer border-b border-sparrow-rule/60 bg-white dark:bg-sparrow-dark-surface hover:bg-sparrow-mist/40">
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{g.funder_name}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sparrow-gray dark:text-sparrow-dark-gray">{formatMoney(g.amount)}</td>
                <td className="px-3 py-2.5"><OwnerCell owner={owner} ownerColors={ownerColors} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Prospects (Being Pursued) ──────────────────────────────────────────────────────────
function ProspectsTable({
  prospects,
  profiles,
  ownerColors,
  tierLabels,
  sourceLabels,
  onOpen,
}: {
  prospects: GrantProspect[];
  profiles: Profile[];
  ownerColors: Record<string, string>;
  tierLabels: GrantProspectLabel[];
  sourceLabels: GrantProspectLabel[];
  onOpen: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<'name' | 'owner' | 'deadline' | 'amount'>('deadline');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function onSort(k: typeof sortKey) {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  }

  const sorted = [...prospects].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortKey === 'amount') cmp = (a.est_amount ?? 0) - (b.est_amount ?? 0);
    else if (sortKey === 'owner') cmp = (profiles.find((p) => p.id === a.owner_id)?.full_name ?? '').localeCompare(profiles.find((p) => p.id === b.owner_id)?.full_name ?? '');
    else cmp = (daysSince(a.application_deadline) ?? 9999) - (daysSince(b.application_deadline) ?? 9999);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  if (sorted.length === 0) return <p className="mt-4 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No prospects yet.</p>;

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/40">
            <th className="w-6 px-3 py-2" />
            <Th label="Name" k="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Tier / Source</th>
            <Th label="Est. amount" k="amount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <Th label="Owner" k="owner" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <Th label="Deadline" k="deadline" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const owner = profiles.find((x) => x.id === p.owner_id);
            const tier = tierLabels.find((l) => l.id === p.tier_label_id);
            const source = sourceLabels.find((l) => l.id === p.source_label_id);
            const overdue = (daysSince(p.application_deadline) ?? -9999) > 0;
            return (
              <tr key={p.id} onClick={() => onOpen(p.id)} className="cursor-pointer border-b border-sparrow-rule/60 bg-white dark:bg-sparrow-dark-surface hover:bg-sparrow-mist/40">
                <td className="px-3 py-2.5"><span className="block h-2 w-2 rounded-full" style={{ background: PROSPECT_DOT[p.status] ?? '#9CA3AF' }} /></td>
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{p.name}</td>
                <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1"><LabelCell label={tier} /><LabelCell label={source} /></div></td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sparrow-gray dark:text-sparrow-dark-gray">{p.est_amount ? formatMoney(p.est_amount) : '—'}</td>
                <td className="px-3 py-2.5"><OwnerCell owner={owner} ownerColors={ownerColors} /></td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {p.status === 'applied' ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Applied</span>
                  ) : p.application_deadline ? (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${overdue ? 'bg-priority-p1/15 text-priority-p1' : 'bg-blue-100 text-blue-700'}`}>
                      {formatDate(p.application_deadline)}
                    </span>
                  ) : (
                    <span className="text-sparrow-gray dark:text-sparrow-dark-gray">No deadline set</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Not Moving Forward — no due dates, a reasoning preview instead ────────────────────
function NotMovingTable({
  prospects,
  profiles,
  ownerColors,
  tierLabels,
  sourceLabels,
  onOpen,
}: {
  prospects: GrantProspect[];
  profiles: Profile[];
  ownerColors: Record<string, string>;
  tierLabels: GrantProspectLabel[];
  sourceLabels: GrantProspectLabel[];
  onOpen: (id: string) => void;
}) {
  if (prospects.length === 0) return <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Nothing here yet.</p>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/40">
            <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Name</th>
            <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Tier / Source</th>
            <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Owner</th>
            <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Why</th>
          </tr>
        </thead>
        <tbody>
          {prospects.map((p) => {
            const owner = profiles.find((x) => x.id === p.owner_id);
            const tier = tierLabels.find((l) => l.id === p.tier_label_id);
            const source = sourceLabels.find((l) => l.id === p.source_label_id);
            return (
              <tr key={p.id} onClick={() => onOpen(p.id)} className="cursor-pointer border-b border-sparrow-rule/60 bg-white dark:bg-sparrow-dark-surface hover:bg-sparrow-mist/40">
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{p.name}</td>
                <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1"><LabelCell label={tier} /><LabelCell label={source} /></div></td>
                <td className="px-3 py-2.5"><OwnerCell owner={owner} ownerColors={ownerColors} /></td>
                <td className="max-w-xs truncate px-3 py-2.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{p.decision_reasoning || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

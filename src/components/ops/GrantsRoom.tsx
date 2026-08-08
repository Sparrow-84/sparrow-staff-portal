import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { createGrant, fetchGrants } from '@/lib/grants';
import { certificationTone, formatMoney, type Grant } from '@/lib/grants-types';
import { createProspect, fetchProspects } from '@/lib/grant-prospects';
import { PROSPECT_ACTIVE_STATUSES, prospectStatusChip, prospectStatusLabel, type GrantProspect } from '@/lib/grant-prospects-types';
import { GrantPanel } from './GrantPanel';
import { GrantProspectPanel } from './GrantProspectPanel';
import { GrantsHelpModal } from './GrantsHelpModal';

type ModuleTab = 'active' | 'prospects' | 'no' | 'past';
const MODULE_TABS: { key: ModuleTab; label: string; desc: string }[] = [
  { key: 'active', label: 'Active Grants', desc: 'Grants Sparrow currently holds — ongoing compliance to track.' },
  { key: 'prospects', label: 'Being Pursued', desc: 'Anything still in motion — not researched, researching, decided to pursue, or applied and waiting.' },
  { key: 'no', label: 'Not Moving Forward', desc: 'Leads that ended without funding, whether Sparrow passed or applied and was declined. Kept for the record of why.' },
  { key: 'past', label: 'Past Grants', desc: 'Grants that were awarded and have since wrapped up. Nothing is stripped out.' },
];

export function GrantsRoom() {
  const { profile } = useAuth();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [prospects, setProspects] = useState<GrantProspect[]>([]);
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
      const [g, p] = await Promise.all([fetchGrants(), fetchProspects()]);
      setGrants(g);
      setProspects(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load grants.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
          ohcs_contact_name: null,
          ohcs_contact_email: null,
          ohcs_contact_phone: null,
          certification_due_date: null,
          prior_consent_required: false,
          notes: null,
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

  if (loading) return <p className="p-4 text-sm text-sparrow-gray">Loading grants…</p>;
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
        <div className="flex flex-wrap gap-1 rounded-xl border border-sparrow-rule bg-sparrow-mist p-1 text-xs">
          {MODULE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setModuleTab(t.key)}
              className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
                moduleTab === t.key ? 'bg-white text-sparrow-green shadow-sm' : 'text-sparrow-gray hover:text-sparrow-ink'
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sparrow-rule text-sm font-medium text-sparrow-gray transition hover:border-sparrow-green hover:text-sparrow-green"
        >
          ?
        </button>
      </div>
      <p className="mt-2 text-xs text-sparrow-gray">{currentTab.desc}</p>

      {moduleTab === 'active' && overdueCount > 0 && (
        <div className="mt-3 rounded-xl border border-priority-p1/40 bg-priority-p1/10 px-4 py-2 text-sm text-priority-p1">
          📋 {overdueCount} annual certification{overdueCount > 1 ? 's' : ''} overdue
        </div>
      )}

      {moduleTab === 'active' && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-sparrow-gray">{activeGrants.length} active grant{activeGrants.length === 1 ? '' : 's'}</p>
            <button onClick={() => setShowNewGrant((v) => !v)} className="btn-primary">
              + Add grant
            </button>
          </div>
          {showNewGrant && (
            <div className="mt-4 flex gap-2 rounded-xl border border-sparrow-rule bg-white p-3 shadow-card">
              <input value={newFunder} onChange={(e) => setNewFunder(e.target.value)} placeholder="Funder name" className="field-input mt-0 flex-1" />
              <button onClick={addGrant} disabled={busy || !newFunder.trim()} className="btn-primary shrink-0">
                Create
              </button>
            </div>
          )}
          <GrantList grants={activeGrants} emptyLabel="No active grants yet." onOpen={openGrant} />
        </>
      )}

      {moduleTab === 'past' && (
        <div className="mt-4">
          <GrantList grants={pastGrants} emptyLabel="No past grants yet — nothing's wrapped up so far. When one does, it lands here with every field, link, and document intact." onOpen={openGrant} />
        </div>
      )}

      {moduleTab === 'prospects' && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-sparrow-gray">{pursuedProspects.length} prospect{pursuedProspects.length === 1 ? '' : 's'} still in motion</p>
            <button onClick={() => setShowNewProspect((v) => !v)} className="btn-primary">
              + Add prospect
            </button>
          </div>
          {showNewProspect && (
            <div className="mt-4 flex gap-2 rounded-xl border border-sparrow-rule bg-white p-3 shadow-card">
              <input value={newProspectName} onChange={(e) => setNewProspectName(e.target.value)} placeholder="Funder / opportunity name" className="field-input mt-0 flex-1" />
              <button onClick={addProspect} disabled={busy || !newProspectName.trim()} className="btn-primary shrink-0">
                Create
              </button>
            </div>
          )}
          <ProspectList prospects={pursuedProspects} emptyLabel="No prospects yet." onOpen={openProspect} />
        </>
      )}

      {moduleTab === 'no' && (
        <div className="mt-4">
          <ProspectList prospects={notMovingProspects} emptyLabel="Nothing here yet." onOpen={openProspect} />
        </div>
      )}

      <GrantPanel
        open={grantPanelOpen}
        grant={selectedGrantId ? grants.find((g) => g.id === selectedGrantId) ?? null : null}
        currentUserId={profile?.id ?? ''}
        onClose={() => setGrantPanelOpen(false)}
        onChanged={load}
      />
      <GrantProspectPanel
        open={prospectPanelOpen}
        prospect={selectedProspectId ? prospects.find((p) => p.id === selectedProspectId) ?? null : null}
        currentUserId={profile?.id ?? ''}
        onClose={() => setProspectPanelOpen(false)}
        onChanged={load}
        onAwarded={handleAwarded}
      />
      <GrantsHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function GrantList({ grants, emptyLabel, onOpen }: { grants: Grant[]; emptyLabel: string; onOpen: (id: string) => void }) {
  return (
    <ul className="mt-4 space-y-2">
      {grants.length === 0 && <li className="text-sm text-sparrow-gray">{emptyLabel}</li>}
      {grants.map((g) => {
        const tone = certificationTone(g.certification_due_date);
        return (
          <li key={g.id}>
            <button
              onClick={() => onOpen(g.id)}
              className="flex w-full items-center gap-4 rounded-2xl border border-sparrow-rule bg-white p-4 text-left shadow-card transition hover:border-sparrow-green/40"
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium text-sparrow-ink">{g.funder_name}</span>
                <p className="text-xs text-sparrow-gray">{formatMoney(g.amount)}</p>
              </div>
              {g.prior_consent_required && (
                <span className="rounded-full bg-priority-p1/15 px-2 py-0.5 text-[10px] font-medium text-priority-p1" title="Prior consent required">
                  ⚠️ Consent required
                </span>
              )}
              {g.status === 'active' && tone.label && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.chip}`} title="Certification due">
                  {tone.label}
                </span>
              )}
              <span className="shrink-0 text-sparrow-gray">›</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ProspectList({ prospects, emptyLabel, onOpen }: { prospects: GrantProspect[]; emptyLabel: string; onOpen: (id: string) => void }) {
  return (
    <ul className="mt-4 space-y-2">
      {prospects.length === 0 && <li className="text-sm text-sparrow-gray">{emptyLabel}</li>}
      {prospects.map((p) => (
        <li key={p.id}>
          <button
            onClick={() => onOpen(p.id)}
            className="flex w-full items-center gap-4 rounded-2xl border border-sparrow-rule bg-white p-4 text-left shadow-card transition hover:border-sparrow-green/40"
          >
            <div className="min-w-0 flex-1">
              <span className="font-medium text-sparrow-ink">{p.name}</span>
              {p.application_deadline && <p className="text-xs text-sparrow-gray">Due {p.application_deadline}</p>}
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${prospectStatusChip(p.status)}`}>
              {prospectStatusLabel(p.status)}
            </span>
            <span className="shrink-0 text-sparrow-gray">›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

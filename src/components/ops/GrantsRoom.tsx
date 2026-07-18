import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { createGrant, fetchGrants } from '@/lib/grants';
import { certificationTone, formatMoney, type Grant } from '@/lib/grants-types';
import { GrantPanel } from './GrantPanel';

export function GrantsRoom() {
  const { profile } = useAuth();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newFunder, setNewFunder] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setGrants(await fetchGrants());
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
    setSelectedId(id);
    setPanelOpen(true);
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
      setShowNew(false);
      await load();
      openGrant(grant.id);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="p-4 text-sm text-sparrow-gray">Loading grants…</p>;
  if (error) return <p className="p-4 text-sm text-priority-p1">{error}</p>;

  const overdueCount = grants.filter((g) => (certificationTone(g.certification_due_date).chip ?? '').includes('priority-p1')).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-sparrow-gray">{grants.length} active grant{grants.length === 1 ? '' : 's'}</p>
        <button onClick={() => setShowNew((v) => !v)} className="btn-primary">
          + Add grant
        </button>
      </div>

      {overdueCount > 0 && (
        <div className="mt-3 rounded-xl border border-priority-p1/40 bg-priority-p1/10 px-4 py-2 text-sm text-priority-p1">
          📋 {overdueCount} annual certification{overdueCount > 1 ? 's' : ''} overdue
        </div>
      )}

      {showNew && (
        <div className="mt-4 flex gap-2 rounded-xl border border-sparrow-rule bg-white p-3 shadow-card">
          <input
            value={newFunder}
            onChange={(e) => setNewFunder(e.target.value)}
            placeholder="Funder name"
            className="field-input mt-0 flex-1"
          />
          <button onClick={addGrant} disabled={busy || !newFunder.trim()} className="btn-primary shrink-0">
            Create
          </button>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {grants.length === 0 && <li className="text-sm text-sparrow-gray">No grants tracked yet.</li>}
        {grants.map((g) => {
          const tone = certificationTone(g.certification_due_date);
          return (
            <li key={g.id}>
              <button
                onClick={() => openGrant(g.id)}
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
                {tone.label && (
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

      <GrantPanel
        open={panelOpen}
        grant={selectedId ? grants.find((g) => g.id === selectedId) ?? null : null}
        currentUserId={profile?.id ?? ''}
        onClose={() => setPanelOpen(false)}
        onChanged={load}
      />
    </div>
  );
}

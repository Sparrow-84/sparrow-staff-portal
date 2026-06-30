import { useEffect, useState } from 'react';
import type { Profile } from '@/lib/types';
import { createPartner, emitFirstTimeDonorTask } from '@/lib/partnerships';
import {
  PARTNER_STAGE,
  PARTNER_TYPE,
  PARTNER_TYPES,
  type PartnerStage,
  type PartnerType,
} from '@/lib/partnerships-types';
import { Drawer } from '../lcp/Drawer';

// Default stewardship cadence by type (days between touchpoints). null = no day-based cadence.
// Donors: calendar-driven (comms tab handles it). Prayer: attendance tracking handles it.
// Church: quarterly per role doc. Community/business: 1-2x/year. Advisory: annual.
const DEFAULT_CADENCE: Record<PartnerType, number | null> = {
  donor:      null,
  church:     90,
  community:  180,
  volunteer:  180,
  prayer:     null,
  fst:        null,
  business:   180,
  foundation: null,
  advisory:   365,
};

export function AddPartnerPanel({
  open,
  profiles,
  defaultOwnerId,
  onClose,
  onCreated,
}: {
  open: boolean;
  profiles: Profile[];
  defaultOwnerId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<PartnerType>('donor');
  const [stage, setStage] = useState<PartnerStage>('prospect');
  const [ownerId, setOwnerId] = useState<string>('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [source, setSource] = useState('');
  const [cadence, setCadence] = useState<number | null>(DEFAULT_CADENCE.donor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setType('donor');
      setStage('prospect');
      setOwnerId(defaultOwnerId ?? '');
      setContactName('');
      setEmail('');
      setPhone('');
      setAddress('');
      setSource('');
      setCadence(DEFAULT_CADENCE.donor);
      setError(null);
      setBusy(false);
    }
  }, [open, defaultOwnerId]);

  function pickType(t: PartnerType) {
    setType(t);
    setCadence(DEFAULT_CADENCE[t]); // follow the type's default rhythm unless the user overrides
  }

  const canSave = name.trim().length > 0 && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const trimmedName = name.trim();
      await createPartner({
        name: trimmedName,
        type,
        stage,
        owner_id: ownerId || null,
        organization: null,
        contact_name: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        donor_tier: type === 'donor' ? 'first_time' : null,
        cadence_days: cadence && cadence > 0 ? cadence : null,
        source: source.trim() || null,
        notes: null,
      });
      // 72-hr follow-up task for new donors — best-effort, don't block the save
      if (type === 'donor' && ownerId) {
        // Fetch the new partner's id to emit the dedup-safe task
        const { data } = await import('@/lib/supabase').then((m) =>
          m.supabase.from('partners').select('id').eq('name', trimmedName).order('created_at', { ascending: false }).limit(1).single()
        );
        if (data?.id) {
          void emitFirstTimeDonorTask(data.id, trimmedName, ownerId).catch(() => undefined);
        }
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the partner.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add partner"
      subtitle="Name the owner and a cadence — that's what makes it stewarded"
      footer={
        <button onClick={save} disabled={!canSave} className="btn-primary w-full">
          {busy ? 'Adding…' : 'Add partner'}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="field-label" htmlFor="pa-name">Name</label>
          <input
            id="pa-name"
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Person, church, or organization"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="pa-type">Type</label>
            <select id="pa-type" className="field-input" value={type} onChange={(e) => pickType(e.target.value as PartnerType)}>
              {PARTNER_TYPES.map((t) => (
                <option key={t} value={t}>{PARTNER_TYPE[t].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="pa-stage">Stage</label>
            <select id="pa-stage" className="field-input" value={stage} onChange={(e) => setStage(e.target.value as PartnerStage)}>
              {(['prospect', 'active', 'reengaging'] as PartnerStage[]).map((s) => (
                <option key={s} value={s}>{PARTNER_STAGE[s].label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="pa-owner">Owner</label>
          <select id="pa-owner" className="field-input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Unassigned</option>
            {profiles
              .filter((p) => p.department === 'partnerships' || p.partnerships_access)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
          </select>
          <p className="mt-1 text-xs text-sparrow-gray">
            Every relationship needs a named owner — it's the precondition for stewardship.
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="pa-cadence">Cadence (days between touchpoints)</label>
          <input
            id="pa-cadence"
            type="number"
            min={1}
            className="field-input"
            value={cadence ?? ''}
            onChange={(e) => setCadence(e.target.value === '' ? null : Math.max(1, Number(e.target.value)))}
          />
          <p className="mt-1 text-xs text-sparrow-gray">
            Defaulted from the type ({PARTNER_TYPE[type].label}). Adjust to the rhythm this relationship needs.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="pa-contact">Primary contact</label>
            <input id="pa-contact" className="field-input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label className="field-label" htmlFor="pa-phone">Phone</label>
            <input id="pa-phone" className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="optional" />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="pa-email">Email</label>
          <input id="pa-email" type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" />
        </div>

        <div>
          <label className="field-label" htmlFor="pa-address">Mailing address</label>
          <textarea id="pa-address" rows={2} className="field-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="optional" />
        </div>

        <div>
          <label className="field-label" htmlFor="pa-source">Source (how the connection was made)</label>
          <input id="pa-source" className="field-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="optional" />
        </div>

        {error && <p className="text-sm text-priority-p1">{error}</p>}
      </div>
    </Drawer>
  );
}

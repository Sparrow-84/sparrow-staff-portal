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
import { useRequiredFields } from '@/hooks/useRequiredFields';

// Default stewardship cadence by type (days between touchpoints). Every partner now needs a
// cadence value (migration 0080 makes partners.cadence_days NOT NULL — "a record without a
// rhythm is the defect the room exists to surface" applies across the board now, donors
// included). Church: quarterly per role doc. Community/business: 1-2x/year. Advisory/
// foundation: annual grant cycle. Donor/prayer/fst: semi-annual personal check-in as a
// starting point — always editable.
const DEFAULT_CADENCE: Record<PartnerType, number> = {
  donor:      182,
  church:     90,
  community:  180,
  volunteer:  180,
  prayer:     90,
  fst:        90,
  business:   180,
  foundation: 365,
  advisory:   365,
};

// Universal default lead time (days of advance warning before a touchpoint is due) — matches
// the 14-day default migration 0080 backfilled everywhere else in the reminder engine.
const DEFAULT_LEAD_TIME = 14;

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
  const [leadTime, setLeadTime] = useState<number | null>(DEFAULT_LEAD_TIME);
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
      setLeadTime(DEFAULT_LEAD_TIME);
      setError(null);
      setBusy(false);
      resetValidation();
    }
  }, [open, defaultOwnerId]);

  // Cadence + lead time are required (migration 0080 — NOT NULL at the DB level). Validate here
  // so a save attempt never hits the DB constraint as its only feedback.
  const { missingMessage, validate, fieldClass, clear, reset: resetValidation } = useRequiredFields([
    { key: 'pa-name', label: 'Name', valid: name.trim().length > 0 },
    { key: 'pa-cadence', label: 'Cadence (days)', valid: cadence != null && cadence > 0 },
    { key: 'pa-lead-time', label: 'Lead time (days)', valid: leadTime != null && leadTime > 0 },
  ]);

  function pickType(t: PartnerType) {
    setType(t);
    setCadence(DEFAULT_CADENCE[t]); // follow the type's default rhythm unless the user overrides
    clear('pa-cadence');
  }

  async function save() {
    if (!validate() || cadence == null || leadTime == null) return;
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
        cadence_days: cadence,
        lead_time_days: leadTime,
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
        <div className="space-y-2">
          {missingMessage && <p className="text-sm text-priority-p1">{missingMessage}</p>}
          <button onClick={save} disabled={busy} className="btn-primary w-full">
            {busy ? 'Adding…' : 'Add partner'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="field-label" htmlFor="pa-name">Name</label>
          <input
            id="pa-name"
            className={fieldClass('pa-name')}
            value={name}
            onChange={(e) => { setName(e.target.value); clear('pa-name'); }}
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
              // Exec is excluded even if flagged with partnerships_access — Andrew's only role
              // here is the one-time major-donor call task, never standing ownership.
              .filter((p) => (p.department === 'partnerships' || p.partnerships_access) && p.department !== 'exec')
              .map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
          </select>
          <p className="mt-1 text-xs text-sparrow-gray">
            Every relationship needs a named owner — it's the precondition for stewardship.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="pa-cadence">Cadence (days) *</label>
            <input
              id="pa-cadence"
              type="number"
              min={1}
              required
              className={fieldClass('pa-cadence')}
              value={cadence ?? ''}
              onChange={(e) => {
                setCadence(e.target.value === '' ? null : Math.max(1, Number(e.target.value)));
                clear('pa-cadence');
              }}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="pa-lead-time">Lead time (days) *</label>
            <input
              id="pa-lead-time"
              type="number"
              min={1}
              required
              className={fieldClass('pa-lead-time')}
              value={leadTime ?? ''}
              onChange={(e) => {
                setLeadTime(e.target.value === '' ? null : Math.max(1, Number(e.target.value)));
                clear('pa-lead-time');
              }}
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-sparrow-gray">
          Cadence defaulted from the type ({PARTNER_TYPE[type].label}); lead time defaults to {DEFAULT_LEAD_TIME} days'
          advance warning. Both required — adjust to the rhythm this relationship needs.
        </p>

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

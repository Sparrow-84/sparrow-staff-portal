import { useEffect, useState } from 'react';
import type { Profile } from '@/lib/types';
import { createPartner, emitFirstTimeDonorTask, findPossibleDuplicatePartner } from '@/lib/partnerships';
import {
  PARTNER_STAGE,
  PARTNER_TYPE,
  PARTNER_TYPES,
  type PartnerStage,
  type PartnerType,
} from '@/lib/partnerships-types';
import { Drawer } from '../lcp/Drawer';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { LEAD_TIME_PRESETS } from '@/lib/cadence';
import { CadenceInput } from './CadenceInput';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { createInterest, setPartnerInterests, type PartnershipInterest } from '@/lib/partnership-interests';

// Default stewardship cadence by type (days between touchpoints). Every partner now needs a
// cadence value (migration 0080 makes partners.cadence_days NOT NULL — "a record without a
// rhythm is the defect the room exists to surface" applies across the board now, donors
// included). Church: quarterly per role doc. Community/business: 1-2x/year. Advisory/
// foundation: annual grant cycle. Donor/prayer/fst: semi-annual personal check-in as a
// starting point — always editable.
const DEFAULT_CADENCE: Record<PartnerType, number> = {
  donor:      182,
  church:     90,
  community:  182,
  volunteer:  182,
  prayer:     90,
  fst:        90,
  business:   182,
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
  interests = [],
  onInterestsCreated,
  initialValues,
  onCreatedFromContact,
}: {
  open: boolean;
  profiles: Profile[];
  defaultOwnerId: string | null;
  onClose: () => void;
  onCreated: (partnerId: string) => void;
  interests?: PartnershipInterest[];
  onInterestsCreated?: () => void;
  initialValues?: {
    name: string;
    phone: string;
    email: string;
    notes: string | null;
    source?: string;
    organization?: string | null;
    originLabel?: string;
  } | null;
  onCreatedFromContact?: (partnerId: string) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<PartnerType>('donor');
  const [secondaryTypes, setSecondaryTypes] = useState<PartnerType[]>([]);
  const [interestIds, setInterestIds] = useState<string[]>([]);
  const [stage, setStage] = useState<PartnerStage>('prospect');
  const [ownerId, setOwnerId] = useState<string>('');
  const [contactName, setContactName] = useState('');
  const [organization, setOrganization] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [cadence, setCadence] = useState<number | null>(DEFAULT_CADENCE.donor);
  const [leadTime, setLeadTime] = useState<number | null>(DEFAULT_LEAD_TIME);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? '');
      setType('donor');
      setSecondaryTypes([]);
      setInterestIds([]);
      setStage('prospect');
      setOwnerId(defaultOwnerId ?? '');
      setContactName('');
      setOrganization(initialValues?.organization ?? '');
      setEmail(initialValues?.email ?? '');
      setPhone(initialValues?.phone ?? '');
      setAddress('');
      setSource(initialValues?.source ?? '');
      setNotes(initialValues?.notes ?? '');
      setCadence(DEFAULT_CADENCE.donor);
      setLeadTime(DEFAULT_LEAD_TIME);
      setError(null);
      setBusy(false);
      setDuplicateWarning(null);
      resetValidation();
    }
  }, [open, defaultOwnerId, initialValues]);

  // Cadence + lead time are required (migration 0080 — NOT NULL at the DB level). Validate here
  // so a save attempt never hits the DB constraint as its only feedback.
  const { missingMessage, validate, fieldClass, fieldError, clear, reset: resetValidation } = useRequiredFields([
    { key: 'pa-name', label: 'Name', valid: name.trim().length > 0 },
    { key: 'pa-cadence', label: 'Cadence (days)', valid: cadence != null && cadence > 0 },
    { key: 'pa-lead-time', label: 'Lead time (days)', valid: leadTime != null && leadTime > 0 },
  ]);

  function pickType(t: PartnerType) {
    setType(t);
    setCadence(DEFAULT_CADENCE[t]); // follow the type's default rhythm unless the user overrides
    clear('pa-cadence');
    setSecondaryTypes((prev) => prev.filter((s) => s !== t)); // can't tag the same type twice
  }

  async function save() {
    if (!validate() || cadence == null || leadTime == null) return;
    const trimmedName = name.trim();

    // First pass: warn on a likely duplicate rather than silently creating a second record.
    // A second click while the warning is showing (duplicateWarning still set) proceeds anyway.
    if (!duplicateWarning) {
      setBusy(true);
      try {
        const dup = await findPossibleDuplicatePartner(trimmedName, email.trim() || null);
        if (dup) {
          setDuplicateWarning(`"${dup.name}" is already in the Directory. Click "Add anyway" to add this as a separate record.`);
          setBusy(false);
          return;
        }
      } catch {
        // Duplicate check itself failing shouldn't block a real add — fall through.
      }
      setBusy(false);
    }

    setBusy(true);
    setError(null);
    try {
      const newPartnerId = await createPartner({
        name: trimmedName,
        type,
        secondary_types: secondaryTypes,
        stage,
        owner_id: ownerId || null,
        organization: organization.trim() || null,
        contact_name: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        donor_tier: type === 'donor' ? 'first_time' : null,
        cadence_days: cadence,
        lead_time_days: leadTime,
        source: source.trim() || null,
        notes: notes.trim() || null,
      });
      if (type === 'donor' && ownerId) {
        void emitFirstTimeDonorTask(newPartnerId, trimmedName, ownerId).catch(() => undefined);
      }
      if (interestIds.length > 0) {
        await setPartnerInterests(newPartnerId, interestIds);
      }
      if (initialValues) {
        onCreatedFromContact?.(newPartnerId);
      }
      onCreated(newPartnerId);
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
          {duplicateWarning && <p className="text-sm text-priority-p1">{duplicateWarning}</p>}
          <button onClick={save} disabled={busy} className="btn-primary w-full">
            {busy ? 'Adding…' : duplicateWarning ? 'Add anyway' : 'Add partner'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {initialValues && (
          <p className="rounded-lg bg-sparrow-green/10 px-3 py-2 text-xs text-sparrow-green dark:text-sparrow-dark-green">
            Prefilled from {initialValues.name}'s {initialValues.originLabel ?? 'My Contacts entry'}. Pick a type and confirm the cadence to add them to the Directory.
          </p>
        )}
        <div>
          <label className="field-label field-label-required" htmlFor="pa-name">Name</label>
          <input
            id="pa-name"
            className={fieldClass('pa-name')}
            value={name}
            onChange={(e) => { setName(e.target.value); clear('pa-name'); setDuplicateWarning(null); }}
            placeholder="Person, church, or organization"
          />
          {fieldError('pa-name') && <p className="mt-1 text-xs text-priority-p1">{fieldError('pa-name')}</p>}
        </div>

        <div>
          <label className="field-label" htmlFor="pa-organization">Organization (optional)</label>
          <input
            id="pa-organization"
            className="field-input"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="Who they're with, if separate from the name above"
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
          <label className="field-label">Also involved as (optional)</label>
          <MultiSelectDropdown
            options={PARTNER_TYPES.filter((t) => t !== type).map((t) => ({
              value: t,
              label: PARTNER_TYPE[t].label,
              icon: PARTNER_TYPE[t].icon,
            }))}
            selected={secondaryTypes}
            onChange={(next) => setSecondaryTypes(next as PartnerType[])}
            placeholder="None"
          />
          <p className="mt-1 text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">
            Someone who's more than one thing to Sparrow — e.g. a donor who's also a prayer
            volunteer. Cadence still follows the main Type above; tag the other roles here so
            they also show up under those Directory tabs.
          </p>
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
          <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            Every relationship needs a named owner — it's the precondition for stewardship.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label field-label-required" htmlFor="pa-cadence">Cadence</label>
            <CadenceInput
              value={cadence}
              onCommit={(v) => { setCadence(v); clear('pa-cadence'); }}
              invalid={!!fieldError('pa-cadence')}
            />
            {fieldError('pa-cadence') && <p className="mt-1 text-xs text-priority-p1">{fieldError('pa-cadence')}</p>}
          </div>
          <div>
            <label className="field-label field-label-required" htmlFor="pa-lead-time">Lead time</label>
            <CadenceInput
              value={leadTime}
              onCommit={(v) => { setLeadTime(v); clear('pa-lead-time'); }}
              presets={LEAD_TIME_PRESETS}
              invalid={!!fieldError('pa-lead-time')}
            />
            {fieldError('pa-lead-time') && <p className="mt-1 text-xs text-priority-p1">{fieldError('pa-lead-time')}</p>}
          </div>
        </div>
        <p className="-mt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
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
          <input id="pa-email" type="email" className="field-input" value={email} onChange={(e) => { setEmail(e.target.value); setDuplicateWarning(null); }} placeholder="optional" />
        </div>

        <div>
          <label className="field-label" htmlFor="pa-address">Mailing address</label>
          <textarea id="pa-address" rows={2} className="field-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="optional" />
        </div>

        <div>
          <label className="field-label">Interests</label>
          <MultiSelectDropdown
            options={interests.map((i) => ({ value: i.id, label: i.label, color: i.color }))}
            selected={interestIds}
            onChange={setInterestIds}
            placeholder="None"
            onCreateNew={async (label, color) => {
              await createInterest(label, color);
              onInterestsCreated?.();
            }}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="pa-source">Source (how the connection was made)</label>
          <input id="pa-source" className="field-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="optional" />
        </div>

        <div>
          <label className="field-label" htmlFor="pa-notes">Notes</label>
          <textarea
            id="pa-notes"
            className="field-input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Context, commitments, history…"
          />
        </div>

        {error && <p className="text-sm text-priority-p1">{error}</p>}
      </div>
    </Drawer>
  );
}

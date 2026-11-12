import { useEffect, useMemo, useState } from 'react';
import { Drawer } from '../lcp/Drawer';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { isPersonRecord, type Partner } from '@/lib/partnerships-types';
import { fetchPartnerContacts, type PartnerContact } from '@/lib/partner-contacts';
import {
  AREA_OPTIONS,
  SERVES_ALL,
  SERVES_OPTIONS,
  SERVICE_TYPES,
  areasColumnReady,
  createService,
  updateService,
  type ResidentService,
  type ServiceInput,
} from '@/lib/resident-services';

const NO_RECORD = '__none__';

/** Add or edit a service. Opened from the Resident Services room, or from a Directory
 *  record's "Services they offer" (which presets the organization). */
export function ServiceFormPanel({
  open,
  service,
  partners,
  presetPartnerId,
  forReview = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  service: ResidentService | null;
  partners: Pick<Partner, 'id' | 'name' | 'type' | 'sub_category'>[];
  presetPartnerId?: string | null;
  /** Adding from a "To review" item: saved as waiting for review, not checked. */
  forReview?: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [partnerChoice, setPartnerChoice] = useState('');
  const [providerName, setProviderName] = useState('');
  const [name, setName] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [serves, setServes] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [areasReady, setAreasReady] = useState(false);
  const [address, setAddress] = useState('');
  const [confidential, setConfidential] = useState(false);
  const [helpPhone, setHelpPhone] = useState('');
  const [hours, setHours] = useState('');
  const [howTo, setHowTo] = useState('');
  const [website, setWebsite] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [goToContactId, setGoToContactId] = useState('');
  const [orgContacts, setOrgContacts] = useState<PartnerContact[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Organizations only -- a service is offered by an organization, not a person.
  const orgOptions = useMemo(
    () => partners.filter((p) => !isPersonRecord(p)).sort((a, b) => a.name.localeCompare(b.name)),
    [partners],
  );

  useEffect(() => {
    if (!open) return;
    setPartnerChoice(service ? (service.partner_id ?? NO_RECORD) : (presetPartnerId ?? ''));
    setProviderName(service?.provider_name ?? '');
    setName(service?.name ?? '');
    setServiceType(service?.service_type ?? '');
    setServes(service?.serves ?? []);
    setAreas(service?.areas ?? []);
    setAddress(service?.address ?? '');
    setConfidential(service?.address_confidential ?? false);
    setHelpPhone(service?.help_phone ?? '');
    setHours(service?.hours ?? '');
    setHowTo(service?.how_to_access ?? '');
    setWebsite(service?.website ?? '');
    setInternalNotes(service?.internal_notes ?? '');
    setGoToContactId(service?.go_to_contact_id ?? '');
    setError(null);
    setBusy(false);
    resetValidation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service, presetPartnerId]);

  useEffect(() => {
    if (open) void areasColumnReady().then(setAreasReady);
  }, [open]);

  // The go-to contact is picked from the chosen organization's contacts list.
  useEffect(() => {
    if (!open || !partnerChoice || partnerChoice === NO_RECORD) { setOrgContacts([]); return; }
    let cancelled = false;
    void fetchPartnerContacts(partnerChoice).then((res) => { if (!cancelled) setOrgContacts(res.contacts); });
    return () => { cancelled = true; };
  }, [open, partnerChoice]);

  const { missingMessage, validate, fieldClass, fieldError, clear, reset: resetValidation } = useRequiredFields([
    { key: 'rs-org', label: 'Organization', valid: partnerChoice !== '' && (partnerChoice !== NO_RECORD || providerName.trim().length > 0) },
    { key: 'rs-name', label: 'Program or service', valid: name.trim().length > 0 },
    { key: 'rs-type', label: 'Type', valid: serviceType !== '' },
    { key: 'rs-serves', label: 'Who it serves', valid: serves.length > 0 },
    { key: 'rs-areas', label: "Where it's available", valid: !areasReady || areas.length > 0 },
  ]);

  function toggleServes(group: string) {
    clear('rs-serves');
    setServes((prev) => {
      if (prev.includes(group)) return prev.filter((g) => g !== group);
      // "All people" already covers every group, so picking it clears the specific ones (and vice versa).
      if (group === SERVES_ALL) return [SERVES_ALL];
      return [...prev.filter((g) => g !== SERVES_ALL), group];
    });
  }

  async function save() {
    if (!validate()) return;
    const input: ServiceInput = {
      partner_id: partnerChoice === NO_RECORD ? null : partnerChoice,
      provider_name: partnerChoice === NO_RECORD ? providerName.trim() : null,
      name: name.trim(),
      service_type: serviceType,
      serves,
      address: address.trim() || null,
      address_confidential: confidential,
      help_phone: helpPhone.trim() || null,
      hours: hours.trim() || null,
      how_to_access: howTo.trim() || null,
      website: website.trim() || null,
      internal_notes: internalNotes.trim() || null,
      // Only sent when there's something to save or clear, so saving works even before 0200 adds the column.
      ...(goToContactId || service?.go_to_contact_id ? { go_to_contact_id: goToContactId || null } : {}),
      ...(forReview && !service ? { needs_review: true } : {}),
      // The column only exists once 0216 runs.
      ...(areasReady ? { areas } : {}),
    };
    setBusy(true);
    setError(null);
    try {
      if (service) {
        await updateService(service.id, input);
        onSaved(service.id);
      } else {
        onSaved(await createService(input));
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this program.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={service ? 'Edit program or service' : 'Add a program or service'}
      subtitle={forReview && !service
        ? 'Stays in "To review" until you mark the organization reviewed'
        : 'What a resident can get, and how'}
      footer={
        <div className="space-y-2">
          {missingMessage && <p className="text-sm text-priority-p1">{missingMessage}</p>}
          {error && <p className="text-sm text-priority-p1">{error}</p>}
          <button onClick={() => void save()} disabled={busy} className="btn-primary w-full">
            {busy ? 'Saving…' : service ? 'Save changes' : 'Add program or service'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="field-label field-label-required" htmlFor="rs-org">Organization</label>
          <select
            id="rs-org"
            className={fieldClass('rs-org')}
            value={partnerChoice}
            onChange={(e) => { setPartnerChoice(e.target.value); setGoToContactId(''); clear('rs-org'); }}
          >
            <option value="" disabled>— Pick from the Directory —</option>
            {orgOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value={NO_RECORD}>Not in the Directory (a program, scholarship, statewide service)</option>
          </select>
          {partnerChoice === NO_RECORD ? (
            <input
              className="field-input mt-2"
              value={providerName}
              onChange={(e) => { setProviderName(e.target.value); clear('rs-org'); }}
              placeholder="Who provides it, e.g. Reser Family Foundation"
            />
          ) : (
            <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              Organization not listed? Add it in Partnerships → Directory first, so both rooms share one record.
            </p>
          )}
          {fieldError('rs-org') && <p className="mt-1 text-xs text-priority-p1">{fieldError('rs-org')}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label field-label-required" htmlFor="rs-name">Program or service</label>
            <input id="rs-name" className={fieldClass('rs-name')} value={name} onChange={(e) => { setName(e.target.value); clear('rs-name'); }} placeholder="e.g. Vocational Rehabilitation, Men's shelter" />
            {fieldError('rs-name') && <p className="mt-1 text-xs text-priority-p1">{fieldError('rs-name')}</p>}
          </div>
          <div>
            <label className="field-label field-label-required" htmlFor="rs-type">Type</label>
            <select id="rs-type" className={fieldClass('rs-type')} value={serviceType} onChange={(e) => { setServiceType(e.target.value); clear('rs-type'); }}>
              <option value="" disabled>— Select —</option>
              {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {fieldError('rs-type') && <p className="mt-1 text-xs text-priority-p1">{fieldError('rs-type')}</p>}
          </div>
        </div>

        <div id="rs-serves" tabIndex={-1}>
          <span className="field-label field-label-required">Who it serves</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {SERVES_OPTIONS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => toggleServes(g)}
                aria-pressed={serves.includes(g)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  serves.includes(g)
                    ? 'border-sparrow-green bg-sparrow-green text-white dark:border-sparrow-dark-green dark:bg-sparrow-dark-green'
                    : 'border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-ink dark:text-sparrow-dark-ink hover:border-sparrow-green'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Pick every group that qualifies. "All people" means anyone can use it.</p>
          {fieldError('rs-serves') && <p className="mt-1 text-xs text-priority-p1">{fieldError('rs-serves')}</p>}
        </div>

        {areasReady && (
          <div id="rs-areas" tabIndex={-1}>
            <span className="field-label field-label-required">Where it's available</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {AREA_OPTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => { clear('rs-areas'); setAreas((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a])); }}
                  aria-pressed={areas.includes(a)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                    areas.includes(a)
                      ? 'border-sparrow-green bg-sparrow-green text-white dark:border-sparrow-dark-green dark:bg-sparrow-dark-green'
                      : 'border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-ink dark:text-sparrow-dark-ink hover:border-sparrow-green'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            {fieldError('rs-areas') && <p className="mt-1 text-xs text-priority-p1">{fieldError('rs-areas')}</p>}
          </div>
        )}

        <section className="space-y-3 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-green dark:text-sparrow-dark-green">For people seeking help · can go on the website</p>
          <div>
            <label className="field-label" htmlFor="rs-address">Address people go to</label>
            <input id="rs-address" className="field-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Where someone shows up for this program" />
            <label className="mt-1.5 flex items-start gap-2 text-xs text-sparrow-ink dark:text-sparrow-dark-ink">
              <input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-sparrow-green" />
              Confidential location (for example a domestic violence shelter): never published or printed. People call the program, and the program decides who gets the address.
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="rs-phone">Phone people call for help</label>
              <input id="rs-phone" className="field-input" value={helpPhone} onChange={(e) => setHelpPhone(e.target.value)} placeholder="The public help line" />
            </div>
            <div>
              <label className="field-label" htmlFor="rs-hours">Hours</label>
              <input id="rs-hours" className="field-input" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. Intake nightly at 6pm" />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="rs-how">First steps to get this program</label>
            <textarea id="rs-how" rows={3} className="field-input" value={howTo} onChange={(e) => setHowTo(e.target.value)} placeholder="e.g. Walk in during open hours and bring photo ID. Or: call to get on the waitlist. Or: needs a referral from a caseworker." />
          </div>
          <div>
            <label className="field-label" htmlFor="rs-web">Website</label>
            <input id="rs-web" className="field-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="optional" />
          </div>
        </section>

        <section className="space-y-2 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Internal only · never published</p>
          {partnerChoice && partnerChoice !== NO_RECORD && (
            <div>
              <label className="field-label" htmlFor="rs-goto">Go-to contact for this program or service</label>
              <select id="rs-goto" className="field-input" value={goToContactId} onChange={(e) => setGoToContactId(e.target.value)}>
                <option value="">— None picked —</option>
                {orgContacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.role ? `, ${c.role}` : ''}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                {orgContacts.length === 0
                  ? "This organization has no contacts yet. Add people under Contacts once it's saved, then pick one here."
                  : 'The person we call about this program, which may not be the main partnership contact. Choose from the organization\'s contacts.'}
              </p>
            </div>
          )}
          <label className="field-label" htmlFor="rs-notes">Staff notes</label>
          <textarea id="rs-notes" rows={2} className="field-input" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Notes for staff, e.g. what worked last time" />
        </section>
      </div>
    </Drawer>
  );
}

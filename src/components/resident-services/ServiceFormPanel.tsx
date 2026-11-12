import { useEffect, useMemo, useState } from 'react';
import { Drawer } from '../lcp/Drawer';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { isPersonRecord, type Partner } from '@/lib/partnerships-types';
import { fetchPartnerContacts, type PartnerContact } from '@/lib/partner-contacts';
import {
  SERVES_ALL,
  SERVES_OPTIONS,
  SERVICE_TYPES,
  createService,
  locationsReady,
  programAddresses,
  updateService,
  type ResidentService,
  type ServiceInput,
} from '@/lib/resident-services';
import { addOrgAddress, addressLine, fetchOrgAddresses, setProgramLocation, type OrgAddress } from '@/lib/locations';
import { AddressForm } from '../partnerships/OrgAddresses';

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
  onFindOrganization,
  addedOrg = null,
}: {
  open: boolean;
  service: ResidentService | null;
  partners: Pick<Partner, 'id' | 'name' | 'type' | 'sub_category'>[];
  presetPartnerId?: string | null;
  /** Adding from a "To review" item: saved as waiting for review, not checked. */
  forReview?: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
  /** "Can't find it?": opens the room's Add an organization panel (migration 0222). */
  onFindOrganization?: () => void;
  /** An organization just added or linked from that panel: picked for this program. */
  addedOrg?: { id: string; name: string } | null;
}) {
  const [partnerChoice, setPartnerChoice] = useState('');
  const [providerName, setProviderName] = useState('');
  const [name, setName] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [serves, setServes] = useState<string[]>([]);
  // Where people go (migration 0224): the organization's addresses, Remote, or Unknown.
  const [locReady, setLocReady] = useState(true);
  const [orgAddresses, setOrgAddresses] = useState<OrgAddress[]>([]);
  const [pickedAddr, setPickedAddr] = useState<string[]>([]);
  const [remote, setRemote] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [addingAddr, setAddingAddr] = useState(false);
  const [helpPhone, setHelpPhone] = useState('');
  const [hours, setHours] = useState('');
  const [howTo, setHowTo] = useState('');
  const [website, setWebsite] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [goToContactId, setGoToContactId] = useState('');
  const [orgContacts, setOrgContacts] = useState<PartnerContact[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Organizations only -- a service is offered by an organization, not a person. One just
  // added or linked from "Can't find it?" isn't visible to this person until the program is
  // saved, so it's added to the list here.
  const orgOptions = useMemo(() => {
    const list: Pick<Partner, 'id' | 'name'>[] = partners.filter((p) => !isPersonRecord(p));
    if (addedOrg && !list.some((p) => p.id === addedOrg.id)) list.push(addedOrg);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [partners, addedOrg]);

  useEffect(() => {
    if (open && addedOrg) { setPartnerChoice(addedOrg.id); setGoToContactId(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addedOrg]);

  useEffect(() => {
    if (!open) return;
    setPartnerChoice(service ? (service.partner_id ?? NO_RECORD) : (presetPartnerId ?? ''));
    setProviderName(service?.provider_name ?? '');
    setName(service?.name ?? '');
    setServiceType(service?.service_type ?? '');
    setServes(service?.serves ?? []);
    setPickedAddr(service ? programAddresses(service).map((a) => a.id) : []);
    setRemote(!!service?.location_remote);
    setUnknown(!!service?.location_unknown);
    setAddingAddr(false);
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
    if (open) void locationsReady().then(setLocReady);
  }, [open]);

  // The chosen organization's addresses, to tick where people go.
  useEffect(() => {
    if (!open || !partnerChoice || partnerChoice === NO_RECORD) { setOrgAddresses([]); return; }
    let cancelled = false;
    void fetchOrgAddresses(partnerChoice).then((res) => { if (!cancelled) setOrgAddresses(res.addresses); });
    return () => { cancelled = true; };
  }, [open, partnerChoice]);

  // Unknown stands alone: ticking it clears the rest, and ticking anything else clears it.
  const tickAddress = (id: string) => {
    clear('rs-where');
    setUnknown(false);
    setPickedAddr((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const tickRemote = () => { clear('rs-where'); setUnknown(false); setRemote((v) => !v); };
  const tickUnknown = () => {
    clear('rs-where');
    const next = !unknown;
    setUnknown(next);
    if (next) { setPickedAddr([]); setRemote(false); }
  };

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
    { key: 'rs-where', label: 'Where people go', valid: !locReady || unknown || remote || pickedAddr.some((id) => orgAddresses.some((a) => a.id === id)) },
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
      help_phone: helpPhone.trim() || null,
      hours: hours.trim() || null,
      how_to_access: howTo.trim() || null,
      website: website.trim() || null,
      internal_notes: internalNotes.trim() || null,
      // Only sent when there's something to save or clear, so saving works even before 0200 adds the column.
      ...(goToContactId || service?.go_to_contact_id ? { go_to_contact_id: goToContactId || null } : {}),
      ...(forReview && !service ? { needs_review: true } : {}),
    };
    const location = {
      addressIds: partnerChoice === NO_RECORD ? [] : pickedAddr.filter((id) => orgAddresses.some((a) => a.id === id)),
      remote,
      unknown,
    };
    setBusy(true);
    setError(null);
    try {
      const id = service ? service.id : await createService(input);
      if (service) await updateService(service.id, input);
      if (locReady) await setProgramLocation(id, location);
      onSaved(id);
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
            onFindOrganization ? (
              <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                Can't find it?{' '}
                <button type="button" onClick={onFindOrganization} className="font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
                  Add a new organization
                </button>
              </p>
            ) : (
              <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                Organization not listed? Add it in Partnerships → Directory first, so both rooms share one record.
              </p>
            )
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

        <section className="space-y-3 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-green dark:text-sparrow-dark-green">For people seeking help · can go on the website</p>
          <div id="rs-where" tabIndex={-1} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="field-label field-label-required">Where people go for this program</span>
              {locReady && partnerChoice && partnerChoice !== NO_RECORD && !addingAddr && (
                <button type="button" onClick={() => setAddingAddr(true)} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
                  + Add an address
                </button>
              )}
            </div>
            {!locReady ? (
              <p className="text-xs text-amber-800 dark:text-amber-200">Locations are waiting on a database update (migration 0224). You can save the rest now and add where people go once it runs.</p>
            ) : (
              <>
                {orgAddresses.map((a) => (
                  <LocationCard key={a.id} checked={pickedAddr.includes(a.id)} onToggle={() => tickAddress(a.id)} title={a.label} sub={addressLine(a)} private={a.is_private} />
                ))}
                {addingAddr && partnerChoice && partnerChoice !== NO_RECORD && (
                  <AddressForm
                    onCancel={() => setAddingAddr(false)}
                    onSave={async (input) => {
                      const added = await addOrgAddress(partnerChoice, input);
                      setOrgAddresses((prev) => [...prev, added]);
                      tickAddress(added.id);
                      setAddingAddr(false);
                    }}
                  />
                )}
                <LocationCard checked={remote} onToggle={tickRemote} title="Remote" sub="By video call or phone" />
                <LocationCard checked={unknown} onToggle={tickUnknown} title="Unknown" sub="Not sure yet. Fill it in when you find out." />
                <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Tick every place people can go. Not sure? Tick Unknown.</p>
              </>
            )}
            {fieldError('rs-where') && <p className="text-xs text-priority-p1">{fieldError('rs-where')}</p>}
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

/** One choice in "Where people go": an address, Remote or Unknown, all in the same card style. */
function LocationCard({ checked, onToggle, title, sub, private: isPrivate = false }: {
  checked: boolean; onToggle: () => void; title: string; sub: string; private?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
        checked
          ? 'border-sparrow-green bg-sparrow-green/5 dark:border-sparrow-dark-green'
          : 'border-sparrow-rule dark:border-sparrow-dark-border hover:border-sparrow-green'
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-0.5 h-4 w-4 accent-sparrow-green" />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className={`block text-xs ${isPrivate ? 'text-purple-700 dark:text-purple-300' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}>{sub}</span>
      </span>
    </label>
  );
}

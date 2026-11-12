import { useEffect, useState } from 'react';
import type { Profile } from '@/lib/types';
import { createPartner, findPossibleDuplicatePartner } from '@/lib/partnerships';
import { sendToResidentServices } from '@/lib/resident-services';
import {
  PARTNER_STAGE,
  PARTNER_SUB_CATEGORY,
  PARTNER_TYPE,
  PARTNER_TYPES,
  SUB_CATEGORIES_FOR_TYPE,
  categoriesPatch,
  VOLUNTEER_SUB_CATEGORIES,
  VOLUNTEER_SUB_CATEGORY,
  type VolunteerSubCategory,
  composePartnerName,
  type PartnerStage,
  type PartnerSubCategory,
  type PartnerType,
} from '@/lib/partnerships-types';

/** Naive client-side mirror of migration 0194's split (last word = last name) — just a
 *  starting guess when someone switches an existing Name entry over to Individual;
 *  freely editable from there. */
function guessNameSplit(full: string): { first: string; last: string } {
  const trimmed = full.trim();
  const idx = trimmed.lastIndexOf(' ');
  if (idx === -1) return { first: '', last: trimmed };
  return { first: trimmed.slice(0, idx).trim(), last: trimmed.slice(idx + 1).trim() };
}
import { Drawer } from '../lcp/Drawer';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { createInterest, setPartnerInterests, type PartnershipInterest } from '@/lib/partnership-interests';

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
    role?: string | null;
    website?: string | null;
    originLabel?: string;
  } | null;
  onCreatedFromContact?: (partnerId: string) => void;
}) {
  const [name, setName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // No default -- staff must actively pick at least one category (previously defaulted to
  // 'donor', which silently mistyped anyone added via "Add to Directory" from a non-donor
  // context). All categories are equal; there's no "main" one (Susanna, 2026-11-05).
  const [categories, setCategories] = useState<PartnerType[]>([]);
  const [subCategory, setSubCategory] = useState<PartnerSubCategory | ''>('');
  const [volunteerSubs, setVolunteerSubs] = useState<VolunteerSubCategory[]>([]);
  const isVolunteerAnywhere = categories.includes('volunteer');
  // Donor/Community records say what they are (Individual, Church...); a Volunteer-only
  // record is always a person.
  const needsSubCategory = categories.includes('donor') || categories.includes('community');
  const volunteerOnly = categories.length === 1 && categories[0] === 'volunteer';
  const [interestIds, setInterestIds] = useState<string[]>([]);
  const [stage, setStage] = useState<PartnerStage>('prospect');
  const [ownerId, setOwnerId] = useState<string>('');
  const [contactName, setContactName] = useState('');
  const [role, setRole] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [alsoSendToRs, setAlsoSendToRs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  // Only offered when prefilled from a connection/contact that names an organization: is the
  // Directory record for the organization (person becomes its contact) or the person themself?
  const [recordFor, setRecordFor] = useState<'org' | 'person'>('org');

  const prefillPerson = initialValues?.name?.trim() ?? '';
  const prefillOrg = initialValues?.organization?.trim() ?? '';
  const prefillRole = initialValues?.role?.trim() ?? '';

  function applyRecordFor(mode: 'org' | 'person') {
    setRecordFor(mode);
    if (mode === 'org') {
      setName(prefillOrg);
      setContactName(prefillPerson);
      setRole(prefillRole);
    } else {
      setName(prefillPerson);
      setContactName('');
      setRole('');
    }
    setFirstName('');
    setLastName('');
    setSubCategory('');
    setDuplicateWarning(null);
  }

  useEffect(() => {
    if (open) {
      setFirstName('');
      setLastName('');
      setCategories([]);
      setSubCategory('');
      setVolunteerSubs([]);
      setInterestIds([]);
      setStage('prospect');
      setOwnerId(defaultOwnerId ?? '');
      if (prefillOrg) {
        // Default: the organization is the relationship, the person is its contact.
        setRecordFor('org');
        setName(prefillOrg);
        setContactName(prefillPerson);
        setRole(prefillRole);
      } else {
        setRecordFor('person');
        setName(initialValues?.name ?? '');
        setContactName('');
        setRole(initialValues?.role ?? '');
      }
      setWebsite(initialValues?.website ?? '');
      setEmail(initialValues?.email ?? '');
      setPhone(initialValues?.phone ?? '');
      setAddress('');
      setSource(initialValues?.source ?? '');
      setNotes(initialValues?.notes ?? '');
      setAlsoSendToRs(false);
      setError(null);
      setBusy(false);
      setDuplicateWarning(null);
      resetValidation();
    }
  }, [open, defaultOwnerId, initialValues]);

  const { missingMessage, validate, fieldClass, fieldError, clear, reset: resetValidation } = useRequiredFields([
    { key: 'pa-name', label: 'Name', valid: name.trim().length > 0 },
    { key: 'pa-type', label: 'Categories', valid: categories.length > 0 },
    { key: 'pa-subcategory', label: 'Sub-category', valid: !needsSubCategory || subCategory !== '' },
    { key: 'pa-volsubs', label: 'Volunteer sub-categories', valid: !isVolunteerAnywhere || volunteerSubs.length > 0 },
  ]);

  function pickCategories(next: PartnerType[]) {
    setCategories(next);
    clear('pa-type');
    // A Volunteer-only record is always a person (the Volunteer sub-categories are kinds of
    // volunteering, not an entity type) -- seed First/Last from whatever's already in Name
    // right away, same as picking Individual does.
    if (next.length === 1 && next[0] === 'volunteer') {
      setSubCategory('individual');
      if (!firstName && !lastName && name.trim()) {
        const guess = guessNameSplit(name);
        setFirstName(guess.first);
        setLastName(guess.last);
      }
    }
  }

  async function save() {
    if (!validate() || categories.length === 0) return;
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

    // Added as the person, not their organization: the Directory has no Organization field,
    // so keep where they're connected from in the notes rather than dropping it.
    const affiliation = recordFor === 'person' && prefillOrg
      ? `Connected through ${prefillOrg}${prefillRole ? ` (${prefillRole})` : ''}.`
      : null;
    const finalNotes = [affiliation, notes.trim()].filter(Boolean).join('\n\n');

    setBusy(true);
    setError(null);
    try {
      const newPartnerId = await createPartner({
        name: trimmedName,
        ...categoriesPatch({ sub_category: subCategory || null }, categories),
        ...(isVolunteerAnywhere ? { volunteer_sub_categories: volunteerSubs } : {}),
        first_name: isPerson ? (firstName.trim() || null) : null,
        last_name: isPerson ? (lastName.trim() || null) : null,
        stage,
        owner_id: ownerId || null,
        contact_name: contactName.trim() || null,
        role: role.trim() || null,
        website: website.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        donor_tier: null,
        source: source.trim() || null,
        notes: finalNotes || null,
      });
      if (interestIds.length > 0) {
        await setPartnerInterests(newPartnerId, interestIds);
      }
      if (alsoSendToRs && !isPerson) {
        // The record is already saved; failing to send (e.g. before migration 0206 runs)
        // shouldn't make the add look failed. It can be sent later from its drawer.
        await sendToResidentServices(newPartnerId).catch(() => undefined);
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

  const isPerson = subCategory === 'individual' || volunteerOnly;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add partner"
      subtitle="Stage starts at Prospect"
      footer={
        <div className="space-y-2">
          {missingMessage && <p className="text-sm text-priority-p1">{missingMessage}</p>}
          {duplicateWarning && <p className="text-sm text-priority-p1">{duplicateWarning}</p>}
          {categories.length > 0 && !isPerson && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={alsoSendToRs}
                onChange={(e) => setAlsoSendToRs(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-sparrow-green"
              />
              <span>
                Also send to Resident Services
                <span className="block text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                  For organizations residents could get help from. Resident Services staff review it and add the programs.
                </span>
              </span>
            </label>
          )}
          <button onClick={save} disabled={busy} className="btn-primary w-full">
            {busy ? 'Adding…' : duplicateWarning ? 'Add anyway' : 'Add partner'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {initialValues && (
          <p className="rounded-lg bg-sparrow-green/10 px-3 py-2 text-xs text-sparrow-green dark:text-sparrow-dark-green">
            Prefilled from {initialValues.name}'s {initialValues.originLabel ?? 'details'}. Pick a category and sub-category to add them to the Directory.
          </p>
        )}
        {initialValues && prefillOrg && (
          <fieldset className="space-y-2 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border px-3 py-2.5">
            <legend className="field-label px-1">Who is this Directory record for?</legend>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
              <input type="radio" name="pa-record-for" className="mt-1 accent-sparrow-green" checked={recordFor === 'org'} onChange={() => applyRecordFor('org')} />
              <span>
                <span className="font-medium">{prefillOrg}</span>
                <span className="block text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                  The organization — {prefillPerson}{prefillRole ? ` (${prefillRole})` : ''} is listed as its contact person
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
              <input type="radio" name="pa-record-for" className="mt-1 accent-sparrow-green" checked={recordFor === 'person'} onChange={() => applyRecordFor('person')} />
              <span>
                <span className="font-medium">{prefillPerson}</span>
                <span className="block text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                  The individual, personally — not on behalf of {prefillOrg}
                </span>
              </span>
            </label>
          </fieldset>
        )}
        {isPerson ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label field-label-required" htmlFor="pa-first-name">First name</label>
              <input
                id="pa-first-name"
                className={fieldClass('pa-name')}
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  setName(composePartnerName(e.target.value, lastName));
                  clear('pa-name');
                  setDuplicateWarning(null);
                }}
              />
            </div>
            <div>
              <label className="field-label field-label-required" htmlFor="pa-last-name">Last name</label>
              <input
                id="pa-last-name"
                className={fieldClass('pa-name')}
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  setName(composePartnerName(firstName, e.target.value));
                  clear('pa-name');
                  setDuplicateWarning(null);
                }}
              />
            </div>
            {fieldError('pa-name') && <p className="col-span-2 mt-1 text-xs text-priority-p1">{fieldError('pa-name')}</p>}
          </div>
        ) : (
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
        )}

        <div id="pa-type" tabIndex={-1}>
          <label className="field-label field-label-required">Categories</label>
          <MultiSelectDropdown
            options={PARTNER_TYPES.map((t) => ({ value: t, label: PARTNER_TYPE[t].label, icon: PARTNER_TYPE[t].icon }))}
            selected={categories}
            onChange={(next) => pickCategories(next as PartnerType[])}
            placeholder="Pick one or more"
          />
          {fieldError('pa-type') && <p className="mt-1 text-xs text-priority-p1">{fieldError('pa-type')}</p>}
        </div>

        {(needsSubCategory || isVolunteerAnywhere) && (
          <div className="grid grid-cols-2 gap-3">
            {needsSubCategory && (
              <div>
                <label className="field-label field-label-required" htmlFor="pa-subcategory">Sub-category</label>
                <select
                  id="pa-subcategory"
                  className={fieldClass('pa-subcategory')}
                  value={subCategory}
                  onChange={(e) => {
                    const next = e.target.value as PartnerSubCategory;
                    setSubCategory(next);
                    clear('pa-subcategory');
                    // Switching into Individual for the first time: seed First/Last from
                    // whatever's already in Name so nothing typed so far is lost.
                    if (next === 'individual' && subCategory !== 'individual' && !firstName && !lastName && name.trim()) {
                      const guess = guessNameSplit(name);
                      setFirstName(guess.first);
                      setLastName(guess.last);
                    }
                  }}
                >
                  <option value="" disabled>— Select —</option>
                  {SUB_CATEGORIES_FOR_TYPE.donor.map((sc) => (
                    <option key={sc} value={sc}>{PARTNER_SUB_CATEGORY[sc]}</option>
                  ))}
                </select>
                {fieldError('pa-subcategory') && <p className="mt-1 text-xs text-priority-p1">{fieldError('pa-subcategory')}</p>}
              </div>
            )}
            {isVolunteerAnywhere && (
              <div id="pa-volsubs" tabIndex={-1}>
                <label className="field-label field-label-required">Volunteer sub-categories</label>
                <MultiSelectDropdown
                  options={VOLUNTEER_SUB_CATEGORIES.map((v) => ({ value: v, label: VOLUNTEER_SUB_CATEGORY[v] }))}
                  selected={volunteerSubs}
                  onChange={(next) => { setVolunteerSubs(next as VolunteerSubCategory[]); clear('pa-volsubs'); }}
                  placeholder="Pick at least one"
                />
                {fieldError('pa-volsubs') && <p className="mt-1 text-xs text-priority-p1">{fieldError('pa-volsubs')}</p>}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="field-label" htmlFor="pa-stage">Stage</label>
          <select id="pa-stage" className="field-input" value={stage} onChange={(e) => setStage(e.target.value as PartnerStage)}>
            {(['prospect', 'active'] as PartnerStage[]).map((s) => (
              <option key={s} value={s}>{PARTNER_STAGE[s].label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            Add Active Donors and Volunteers to TSM in Brevo. For Community Partners, use judgment — usually at least one leader. Prospects aren't added yet.
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
        </div>

        <div className={`grid grid-cols-2 gap-3 ${isPerson ? 'opacity-50' : ''}`}>
          <div>
            <label className="field-label" htmlFor="pa-contact">Primary Contact Person</label>
            <input id="pa-contact" className="field-input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label className="field-label" htmlFor="pa-role">Role / title</label>
            <input id="pa-role" className="field-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="optional" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="pa-phone">Phone</label>
            <input id="pa-phone" className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label className="field-label" htmlFor="pa-email">Email</label>
            <input id="pa-email" type="email" className="field-input" value={email} onChange={(e) => { setEmail(e.target.value); setDuplicateWarning(null); }} placeholder="optional" />
          </div>
        </div>

        <div className={isPerson ? 'opacity-50' : ''}>
          <label className="field-label" htmlFor="pa-website">Website</label>
          <input id="pa-website" className="field-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="optional" />
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

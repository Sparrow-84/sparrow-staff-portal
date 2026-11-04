import { useEffect, useState } from 'react';
import type { Profile } from '@/lib/types';
import { createPartner, emitFirstTimeDonorTask, findPossibleDuplicatePartner } from '@/lib/partnerships';
import {
  PARTNER_STAGE,
  PARTNER_SUB_CATEGORY,
  PARTNER_TYPE,
  PARTNER_TYPES,
  SUB_CATEGORIES_FOR_TYPE,
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
  // No default -- staff must actively pick a category (previously defaulted to 'donor', which
  // silently mistyped anyone added via "Add to Directory" from a non-donor context).
  const [type, setType] = useState<PartnerType | ''>('');
  const [subCategory, setSubCategory] = useState<PartnerSubCategory | ''>('');
  const [secondaryTypes, setSecondaryTypes] = useState<PartnerType[]>([]);
  const [interestIds, setInterestIds] = useState<string[]>([]);
  const [stage, setStage] = useState<PartnerStage>('prospect');
  const [ownerId, setOwnerId] = useState<string>('');
  const [contactName, setContactName] = useState('');
  const [organization, setOrganization] = useState('');
  const [role, setRole] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? '');
      setFirstName('');
      setLastName('');
      setType('');
      setSubCategory('');
      setSecondaryTypes([]);
      setInterestIds([]);
      setStage('prospect');
      setOwnerId(defaultOwnerId ?? '');
      setContactName('');
      setOrganization(initialValues?.organization ?? '');
      setRole(initialValues?.role ?? '');
      setWebsite(initialValues?.website ?? '');
      setEmail(initialValues?.email ?? '');
      setPhone(initialValues?.phone ?? '');
      setAddress('');
      setSource(initialValues?.source ?? '');
      setNotes(initialValues?.notes ?? '');
      setError(null);
      setBusy(false);
      setDuplicateWarning(null);
      resetValidation();
    }
  }, [open, defaultOwnerId, initialValues]);

  const { missingMessage, validate, fieldClass, fieldError, clear, reset: resetValidation } = useRequiredFields([
    { key: 'pa-name', label: 'Name', valid: name.trim().length > 0 },
    { key: 'pa-type', label: 'Category', valid: type !== '' },
    { key: 'pa-subcategory', label: 'Sub-category', valid: subCategory !== '' },
  ]);

  function pickType(t: PartnerType) {
    setType(t);
    // Reset sub-category when the category changes -- the options differ per category
    // (e.g. Volunteer only offers Prayer), so a stale pick from the old category shouldn't
    // silently carry over.
    setSubCategory('');
    // Volunteer is always a person (its one sub-category, Prayer, describes a kind of
    // volunteering, not an entity type) -- seed First/Last from whatever's already in Name
    // right away, same as switching a Donor/Community sub-category to Individual does,
    // rather than waiting on a sub-category pick that's about to be forced anyway.
    if (t === 'volunteer' && !firstName && !lastName && name.trim()) {
      const guess = guessNameSplit(name);
      setFirstName(guess.first);
      setLastName(guess.last);
    } else {
      setFirstName('');
      setLastName('');
    }
    clear('pa-type');
    setSecondaryTypes((prev) => prev.filter((s) => s !== t)); // can't tag the same category twice
  }

  async function save() {
    if (!validate() || type === '' || subCategory === '') return;
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
        sub_category: subCategory,
        first_name: isPerson ? (firstName.trim() || null) : null,
        last_name: isPerson ? (lastName.trim() || null) : null,
        stage,
        owner_id: ownerId || null,
        organization: organization.trim() || null,
        contact_name: contactName.trim() || null,
        role: role.trim() || null,
        website: website.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        donor_tier: type === 'donor' ? 'first_time' : null,
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

  const subCategoryOptions = type ? SUB_CATEGORIES_FOR_TYPE[type] : [];
  // Volunteer has no organization sub-category at all today -- its only option, 'prayer',
  // describes a kind of volunteering, not an entity type -- so every Volunteer is a person.
  const isPerson = subCategory === 'individual' || type === 'volunteer';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add partner"
      subtitle="Name a category and sub-category — stage starts at Prospect"
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
            Prefilled from {initialValues.name}'s {initialValues.originLabel ?? 'My Contacts entry'}. Pick a category and sub-category to add them to the Directory.
          </p>
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

        <div className={isPerson ? 'opacity-50' : ''}>
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
            <label className="field-label field-label-required" htmlFor="pa-type">Category</label>
            <select
              id="pa-type"
              className={fieldClass('pa-type')}
              value={type}
              onChange={(e) => pickType(e.target.value as PartnerType)}
            >
              <option value="" disabled>— Select category —</option>
              {PARTNER_TYPES.map((t) => (
                <option key={t} value={t}>{PARTNER_TYPE[t].label}</option>
              ))}
            </select>
            {fieldError('pa-type') && <p className="mt-1 text-xs text-priority-p1">{fieldError('pa-type')}</p>}
          </div>
          <div>
            <label className="field-label field-label-required" htmlFor="pa-subcategory">Sub-category</label>
            <select
              id="pa-subcategory"
              className={fieldClass('pa-subcategory')}
              value={subCategory}
              disabled={!type}
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
              <option value="" disabled>{type ? '— Select —' : 'Pick a category first'}</option>
              {subCategoryOptions.map((sc) => (
                <option key={sc} value={sc}>{PARTNER_SUB_CATEGORY[sc]}</option>
              ))}
            </select>
            {fieldError('pa-subcategory') && <p className="mt-1 text-xs text-priority-p1">{fieldError('pa-subcategory')}</p>}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="pa-stage">Stage</label>
          <select id="pa-stage" className="field-input" value={stage} onChange={(e) => setStage(e.target.value as PartnerStage)}>
            {(['prospect', 'active'] as PartnerStage[]).map((s) => (
              <option key={s} value={s}>{PARTNER_STAGE[s].label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            Prospects aren't subscribed to TSM automatically — only Active relationships are.
          </p>
        </div>

        <div>
          <label className="field-label">Also a (optional)</label>
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
            Someone who's more than one kind of relationship to Sparrow — e.g. a church that's
            also a Donor. Tag the other categories here so they also show up under those
            Directory tabs; it's one record, not two.
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
            The staff member responsible for this relationship.
          </p>
        </div>

        <div className={`grid grid-cols-2 gap-3 ${isPerson ? 'opacity-50' : ''}`}>
          <div>
            <label className="field-label" htmlFor="pa-contact">Primary contact</label>
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

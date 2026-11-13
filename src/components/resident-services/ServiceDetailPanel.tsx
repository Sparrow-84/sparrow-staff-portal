import { useEffect, useState } from 'react';
import { Drawer } from '../lcp/Drawer';
import type { Profile } from '@/lib/types';
import { MOU_STATUS } from '@/lib/partnerships-types';
import {
  archiveService,
  locationLines,
  markPartnerInfoChecked,
  markServiceChecked,
  providerName,
  publicDropOffPassed,
  publishService,
  restoreService,
  unpublishService,
  updatePartnerContact,
  programAddresses,
  type ResidentService,
} from '@/lib/resident-services';
import { OrgAddresses } from '../partnerships/OrgAddresses';
import { FreshnessStamp, StillCorrectButton } from './Freshness';
import { OrgContacts } from '../partnerships/OrgContacts';
import { fetchPartnerContacts, type PartnerContact } from '@/lib/partner-contacts';
import { DirectoryCheckins } from './DirectoryCheckins';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 text-sm">
      <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{label}</span>
      <span className={value ? 'whitespace-pre-line text-sparrow-ink dark:text-sparrow-dark-ink' : 'text-sparrow-gray/60 dark:text-sparrow-dark-gray/60'}>{value || '—'}</span>
    </div>
  );
}

/** Saves on blur -- for the Directory-record fields shown inside a service. */
function BlurField({ id, label, value, placeholder, onSave }: { id: string; label: string; value: string; placeholder?: string; onSave: (v: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="field-input"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim() !== value) void onSave(draft.trim()); }}
      />
    </div>
  );
}

export function ServiceDetailPanel({
  open,
  service,
  profiles,
  currentUserId,
  isPartnershipsStaff,
  archived = false,
  onClose,
  onEdit,
  onChanged,
}: {
  open: boolean;
  service: ResidentService | null;
  profiles: Profile[];
  currentUserId: string;
  isPartnershipsStaff: boolean;
  /** Opened from the room's Archived view: read-only, with Restore. */
  archived?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [goTo, setGoTo] = useState<PartnerContact | null>(null);
  const [officeElsewhere, setOfficeElsewhere] = useState(false);
  const [confirmClearOffice, setConfirmClearOffice] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const partner = service?.partner ?? null;
  const nameFor = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name ?? null : null);

  useEffect(() => {
    if (!open || !service) return;
    setConfirmRemove(false);
    setError(null);
    setOfficeElsewhere(!!service.partner?.address);
    setConfirmClearOffice(false);
    setGoTo(null);
    if (service.partner_id && service.go_to_contact_id) {
      void fetchPartnerContacts(service.partner_id).then((res) => setGoTo(res.contacts.find((c) => c.id === service.go_to_contact_id) ?? null));
    }
  }, [open, service?.id, service?.go_to_contact_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!service) return null;

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong saving that.');
    }
  }

  const tooOldForWebsite = publicDropOffPassed(service.last_checked_at);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={providerName(service)}
      subtitle={`${service.name} · ${service.service_type}`}
      footer={archived
        ? <button onClick={() => void run(async () => { await restoreService(service.id); onClose(); })} className="btn-primary w-full">Restore to the list</button>
        : <button onClick={onEdit} className="btn-primary w-full">Edit program</button>}
    >
      <div className="space-y-5">
        {error && <p className="rounded-lg bg-priority-p1/10 px-3 py-2 text-sm text-priority-p1">{error}</p>}

        {archived && service.archived_at && (
          <p className="rounded-xl bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-3 py-2.5 text-sm">
            Archived on {shortDate(service.archived_at)}. It isn't on the list or the website. Restoring puts it back on the list. It only goes back on the website if someone clicks Publish again.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <FreshnessStamp checkedAt={service.last_checked_at} checkedBy={service.last_checked_by} how={service.last_checked_how} nameFor={nameFor} />
          {!archived && <StillCorrectButton onConfirm={(how) => run(() => markServiceChecked(service.id, how, currentUserId))} />}
        </div>

        {/* Website */}
        {!archived && (
        <section className="space-y-2 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-3">
          <p className="text-sm font-medium">Website</p>
          {service.published_at ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sparrow-green/10 px-2.5 py-0.5 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
                Published on {shortDate(service.published_at)}{nameFor(service.published_by) ? ` by ${nameFor(service.published_by)}` : ''}
              </span>
              <button onClick={() => void run(() => unpublishService(service.id))} className="btn-secondary px-2.5 py-1 text-xs">
                Remove from website
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <button onClick={() => void run(() => publishService(service.id))} className="btn-secondary px-3 py-1.5 text-sm">
                Publish to website
              </button>
              <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                Not on the website. Good practice before publishing: call them and check the public details below with them.
              </p>
            </div>
          )}
          {service.published_at && tooOldForWebsite && (
            <p className="text-xs text-priority-p1">Hidden from the website: not checked in over 2 years. Check it and click "Still correct" to bring it back.</p>
          )}
          {service.published_at && programAddresses(service).some((a) => a.is_private) && (
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Its private location shows only the city on the website, with "call them for the location".</p>
          )}
        </section>
        )}

        {/* Public details */}
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-green dark:text-sparrow-dark-green">For people seeking help · can go on the website</p>
          <div className="flex flex-wrap gap-1.5">
            {service.serves.map((g) => (
              <span key={g} className="rounded-full bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-2 py-0.5 text-xs font-medium">{g}</span>
            ))}
          </div>
          {service.location_remote === undefined ? (
            <Row label="Address" value={service.address ? `${service.address}${service.address_confidential ? '  (confidential: never published or printed)' : ''}` : null} />
          ) : (
            <Row
              label="Where people go"
              value={service.location_unknown
                ? 'Unknown. Fill it in with Edit when you find out.'
                : locationLines(service).join('\n') || 'Not filled in yet. Add it with Edit.'}
            />
          )}
          <Row label="Phone for help" value={service.help_phone} />
          <Row label="Hours" value={service.hours} />
          <Row label="First steps" value={service.how_to_access} />
          <Row label="Website" value={service.website ?? partner?.website ?? null} />
        </section>

        {/* Internal */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Internal only · never published</p>
          {partner && (
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 text-sm">
              <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Go-to contact</span>
              {goTo ? (
                <span>
                  <span className="font-medium">{goTo.name}</span>
                  {goTo.role && <span className="text-sparrow-gray dark:text-sparrow-dark-gray">, {goTo.role}</span>}
                  <span className="block select-text text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                    {[goTo.phone, goTo.email].filter(Boolean).join(' · ') || 'No phone or email on file'}
                  </span>
                </span>
              ) : (
                <span className="text-sparrow-gray/70 dark:text-sparrow-dark-gray/70">None picked. Choose one with Edit, below.</span>
              )}
            </div>
          )}
          <Row label="Staff notes" value={service.internal_notes} />

          {partner ? (
            <div className="space-y-3 rounded-xl bg-sparrow-green/5 dark:bg-sparrow-dark-surface2 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-green dark:text-sparrow-dark-green">From the Directory record · {partner.name}</p>
              <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Stored once. Changes here show in Partnerships too.</p>
              {/* Each person's own phone/email lives on their contact, separate from the help line people call. */}
              <OrgContacts partnerId={partner.id} onChanged={onChanged} />
              <OrgAddresses
                partnerId={partner.id}
                onChanged={onChanged}
                fallback={<>
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={officeElsewhere} onChange={(e) => {
                  // Unticking means the office is where people go, so the saved office
                  // address goes too (it lives on the Directory record, so ask first).
                  if (!e.target.checked && partner.address) { setConfirmClearOffice(true); return; }
                  setOfficeElsewhere(e.target.checked);
                }} className="mt-0.5 h-3.5 w-3.5 accent-sparrow-green" />
                Their office is somewhere else (not where people go for help)
              </label>
              {confirmClearOffice && (
                <div className="space-y-2 rounded-lg bg-white dark:bg-sparrow-dark-surface p-2.5 text-xs">
                  <p>Remove the office address? It's also removed from the Directory record in Partnerships.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmClearOffice(false)} className="btn-ghost px-2.5 py-1 text-xs">Keep it</button>
                    <button
                      onClick={() => void run(async () => {
                        await updatePartnerContact(partner.id, { address: null });
                        setConfirmClearOffice(false);
                        setOfficeElsewhere(false);
                      })}
                      className="btn-secondary px-2.5 py-1 text-xs"
                    >
                      Remove it
                    </button>
                  </div>
                </div>
              )}
              {officeElsewhere && (
                <BlurField id="rs-office" label="Office / mailing address" value={partner.address ?? ''} onSave={(v) => run(() => updatePartnerContact(partner.id, { address: v || null }))} />
              )}
                </>}
              />
              <div className="flex flex-wrap items-center gap-2">
                <FreshnessStamp checkedAt={partner.info_checked_at} checkedBy={partner.info_checked_by} how={partner.info_checked_how} nameFor={nameFor} />
                <StillCorrectButton onConfirm={(how) => run(() => markPartnerInfoChecked(partner.id, how, currentUserId))} />
              </div>
              <Row label="MOU" value={`${partner.mou_status ? MOU_STATUS[partner.mou_status] : 'Not set'}${isPartnershipsStaff ? '' : '  (Partnerships staff edit this)'}`} />
              {/* Shared from the Directory record (decided 2026-11-13): so nobody calls the
                  organization to ask what Partnerships already knows. Giving, donor and
                  volunteer details are never shown here. */}
              <Row label="Ask in Partnerships" value={nameFor(partner.owner_id) ?? 'No owner yet. Ask the Partnerships Coordinator.'} />
              <Row label="Notes" value={partner.notes} />
              {(partner.sparrow_provides || (partner.partner_provides_tags ?? []).length > 0) && (
                <>
                  <Row label="What Sparrow provides" value={partner.sparrow_provides} />
                  <Row label="What they provide" value={(partner.partner_provides_tags ?? []).join(', ') || null} />
                </>
              )}
              <DirectoryCheckins
                partnerId={partner.id}
                currentUserId={currentUserId}
                isAdmin={profiles.find((p) => p.id === currentUserId)?.role === 'admin'}
                nameFor={nameFor}
              />
            </div>
          ) : (
            <p className="rounded-xl bg-sparrow-mist/60 dark:bg-sparrow-dark-surface2 p-3 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              No Directory record: a program with no local organization to build a relationship with. It lives only here.
            </p>
          )}
        </section>

        {!archived && (
        <section className="border-t border-sparrow-rule dark:border-sparrow-dark-border pt-4">
          {confirmRemove ? (
            <div className="space-y-2">
              <p className="text-sm">Archive this program? It comes off the list and the website. You can restore it from Archived any time.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmRemove(false)} className="btn-ghost">Cancel</button>
                <button
                  onClick={() => void run(async () => { await archiveService(service.id); onClose(); })}
                  className="btn-secondary"
                >
                  Archive it
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmRemove(true)} className="btn-secondary px-3 py-1.5 text-sm">
              Archive this program (closed or no longer offered)
            </button>
          )}
        </section>
        )}
      </div>
    </Drawer>
  );
}

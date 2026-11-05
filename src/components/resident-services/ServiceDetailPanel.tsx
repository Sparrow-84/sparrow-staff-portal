import { useEffect, useState } from 'react';
import { Drawer } from '../lcp/Drawer';
import type { Profile } from '@/lib/types';
import { MOU_STATUS } from '@/lib/partnerships-types';
import {
  archiveService,
  fetchLatestTouchpoint,
  markPartnerInfoChecked,
  markServiceChecked,
  providerName,
  publicDropOffPassed,
  publishService,
  unpublishService,
  updatePartnerContact,
  updateService,
  type ResidentService,
} from '@/lib/resident-services';
import { FreshnessStamp, StillCorrectButton } from './Freshness';
import { OrgContacts } from '../partnerships/OrgContacts';

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

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
  ownerOptions,
  currentUserId,
  isPartnershipsStaff,
  onClose,
  onEdit,
  onChanged,
}: {
  open: boolean;
  service: ResidentService | null;
  profiles: Profile[];
  ownerOptions: Profile[];
  currentUserId: string;
  isPartnershipsStaff: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [latestNote, setLatestNote] = useState<Awaited<ReturnType<typeof fetchLatestTouchpoint>>>(null);
  const [officeElsewhere, setOfficeElsewhere] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const partner = service?.partner ?? null;
  const nameFor = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name ?? null : null);

  useEffect(() => {
    if (!open || !service) return;
    setConfirmRemove(false);
    setError(null);
    setOfficeElsewhere(!!service.partner?.address);
    setLatestNote(null);
    if (service.partner_id) void fetchLatestTouchpoint(service.partner_id).then(setLatestNote);
  }, [open, service?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      footer={<button onClick={onEdit} className="btn-primary w-full">Edit service</button>}
    >
      <div className="space-y-5">
        {error && <p className="rounded-lg bg-priority-p1/10 px-3 py-2 text-sm text-priority-p1">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <FreshnessStamp checkedAt={service.last_checked_at} checkedBy={service.last_checked_by} how={service.last_checked_how} nameFor={nameFor} />
          <StillCorrectButton onConfirm={(how) => run(() => markServiceChecked(service.id, how, currentUserId))} />
        </div>

        {/* Website */}
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
          {service.published_at && service.address_confidential && (
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">The address is confidential and never shown on the website.</p>
          )}
        </section>

        {/* Public details */}
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-green dark:text-sparrow-dark-green">For people seeking help · can go on the website</p>
          <div className="flex flex-wrap gap-1.5">
            {service.serves.map((g) => (
              <span key={g} className="rounded-full bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-2 py-0.5 text-xs font-medium">{g}</span>
            ))}
          </div>
          <Row label="Address" value={service.address ? `${service.address}${service.address_confidential ? '  (confidential, never published)' : ''}` : null} />
          <Row label="Phone for help" value={service.help_phone} />
          <Row label="Hours" value={service.hours} />
          <Row label="How to get it" value={service.how_to_access} />
          <Row label="Website" value={service.website ?? partner?.website ?? null} />
        </section>

        {/* Internal */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Internal only · never published</p>
          <Row label="Staff notes" value={service.internal_notes} />
          <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2 text-sm">
            <label className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray" htmlFor="rs-owner">Owner</label>
            <select
              id="rs-owner"
              className="field-input mt-0"
              value={service.owner_id ?? ''}
              onChange={(e) => void run(() => updateService(service.id, { owner_id: e.target.value || null }))}
            >
              <option value="">Unassigned</option>
              {ownerOptions.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            The owner gets the re-check task when this hasn't been checked in 9 months. Changing it hands that off, and the new owner gets a notification.
          </p>

          {partner ? (
            <div className="space-y-3 rounded-xl bg-sparrow-green/5 dark:bg-sparrow-dark-surface2 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-green dark:text-sparrow-dark-green">From the Directory record · {partner.name}</p>
              <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Stored once. Changes here show in Partnerships too.</p>
              {/* Each person's own phone/email lives on their contact, separate from the help line people call. */}
              <OrgContacts partnerId={partner.id} onChanged={onChanged} />
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={officeElsewhere} onChange={(e) => setOfficeElsewhere(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-sparrow-green" />
                Their office is somewhere else (not where people go for help)
              </label>
              {officeElsewhere && (
                <BlurField id="rs-office" label="Office / mailing address" value={partner.address ?? ''} onSave={(v) => run(() => updatePartnerContact(partner.id, { address: v || null }))} />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <FreshnessStamp checkedAt={partner.info_checked_at} checkedBy={partner.info_checked_by} how={partner.info_checked_how} nameFor={nameFor} />
                <StillCorrectButton onConfirm={(how) => run(() => markPartnerInfoChecked(partner.id, how, currentUserId))} />
              </div>
              <Row label="MOU" value={`${partner.mou_status ? MOU_STATUS[partner.mou_status] : 'Not set'}${isPartnershipsStaff ? '' : '  (Partnerships staff edit this)'}`} />
              <Row
                label="Latest touchpoint"
                value={latestNote ? `${shortDate(latestNote.occurred_on)}${nameFor(latestNote.logged_by) ? ` · ${nameFor(latestNote.logged_by)}` : ''}${latestNote.summary ? `: ${plainText(latestNote.summary)}` : ''}` : null}
              />
              <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Full record, notes and history: Partnerships → Directory.</p>
            </div>
          ) : (
            <p className="rounded-xl bg-sparrow-mist/60 dark:bg-sparrow-dark-surface2 p-3 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              No Directory record: a program with no local organization to build a relationship with. It lives only here.
            </p>
          )}
        </section>

        <section className="border-t border-sparrow-rule dark:border-sparrow-dark-border pt-4">
          {confirmRemove ? (
            <div className="space-y-2">
              <p className="text-sm">Remove this service from the list (and the website)? It's archived, not deleted.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmRemove(false)} className="btn-ghost">Cancel</button>
                <button
                  onClick={() => void run(async () => { await archiveService(service.id); onClose(); })}
                  className="rounded-lg bg-priority-p1 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Remove service
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmRemove(true)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">
              This service no longer exists → remove it
            </button>
          )}
        </section>
      </div>
    </Drawer>
  );
}

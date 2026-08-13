import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { localDate } from '@/lib/date';
import {
  addGrantLink,
  addGrantNotification,
  deleteGrant,
  deleteGrantDocument,
  deleteGrantLink,
  fetchGrantDocuments,
  fetchGrantLinks,
  fetchGrantNotifications,
  getGrantDocumentUrl,
  markCertified,
  setGrantStatus,
  updateGrant,
  updateGrantDocumentSummary,
  uploadGrantDocument,
  type GrantInput,
} from '@/lib/grants';
import {
  GRANT_NOTIFICATION_CATEGORIES,
  certificationTone,
  formatDate,
  notificationCategoryLabel,
  type Grant,
  type GrantDocument,
  type GrantLink,
  type GrantNotification,
  type GrantNotificationCategory,
} from '@/lib/grants-types';
import { Drawer } from '@/components/lcp/Drawer';
import { InfoTip } from '@/components/InfoTip';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import type { Profile } from '@/lib/types';

type Tab = 'details' | 'notifications';
const TABS: { key: Tab; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'notifications', label: 'Notifications' },
];


export function GrantPanel({
  open,
  grant,
  currentUserId,
  profiles,
  onClose,
  onChanged,
}: {
  open: boolean;
  grant: Grant | null;
  currentUserId: string;
  profiles: Profile[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>('details');
  const [notifications, setNotifications] = useState<GrantNotification[]>([]);
  const [documents, setDocuments] = useState<GrantDocument[]>([]);
  const [links, setLinks] = useState<GrantLink[]>([]);

  const grantId = grant?.id;

  const reload = useCallback(async () => {
    if (!grantId) return;
    const [n, d, l] = await Promise.all([fetchGrantNotifications(grantId), fetchGrantDocuments(grantId), fetchGrantLinks(grantId)]);
    setNotifications(n);
    setDocuments(d);
    setLinks(l);
  }, [grantId]);

  useEffect(() => {
    if (open && grantId) {
      setTab('details');
      void reload();
    }
  }, [open, grantId, reload]);

  if (!grant) return null;
  const changed = () => {
    void reload();
    onChanged();
  };

  return (
    <Drawer open={open} onClose={onClose} title={grant.funder_name} subtitle="Grant record">
      {grant.prior_consent_required && (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-sparrow-green/40 bg-sparrow-sage dark:bg-sparrow-green/15 px-3 py-2 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
          <span aria-hidden>⚠️</span>
          Prior consent required — do not take action on this grant (insurance, management,
          ownership, or debt changes) without the funder's sign-off first.
        </p>
      )}
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-1 text-xs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
              tab === t.key ? 'bg-white dark:bg-sparrow-dark-surface text-sparrow-green dark:text-sparrow-dark-green shadow-sm' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <DetailsTab grant={grant} profiles={profiles} onChanged={changed} onDeleted={() => { onChanged(); onClose(); }}>
          <LinksTab grantId={grant.id} links={links} currentUserId={currentUserId} onChanged={changed} />
          <DocumentsTab grantId={grant.id} docs={documents} currentUserId={currentUserId} onChanged={changed} />
        </DetailsTab>
      )}
      {tab === 'notifications' && (
        <NotificationsTab grantId={grant.id} items={notifications} currentUserId={currentUserId} onChanged={changed} />
      )}
    </Drawer>
  );
}

// ── Details ──────────────────────────────────────────────────────────
// Documents render inline at the bottom of this same tab (not a separate one) — no need
// to click over to see what's already on file while reading everything else about a grant.
function DetailsTab({
  grant,
  profiles,
  onChanged,
  onDeleted,
  children,
}: {
  grant: Grant;
  profiles: Profile[];
  onChanged: () => void;
  onDeleted: () => void;
  children: ReactNode;
}) {
  const [form, setForm] = useState<GrantInput>(() => toInput(grant));
  const [busy, setBusy] = useState(false);
  const [certBusy, setCertBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [autoSaveLabel, setAutoSaveLabel] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const skipNextAutosave = useRef(true);

  const { missingMessage, validate, fieldClass, fieldError, clear, reset: resetValidation } = useRequiredFields([
    { key: 'grant-funder-name', label: 'Funder name', valid: form.funder_name.trim().length > 0 },
  ]);

  useEffect(() => {
    setForm(toInput(grant));
    resetValidation();
    setAutoSaveLabel(null);
    skipNextAutosave.current = true;
  }, [grant]);

  function set<K extends keyof GrantInput>(key: K, value: GrantInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!validate() || busy) return;
    setBusy(true);
    try {
      await updateGrant(grant.id, form);
      setAutoSaveLabel(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  // Autosave a few seconds after the last edit — the button stays for anyone who wants
  // the peace of mind of an explicit save, but nothing is lost if you just click away.
  useEffect(() => {
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    if (!form.funder_name.trim()) return; // don't autosave over a required field left blank
    setAutoSaveLabel('Saving…');
    const t = setTimeout(() => {
      updateGrant(grant.id, form)
        .then(() => { setAutoSaveLabel('Saved automatically'); onChanged(); })
        .catch(() => setAutoSaveLabel(null));
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  async function certify() {
    setCertBusy(true);
    try {
      // Save any pending edits first so "mark certified" never clobbers a typed-but-
      // unsaved date — it rolls forward from whatever's in the box right now, not the DB.
      if (!validate()) return;
      await updateGrant(grant.id, form);
      await markCertified(grant.id, form.certification_due_date, localDate());
      onChanged();
    } finally {
      setCertBusy(false);
    }
  }

  async function toggleStatus() {
    setStatusBusy(true);
    try {
      await setGrantStatus(grant.id, grant.status === 'active' ? 'past' : 'active');
      onChanged();
    } finally {
      setStatusBusy(false);
    }
  }

  async function remove() {
    setDeleteBusy(true);
    try {
      await deleteGrant(grant.id);
      onDeleted();
    } finally {
      setDeleteBusy(false);
      setConfirmDelete(false);
    }
  }

  const tone = certificationTone(grant.certification_due_date);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-sparrow-rule/70 p-3">
        <span className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          {grant.status === 'active' ? 'Active grant' : 'Past — wrapped up'}
          <InfoTip text="Marking a grant Past doesn't delete anything — every field, link, and document stays exactly as it was. It just moves which tab it shows up in." />
        </span>
        <button onClick={toggleStatus} disabled={statusBusy} className="btn-ghost text-xs">
          {grant.status === 'active' ? 'Mark as Past Grant' : 'Reactivate as Active Grant'}
        </button>
      </div>

      <div className="rounded-xl border border-sparrow-rule/70 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
            Annual certification
            <InfoTip text="Once a year you tell the funder that you're still meeting the grant's rules — e.g. that enough spaces are still rented to qualifying low-income households. The date below is when that's due." />
          </span>
          {tone.label && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.chip}`}>{tone.label}</span>}
        </div>
        <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
          Due {formatDate(grant.certification_due_date)}
          {grant.last_certified_on && ` · last certified ${formatDate(grant.last_certified_on)}`}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="date"
            value={form.certification_due_date ?? ''}
            onChange={(e) => set('certification_due_date', e.target.value || null)}
            className="field-input mt-0 flex-1"
          />
          <button onClick={certify} disabled={certBusy} className="btn-primary shrink-0">
            Mark certified today
          </button>
        </div>
        <p className="mt-2 text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
          "Mark certified today" saves the date in the box above, records today as the completion
          date, and rolls the due date forward exactly one year. Only click it once this year's
          certification has actually been filed with the funder — not just to save a typed-in date.
        </p>
      </div>

      <label className="block" htmlFor="grant-funder-name">
        <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray field-label-required">Funder name</span>
        <input
          id="grant-funder-name"
          value={form.funder_name}
          onChange={(e) => { set('funder_name', e.target.value); clear('grant-funder-name'); }}
          className={fieldClass('grant-funder-name')}
        />
      </label>
      {fieldError('grant-funder-name') && <p className="mt-1 text-xs text-priority-p1">{fieldError('grant-funder-name')}</p>}

      <label className="block">
        <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">Amount</span>
        <input
          type="number"
          value={form.amount ?? ''}
          onChange={(e) => set('amount', e.target.value === '' ? null : Number(e.target.value))}
          className="field-input"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
            Owner
            <InfoTip text="Who's responsible for making sure this grant's to-dos actually happen — filing the certification, watching for funder emails, etc. Reminders go to this person." />
          </span>
          <select
            value={form.owner_id ?? ''}
            onChange={(e) => set('owner_id', e.target.value || null)}
            className="field-input"
          >
            <option value="">Unassigned</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
            Reminder lead time (days)
            <InfoTip text="How many days before the certification is due the owner should get a reminder task. 30 is the default — plenty of time to file with the funder." />
          </span>
          <input
            type="number"
            value={form.lead_time_days}
            onChange={(e) => set('lead_time_days', Number(e.target.value) || 0)}
            className="field-input"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
            Placed in service
            <InfoTip text="Roughly: the date the funded property started being used for its purpose — for an acquisition (like Twin Oaks), that's usually the closing/effective date, not a separate construction date." />
          </span>
          <input
            type="date"
            value={form.placed_in_service_date ?? ''}
            onChange={(e) => set('placed_in_service_date', e.target.value || null)}
            className="field-input"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
            Affordability period end
            <InfoTip text="The date the grant's income restrictions expire — after this, the funder's rules on renting to low-income households no longer apply. Often decades out; check the agreement for the exact formula." />
          </span>
          <input
            type="date"
            value={form.affordability_period_end ?? ''}
            onChange={(e) => set('affordability_period_end', e.target.value || null)}
            className="field-input"
          />
        </label>
      </div>

      <div className="rounded-xl border border-sparrow-rule/70 p-3">
        <p className="mb-2 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
          Funder contact
          <InfoTip text="Who to reach at the funder with questions or required notices. Not every funder assigns a specific person — some route everything through a general compliance address instead." />
        </p>
        <div className="space-y-2">
          <input
            value={form.funder_contact_name ?? ''}
            onChange={(e) => set('funder_contact_name', e.target.value || null)}
            placeholder="Name"
            className="field-input mt-0"
          />
          <input
            value={form.funder_contact_email ?? ''}
            onChange={(e) => set('funder_contact_email', e.target.value || null)}
            placeholder="Email"
            className="field-input mt-0"
          />
          <input
            value={form.funder_contact_phone ?? ''}
            onChange={(e) => set('funder_contact_phone', e.target.value || null)}
            placeholder="Phone"
            className="field-input mt-0"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 rounded-xl border border-sparrow-green/30 bg-sparrow-sage/50 dark:bg-sparrow-green/15 p-3">
        <input
          type="checkbox"
          checked={form.prior_consent_required}
          onChange={(e) => set('prior_consent_required', e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-sm font-medium text-sparrow-green dark:text-sparrow-dark-green">
          Prior consent required before acting
          <InfoTip text="Check this if the funder's agreement says Sparrow must get their written OK before certain actions — commonly: selling/transferring the property, changing the management company, or taking on new debt against it. Acting without asking first can be a real compliance violation, not just a formality." />
        </span>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">Notes</span>
        <textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} rows={3} className="field-input" />
      </label>

      {missingMessage && <p className="text-sm text-priority-p1">{missingMessage}</p>}
      <button onClick={save} disabled={busy} className="btn-primary w-full">
        Save changes
      </button>
      {autoSaveLabel && <p className="-mt-2 text-center text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">{autoSaveLabel} automatically</p>}

      <hr className="border-sparrow-rule dark:border-sparrow-dark-border" />
      {children}

      <hr className="border-sparrow-rule dark:border-sparrow-dark-border" />
      <div className="flex items-center justify-end">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">Delete this grant permanently?</span>
            <button onClick={() => setConfirmDelete(false)} className="btn-ghost">Cancel</button>
            <button onClick={remove} disabled={deleteBusy} className="rounded-lg bg-priority-p1 px-3 py-1.5 text-sm font-medium text-white">
              Delete
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">
            Delete this grant
          </button>
        )}
      </div>
    </div>
  );
}

function toInput(grant: Grant): GrantInput {
  return {
    funder_name: grant.funder_name,
    amount: grant.amount,
    placed_in_service_date: grant.placed_in_service_date,
    affordability_period_end: grant.affordability_period_end,
    funder_contact_name: grant.funder_contact_name,
    funder_contact_email: grant.funder_contact_email,
    funder_contact_phone: grant.funder_contact_phone,
    certification_due_date: grant.certification_due_date,
    prior_consent_required: grant.prior_consent_required,
    notes: grant.notes,
    owner_id: grant.owner_id,
    lead_time_days: grant.lead_time_days,
  };
}

// ── Links (mirrors GrantProspectPanel's LinksSection — copied over automatically
// when a prospect is awarded, so they land here instead of vanishing) ────────────
function LinksTab({
  grantId,
  links,
  currentUserId,
  onChanged,
}: {
  grantId: string;
  links: GrantLink[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!label.trim() || !url.trim() || busy) return;
    setBusy(true);
    try {
      await addGrantLink(grantId, label.trim(), url.trim(), currentUserId);
      setLabel('');
      setUrl('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Links</p>
      <div className="space-y-2 rounded-xl border border-sparrow-rule/70 p-3">
        {links.map((l) => (
          <div key={l.id} className="flex items-center gap-2 text-sm">
            <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium text-sparrow-green dark:text-sparrow-dark-green underline">
              {l.label}
            </a>
            <button onClick={() => deleteGrantLink(l.id).then(onChanged)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">
              Remove
            </button>
          </div>
        ))}
        {links.length === 0 && <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No links yet.</p>}
        <div className="flex gap-2 border-t border-dashed border-sparrow-rule dark:border-sparrow-dark-border pt-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Grant agreement portal)" className="field-input mt-0 flex-1 text-xs" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="field-input mt-0 flex-1 text-xs" />
          <button onClick={add} disabled={busy} className="btn-primary shrink-0 text-xs">
            + Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Notifications (append-only event log) ────────────────────────────
function NotificationsTab({
  grantId,
  items,
  currentUserId,
  onChanged,
}: {
  grantId: string;
  items: GrantNotification[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [category, setCategory] = useState<GrantNotificationCategory>('insurance_change');
  const [sentOn, setSentOn] = useState(() => localDate());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await addGrantNotification(grantId, category, sentOn, notes.trim() || null, currentUserId);
      setNotes('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
        Record of funder notifications actually sent — append-only, this is the compliance history.
      </p>
      <div className="space-y-2 rounded-xl border border-sparrow-rule/70 p-3">
        <span className="flex items-center text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
          What are you notifying the funder about?
          <InfoTip text="These are notices sent TO the funder about changes at the property — not Sparrow's own insurance shopping. Insurance change: a policy was cancelled, non-renewed, or swapped. Management change: a new property manager. Ownership/transfer: any change in who owns the property or Sparrow itself. Debt: any new loan that could create a lien on the property." />
        </span>
        <select value={category} onChange={(e) => setCategory(e.target.value as GrantNotificationCategory)} className="field-input mt-0">
          {GRANT_NOTIFICATION_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input type="date" value={sentOn} onChange={(e) => setSentOn(e.target.value)} className="field-input mt-0" />
          <button onClick={add} disabled={busy} className="btn-primary shrink-0">
            Log notification
          </button>
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" className="field-input mt-0" />
      </div>
      <ul className="space-y-2">
        {items.length === 0 && <li className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No notifications logged yet.</li>}
        {items.map((n) => (
          <li key={n.id} className="rounded-xl border border-sparrow-rule/70 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{notificationCategoryLabel(n.category)}</span>
              <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{formatDate(n.sent_on)}</span>
            </div>
            {n.notes && <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{n.notes}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Documents ────────────────────────────────────────────────────────
function DocumentsTab({
  grantId,
  docs,
  currentUserId,
  onChanged,
}: {
  grantId: string;
  docs: GrantDocument[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { missingMessage, validate, fieldClass, fieldError, clear } = useRequiredFields([
    { key: 'grant-doc-label', label: 'Label', valid: label.trim().length > 0 },
    { key: 'grant-doc-file', label: 'File', valid: !!fileName },
  ]);

  async function upload() {
    if (!validate()) return;
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadGrantDocument(grantId, label.trim(), file, currentUserId);
      setLabel('');
      setFileName(null);
      if (fileRef.current) fileRef.current.value = '';
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function open(doc: GrantDocument) {
    const url = await getGrantDocumentUrl(doc.storage_path);
    window.open(url, '_blank', 'noreferrer');
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Documents</p>
      <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Grant agreements and correspondence — stored privately, ops tier only.</p>
      <div className="space-y-2 rounded-xl border border-sparrow-rule/70 p-3">
        <input
          id="grant-doc-label"
          value={label}
          onChange={(e) => { setLabel(e.target.value); clear('grant-doc-label'); }}
          placeholder="Label (e.g. Signed grant agreement)"
          className={fieldClass('grant-doc-label', 'field-input mt-0')}
        />
        {fieldError('grant-doc-label') && <p className="mt-1 text-xs text-priority-p1">{fieldError('grant-doc-label')}</p>}
        <input
          id="grant-doc-file"
          ref={fileRef}
          type="file"
          onChange={(e) => { setFileName(e.target.files?.[0]?.name ?? null); clear('grant-doc-file'); }}
          className={fieldClass('grant-doc-file', 'field-input mt-0')}
        />
        {fieldError('grant-doc-file') && <p className="mt-1 text-xs text-priority-p1">{fieldError('grant-doc-file')}</p>}
        <button onClick={upload} disabled={busy} className="btn-primary w-full">
          Upload
        </button>
        {(error || missingMessage) && <p className="text-xs text-priority-p1">{error || missingMessage}</p>}
      </div>
      <ul className="divide-y divide-sparrow-rule/70 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border">
        {docs.length === 0 && <li className="p-3 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No documents yet.</li>}
        {docs.map((d) => (
          <li key={d.id} className="p-3 text-sm">
            <div className="flex items-center gap-2">
              <button onClick={() => open(d)} className="flex-1 truncate text-left font-medium text-sparrow-green dark:text-sparrow-dark-green underline">
                {d.label}
              </button>
              <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{formatDate(d.created_at)}</span>
              <button onClick={() => deleteGrantDocument(d).then(onChanged)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">
                Delete
              </button>
            </div>
            <DocumentSummary doc={d} onChanged={onChanged} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// A plain-English summary lives on the same row as its document — one record, so
// "this is a summary of this doc" is automatic rather than needing a separate link.
function DocumentSummary({ doc, onChanged }: { doc: GrantDocument; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.summary ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(doc.summary ?? '');
  }, [doc.summary]);

  async function save() {
    setBusy(true);
    try {
      await updateGrantDocumentSummary(doc.id, draft.trim() || null);
      setEditing(false);
      setExpanded(true);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-2 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          placeholder="Plain-English summary of what this document covers…"
          className="field-input mt-0 text-xs"
        />
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="btn-primary text-xs">
            Save summary
          </button>
          <button
            onClick={() => { setDraft(doc.summary ?? ''); setEditing(false); }}
            className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!doc.summary) {
    return (
      <button onClick={() => setEditing(true)} className="mt-1 text-xs text-sparrow-green dark:text-sparrow-dark-green hover:underline">
        + Add plain-English summary
      </button>
    );
  }

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline"
      >
        <span aria-hidden>{expanded ? '▾' : '▸'}</span>
        Plain-English summary
      </button>
      {expanded && (
        <div className="mt-2 rounded-lg bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-3">
          <p className="whitespace-pre-wrap text-xs text-sparrow-ink dark:text-sparrow-dark-ink">{doc.summary}</p>
          <button onClick={() => setEditing(true)} className="mt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

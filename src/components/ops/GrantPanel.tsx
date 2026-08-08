import { useCallback, useEffect, useRef, useState } from 'react';
import { localDate } from '@/lib/date';
import {
  addGrantNotification,
  deleteGrantDocument,
  fetchGrantDocuments,
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
  type GrantNotification,
  type GrantNotificationCategory,
} from '@/lib/grants-types';
import { Drawer } from '@/components/lcp/Drawer';
import { InfoTip } from '@/components/InfoTip';
import { useRequiredFields } from '@/hooks/useRequiredFields';

type Tab = 'details' | 'notifications' | 'documents';
const TABS: { key: Tab; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'documents', label: 'Documents' },
];


export function GrantPanel({
  open,
  grant,
  currentUserId,
  onClose,
  onChanged,
}: {
  open: boolean;
  grant: Grant | null;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>('details');
  const [notifications, setNotifications] = useState<GrantNotification[]>([]);
  const [documents, setDocuments] = useState<GrantDocument[]>([]);

  const grantId = grant?.id;

  const reload = useCallback(async () => {
    if (!grantId) return;
    const [n, d] = await Promise.all([fetchGrantNotifications(grantId), fetchGrantDocuments(grantId)]);
    setNotifications(n);
    setDocuments(d);
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
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-priority-p1/40 bg-priority-p1/10 px-3 py-2 text-xs font-medium text-priority-p1">
          <span aria-hidden>⚠️</span>
          Prior consent required — do not take action on this grant (insurance, management,
          ownership, or debt changes) without OHCS/funder sign-off first.
        </p>
      )}
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-sparrow-rule bg-sparrow-mist p-1 text-xs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
              tab === t.key ? 'bg-white text-sparrow-green shadow-sm' : 'text-sparrow-gray hover:text-sparrow-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'details' && <DetailsTab grant={grant} onChanged={changed} />}
      {tab === 'notifications' && (
        <NotificationsTab grantId={grant.id} items={notifications} currentUserId={currentUserId} onChanged={changed} />
      )}
      {tab === 'documents' && (
        <DocumentsTab grantId={grant.id} docs={documents} currentUserId={currentUserId} onChanged={changed} />
      )}
    </Drawer>
  );
}

// ── Details ──────────────────────────────────────────────────────────
function DetailsTab({ grant, onChanged }: { grant: Grant; onChanged: () => void }) {
  const [form, setForm] = useState<GrantInput>(() => toInput(grant));
  const [busy, setBusy] = useState(false);
  const [certBusy, setCertBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const { missingMessage, validate, fieldClass, clear, reset: resetValidation } = useRequiredFields([
    { key: 'grant-funder-name', label: 'Funder name', valid: form.funder_name.trim().length > 0 },
  ]);

  useEffect(() => { setForm(toInput(grant)); resetValidation(); }, [grant]);

  function set<K extends keyof GrantInput>(key: K, value: GrantInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!validate() || busy) return;
    setBusy(true);
    try {
      await updateGrant(grant.id, form);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function certify() {
    setCertBusy(true);
    try {
      await markCertified(grant, localDate());
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

  const tone = certificationTone(grant.certification_due_date);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-sparrow-rule/70 p-3">
        <span className="text-sm text-sparrow-gray">
          {grant.status === 'active' ? 'Active grant' : 'Past — wrapped up'}
          <InfoTip text="Marking a grant Past doesn't delete anything — every field, link, and document stays exactly as it was. It just moves which tab it shows up in." />
        </span>
        <button onClick={toggleStatus} disabled={statusBusy} className="btn-ghost text-xs">
          {grant.status === 'active' ? 'Mark as Past Grant' : 'Reactivate as Active Grant'}
        </button>
      </div>

      <div className="rounded-xl border border-sparrow-rule/70 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-sparrow-ink">
            Annual OHCS certification
            <InfoTip text="Once a year you tell the funder (OHCS) that you're still meeting the grant's rules — e.g. that enough spaces are still rented to qualifying low-income households. The date below is when that's due." />
          </span>
          {tone.label && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.chip}`}>{tone.label}</span>}
        </div>
        <p className="mt-1 text-xs text-sparrow-gray">
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
        <p className="mt-2 text-[11px] text-sparrow-gray">
          Only click "Mark certified today" once this year's certification has actually been filed with
          OHCS — it records today as done and automatically pushes the due date forward one year.
        </p>
      </div>

      <label className="block" htmlFor="grant-funder-name">
        <span className="text-xs font-medium text-sparrow-gray">Funder name</span>
        <input
          id="grant-funder-name"
          value={form.funder_name}
          onChange={(e) => { set('funder_name', e.target.value); clear('grant-funder-name'); }}
          className={fieldClass('grant-funder-name')}
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-sparrow-gray">Amount</span>
        <input
          type="number"
          value={form.amount ?? ''}
          onChange={(e) => set('amount', e.target.value === '' ? null : Number(e.target.value))}
          className="field-input"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-sparrow-gray">
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
          <span className="text-xs font-medium text-sparrow-gray">
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
        <p className="mb-2 text-xs font-medium text-sparrow-gray">
          OHCS contact
          <InfoTip text="Who to reach at the funder with questions or required notices. Not every funder assigns a specific person — some, like OHCS on this grant, route everything through a general compliance address instead." />
        </p>
        <div className="space-y-2">
          <input
            value={form.ohcs_contact_name ?? ''}
            onChange={(e) => set('ohcs_contact_name', e.target.value || null)}
            placeholder="Name"
            className="field-input mt-0"
          />
          <input
            value={form.ohcs_contact_email ?? ''}
            onChange={(e) => set('ohcs_contact_email', e.target.value || null)}
            placeholder="Email"
            className="field-input mt-0"
          />
          <input
            value={form.ohcs_contact_phone ?? ''}
            onChange={(e) => set('ohcs_contact_phone', e.target.value || null)}
            placeholder="Phone"
            className="field-input mt-0"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 rounded-xl border border-priority-p1/30 bg-priority-p1/5 p-3">
        <input
          type="checkbox"
          checked={form.prior_consent_required}
          onChange={(e) => set('prior_consent_required', e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-sm font-medium text-priority-p1">
          Prior consent required before acting
          <InfoTip text="Check this if the funder's agreement says Sparrow must get their written OK before certain actions — commonly: selling/transferring the property, changing the management company, or taking on new debt against it. Acting without asking first can be a real compliance violation, not just a formality." />
        </span>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-sparrow-gray">Notes</span>
        <textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} rows={3} className="field-input" />
      </label>

      {missingMessage && <p className="text-sm text-priority-p1">{missingMessage}</p>}
      <button onClick={save} disabled={busy} className="btn-primary w-full">
        Save changes
      </button>
    </div>
  );
}

function toInput(grant: Grant): GrantInput {
  return {
    funder_name: grant.funder_name,
    amount: grant.amount,
    placed_in_service_date: grant.placed_in_service_date,
    affordability_period_end: grant.affordability_period_end,
    ohcs_contact_name: grant.ohcs_contact_name,
    ohcs_contact_email: grant.ohcs_contact_email,
    ohcs_contact_phone: grant.ohcs_contact_phone,
    certification_due_date: grant.certification_due_date,
    prior_consent_required: grant.prior_consent_required,
    notes: grant.notes,
  };
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
      <p className="text-xs text-sparrow-gray">
        Record of funder notifications actually sent — append-only, this is the compliance history.
      </p>
      <div className="space-y-2 rounded-xl border border-sparrow-rule/70 p-3">
        <span className="flex items-center text-xs font-medium text-sparrow-gray">
          What are you notifying OHCS about?
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
        {items.length === 0 && <li className="text-sm text-sparrow-gray">No notifications logged yet.</li>}
        {items.map((n) => (
          <li key={n.id} className="rounded-xl border border-sparrow-rule/70 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-sparrow-ink">{notificationCategoryLabel(n.category)}</span>
              <span className="text-xs text-sparrow-gray">{formatDate(n.sent_on)}</span>
            </div>
            {n.notes && <p className="mt-1 text-sm text-sparrow-gray">{n.notes}</p>}
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

  const { missingMessage, validate, fieldClass, clear } = useRequiredFields([
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
      <p className="text-xs text-sparrow-gray">Grant agreements and correspondence — stored privately, ops tier only.</p>
      <div className="space-y-2 rounded-xl border border-sparrow-rule/70 p-3">
        <input
          id="grant-doc-label"
          value={label}
          onChange={(e) => { setLabel(e.target.value); clear('grant-doc-label'); }}
          placeholder="Label (e.g. Signed grant agreement)"
          className={fieldClass('grant-doc-label', 'field-input mt-0')}
        />
        <input
          id="grant-doc-file"
          ref={fileRef}
          type="file"
          onChange={(e) => { setFileName(e.target.files?.[0]?.name ?? null); clear('grant-doc-file'); }}
          className={fieldClass('grant-doc-file', 'field-input mt-0')}
        />
        <button onClick={upload} disabled={busy} className="btn-primary w-full">
          Upload
        </button>
        {(error || missingMessage) && <p className="text-xs text-priority-p1">{error || missingMessage}</p>}
      </div>
      <ul className="divide-y divide-sparrow-rule/70 rounded-xl border border-sparrow-rule">
        {docs.length === 0 && <li className="p-3 text-sm text-sparrow-gray">No documents yet.</li>}
        {docs.map((d) => (
          <li key={d.id} className="p-3 text-sm">
            <div className="flex items-center gap-2">
              <button onClick={() => open(d)} className="flex-1 truncate text-left font-medium text-sparrow-green underline">
                {d.label}
              </button>
              <span className="text-xs text-sparrow-gray">{formatDate(d.created_at)}</span>
              <button onClick={() => deleteGrantDocument(d).then(onChanged)} className="text-xs text-sparrow-gray hover:text-priority-p1">
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
            className="text-xs text-sparrow-gray hover:text-sparrow-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!doc.summary) {
    return (
      <button onClick={() => setEditing(true)} className="mt-1 text-xs text-sparrow-green hover:underline">
        + Add plain-English summary
      </button>
    );
  }

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1 text-xs font-medium text-sparrow-green hover:underline"
      >
        <span aria-hidden>{expanded ? '▾' : '▸'}</span>
        Plain-English summary
      </button>
      {expanded && (
        <div className="mt-2 rounded-lg bg-sparrow-mist p-3">
          <p className="whitespace-pre-wrap text-xs text-sparrow-ink">{doc.summary}</p>
          <button onClick={() => setEditing(true)} className="mt-2 text-xs text-sparrow-gray hover:text-sparrow-ink">
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

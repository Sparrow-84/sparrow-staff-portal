import { useCallback, useEffect, useRef, useState } from 'react';
import { localDate } from '@/lib/date';
import {
  addGrantNotification,
  deleteGrantDocument,
  fetchGrantDocuments,
  fetchGrantNotifications,
  getGrantDocumentUrl,
  markCertified,
  updateGrant,
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

  useEffect(() => setForm(toInput(grant)), [grant]);

  function set<K extends keyof GrantInput>(key: K, value: GrantInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
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

  const tone = certificationTone(grant.certification_due_date);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sparrow-rule/70 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-sparrow-ink">Annual OHCS certification</span>
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
      </div>

      <label className="block">
        <span className="text-xs font-medium text-sparrow-gray">Funder name</span>
        <input value={form.funder_name} onChange={(e) => set('funder_name', e.target.value)} className="field-input" />
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
          <span className="text-xs font-medium text-sparrow-gray">Placed in service</span>
          <input
            type="date"
            value={form.placed_in_service_date ?? ''}
            onChange={(e) => set('placed_in_service_date', e.target.value || null)}
            className="field-input"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-sparrow-gray">Affordability period end</span>
          <input
            type="date"
            value={form.affordability_period_end ?? ''}
            onChange={(e) => set('affordability_period_end', e.target.value || null)}
            className="field-input"
          />
        </label>
      </div>

      <div className="rounded-xl border border-sparrow-rule/70 p-3">
        <p className="mb-2 text-xs font-medium text-sparrow-gray">OHCS contact</p>
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
        <span className="text-sm font-medium text-priority-p1">Prior consent required before acting</span>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-sparrow-gray">Notes</span>
        <textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} rows={3} className="field-input" />
      </label>

      <button onClick={save} disabled={busy || !form.funder_name.trim()} className="btn-primary w-full">
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file || !label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await uploadGrantDocument(grantId, label.trim(), file, currentUserId);
      setLabel('');
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
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Signed grant agreement)" className="field-input mt-0" />
        <input ref={fileRef} type="file" className="field-input mt-0" />
        <button onClick={upload} disabled={busy || !label.trim()} className="btn-primary w-full">
          Upload
        </button>
        {error && <p className="text-xs text-priority-p1">{error}</p>}
      </div>
      <ul className="divide-y divide-sparrow-rule/70 rounded-xl border border-sparrow-rule">
        {docs.length === 0 && <li className="p-3 text-sm text-sparrow-gray">No documents yet.</li>}
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-2 p-3 text-sm">
            <button onClick={() => open(d)} className="flex-1 truncate text-left font-medium text-sparrow-green underline">
              {d.label}
            </button>
            <span className="text-xs text-sparrow-gray">{formatDate(d.created_at)}</span>
            <button onClick={() => deleteGrantDocument(d).then(onChanged)} className="text-xs text-sparrow-gray hover:text-priority-p1">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

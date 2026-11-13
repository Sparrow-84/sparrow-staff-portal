import { useCallback, useEffect, useState } from 'react';
import {
  addPartnerContact,
  deletePartnerContact,
  fetchPartnerContacts,
  setPrimaryContact,
  updatePartnerContactRow,
  type PartnerContact,
  type PartnerContactInput,
} from '@/lib/partner-contacts';
import { fetchServicesForPartner } from '@/lib/resident-services';
import { SharedWithRs } from './SharedWithRs';

const EMPTY: PartnerContactInput = { name: '', role: '', phone: '', email: '', notes: '' };

function clean(input: PartnerContactInput): PartnerContactInput {
  const t = (v: string | null) => (v ?? '').trim() || null;
  return { name: input.name.trim(), role: t(input.role), phone: t(input.phone), email: t(input.email), notes: t(input.notes) };
}

function ContactForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: PartnerContactInput;
  submitLabel: string;
  onSubmit: (input: PartnerContactInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof PartnerContactInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.name.trim()) { setError('Add their name.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(clean(form));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this contact.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-3">
      <div className="grid grid-cols-2 gap-2">
        <input className="field-input mt-0" placeholder="Name" value={form.name} onChange={set('name')} aria-label="Name" autoFocus />
        <input className="field-input mt-0" placeholder="Role, e.g. Executive Director" value={form.role ?? ''} onChange={set('role')} aria-label="Role" />
        <input className="field-input mt-0" placeholder="Their phone" value={form.phone ?? ''} onChange={set('phone')} aria-label="Phone" />
        <input className="field-input mt-0" type="email" placeholder="Their email" value={form.email ?? ''} onChange={set('email')} aria-label="Email" />
      </div>
      <input className="field-input mt-0" placeholder="Notes (optional), e.g. best for referral questions" value={form.notes ?? ''} onChange={set('notes')} aria-label="Notes" />
      {error && <p className="text-xs text-priority-p1">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost text-xs">Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={busy} className="btn-primary text-xs">{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </div>
  );
}

/** Everyone we know at an organization, each with their role; ★ marks the primary contact
 *  (the one shown in the Directory's Contact Person column). Renders nothing until
 *  migration 0200 runs. Used in the Directory record drawer and in a Resident Services
 *  service, so either team can keep it current. */
export function OrgContacts({ partnerId, onChanged, shared = false }: {
  partnerId: string;
  onChanged?: () => void;
  /** Show the "Shared with Resident Services" tag (Directory drawer only). */
  shared?: boolean;
}) {
  const [contacts, setContacts] = useState<PartnerContact[]>([]);
  const [available, setAvailable] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // contact id -> the programs/services they're the go-to for (shown under their name, so
  // Partnerships staff see who Resident Services calls about what).
  const [goToFor, setGoToFor] = useState<Map<string, string[]>>(new Map());

  const load = useCallback(async () => {
    const [res, services] = await Promise.all([fetchPartnerContacts(partnerId), fetchServicesForPartner(partnerId)]);
    setContacts(res.contacts);
    setAvailable(res.available);
    const map = new Map<string, string[]>();
    for (const s of services) {
      if (!s.go_to_contact_id) continue;
      map.set(s.go_to_contact_id, [...(map.get(s.go_to_contact_id) ?? []), s.name]);
    }
    setGoToFor(map);
  }, [partnerId]);

  useEffect(() => {
    setAdding(false);
    setEditingId(null);
    setConfirmDeleteId(null);
    void load();
  }, [load]);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  if (!available) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="field-label">Contacts <SharedWithRs show={shared} className="ml-1.5" /></span>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
            + Add a contact
          </button>
        )}
      </div>
      {error && <p className="text-xs text-priority-p1">{error}</p>}
      {contacts.length === 0 && !adding && (
        <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No contacts yet. Add the people we know there.</p>
      )}
      {contacts.map((c) =>
        editingId === c.id ? (
          <ContactForm
            key={c.id}
            initial={{ name: c.name, role: c.role, phone: c.phone, email: c.email, notes: c.notes }}
            submitLabel="Save"
            onCancel={() => setEditingId(null)}
            onSubmit={(input) => run(async () => { await updatePartnerContactRow(c.id, input); setEditingId(null); })}
          />
        ) : (
          <div key={c.id} className="group flex items-start gap-2 rounded-xl border border-sparrow-rule/70 dark:border-sparrow-dark-border px-3 py-2">
            <button
              type="button"
              onClick={() => { if (!c.is_primary) void run(() => setPrimaryContact(partnerId, c.id)); }}
              title={c.is_primary ? 'Primary contact' : 'Make primary contact'}
              aria-label={c.is_primary ? 'Primary contact' : `Make ${c.name} the primary contact`}
              className={`mt-0.5 text-base leading-none ${c.is_primary ? 'text-sparrow-gold' : 'text-sparrow-gray/40 hover:text-sparrow-gold'}`}
            >
              {c.is_primary ? '★' : '☆'}
            </button>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                {c.name}
                {c.role && <span className="font-normal text-sparrow-gray dark:text-sparrow-dark-gray">, {c.role}</span>}
              </p>
              <p className="select-text text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                {[c.phone, c.email].filter(Boolean).join(' · ') || 'No phone or email yet'}
              </p>
              {c.notes && <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{c.notes}</p>}
              {goToFor.get(c.id) && (
                <p className="text-xs text-sparrow-green dark:text-sparrow-dark-green">Go-to for: {goToFor.get(c.id)!.join(', ')}</p>
              )}
            </div>
            {confirmDeleteId === c.id ? (
              <span className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs">
                {goToFor.get(c.id) && <span className="text-priority-p1">Clears them as go-to for {goToFor.get(c.id)!.join(', ')}.</span>}
                <button onClick={() => setConfirmDeleteId(null)} className="text-sparrow-gray">Keep</button>
                <button onClick={() => void run(() => deletePartnerContact(c.id))} className="font-medium text-priority-p1">Remove</button>
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-2 text-xs opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <button onClick={() => setEditingId(c.id)} className="text-sparrow-green dark:text-sparrow-dark-green">Edit</button>
                <button onClick={() => setConfirmDeleteId(c.id)} className="text-sparrow-gray hover:text-priority-p1">Remove</button>
              </span>
            )}
          </div>
        ),
      )}
      {adding && (
        <ContactForm
          initial={EMPTY}
          submitLabel="Add contact"
          onCancel={() => setAdding(false)}
          onSubmit={(input) => run(async () => { await addPartnerContact(partnerId, input, contacts.length === 0); setAdding(false); })}
        />
      )}
      {contacts.length > 1 && (
        <p className="text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">★ marks the primary contact, the one shown in the Directory.</p>
      )}
    </div>
  );
}

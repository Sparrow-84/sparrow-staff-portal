import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { ContactFields } from '@/components/ContactFields';
import {
  createContact,
  deleteContact,
  fetchMyContacts,
  updateContact,
  type PersonalContact,
  type PersonalContactInput,
} from '@/lib/personalContacts';

function emptyForm(): PersonalContactInput {
  return { name: '', organization: '', relationship: '', phone: '', email: '', notes: '' };
}

function toForm(c: PersonalContact): PersonalContactInput {
  return {
    name: c.name,
    organization: c.organization,
    relationship: c.relationship,
    phone: c.phone ?? '',
    email: c.email ?? '',
    notes: c.notes,
  };
}

function ContactCard({ contact, onSave, onDelete }: {
  contact: PersonalContact;
  onSave: (input: PersonalContactInput) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PersonalContactInput>(toForm(contact));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this contact.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 space-y-3">
        <ContactFields form={form} onChange={setForm} />
        {error && <p className="text-sm text-priority-p1">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { setForm(toForm(contact)); setEditing(false); setError(null); }}
            className="btn-ghost text-sm"
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="group rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{contact.name}</p>
          {contact.organization && <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{contact.organization}</p>}
          {contact.relationship && <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Connection: {contact.relationship}</p>}
          <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            {contact.phone && <span>{contact.phone}</span>}
            {contact.email && <span>{contact.email}</span>}
          </div>
          {contact.notes && <p className="mt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{contact.notes}</p>}
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
          <button onClick={() => setEditing(true)} className="rounded p-1 text-sparrow-gray/70 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink" title="Edit" aria-label="Edit contact">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button onClick={() => void onDelete()} className="rounded p-1 text-sparrow-gray/70 hover:text-priority-p1" title="Delete" aria-label="Delete contact">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export function MyContactsView() {
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<PersonalContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<PersonalContactInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    void fetchMyContacts(profile.id).then(setContacts).finally(() => setLoading(false));
  }, [profile]);

  if (!profile) return null;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const created = await createContact(profile!.id, form);
      setContacts((prev) => [created, ...prev]);
      setForm(emptyForm());
      setShowAddForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save this contact. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(id: string, input: PersonalContactInput) {
    await updateContact(id, input);
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...input } : c)));
  }

  async function handleDelete(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    await deleteContact(id);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-semibold">My Contacts</h1>
        <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          A personal list of people you think Sparrow should know about — a relative in ministry, a
          former coworker, anyone worth staying connected to as part of Sparrow's network. This is
          mostly a one-time thing to fill out, not a tool you'll use often. Partnerships staff can see
          everyone's list to consider reaching out down the road.
        </p>
      </div>

      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
        <button onClick={() => { setShowAddForm((v) => !v); setFormError(null); }} className="btn-primary text-xs">
          {showAddForm ? 'Cancel' : '+ Add contact'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="mb-5 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 space-y-3">
          <ContactFields form={form} onChange={setForm} />
          {formError && <p className="text-sm text-priority-p1">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setShowAddForm(false); setFormError(null); }} className="btn-ghost text-sm">
              Cancel
            </button>
            <button type="submit" disabled={!form.name.trim() || saving} className="btn-primary text-sm">
              {saving ? 'Saving…' : 'Add contact'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
      ) : contacts.length === 0 ? (
        <p className="py-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          Nothing here yet — add anyone worth Sparrow staying connected to, whenever one comes to mind.
        </p>
      ) : (
        <div className="space-y-3">
          {contacts.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              onSave={(input) => handleSaveEdit(c.id, input)}
              onDelete={() => handleDelete(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

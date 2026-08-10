import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Profile } from '@/lib/types';
import { ContactFields } from '@/components/ContactFields';
import {
  fetchAllContacts,
  markContactConverted,
  updateContact,
  type PersonalContactInput,
  type PersonalContactWithOwner,
} from '@/lib/personalContacts';
import { AddPartnerPanel } from './AddPartnerPanel';
import { Drawer } from '../lcp/Drawer';

function toForm(c: PersonalContactWithOwner): PersonalContactInput {
  return {
    name: c.name,
    organization: c.organization,
    relationship: c.relationship,
    phone: c.phone ?? '',
    email: c.email ?? '',
    notes: c.notes,
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type SortMode = 'name' | 'staff';

export function PartnershipContactsTab({ profiles }: { profiles: Profile[] }) {
  const [contacts, setContacts] = useState<PersonalContactWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [addingFor, setAddingFor] = useState<PersonalContactWithOwner | null>(null);
  const [editingFor, setEditingFor] = useState<PersonalContactWithOwner | null>(null);
  const [editForm, setEditForm] = useState<PersonalContactInput | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit(c: PersonalContactWithOwner) {
    setEditingFor(c);
    setEditForm(toForm(c));
    setEditError(null);
  }

  async function saveEdit() {
    if (!editingFor || !editForm || !editForm.name.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await updateContact(editingFor.id, editForm);
      setEditingFor(null);
      load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not save this contact.');
    } finally {
      setEditSaving(false);
    }
  }

  function load() {
    void fetchAllContacts().then(setContacts).finally(() => setLoading(false));
  }
  useEffect(load, []);

  const sorted = [...contacts].sort((a, b) => {
    if (sortMode === 'staff') {
      const staffCompare = (a.owner?.full_name ?? '').localeCompare(b.owner?.full_name ?? '');
      if (staffCompare !== 0) return staffCompare;
    }
    return a.name.localeCompare(b.name);
  });

  const rows: { staffHeader: string | null; contact: PersonalContactWithOwner }[] = [];
  let lastStaff: string | null = null;
  for (const c of sorted) {
    const staffName = c.owner?.full_name ?? 'Unknown';
    if (sortMode === 'staff' && staffName !== lastStaff) {
      rows.push({ staffHeader: staffName, contact: c });
      lastStaff = staffName;
    } else {
      rows.push({ staffHeader: null, contact: c });
    }
  }

  // Memoized so the object reference only changes when the underlying contact does — a fresh
  // literal on every render was re-firing AddPartnerPanel's open-reset effect (which depends on
  // this prop) on any unrelated re-render of this tab, silently flipping its busy state back to
  // false mid-save and reopening the door to a real double-submit.
  const addPartnerInitialValues = useMemo(
    () =>
      addingFor
        ? {
            name: addingFor.name,
            phone: addingFor.phone ?? '',
            email: addingFor.email ?? '',
            notes: addingFor.notes || null,
            source: `Connected by ${addingFor.owner?.full_name ?? 'a staff member'} (My Contacts)`,
          }
        : null,
    [addingFor],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          Every personal contact staff across Sparrow have logged as worth staying connected to. This is a
          read-only pool for Partnerships to consider reaching out to — not a task list.
        </p>
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-0.5 text-xs">
          <button
            onClick={() => setSortMode('name')}
            className={`rounded-full px-2.5 py-1 font-medium ${sortMode === 'name' ? 'bg-white dark:bg-sparrow-dark-surface text-sparrow-ink dark:text-sparrow-dark-ink shadow-sm' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}
          >
            Sort: Name
          </button>
          <button
            onClick={() => setSortMode('staff')}
            className={`rounded-full px-2.5 py-1 font-medium ${sortMode === 'staff' ? 'bg-white dark:bg-sparrow-dark-surface text-sparrow-ink dark:text-sparrow-dark-ink shadow-sm' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}
          >
            Sort: Staff member
          </button>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
      ) : contacts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-sparrow-rule dark:border-sparrow-dark-border p-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          No staff contacts logged yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sparrow-rule dark:border-sparrow-dark-border text-left">
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Name</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Organization / context</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Connection</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Contact info</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Notes</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Staff member</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Added</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sparrow-rule dark:divide-sparrow-dark-border">
              {rows.map(({ staffHeader, contact: c }) => (
                <Fragment key={c.id}>
                  {staffHeader && (
                    <tr key={`hdr-${c.id}`} className="bg-sparrow-mist/60">
                      <td colSpan={8} className="px-3 py-1.5 text-xs font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{staffHeader}</td>
                    </tr>
                  )}
                  <tr key={c.id}>
                    <td className="px-3 py-2 font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{c.name}</td>
                    <td className="px-3 py-2 text-sparrow-gray dark:text-sparrow-dark-gray">{c.organization || '—'}</td>
                    <td className="px-3 py-2 text-sparrow-gray dark:text-sparrow-dark-gray">{c.relationship || '—'}</td>
                    <td className="px-3 py-2 text-sparrow-gray dark:text-sparrow-dark-gray">
                      {c.phone && <div>{c.phone}</div>}
                      {c.email && <div>{c.email}</div>}
                      {!c.phone && !c.email && '—'}
                    </td>
                    <td className="px-3 py-2 text-sparrow-gray dark:text-sparrow-dark-gray">{c.notes || '—'}</td>
                    <td className="px-3 py-2 text-sparrow-gray dark:text-sparrow-dark-gray">{c.owner?.full_name ?? 'Unknown'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sparrow-gray dark:text-sparrow-dark-gray">{formatDate(c.created_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(c)}
                          className="rounded p-1 text-sparrow-gray/70 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
                          title="Edit"
                          aria-label={`Edit ${c.name}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {c.converted_to_partner_id ? (
                          <span className="rounded-full bg-sparrow-green/10 px-2 py-0.5 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
                            ✓ In Directory{c.converted_partner ? `: ${c.converted_partner.name}` : ''}
                          </span>
                        ) : (
                          <button
                            onClick={() => setAddingFor(c)}
                            className="rounded-md bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-2.5 py-1 text-xs font-medium text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-rule dark:hover:bg-sparrow-dark-border"
                          >
                            Add to Directory
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={editingFor != null}
        onClose={() => setEditingFor(null)}
        title="Edit contact"
        subtitle={editingFor ? `Logged by ${editingFor.owner?.full_name ?? 'Unknown'}` : undefined}
        footer={
          editForm && (
            <div className="space-y-2">
              {editError && <p className="text-sm text-priority-p1">{editError}</p>}
              <button onClick={saveEdit} disabled={editSaving || !editForm.name.trim()} className="btn-primary w-full">
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )
        }
      >
        {editForm && <ContactFields form={editForm} onChange={setEditForm} />}
      </Drawer>

      <AddPartnerPanel
        open={addingFor != null}
        profiles={profiles}
        defaultOwnerId={null}
        onClose={() => setAddingFor(null)}
        onCreated={() => setAddingFor(null)}
        initialValues={addPartnerInitialValues}
        onCreatedFromContact={(partnerId) => {
          if (addingFor) void markContactConverted(addingFor.id, partnerId).then(load);
        }}
      />
    </div>
  );
}

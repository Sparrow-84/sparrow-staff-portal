import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { deleteStaff, fetchAllStaff, updateStaff } from '@/lib/admin';
import { ROLES, departmentLabel, type Profile } from '@/lib/types';
import { StaffPanel } from './StaffPanel';
import { OnboardingEditor } from './OnboardingEditor';
import { DocumentsEditor } from './DocumentsEditor';

type AdminTab = 'roster' | 'onboarding' | 'documents';

const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

export function StaffAdmin() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>('roster');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    try {
      setStaff(await fetchAllStaff());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load staff.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (profile?.role !== 'admin') {
    return <p className="p-8 text-sm text-sparrow-gray">Staff management is available to admins only.</p>;
  }
  if (loading) return <p className="p-8 text-sm text-sparrow-gray">Loading staff…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  const nameByEmail = (email: string | null) =>
    email ? (staff.find((s) => s.email === email)?.full_name ?? email) : '—';

  async function toggleActive(s: Profile) {
    await updateStaff(s.id, { active: !s.active });
    void load();
  }
  async function remove(s: Profile) {
    if (!window.confirm(`Remove ${s.full_name} permanently? This can't be undone.`)) return;
    await deleteStaff(s.id);
    void load();
  }
  function openAdd() {
    setEditing(null);
    setPanelOpen(true);
  }
  function openEdit(s: Profile) {
    setEditing(s);
    setPanelOpen(true);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Staff</h1>
        </div>
        {tab === 'roster' && (
          <button onClick={openAdd} className="btn-primary">
            + Add staff
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="mt-4 flex gap-1 rounded-xl border border-sparrow-rule bg-sparrow-mist p-1 text-sm">
        {(['roster', 'onboarding', 'documents'] as AdminTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 font-medium capitalize transition ${
              tab === t ? 'bg-white text-sparrow-green shadow-sm' : 'text-sparrow-gray hover:text-sparrow-ink'
            }`}
          >
            {t === 'onboarding' ? 'Onboarding Checklist' : t === 'documents' ? 'Documents' : 'Roster'}
          </button>
        ))}
      </div>

      {tab === 'onboarding' ? (
        <div className="mt-6">
          <OnboardingEditor />
        </div>
      ) : tab === 'documents' ? (
        <div className="mt-6">
          <DocumentsEditor />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <div className="overflow-x-auto rounded-xl border border-sparrow-rule bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-sparrow-rule text-xs uppercase tracking-wide text-sparrow-gray">
                <tr>
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Role</th>
                  <th className="px-4 py-2 font-semibold">Department</th>
                  <th className="px-4 py-2 font-semibold">Reports to</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sparrow-rule">
                {staff.map((s) => (
                  <tr key={s.id} className={s.active ? '' : 'bg-sparrow-mist/60 text-sparrow-gray'}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sparrow-ink">{s.full_name}</div>
                      <div className="text-xs text-sparrow-gray">{s.email}</div>
                    </td>
                    <td className="px-4 py-3">{roleLabel(s.role)}</td>
                    <td className="px-4 py-3">{departmentLabel(s.department)}</td>
                    <td className="px-4 py-3">{nameByEmail(s.manager_email)}</td>
                    <td className="px-4 py-3">
                      {s.active ? (
                        <span className="rounded-full bg-sparrow-sage px-2 py-0.5 text-xs font-medium text-sparrow-green">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-sparrow-rule/60 px-2 py-0.5 text-xs font-medium text-sparrow-gray">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2 text-xs">
                        <button onClick={() => openEdit(s)} className="font-medium text-sparrow-green hover:underline">
                          Edit
                        </button>
                        <button onClick={() => void toggleActive(s)} className="text-sparrow-gray hover:text-sparrow-ink">
                          {s.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button onClick={() => void remove(s)} className="text-priority-p1 hover:underline">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-sparrow-gray">
            New staff sign in with the Google email you enter here — it's the roster allowlist. Deactivating
            blocks sign-in without deleting their history; Delete removes the record entirely.
          </p>
          <StaffPanel
            open={panelOpen}
            staff={editing}
            allStaff={staff}
            onClose={() => setPanelOpen(false)}
            onChanged={load}
          />
        </div>
      )}
    </div>
  );
}

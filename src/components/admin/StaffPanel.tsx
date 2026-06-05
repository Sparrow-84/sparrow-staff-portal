import { useEffect, useState, useTransition } from 'react';
import {
  DEPARTMENTS,
  ROLES,
  type AppRole,
  type Department,
  type Profile,
} from '@/lib/types';
import { createStaff, updateStaff, type StaffInput } from '@/lib/admin';

interface Props {
  open: boolean;
  staff: Profile | null; // null = add new
  allStaff: Profile[];
  onClose: () => void;
  onChanged: () => void;
}

export function StaffPanel({ open, staff, allStaff, onClose, onChanged }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('staff');
  const [department, setDepartment] = useState<Department>('ops');
  const [managerEmail, setManagerEmail] = useState<string>('');
  const [active, setActive] = useState(true);
  const [lcpFull, setLcpFull] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (staff) {
      setFullName(staff.full_name);
      setEmail(staff.email);
      setRole(staff.role);
      setDepartment(staff.department);
      setManagerEmail(staff.manager_email ?? '');
      setActive(staff.active);
      setLcpFull(staff.lcp_role === 'full');
    } else {
      setFullName('');
      setEmail('');
      setRole('staff');
      setDepartment('ops');
      setManagerEmail('');
      setActive(true);
      setLcpFull(false);
    }
  }, [open, staff]);

  function save() {
    if (!fullName.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }
    const base: StaffInput = {
      full_name: fullName.trim(),
      email: email.trim(),
      role,
      department,
      manager_email: managerEmail || null,
      // Checkbox governs the `full` tier only. When unchecked, preserve an existing
      // `extended` grant (set via SQL / Phase-2 read views) rather than clobbering it.
      lcp_role: lcpFull ? 'full' : staff?.lcp_role === 'extended' ? 'extended' : null,
    };
    startTransition(async () => {
      try {
        if (staff) await updateStaff(staff.id, { ...base, active });
        else await createStaff(base);
        onChanged();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });
  }

  const managerOptions = allStaff.filter((s) => s.id !== staff?.id);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-sparrow-ink/30 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl transition-transform ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-sparrow-rule px-5 py-4">
          <h2 className="font-serif text-lg font-semibold">{staff ? 'Edit staff' : 'Add staff'}</h2>
          <button onClick={onClose} className="btn-ghost" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <label className="field-label" htmlFor="s-name">
            Full name
          </label>
          <input id="s-name" className="field-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />

          <div className="mt-4">
            <label className="field-label" htmlFor="s-email">
              Google email <span className="text-sparrow-gray">(sign-in address)</span>
            </label>
            {staff ? (
              <p className="mt-1 rounded-lg bg-sparrow-mist px-3 py-2 text-sm text-sparrow-gray">{email}</p>
            ) : (
              <input
                id="s-email"
                type="email"
                className="field-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@sparrowinc.org"
              />
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="s-role">
                Role
              </label>
              <select id="s-role" className="field-input" value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="s-dept">
                Department
              </label>
              <select
                id="s-dept"
                className="field-input"
                value={department}
                onChange={(e) => setDepartment(e.target.value as Department)}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="field-label" htmlFor="s-mgr">
              Reports to
            </label>
            <select
              id="s-mgr"
              className="field-input"
              value={managerEmail}
              onChange={(e) => setManagerEmail(e.target.value)}
            >
              <option value="">No manager</option>
              {managerOptions.map((s) => (
                <option key={s.id} value={s.email}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>

          <p className="mt-4 rounded-lg bg-sparrow-sage/50 px-3 py-2 text-xs text-sparrow-ink">
            Role + department set what this person can see: <strong>Admin</strong> sees everything,
            <strong> Manager</strong> sees their reports' tasks, and <strong>Twin Oaks</strong> staff
            (or admins) can see resident records.
          </p>

          <div className="mt-4 rounded-lg border border-sparrow-gold/40 bg-sparrow-cream px-3 py-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={lcpFull}
                onChange={(e) => setLcpFull(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-sparrow-green"
              />
              <span>
                <span className="font-medium">LifeChange Room access (full)</span>
                <span className="mt-0.5 block text-xs text-sparrow-gray">
                  Opens the LifeChange Room — participant records, messages, staff notes, and
                  vouchers. Grant only to LCP staff. Separate from Role and Department.
                </span>
              </span>
            </label>
            {staff?.lcp_role === 'extended' && (
              <p className="mt-2 text-xs text-sparrow-gray">
                Currently has <strong>extended</strong> (read-only, Phase 2) access — leaving this
                unchecked keeps that.
              </p>
            )}
          </div>

          {staff && (
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 accent-sparrow-green"
              />
              Active (can sign in)
            </label>
          )}

          {error && <p className="mt-4 text-sm text-priority-p1">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-sparrow-rule px-5 py-4">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={pending} className="btn-primary">
            {pending ? 'Saving…' : staff ? 'Save' : 'Add staff'}
          </button>
        </div>
      </aside>
    </>
  );
}

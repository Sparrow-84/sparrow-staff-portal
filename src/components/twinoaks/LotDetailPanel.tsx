import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { calculateMaxRent, getRentCap } from '@/lib/compliance/rentCap';
import {
  RENT_STATUSES,
  SPACE_STATUSES,
  SPACE_TYPES,
  TENANT_STATUSES,
  type RentStatus,
  type Space,
  type SpaceStatus,
  type SpaceType,
  type Tenant,
  type TenantStatus,
} from '@/lib/housing-types';
import {
  createTenant,
  deleteTenant,
  updateSpace,
  updateTenant,
  type WorkOrderWithAssignee,
} from '@/lib/housing';

interface Props {
  open: boolean;
  space: Space | null;
  tenant: Tenant | null;
  workOrders: WorkOrderWithAssignee[];
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
  onNewWorkOrder: (spaceId: string) => void;
  onSelectWorkOrder: (wo: WorkOrderWithAssignee) => void;
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;

export function LotDetailPanel({
  open,
  space,
  tenant,
  workOrders,
  canManage,
  onClose,
  onChanged,
  onNewWorkOrder,
  onSelectWorkOrder,
}: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const year = new Date().getFullYear();

  // space fields
  const [status, setStatus] = useState<SpaceStatus>('vacant');
  const [type, setType] = useState<SpaceType>('manufactured_home');
  const [rent, setRent] = useState('');
  const [rentStatus, setRentStatus] = useState<RentStatus>('na');
  const [size, setSize] = useState('');
  const [notes, setNotes] = useState('');
  // resident fields
  const [rName, setRName] = useState('');
  const [rPhone, setRPhone] = useState('');
  const [rEmail, setREmail] = useState('');
  const [rHousehold, setRHousehold] = useState('1');
  const [rIncome, setRIncome] = useState('');
  const [rMoveIn, setRMoveIn] = useState('');
  const [rStatus, setRStatus] = useState<TenantStatus>('active');
  const [rNotes, setRNotes] = useState('');

  function populate() {
    if (space) {
      setStatus(space.status);
      setType(space.type);
      setRent(String(space.current_rent ?? ''));
      setRentStatus(space.rent_status);
      setSize(space.size ?? '');
      setNotes(space.notes ?? '');
    }
    setRName(tenant?.name ?? '');
    setRPhone(tenant?.phone ?? '');
    setREmail(tenant?.email ?? '');
    setRHousehold(String(tenant?.household_size ?? 1));
    setRIncome(tenant?.annual_income != null ? String(tenant.annual_income) : '');
    setRMoveIn(tenant?.move_in_date ?? '');
    setRStatus(tenant?.status ?? 'active');
    setRNotes(tenant?.notes ?? '');
    setError(null);
  }

  // Reset to view mode when a different lot is opened.
  useEffect(() => {
    setMode('view');
  }, [space?.id]);
  // Keep edit fields in sync with the latest data.
  useEffect(() => {
    populate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space, tenant]);

  function save() {
    if (!space) return;
    startTransition(async () => {
      try {
        await updateSpace(space.id, {
          status,
          type,
          current_rent: Number(rent) || 0,
          rent_status: rentStatus,
          size: size.trim() || null,
          notes: notes.trim() || null,
        });
        const name = rName.trim();
        const residentPatch = {
          name,
          phone: rPhone.trim() || null,
          email: rEmail.trim() || null,
          household_size: Number(rHousehold) || 1,
          annual_income: rIncome.trim() === '' ? null : Number(rIncome),
          status: rStatus,
          move_in_date: rMoveIn || null,
          notes: rNotes.trim() || null,
        };
        if (tenant) {
          if (name) await updateTenant(tenant.id, residentPatch);
        } else if (name) {
          await createTenant({ space_id: space.id, ...residentPatch });
        }
        onChanged();
        setMode('view');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });
  }

  function removeResident() {
    if (!tenant) return;
    startTransition(async () => {
      try {
        await deleteTenant(tenant.id);
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not remove resident.');
      }
    });
  }

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
        {space && (
          <>
            <div className="flex items-center justify-between border-b border-sparrow-rule px-5 py-4">
              <h2 className="font-serif text-lg font-semibold">
                {mode === 'edit' ? 'Edit lot ' : 'Lot '}
                {space.label}
              </h2>
              <div className="flex items-center gap-2">
                {canManage && mode === 'view' && (
                  <button onClick={() => setMode('edit')} className="btn-ghost text-sparrow-green">
                    Edit
                  </button>
                )}
                <button onClick={onClose} className="btn-ghost" aria-label="Close">
                  ✕
                </button>
              </div>
            </div>

            {mode === 'view' ? (
              <ViewBody
                space={space}
                tenant={tenant}
                workOrders={workOrders}
                canManage={canManage}
                year={year}
                onNewWorkOrder={onNewWorkOrder}
                onSelectWorkOrder={onSelectWorkOrder}
              />
            ) : (
              <>
                <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
                  {/* Lot settings */}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Status">
                      <select className="field-input" value={status} onChange={(e) => setStatus(e.target.value as SpaceStatus)}>
                        {SPACE_STATUSES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Type">
                      <select className="field-input" value={type} onChange={(e) => setType(e.target.value as SpaceType)}>
                        {SPACE_TYPES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Monthly rent">
                      <input className="field-input" type="number" min="0" value={rent} onChange={(e) => setRent(e.target.value)} />
                    </Field>
                    <Field label="Rent status">
                      <select className="field-input" value={rentStatus} onChange={(e) => setRentStatus(e.target.value as RentStatus)}>
                        {RENT_STATUSES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="Size / notes (lot)">
                    <input className="field-input" value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 40×80" />
                    <textarea className="field-input mt-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Lot notes" />
                  </Field>

                  {/* Resident */}
                  <div className="border-t border-sparrow-rule pt-4">
                    <div className="flex items-center justify-between">
                      <p className="field-label">Resident {tenant ? '' : '(add)'}</p>
                      {tenant && (
                        <button onClick={removeResident} disabled={pending} className="text-xs text-priority-p1 hover:underline">
                          Remove resident
                        </button>
                      )}
                    </div>
                    <input className="field-input mt-1" value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Resident / household name" />
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <input className="field-input" value={rPhone} onChange={(e) => setRPhone(e.target.value)} placeholder="Phone" />
                      <input className="field-input" type="email" value={rEmail} onChange={(e) => setREmail(e.target.value)} placeholder="Email" />
                      <input className="field-input" type="number" min="1" value={rHousehold} onChange={(e) => setRHousehold(e.target.value)} placeholder="Household size" />
                      <input className="field-input" type="number" min="0" value={rIncome} onChange={(e) => setRIncome(e.target.value)} placeholder="Annual income" />
                      <input className="field-input" type="date" value={rMoveIn} onChange={(e) => setRMoveIn(e.target.value)} />
                      <select className="field-input" value={rStatus} onChange={(e) => setRStatus(e.target.value as TenantStatus)}>
                        {TENANT_STATUSES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <textarea className="field-input mt-2" rows={2} value={rNotes} onChange={(e) => setRNotes(e.target.value)} placeholder="Resident notes (sensitive)" />
                    <p className="mt-1 text-xs text-sparrow-gray">Leave the name blank to skip adding a resident.</p>
                  </div>

                  {error && <p className="text-sm text-priority-p1">{error}</p>}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-sparrow-rule px-5 py-4">
                  <button onClick={() => { populate(); setMode('view'); }} className="btn-ghost">
                    Cancel
                  </button>
                  <button onClick={save} disabled={pending} className="btn-primary">
                    {pending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </aside>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      {children}
    </div>
  );
}

function ViewBody({
  space,
  tenant,
  workOrders,
  canManage,
  year,
  onNewWorkOrder,
  onSelectWorkOrder,
}: {
  space: Space;
  tenant: Tenant | null;
  workOrders: WorkOrderWithAssignee[];
  canManage: boolean;
  year: number;
  onNewWorkOrder: (spaceId: string) => void;
  onSelectWorkOrder: (wo: WorkOrderWithAssignee) => void;
}) {
  return (
    <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-sparrow-mist px-2 py-0.5 text-xs capitalize text-sparrow-gray">{space.status}</span>
        <span className="rounded-full bg-sparrow-mist px-2 py-0.5 text-xs text-sparrow-gray">
          {space.type === 'rv' ? 'RV' : 'Manufactured home'}
        </span>
        {space.rent_status === 'overdue' && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Rent overdue</span>
        )}
      </div>

      {space.status !== 'vacant' && (
        <div className="rounded-lg border border-sparrow-rule p-3">
          <p className="field-label">Rent</p>
          <p className="mt-1 text-base font-semibold text-sparrow-ink">{money(space.current_rent)}/mo</p>
          <p className="mt-1 text-xs text-sparrow-gray">
            ORS max next increase:{' '}
            <span className="font-medium text-sparrow-ink">{money(calculateMaxRent(space.current_rent, year))}/mo</span>{' '}
            (cap {(getRentCap(year) * 100).toFixed(1)}%, HB 3054)
          </p>
        </div>
      )}

      <div>
        <p className="field-label">Resident</p>
        {tenant ? (
          <div className="mt-1 space-y-0.5">
            <p className="font-medium text-sparrow-ink">{tenant.name}</p>
            {tenant.phone && <p className="text-sparrow-gray">{tenant.phone}</p>}
            {tenant.email && <p className="text-sparrow-gray">{tenant.email}</p>}
            <p className="text-sparrow-gray">Household of {tenant.household_size}</p>
            {tenant.move_in_date && <p className="text-sparrow-gray">Since {tenant.move_in_date}</p>}
            {tenant.notes && (
              <p className="mt-1 rounded bg-sparrow-cream px-2 py-1 text-xs text-sparrow-ink">{tenant.notes}</p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sparrow-gray">
            {space.status === 'vacant' ? 'Vacant lot.' : 'No resident on file (or restricted).'}
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="field-label">Work orders</p>
          {canManage && (
            <button onClick={() => onNewWorkOrder(space.id)} className="text-xs font-medium text-sparrow-green hover:underline">
              + New
            </button>
          )}
        </div>
        {workOrders.length === 0 ? (
          <p className="mt-1 text-sparrow-gray">None.</p>
        ) : (
          <ul className="mt-1 divide-y divide-sparrow-rule rounded-lg border border-sparrow-rule">
            {workOrders.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => onSelectWorkOrder(w)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-sparrow-mist"
                >
                  <span className="text-sparrow-ink">{w.description}</span>
                  <span className="ml-2 shrink-0 text-xs capitalize text-sparrow-gray">
                    {w.status.replace('_', ' ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

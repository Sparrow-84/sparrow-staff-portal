import { useEffect, useState, useTransition } from 'react';
import {
  WO_CATEGORIES,
  WO_PRIORITIES,
  WO_STATUSES,
  type Space,
  type WoCategory,
  type WoPriority,
  type WoStatus,
} from '@/lib/housing-types';
import {
  createWorkOrder,
  deleteWorkOrder,
  updateWorkOrder,
  type WorkOrderInput,
  type WorkOrderWithAssignee,
} from '@/lib/housing';
import type { Profile } from '@/lib/types';
import { useRequiredFields } from '@/hooks/useRequiredFields';

interface Props {
  open: boolean;
  workOrder: WorkOrderWithAssignee | null;
  prefillSpaceId: string | null;
  spaces: Space[];
  staff: Profile[];
  onClose: () => void;
  onChanged: () => void;
}

export function WorkOrderPanel({
  open,
  workOrder,
  prefillSpaceId,
  spaces,
  staff,
  onClose,
  onChanged,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [spaceId, setSpaceId] = useState<string>('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<WoCategory>('tenant_request');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<WoPriority>('medium');
  const [status, setStatus] = useState<WoStatus>('open');
  const [assignedTo, setAssignedTo] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (workOrder) {
      setSpaceId(workOrder.space_id ?? '');
      setLocation(workOrder.location);
      setCategory(workOrder.category);
      setDescription(workOrder.description);
      setPriority(workOrder.priority);
      setStatus(workOrder.status);
      setAssignedTo(workOrder.assigned_to ?? '');
    } else {
      setSpaceId(prefillSpaceId ?? '');
      setLocation('');
      setCategory('tenant_request');
      setDescription('');
      setPriority('medium');
      setStatus('open');
      setAssignedTo('');
    }
    resetValidation();
  }, [open, workOrder, prefillSpaceId, spaces]);

  const { missingMessage, validate, fieldClass, clear, reset: resetValidation } = useRequiredFields([
    { key: 'w-desc', label: 'Description', valid: description.trim().length > 0 },
    { key: 'w-loc', label: 'Lot or location', valid: !!spaceId || location.trim().length > 0 },
  ]);

  function save() {
    if (!validate()) return;
    const input: WorkOrderInput = {
      space_id: spaceId || null,
      location: location.trim(),
      category,
      description: description.trim(),
      priority,
      status,
      assigned_to: assignedTo || null,
    };
    startTransition(async () => {
      try {
        if (workOrder) await updateWorkOrder(workOrder.id, input);
        else await createWorkOrder(input);
        onChanged();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });
  }

  function remove() {
    if (!workOrder) return;
    startTransition(async () => {
      try {
        await deleteWorkOrder(workOrder.id);
        onChanged();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete.');
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
        <div className="flex items-center justify-between border-b border-sparrow-rule px-5 py-4">
          <h2 className="font-serif text-lg font-semibold">{workOrder ? 'Edit work order' : 'New work order'}</h2>
          <button onClick={onClose} className="btn-ghost" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="w-space">
                Lot
              </label>
              <select
                id="w-space"
                className="field-input"
                value={spaceId}
                onChange={(e) => { setSpaceId(e.target.value); clear('w-loc'); }}
              >
                <option value="">Common area / none</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    Lot {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="w-loc">
                Spot / location
              </label>
              <input
                id="w-loc"
                className={fieldClass('w-loc')}
                value={location}
                onChange={(e) => { setLocation(e.target.value); clear('w-loc'); }}
                placeholder="e.g. front porch — or where, if no lot"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="field-label" htmlFor="w-desc">
              Description
            </label>
            <textarea
              id="w-desc"
              className={fieldClass('w-desc')}
              rows={3}
              value={description}
              onChange={(e) => { setDescription(e.target.value); clear('w-desc'); }}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="w-cat">
                Category
              </label>
              <select
                id="w-cat"
                className="field-input"
                value={category}
                onChange={(e) => setCategory(e.target.value as WoCategory)}
              >
                {WO_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="w-pri">
                Priority
              </label>
              <select
                id="w-pri"
                className="field-input"
                value={priority}
                onChange={(e) => setPriority(e.target.value as WoPriority)}
              >
                {WO_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="w-status">
                Status
              </label>
              <select
                id="w-status"
                className="field-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as WoStatus)}
              >
                {WO_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="w-assignee">
                Assigned to
              </label>
              <select
                id="w-assignee"
                className="field-input"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                <option value="">Unassigned</option>
                {staff.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(error || missingMessage) && <p className="mt-4 text-sm text-priority-p1">{error ?? missingMessage}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-sparrow-rule px-5 py-4">
          {workOrder ? (
            <button onClick={remove} disabled={pending} className="btn-ghost text-priority-p1">
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button onClick={save} disabled={pending} className="btn-primary">
              {pending ? 'Saving…' : workOrder ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

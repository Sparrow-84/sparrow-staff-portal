import { useEffect, useMemo, useState } from 'react';
import { createRegisterItem, fetchAllLocations, fetchAllSubLocations, type NewRegisterItem } from '@/lib/inventory';
import {
  BENTON_SCHEDULE_LABELS, FILING_STATUS_META,
  type InvBentonSchedule, type InvFilingStatus, type InvItemCondition, type InvLocation, type InvSubLocation,
} from '@/lib/inventory-types';
import { Drawer } from '../lcp/Drawer';
import { useRequiredFields } from '@/hooks/useRequiredFields';

const EMPTY = {
  description: '',
  locationId: '',
  subLocationId: '',
  condition: 'used' as InvItemCondition,
  quantity: '1',
  unitCost: '0',
  costSource: 'known' as 'known' | 'estimated',
  donated: 'unknown' as 'unknown' | 'yes' | 'no',
  serialNumber: '',
  year: '',
  bentonSchedule: 'schedule_5a' as InvBentonSchedule,
  filingStatus: 'added' as InvFilingStatus,
  whoHasIt: '',
  notes: '',
  reviewFlag: '',
};

/**
 * For something that was simply never logged — found during a reconciliation
 * pass, a shared item being split off into its own line, etc. — not for this
 * month's actual new purchases/donations, which still belong in the
 * location's monthly submission so reporting stays accurate.
 */
export function AddItemPanel({
  open,
  defaultLocationId,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultLocationId?: string | null;
  onClose: () => void;
  onCreated: (itemId: string) => void;
}) {
  const [locations, setLocations] = useState<InvLocation[]>([]);
  const [subLocations, setSubLocations] = useState<InvSubLocation[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, locationId: defaultLocationId ?? '' });
    setError(null);
    fetchAllLocations().then(setLocations).catch(() => setLocations([]));
    fetchAllSubLocations().then(setSubLocations).catch(() => setSubLocations([]));
  }, [open, defaultLocationId]);

  const sortedLocations = useMemo(() => [...locations].sort((a, b) => a.sort_order - b.sort_order), [locations]);
  const selectedLocation = locations.find((l) => l.id === form.locationId) ?? null;
  const roomOptions = useMemo(
    () => subLocations.filter((sl) => sl.location_id === form.locationId),
    [subLocations, form.locationId],
  );

  const { validate, fieldClass, fieldError, clear, missingMessage } = useRequiredFields([
    { key: 'ai-desc', label: 'Description', valid: form.description.trim().length > 0 },
    { key: 'ai-location', label: 'Location', valid: !!form.locationId },
  ]);

  async function save() {
    if (!validate() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const year = form.year.trim() ? Math.round(Number(form.year)) : null;
      const input: NewRegisterItem = {
        location_id: form.locationId,
        sub_location_id: form.subLocationId || null,
        description: form.description.trim(),
        serial_number: form.serialNumber.trim() || null,
        condition: form.condition,
        is_donated: form.donated === 'unknown' ? null : form.donated === 'yes',
        quantity: Math.max(1, Number(form.quantity) || 1),
        unit_cost: Math.max(0, Number(form.unitCost) || 0),
        cost_source: form.costSource,
        acquired_date: year ? `${year}-01-01` : null,
        benton_schedule: form.bentonSchedule,
        filing_status: form.filingStatus,
        who_has_it: form.whoHasIt.trim() || null,
        notes: form.notes.trim() || null,
        review_flag: form.reviewFlag.trim() || null,
      };
      const id = await createRegisterItem(input);
      onCreated(id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Add item to register">
      <div className="space-y-4">
        <div>
          <label className="field-label field-label-required" htmlFor="ai-desc">Description</label>
          <input
            id="ai-desc"
            value={form.description}
            onChange={(e) => { set({ description: e.target.value }); clear('ai-desc'); }}
            placeholder='e.g. "Dell Laptop (Andrew)"'
            className={fieldClass('ai-desc')}
          />
          {fieldError('ai-desc') && <p className="mt-1 text-xs text-priority-p1">{fieldError('ai-desc')}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label field-label-required" htmlFor="ai-location">Building</label>
            <select
              id="ai-location"
              value={form.locationId}
              onChange={(e) => { set({ locationId: e.target.value, subLocationId: '' }); clear('ai-location'); }}
              className={fieldClass('ai-location')}
            >
              <option value="">Select…</option>
              {sortedLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {fieldError('ai-location') && <p className="mt-1 text-xs text-priority-p1">{fieldError('ai-location')}</p>}
          </div>

          {selectedLocation && !selectedLocation.is_remote && (
            <div>
              <label className="field-label">Room</label>
              <select
                value={form.subLocationId}
                onChange={(e) => set({ subLocationId: e.target.value })}
                className="field-input"
              >
                <option value="">—</option>
                {roomOptions.map((sl) => (
                  <option key={sl.id} value={sl.id}>{sl.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Condition</label>
            <div className="flex gap-2 mt-1">
              {(['new', 'used'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set({ condition: c })}
                  className={`flex-1 rounded-lg border py-1.5 text-sm font-medium transition capitalize ${
                    form.condition === c
                      ? 'border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green/10 text-sparrow-green dark:text-sparrow-dark-green'
                      : 'border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">Donated</label>
            <div className="flex gap-2 mt-1">
              {([['Unk.', 'unknown'], ['Yes', 'yes'], ['No', 'no']] as const).map(([label, value]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set({ donated: value })}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition ${
                    form.donated === value
                      ? 'border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green/10 text-sparrow-green dark:text-sparrow-dark-green'
                      : 'border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="field-label">Quantity</label>
            <input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => set({ quantity: e.target.value })}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Cost ea.</label>
            <input
              type="number"
              min={0}
              value={form.unitCost}
              onChange={(e) => set({ unitCost: e.target.value })}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Year acq.</label>
            <input
              type="number"
              placeholder="—"
              value={form.year}
              onChange={(e) => set({ year: e.target.value })}
              className="field-input"
            />
          </div>
        </div>

        <div className="flex gap-2">
          {(['known', 'estimated'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set({ costSource: s })}
              className={`rounded-md border px-2 py-1 text-xs transition ${
                form.costSource === s
                  ? 'border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green/10 text-sparrow-green dark:text-sparrow-dark-green font-medium'
                  : 'border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2'
              }`}
            >
              {s === 'known' ? 'Known cost (receipt / handoff)' : 'Estimated cost'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Schedule</label>
            <select
              value={form.bentonSchedule}
              onChange={(e) => set({ bentonSchedule: e.target.value as InvBentonSchedule })}
              className="field-input"
            >
              {(Object.keys(BENTON_SCHEDULE_LABELS) as InvBentonSchedule[]).map((s) => (
                <option key={s} value={s}>{BENTON_SCHEDULE_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Filing status</label>
            <select
              value={form.filingStatus}
              onChange={(e) => set({ filingStatus: e.target.value as InvFilingStatus })}
              className="field-input"
            >
              {(Object.keys(FILING_STATUS_META) as InvFilingStatus[]).map((s) => (
                <option key={s} value={s}>{FILING_STATUS_META[s].label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              Usually "New" — unless this was already reported to the county under a
              different line (e.g. splitting a shared item apart), in which case pick "On File".
            </p>
          </div>
        </div>

        <div>
          <label className="field-label">Serial / model #</label>
          <input
            value={form.serialNumber}
            onChange={(e) => set({ serialNumber: e.target.value })}
            placeholder="If visible on the item"
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label">Who has it</label>
          <input
            value={form.whoHasIt}
            onChange={(e) => set({ whoHasIt: e.target.value })}
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label">Notes</label>
          <input
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            className="field-input"
          />
        </div>

        <div>
          <label className="field-label">Review flag <span className="normal-case font-normal text-sparrow-gray dark:text-sparrow-dark-gray">(an open question to come back to)</span></label>
          <input
            value={form.reviewFlag}
            onChange={(e) => set({ reviewFlag: e.target.value })}
            className="field-input"
          />
        </div>

        {(error || missingMessage) && <p className="text-sm text-priority-p1">{error || missingMessage}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={() => void save()} disabled={busy} className="btn-primary text-sm disabled:opacity-40">
            {busy ? 'Adding…' : 'Add item'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}

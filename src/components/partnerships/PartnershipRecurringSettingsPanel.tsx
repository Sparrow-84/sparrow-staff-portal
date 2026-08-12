import { useEffect, useState } from 'react';
import type { Profile } from '@/lib/types';
import { LEAD_TIME_PRESETS } from '@/lib/cadence';
import { CadenceInput } from './CadenceInput';
import {
  fetchRecurringSetting,
  updateRecurringSetting,
  type PartnershipRecurringSetting,
  type RecurringSettingKind,
} from '@/lib/partnerships-tabs';

// Small, compact settings block for the two Partnerships reminders that have no natural
// per-row home of their own (migration 0080): social posting and the newsletter/comms
// calendar. Not a new generic "recurring items" abstraction — this is scoped to exactly the
// one settings table with exactly two rows; Partners and Collateral each keep their own
// inline table UI per the room's agreed design.
export function PartnershipRecurringSettingsPanel({
  kind,
  title,
  helpText,
  profiles,
}: {
  kind: RecurringSettingKind;
  title: string;
  helpText: string;
  profiles: Profile[];
}) {
  const [open, setOpen] = useState(false);
  const [setting, setSetting] = useState<PartnershipRecurringSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const ownerProfiles = profiles.filter(
    (p) => (p.department === 'partnerships' || p.partnerships_access) && p.department !== 'exec',
  );

  useEffect(() => {
    setLoading(true);
    fetchRecurringSetting(kind)
      .then(setSetting)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [kind]);

  async function patch(fields: Partial<Pick<PartnershipRecurringSetting, 'cadence_days' | 'lead_time_days' | 'owner_id'>>) {
    setBusy(true);
    try {
      await updateRecurringSetting(kind, fields);
      setSetting((prev) => (prev ? { ...prev, ...fields } : prev));
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink"
      >
        <span>⚙ Reminder settings</span>
        <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border px-4 py-3">
          {loading && <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>}
          {!loading && !setting && (
            <p className="text-xs text-priority-p1">
              No {title.toLowerCase()} settings row found — an admin needs to create one before this reminder can fire.
            </p>
          )}
          {!loading && setting && (
            <>
              <p className="mb-3 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{helpText}</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="field-label field-label-required">Cadence</label>
                  <CadenceInput
                    value={setting.cadence_days}
                    onCommit={(v) => void patch({ cadence_days: v })}
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="field-label field-label-required">Lead time</label>
                  <CadenceInput
                    value={setting.lead_time_days}
                    onCommit={(v) => void patch({ lead_time_days: v })}
                    disabled={busy}
                    presets={LEAD_TIME_PRESETS}
                  />
                </div>
                <div>
                  <label className="field-label field-label-required">Owner</label>
                  <select
                    value={setting.owner_id}
                    disabled={busy}
                    onChange={(e) => { if (e.target.value) void patch({ owner_id: e.target.value }); }}
                    className="field-input mt-0"
                  >
                    {ownerProfiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import type { Profile } from '@/lib/types';
import { updatePartner } from '@/lib/partnerships';
import {
  PARTNER_STAGE,
  PARTNER_STAGES,
  PARTNER_TYPE,
  STEWARDSHIP,
  daysUntilDue,
  dueLabel,
  shortDate,
  stewardshipStatus,
  type Partner,
  type PartnerStage,
} from '@/lib/partnerships-types';

type SortKey = 'name' | 'type' | 'stage' | 'last_touch' | 'due';
type SortDir = 'asc' | 'desc';

export function PartnerTableView({
  partners,
  profiles,
  onOpenPartner,
  onChanged,
}: {
  partners: Partner[];
  profiles: Profile[];
  onOpenPartner: (id: string) => void;
  onChanged: () => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [busy, setBusy] = useState<string | null>(null);

  const ownerProfiles = profiles.filter(
    (p) => p.role === 'admin' || p.department === 'partnerships' || p.partnerships_access,
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const today = new Date();
  const sorted = [...partners].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'type':
        cmp = a.type.localeCompare(b.type);
        break;
      case 'stage':
        cmp = a.stage.localeCompare(b.stage);
        break;
      case 'last_touch': {
        const da = a.last_touchpoint_at ? new Date(a.last_touchpoint_at).getTime() : 0;
        const db = b.last_touchpoint_at ? new Date(b.last_touchpoint_at).getTime() : 0;
        cmp = da - db;
        break;
      }
      case 'due': {
        const da = daysUntilDue(a, today) ?? 9999;
        const db = daysUntilDue(b, today) ?? 9999;
        cmp = da - db;
        break;
      }
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  async function patch(id: string, update: Parameters<typeof updatePartner>[1]) {
    setBusy(id);
    try {
      await updatePartner(id, update);
    } finally {
      setBusy(null);
    }
    onChanged();
  }

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-sparrow-gray hover:text-sparrow-ink"
      >
        {label}
        {active && <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </th>
    );
  }

  if (sorted.length === 0) {
    return <p className="py-8 text-center text-sm text-sparrow-gray">No partners in this view yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-sparrow-rule">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-sparrow-rule bg-sparrow-mist/40">
            <th className="w-6 px-3 py-2" />
            <SortTh label="Name" k="name" />
            <SortTh label="Type" k="type" />
            <SortTh label="Stage" k="stage" />
            <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-sparrow-gray">
              Owner
            </th>
            <SortTh label="Last touch" k="last_touch" />
            <SortTh label="Due" k="due" />
            <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-sparrow-gray">
              Cadence
            </th>
            <th className="w-8 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const status = stewardshipStatus(p);
            const st = STEWARDSHIP[status];
            const type = PARTNER_TYPE[p.type];
            const isBusy = busy === p.id;
            return (
              <tr
                key={p.id}
                onClick={() => onOpenPartner(p.id)}
                className="group cursor-pointer border-b border-sparrow-rule/60 bg-white hover:bg-sparrow-mist/40"
              >
                {/* Status dot */}
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <span className={`block h-2 w-2 rounded-full ${st.dot}`} title={st.label} />
                </td>

                {/* Name + badges */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sparrow-ink">{p.name}</span>
                    {p.donor_tier === 'major' && (
                      <span className="rounded-full bg-sparrow-gold/20 px-2 py-0.5 text-[10px] font-medium text-sparrow-ink">
                        Major
                      </span>
                    )}
                    {p.mou_status === 'needed' && (
                      <span
                        className="h-2 w-2 rounded-full bg-priority-p1"
                        title="MOU needed"
                      />
                    )}
                  </div>
                </td>

                {/* Type */}
                <td className="whitespace-nowrap px-3 py-2.5 text-sparrow-gray">
                  {type.icon} {type.label}
                </td>

                {/* Stage — inline editable */}
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={p.stage}
                    onChange={(e) => void patch(p.id, { stage: e.target.value as PartnerStage })}
                    disabled={isBusy}
                    className="field-input mt-0 py-1 text-xs"
                  >
                    {PARTNER_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {PARTNER_STAGE[s].label}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Owner — inline editable */}
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={p.owner_id ?? ''}
                    onChange={(e) => void patch(p.id, { owner_id: e.target.value || null })}
                    disabled={isBusy}
                    className="field-input mt-0 py-1 text-xs"
                  >
                    <option value="">Unassigned</option>
                    {ownerProfiles.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.full_name}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Last touch */}
                <td className="whitespace-nowrap px-3 py-2.5 text-sparrow-gray">
                  {shortDate(p.last_touchpoint_at)}
                </td>

                {/* Due chip */}
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.chip}`}>
                    {dueLabel(p)}
                  </span>
                </td>

                {/* Cadence — inline editable */}
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    min={1}
                    defaultValue={p.cadence_days ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value ? Math.max(1, Number(e.target.value)) : null;
                      if (v !== (p.cadence_days ?? null)) void patch(p.id, { cadence_days: v });
                    }}
                    placeholder="—"
                    disabled={isBusy}
                    className="field-input mt-0 w-16 py-1 text-xs"
                  />
                </td>

                {/* Open link */}
                <td
                  className="px-3 py-2.5 text-right opacity-0 transition group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onOpenPartner(p.id)}
                    className="text-xs font-medium text-sparrow-green hover:underline"
                  >
                    Open
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

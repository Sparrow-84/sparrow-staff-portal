import { useMemo, useState } from 'react';
import type { Profile } from '@/lib/types';
import { updatePartner } from '@/lib/partnerships';
import { assignAvatarColors } from '@/lib/avatarColors';
import { LEAD_TIME_PRESETS } from '@/lib/cadence';
import { CadenceInput } from './CadenceInput';
import { LabelPill } from '@/components/LabelPill';
import type { PartnershipInterest } from '@/lib/partnership-interests';
import {
  PARTNER_STAGE,
  PARTNER_TYPE,
  STEWARDSHIP,
  daysUntilDue,
  derivedDonorTier,
  dueLabel,
  shortDate,
  stewardshipStatus,
  type DonorStat,
  type Partner,
  type PartnerStage,
} from '@/lib/partnerships-types';

type SortKey = 'name' | 'type' | 'stage' | 'last_touch' | 'due' | 'last_gift' | 'gift_count';
type SortDir = 'asc' | 'desc';

export function PartnerTableView({
  partners,
  profiles,
  onOpenPartner,
  onChanged,
  nextCommLabel,
  isDonorView = false,
  donorStatMap = new Map(),
  interestMap = new Map(),
}: {
  partners: Partner[];
  profiles: Profile[];
  onOpenPartner: (id: string) => void;
  onChanged: () => void;
  nextCommLabel?: string;
  isDonorView?: boolean;
  donorStatMap?: Map<string, DonorStat>;
  interestMap?: Map<string, PartnershipInterest[]>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [busy, setBusy] = useState<string | null>(null);

  // Exec is excluded even if flagged with partnerships_access — Andrew's only role in this
  // room is the one-time major-donor call task; he should never be a selectable standing owner.
  const ownerProfiles = profiles.filter(
    (p) => (p.department === 'partnerships' || p.partnerships_access) && p.department !== 'exec',
  );

  // Same palette + assignment as the Team page, so a given person's color matches everywhere —
  // makes it easy to spot at a glance who owns what instead of everything reading as one color.
  const ownerColors = useMemo(() => assignAvatarColors(profiles), [profiles]);

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
      case 'last_gift': {
        const da = donorStatMap.get(a.id)?.last_gift_date ?? '';
        const db = donorStatMap.get(b.id)?.last_gift_date ?? '';
        cmp = da.localeCompare(db);
        break;
      }
      case 'gift_count': {
        const da = donorStatMap.get(a.id)?.gift_count ?? 0;
        const db = donorStatMap.get(b.id)?.gift_count ?? 0;
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

  function SortTh({ label, k, minWidth }: { label: string; k: SortKey; minWidth?: string }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        style={minWidth ? { minWidth } : undefined}
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
            <SortTh label="Name" k="name" minWidth="260px" />
            <SortTh label="Type" k="type" minWidth="160px" />
            <th style={{ minWidth: '170px' }} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-sparrow-gray">
              Interests
            </th>
            <SortTh label="Stage" k="stage" minWidth="130px" />
            <th
              style={{ minWidth: '180px' }}
              className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-sparrow-gray"
            >
              Owner
            </th>
            <SortTh label="Last touch" k="last_touch" minWidth="110px" />
            <SortTh label="Due" k="due" minWidth="120px" />
            {isDonorView ? (
              <>
                <SortTh label="Gifts" k="gift_count" minWidth="80px" />
                <SortTh label="Last gift" k="last_gift" minWidth="110px" />
              </>
            ) : (
              <>
                <th style={{ minWidth: '150px' }} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-sparrow-gray">
                  Cadence
                </th>
                <th style={{ minWidth: '150px' }} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-sparrow-gray">
                  Lead time
                </th>
              </>
            )}
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

                {/* Name + badges — kept on one line; the table scrolls horizontally rather than squeezing this */}
                <td className="px-3 py-2.5">
                  <div className="flex flex-nowrap items-center gap-1.5">
                    <span className="whitespace-nowrap font-medium text-sparrow-ink">{p.name}</span>
                    {(() => {
                      const tier = derivedDonorTier(p.donor_tier, donorStatMap.get(p.id));
                      if (tier === 'major') return <span className="whitespace-nowrap rounded-full bg-sparrow-gold/20 px-2 py-0.5 text-[10px] font-medium text-sparrow-ink">Major</span>;
                      if (tier === 'lapsed' && p.type === 'donor') return <span className="whitespace-nowrap rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">Lapsed giving</span>;
                      if (tier === 'first_time') return <span className="whitespace-nowrap rounded-full bg-priority-p3/15 px-2 py-0.5 text-[10px] font-medium text-priority-p3">First gift</span>;
                      return null;
                    })()}
                    {(p.type === 'community' || p.type === 'church') && p.mou_status === 'needed' && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-priority-p1" title="MOU needed" />
                    )}
                  </div>
                </td>

                {/* Type — every type this partner is (primary, then tags), stacked */}
                <td className="whitespace-nowrap px-3 py-2.5 text-sparrow-gray">
                  <div className="flex flex-col gap-0.5">
                    {[type, ...p.secondary_types.map((t) => PARTNER_TYPE[t])].map((t) => (
                      <span key={t.label}>{t.icon} {t.label}</span>
                    ))}
                  </div>
                </td>

                {/* Interests */}
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {(interestMap.get(p.id) ?? []).map((i) => (
                      <LabelPill key={i.id} label={i.label} color={i.color} />
                    ))}
                  </div>
                </td>

                {/* Stage — inline editable */}
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={p.stage}
                    onChange={(e) => void patch(p.id, { stage: e.target.value as PartnerStage })}
                    disabled={isBusy}
                    className="field-input mt-0 py-1 text-xs"
                  >
                    {(['prospect', 'active', 'reengaging', 'inactive'] as PartnerStage[]).map((s) => (
                      <option key={s} value={s}>
                        {PARTNER_STAGE[s].label}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Owner — inline editable, dot color matches the same person's color on the Team page */}
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.owner_id ? (ownerColors[p.owner_id] ?? 'bg-sparrow-gray') : 'bg-sparrow-mist'}`}
                    />
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
                  </div>
                </td>

                {/* Last touch */}
                <td className="whitespace-nowrap px-3 py-2.5 text-sparrow-gray">
                  {shortDate(p.last_touchpoint_at)}
                </td>

                {/* Due chip */}
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.chip}`}>
                    {dueLabel(p, today, p.cadence_days == null ? nextCommLabel : undefined)}
                  </span>
                </td>

                {/* Cadence (non-donor) or gift stats (donor view) */}
                {isDonorView ? (() => {
                  const stat = donorStatMap.get(p.id);
                  return (
                    <>
                      <td className="whitespace-nowrap px-3 py-2.5 text-sparrow-gray">
                        {stat ? stat.gift_count : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-sparrow-gray">
                        {stat?.last_gift_date ? shortDate(stat.last_gift_date) : '—'}
                      </td>
                    </>
                  );
                })() : (
                  <>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <CadenceInput
                        value={p.cadence_days}
                        onCommit={(v) => void patch(p.id, { cadence_days: v })}
                        disabled={isBusy}
                      />
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <CadenceInput
                        value={p.lead_time_days}
                        onCommit={(v) => void patch(p.id, { lead_time_days: v })}
                        disabled={isBusy}
                        presets={LEAD_TIME_PRESETS}
                      />
                    </td>
                  </>
                )}

              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

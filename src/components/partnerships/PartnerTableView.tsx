import { useMemo, useState, type ReactNode } from 'react';
import type { Profile } from '@/lib/types';
import { updatePartner } from '@/lib/partnerships';
import { assignAvatarColors } from '@/lib/avatarColors';
import { LEAD_TIME_PRESETS } from '@/lib/cadence';
import { CadenceInput } from './CadenceInput';
import { LabelPill } from '@/components/LabelPill';
import type { PartnershipInterest } from '@/lib/partnership-interests';
import {
  DONOR_TIER,
  GIVING_METHODS,
  MOU_STATUS,
  PARTNER_STAGE,
  PARTNER_TYPE,
  PARTNER_TYPES,
  STEWARDSHIP,
  daysUntilDue,
  derivedDonorTier,
  dueLabel,
  shortDate,
  stewardshipStatus,
  type DonorStat,
  type DonorTier,
  type MouStatus,
  type Partner,
  type PartnerStage,
  type PartnerType,
} from '@/lib/partnerships-types';
import {
  useColumnLayout, useHeaderInteractions, GridTableShell,
  InlineText, InlineSelect, ExpandableText, InlineCheckbox,
  type GridColumn,
} from '@/components/gridtable/GridTable';

type ColKey =
  | 'status' | 'name' | 'type' | 'secondary_types' | 'organization' | 'contact_name'
  | 'email' | 'phone' | 'address' | 'donor_tier' | 'interests' | 'stage' | 'owner'
  | 'last_touch' | 'due' | 'cadence' | 'lead_time' | 'gift_count' | 'last_gift'
  | 'source' | 'active' | 'mou_status' | 'giving_method' | 'newsletter' | 'first_gift_date'
  | 'sparrow_provides' | 'partner_provides';
type SortDir = 'asc' | 'desc';

const STAGES: PartnerStage[] = ['prospect', 'active', 'reengaging', 'inactive'];
const TIERS: DonorTier[] = ['first_time', 'recurring', 'major', 'lapsed'];
const MOU_STATUSES: MouStatus[] = ['not_needed', 'needed', 'on_file'];

const COLUMNS: GridColumn<ColKey>[] = [
  { key: 'status', label: '', defaultWidth: 36 },
  { key: 'name', label: 'Name', defaultWidth: 200 },
  { key: 'type', label: 'Type', defaultWidth: 170 },
  { key: 'secondary_types', label: 'Also involved as', defaultWidth: 160 },
  { key: 'organization', label: 'Organization', defaultWidth: 170 },
  { key: 'contact_name', label: 'Contact', defaultWidth: 150 },
  { key: 'email', label: 'Email', defaultWidth: 190 },
  { key: 'phone', label: 'Phone', defaultWidth: 130 },
  { key: 'address', label: 'Address', defaultWidth: 200 },
  { key: 'donor_tier', label: 'Donor tier', defaultWidth: 140 },
  { key: 'interests', label: 'Interests', defaultWidth: 170 },
  { key: 'stage', label: 'Stage', defaultWidth: 130 },
  { key: 'owner', label: 'Owner', defaultWidth: 170 },
  { key: 'last_touch', label: 'Last touch', defaultWidth: 100 },
  { key: 'due', label: 'Due', defaultWidth: 120 },
  { key: 'cadence', label: 'Cadence', defaultWidth: 150 },
  { key: 'lead_time', label: 'Lead time', defaultWidth: 150 },
  { key: 'gift_count', label: 'Gifts', align: 'right', defaultWidth: 70 },
  { key: 'last_gift', label: 'Last gift', defaultWidth: 100 },
  { key: 'source', label: 'Source', defaultWidth: 170 },
  { key: 'active', label: 'Active', defaultWidth: 70 },
  { key: 'mou_status', label: 'MOU status', defaultWidth: 140 },
  { key: 'giving_method', label: 'Giving method', defaultWidth: 130 },
  { key: 'newsletter', label: 'Newsletter', defaultWidth: 100 },
  { key: 'first_gift_date', label: 'First gift date', defaultWidth: 140 },
  { key: 'sparrow_provides', label: 'Sparrow provides', defaultWidth: 200 },
  { key: 'partner_provides', label: 'Partner provides', defaultWidth: 200 },
];

// Admin/back-office fields start hidden so the directory doesn't open
// overwhelming — everything's still there and editable via Columns ▾.
const DEFAULT_HIDDEN: ColKey[] = [
  'organization', 'contact_name', 'address', 'source', 'mou_status',
  'giving_method', 'newsletter', 'first_gift_date', 'sparrow_provides', 'partner_provides',
];

const STORAGE_PREFIX = 'sparrow-partnerships-directory-table';

// Interactive fields (free-text inputs, long-text popovers) that don't already
// stop their own click propagation need wrapping so clicking into them to
// edit doesn't also bubble up and pop open the partner's detail drawer.
function Stop({ children }: { children: ReactNode }) {
  return <div className="w-full" onClick={(e) => e.stopPropagation()}>{children}</div>;
}

export function PartnerTableView({
  partners,
  profiles,
  onOpenPartner,
  onChanged,
  nextCommLabel,
  donorStatMap = new Map(),
  interestMap = new Map(),
}: {
  partners: Partner[];
  profiles: Profile[];
  onOpenPartner: (id: string) => void;
  onChanged: () => void;
  nextCommLabel?: string;
  donorStatMap?: Map<string, DonorStat>;
  interestMap?: Map<string, PartnershipInterest[]>;
}) {
  // Exec is excluded even if flagged with partnerships_access — Andrew's only role in this
  // room is the one-time major-donor call task; he should never be a selectable standing owner.
  const ownerProfiles = profiles.filter(
    (p) => (p.department === 'partnerships' || p.partnerships_access) && p.department !== 'exec',
  );

  // Same palette + assignment as the Team page, so a given person's color matches everywhere.
  const ownerColors = useMemo(() => assignAvatarColors(profiles), [profiles]);

  const today = useMemo(() => new Date(), []);

  function compare(a: Partner, b: Partner, key: ColKey): number {
    switch (key) {
      case 'name': return a.name.localeCompare(b.name);
      case 'type': return a.type.localeCompare(b.type);
      case 'organization': return (a.organization ?? '').localeCompare(b.organization ?? '');
      case 'contact_name': return (a.contact_name ?? '').localeCompare(b.contact_name ?? '');
      case 'email': return (a.email ?? '').localeCompare(b.email ?? '');
      case 'phone': return (a.phone ?? '').localeCompare(b.phone ?? '');
      case 'address': return (a.address ?? '').localeCompare(b.address ?? '');
      case 'donor_tier': return (a.donor_tier ?? '').localeCompare(b.donor_tier ?? '');
      case 'stage': return a.stage.localeCompare(b.stage);
      case 'owner': return (a.owner_id ?? '').localeCompare(b.owner_id ?? '');
      case 'last_touch': {
        const da = a.last_touchpoint_at ? new Date(a.last_touchpoint_at).getTime() : 0;
        const db = b.last_touchpoint_at ? new Date(b.last_touchpoint_at).getTime() : 0;
        return da - db;
      }
      case 'due': {
        const da = daysUntilDue(a, today) ?? 9999;
        const db = daysUntilDue(b, today) ?? 9999;
        return da - db;
      }
      case 'cadence': return (a.cadence_days ?? 9999) - (b.cadence_days ?? 9999);
      case 'lead_time': return a.lead_time_days - b.lead_time_days;
      case 'gift_count': return (donorStatMap.get(a.id)?.gift_count ?? 0) - (donorStatMap.get(b.id)?.gift_count ?? 0);
      case 'last_gift': return (donorStatMap.get(a.id)?.last_gift_date ?? '').localeCompare(donorStatMap.get(b.id)?.last_gift_date ?? '');
      case 'source': return (a.source ?? '').localeCompare(b.source ?? '');
      case 'active': return Number(a.active) - Number(b.active);
      case 'mou_status': return (a.mou_status ?? '').localeCompare(b.mou_status ?? '');
      case 'giving_method': return (a.giving_method ?? '').localeCompare(b.giving_method ?? '');
      case 'newsletter': return Number(a.newsletter_subscribed) - Number(b.newsletter_subscribed);
      case 'first_gift_date': return (a.first_gift_date ?? '').localeCompare(b.first_gift_date ?? '');
      default: return 0;
    }
  }

  const layout = useColumnLayout(COLUMNS, STORAGE_PREFIX, DEFAULT_HIDDEN);
  const sortableKeys: ColKey[] = [
    'name', 'type', 'organization', 'contact_name', 'email', 'phone', 'address', 'donor_tier',
    'stage', 'owner', 'last_touch', 'due', 'cadence', 'lead_time', 'gift_count', 'last_gift',
    'source', 'active', 'mou_status', 'giving_method', 'newsletter', 'first_gift_date',
  ];
  const layoutState = useSortState<ColKey>('name');
  const { sortKey, sortDir, setSortKey, setSortDir } = layoutState;
  const { startResize, handleHeaderClick: rawHandleHeaderClick } = useHeaderInteractions(
    layout.colWidths, layout.setColWidths, sortKey, setSortKey, sortDir, setSortDir,
  );
  function handleHeaderClick(key: ColKey) {
    if (!sortableKeys.includes(key)) return;
    rawHandleHeaderClick(key);
  }

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...partners].sort((a, b) => compare(a, b, sortKey) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partners, sortKey, sortDir, donorStatMap]);

  async function patch(id: string, update: Parameters<typeof updatePartner>[1]) {
    await updatePartner(id, update);
    onChanged();
  }

  function changeType(p: Partner, nextType: PartnerType) {
    if (nextType === p.type) return;
    // Changing the primary type shouldn't lose the old one — fold it into
    // secondary tags (and drop the new type from there if it was already tagged).
    const nextSecondary = Array.from(new Set([...(p.secondary_types ?? []).filter((t) => t !== nextType), p.type]));
    void patch(p.id, { type: nextType, secondary_types: nextSecondary });
  }

  function renderCell(p: Partner, key: ColKey) {
    const status = stewardshipStatus(p);
    const st = STEWARDSHIP[status];
    switch (key) {
      case 'status':
        return <span className={`block h-2 w-2 rounded-full ${st.dot}`} title={st.label} />;
      case 'name':
        return (
          <Stop>
            <div className="flex flex-nowrap items-center gap-1.5">
              <InlineText value={p.name} onSave={(v) => { if (v.trim()) void patch(p.id, { name: v.trim() }); }} />
              {(() => {
                const tier = derivedDonorTier(p.donor_tier, donorStatMap.get(p.id));
                if (tier === 'major') return <span className="whitespace-nowrap rounded-full bg-sparrow-gold/20 px-2 py-0.5 text-[10px] font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Major</span>;
                if (tier === 'lapsed' && p.type === 'donor') return <span className="whitespace-nowrap rounded-full bg-orange-100 dark:bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-300">Lapsed giving</span>;
                if (tier === 'first_time') return <span className="whitespace-nowrap rounded-full bg-priority-p3/15 px-2 py-0.5 text-[10px] font-medium text-priority-p3">First gift</span>;
                return null;
              })()}
              {(p.type === 'community' || p.type === 'church') && p.mou_status === 'needed' && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-priority-p1" title="MOU needed" />
              )}
            </div>
          </Stop>
        );
      case 'type':
        return (
          <InlineSelect
            value={p.type}
            onSave={(v) => changeType(p, v as PartnerType)}
            options={PARTNER_TYPES.map((t) => ({ value: t, label: `${PARTNER_TYPE[t].icon} ${PARTNER_TYPE[t].label}` }))}
          />
        );
      case 'secondary_types':
        return (
          <div className="flex flex-wrap gap-1">
            {p.secondary_types.length === 0
              ? <span className="text-sparrow-gray/50 dark:text-sparrow-dark-gray/50">—</span>
              : p.secondary_types.map((t) => (
                <span key={t} className="whitespace-nowrap text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{PARTNER_TYPE[t].icon} {PARTNER_TYPE[t].label}</span>
              ))}
          </div>
        );
      case 'organization':
        return <Stop><InlineText value={p.organization ?? ''} placeholder="—" onSave={(v) => void patch(p.id, { organization: v.trim() || null })} /></Stop>;
      case 'contact_name':
        return <Stop><InlineText value={p.contact_name ?? ''} placeholder="—" onSave={(v) => void patch(p.id, { contact_name: v.trim() || null })} /></Stop>;
      case 'email':
        return <Stop><InlineText type="email" value={p.email ?? ''} placeholder="—" onSave={(v) => void patch(p.id, { email: v.trim() || null })} /></Stop>;
      case 'phone':
        return <Stop><InlineText value={p.phone ?? ''} placeholder="—" onSave={(v) => void patch(p.id, { phone: v.trim() || null })} /></Stop>;
      case 'address':
        return <ExpandableText value={p.address} placeholder="No address" onSave={(v) => void patch(p.id, { address: v })} />;
      case 'donor_tier':
        return (
          <InlineSelect
            value={p.donor_tier ?? ''}
            onSave={(v) => void patch(p.id, { donor_tier: (v || null) as DonorTier | null })}
            options={[{ value: '', label: '—' }, ...TIERS.map((t) => ({ value: t, label: DONOR_TIER[t] }))]}
          />
        );
      case 'interests':
        return (
          <div className="flex flex-wrap gap-1">
            {(interestMap.get(p.id) ?? []).map((i) => (
              <LabelPill key={i.id} label={i.label} color={i.color} />
            ))}
          </div>
        );
      case 'stage':
        return (
          <InlineSelect
            value={p.stage}
            onSave={(v) => void patch(p.id, { stage: v as PartnerStage })}
            options={STAGES.map((s) => ({ value: s, label: PARTNER_STAGE[s].label }))}
          />
        );
      case 'owner':
        return (
          <Stop>
            <div className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.owner_id ? (ownerColors[p.owner_id] ?? 'bg-sparrow-gray dark:bg-sparrow-dark-border') : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2'}`} />
              <InlineSelect
                value={p.owner_id ?? ''}
                onSave={(v) => void patch(p.id, { owner_id: v || null })}
                options={[{ value: '', label: 'Unassigned' }, ...ownerProfiles.map((op) => ({ value: op.id, label: op.full_name }))]}
              />
            </div>
          </Stop>
        );
      case 'last_touch':
        return <span className="whitespace-nowrap text-sparrow-gray dark:text-sparrow-dark-gray">{shortDate(p.last_touchpoint_at)}</span>;
      case 'due':
        return (
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${st.chip}`}>
            {dueLabel(p, today, p.cadence_days == null ? nextCommLabel : undefined)}
          </span>
        );
      case 'cadence':
        return <Stop><CadenceInput value={p.cadence_days} onCommit={(v) => void patch(p.id, { cadence_days: v })} /></Stop>;
      case 'lead_time':
        return <Stop><CadenceInput value={p.lead_time_days} onCommit={(v) => void patch(p.id, { lead_time_days: v })} presets={LEAD_TIME_PRESETS} /></Stop>;
      case 'gift_count': {
        const stat = donorStatMap.get(p.id);
        return <span className="text-sparrow-gray dark:text-sparrow-dark-gray">{stat ? stat.gift_count : '—'}</span>;
      }
      case 'last_gift': {
        const stat = donorStatMap.get(p.id);
        return <span className="whitespace-nowrap text-sparrow-gray dark:text-sparrow-dark-gray">{stat?.last_gift_date ? shortDate(stat.last_gift_date) : '—'}</span>;
      }
      case 'source':
        return <Stop><InlineText value={p.source ?? ''} placeholder="—" onSave={(v) => void patch(p.id, { source: v.trim() || null })} /></Stop>;
      case 'active':
        return (
          <InlineCheckbox
            checked={p.active}
            onSave={(v) => void patch(p.id, v ? { active: true, stage: 'active' } : { active: false, stage: 'inactive' })}
          />
        );
      case 'mou_status':
        return (
          <InlineSelect
            value={p.mou_status ?? ''}
            onSave={(v) => void patch(p.id, { mou_status: (v || null) as MouStatus | null })}
            options={[{ value: '', label: '—' }, ...MOU_STATUSES.map((s) => ({ value: s, label: MOU_STATUS[s] }))]}
          />
        );
      case 'giving_method':
        return (
          <InlineSelect
            value={p.giving_method ?? ''}
            onSave={(v) => void patch(p.id, { giving_method: v || null })}
            options={[{ value: '', label: '—' }, ...GIVING_METHODS.map((m) => ({ value: m, label: m }))]}
          />
        );
      case 'newsletter':
        return <InlineCheckbox checked={p.newsletter_subscribed} onSave={(v) => void patch(p.id, { newsletter_subscribed: v })} />;
      case 'first_gift_date':
        return <Stop><InlineText type="date" value={p.first_gift_date ?? ''} onSave={(v) => void patch(p.id, { first_gift_date: v || null })} /></Stop>;
      case 'sparrow_provides':
        return <ExpandableText value={p.sparrow_provides} placeholder="—" onSave={(v) => void patch(p.id, { sparrow_provides: v })} />;
      case 'partner_provides':
        return <ExpandableText value={p.partner_provides} placeholder="—" onSave={(v) => void patch(p.id, { partner_provides: v })} />;
      default:
        return null;
    }
  }

  if (sorted.length === 0) {
    return <p className="py-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No partners in this view yet.</p>;
  }

  return (
    <GridTableShell
      layout={layout}
      sortKey={sortKey}
      sortDir={sortDir}
      onHeaderClick={handleHeaderClick}
      startResize={startResize}
      items={sorted}
      rowKey={(p) => p.id}
      renderCell={renderCell}
      onRowClick={(p) => onOpenPartner(p.id)}
      rowClassName={() => 'cursor-pointer hover:bg-sparrow-mist/40 dark:hover:bg-sparrow-dark-surface2'}
      emptyMessage="No partners in this view yet."
    />
  );
}

// Tiny local hook — sort state doesn't need to live in the shared engine
// (Inventory's sort key/dir stay local to its own view for the same reason).
function useSortState<K extends string>(initial: K) {
  const [sortKey, setSortKey] = useState<K>(initial);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  return { sortKey, sortDir, setSortKey, setSortDir };
}

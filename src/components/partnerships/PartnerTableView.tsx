import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/auth/AuthContext';
import type { Profile } from '@/lib/types';
import { updatePartner } from '@/lib/partnerships';
import { assignAvatarColors } from '@/lib/avatarColors';
import { GivingMethodEditor } from './GivingMethodEditor';
import { LabelPill } from '@/components/LabelPill';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import type { PartnershipInterest } from '@/lib/partnership-interests';
import {
  DONOR_TIER,
  MOU_STATUS,
  PARTNER_PROVIDES_PRESETS,
  PARTNER_STAGE,
  PARTNER_SUB_CATEGORY,
  PARTNER_TYPE,
  PARTNER_TYPES,
  STEWARDSHIP,
  SUB_CATEGORIES_FOR_TYPE,
  composePartnerName,
  derivedDonorTier,
  displayPartnerName,
  hasPartnershipTerms,
  isPersonRecord,
  shortDate,
  stagePatch,
  stewardshipStatus,
  type DonorStat,
  type DonorTier,
  type MouStatus,
  type Partner,
  type PartnerProvidesTag,
  type PartnerStage,
  type PartnerSubCategory,
  type PartnerType,
} from '@/lib/partnerships-types';
import {
  useColumnLayout, useHeaderInteractions, GridTableShell,
  InlineText, InlineSelect, ExpandableText, InlineCheckbox, editableBase,
  type GridColumn,
} from '@/components/gridtable/GridTable';

type ColKey =
  | 'status' | 'name' | 'type' | 'sub_category' | 'contact_name'
  | 'email' | 'phone' | 'address' | 'donor_tier' | 'interests' | 'stage' | 'owner'
  | 'needs_touchpoint' | 'gift_count' | 'last_gift'
  | 'source' | 'mou_status' | 'giving_method' | 'newsletter' | 'first_gift_date'
  | 'sparrow_provides' | 'partner_provides';
type SortDir = 'asc' | 'desc';

const STAGES: PartnerStage[] = ['prospect', 'active', 'inactive'];
const TIERS: DonorTier[] = ['first_time', 'recurring', 'major', 'lapsed'];
const MOU_STATUSES: MouStatus[] = ['not_needed', 'needed', 'on_file'];

const COLUMNS: GridColumn<ColKey>[] = [
  { key: 'status', label: '', defaultWidth: 36 },
  { key: 'name', label: 'Name', defaultWidth: 200 },
  { key: 'type', label: 'Category', defaultWidth: 150 },
  { key: 'sub_category', label: 'Sub-category', defaultWidth: 130 },
  { key: 'contact_name', label: 'Contact Person', defaultWidth: 150 },
  { key: 'email', label: 'Email', defaultWidth: 190 },
  { key: 'phone', label: 'Phone', defaultWidth: 130 },
  { key: 'address', label: 'Address', defaultWidth: 200 },
  { key: 'donor_tier', label: 'Donor tier', defaultWidth: 140 },
  { key: 'interests', label: 'Interests', defaultWidth: 170 },
  { key: 'stage', label: 'Stage', defaultWidth: 130 },
  { key: 'owner', label: 'Owner', defaultWidth: 170 },
  { key: 'needs_touchpoint', label: 'Needs additional touchpoint', defaultWidth: 220 },
  { key: 'gift_count', label: 'Total Gifts', align: 'right', defaultWidth: 90 },
  { key: 'last_gift', label: 'Last gift', defaultWidth: 100 },
  { key: 'source', label: 'Source', defaultWidth: 170 },
  { key: 'mou_status', label: 'MOU status', defaultWidth: 140 },
  { key: 'giving_method', label: 'Giving method', defaultWidth: 130 },
  { key: 'newsletter', label: 'Subscribed to TSM', defaultWidth: 130 },
  { key: 'first_gift_date', label: 'First gift date', defaultWidth: 140 },
  { key: 'sparrow_provides', label: 'Sparrow provides', defaultWidth: 200 },
  { key: 'partner_provides', label: 'Partner provides', defaultWidth: 220 },
];

// Admin/back-office fields start hidden so the directory doesn't open
// overwhelming — everything's still there and editable via Columns ▾.
const DEFAULT_HIDDEN: ColKey[] = [
  'contact_name', 'address', 'source', 'mou_status',
  'giving_method', 'newsletter', 'first_gift_date', 'sparrow_provides', 'partner_provides',
];

const STORAGE_PREFIX = 'sparrow-partnerships-directory-table';

// ── Per-column funnel filters ───────────────────────────────────────────────────────────
type FilterableKey = 'partner_provides' | 'sub_category' | 'stage' | 'donor_tier' | 'mou_status' | 'newsletter' | 'owner' | 'giving_method' | 'interests';
const FILTERABLE_KEYS: FilterableKey[] = ['partner_provides', 'sub_category', 'stage', 'donor_tier', 'mou_status', 'newsletter', 'owner', 'giving_method', 'interests'];
const NONE = '(none)';

/** The value(s) a partner has for a given filterable column — an array since
 *  Partner Provides/Interests are multi-valued. `interestMap` is only needed for the
 *  'interests' case (Interests aren't a field on `Partner` itself). */
function filterValuesFor(key: FilterableKey, p: Partner, interestMap: Map<string, PartnershipInterest[]>): string[] {
  switch (key) {
    case 'partner_provides': return p.partner_provides_tags.length ? p.partner_provides_tags : [NONE];
    case 'sub_category': return [p.sub_category ?? NONE];
    case 'stage': return [p.stage];
    case 'donor_tier': return [p.donor_tier ?? NONE];
    case 'mou_status': return [p.mou_status ?? NONE];
    case 'newsletter': return [p.newsletter_subscribed ? 'Yes' : 'No'];
    case 'owner': return [p.owner_id ?? NONE];
    case 'giving_method': return [p.giving_method ?? NONE];
    case 'interests': {
      const list = interestMap.get(p.id) ?? [];
      return list.length ? list.map((i) => i.label) : [NONE];
    }
  }
}

function ColumnFilterButton({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const active = selected.size > 0;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScroll(e: Event) {
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onResize() { setOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  function toggleOpen() {
    if (open) { setOpen(false); return; }
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 216) });
    setOpen(true);
  }

  function toggle(v: string) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next);
  }

  // The dropdown is portaled to <body> with fixed positioning -- rendered inside the header
  // cell it was clipped invisible by the header's (and table's) overflow:hidden, which is why
  // clicking a funnel looked like it did nothing.
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        aria-label="Filter this column"
        className={`grid h-4 w-4 shrink-0 place-items-center rounded ${active ? 'bg-sparrow-gold text-sparrow-ink' : 'text-white/50 hover:text-white/90'}`}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18l-7 9v7l-4 2v-9z" /></svg>
      </button>
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          // Portals still bubble clicks up the React tree -- stop them reaching the header's sort click.
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
          className="z-50 w-52 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-2 normal-case tracking-normal shadow-lg">
          <div className="mb-1.5 flex items-center justify-between">
            <button type="button" onClick={() => onChange(new Set())} className="text-[11px] font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
              Clear
            </button>
            <button type="button" onClick={() => onChange(new Set(options.map((o) => o.value)))} className="text-[11px] font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:underline">
              Select all
            </button>
          </div>
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {options.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs font-normal text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist/60 dark:hover:bg-sparrow-dark-surface2/60">
                <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} className="h-3.5 w-3.5 rounded accent-sparrow-green" />
                {o.label}
              </label>
            ))}
            {options.length === 0 && <p className="px-1.5 py-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No values yet.</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// Interactive fields (free-text inputs, long-text popovers) that don't already
// stop their own click propagation need wrapping so clicking into them to
// edit doesn't also bubble up and pop open the partner's detail drawer.
function Stop({ children }: { children: ReactNode }) {
  return <div className="w-full" onClick={(e) => e.stopPropagation()}>{children}</div>;
}

/** A cell that reads as one plain line of text (e.g. "Caswell, Jennifer") but stores two
 *  separate fields -- clicking it opens a small popover with one labeled box per field.
 *  Portaled so the table's overflow:hidden can't clip it (same as ExpandableText). */
function SplitFieldCell<K extends string>({
  display,
  placeholder,
  fields,
  onSave,
}: {
  display: string;
  placeholder?: string;
  fields: { key: K; label: string; value: string; type?: string; placeholder?: string; hint?: string }[];
  onSave: (values: Record<K, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const [draft, setDraft] = useState<Record<K, string>>({} as Record<K, string>);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function current(): Record<K, string> {
    return Object.fromEntries(fields.map((f) => [f.key, f.value])) as Record<K, string>;
  }

  function openPopover() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 300) });
    setDraft(current());
    setOpen(true);
  }

  function save() {
    setOpen(false);
    if (fields.some((f) => (draft[f.key] ?? '') !== f.value)) onSave(draft);
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) save();
    }
    function onScroll(e: Event) {
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      save();
    }
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', save);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', save);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); openPopover(); }}
        className={`${editableBase} block truncate text-left text-sm ${display ? 'text-sparrow-ink dark:text-sparrow-dark-ink' : 'italic text-sparrow-gray dark:text-sparrow-dark-gray'}`}
      >
        {display || placeholder || '—'}
      </button>
      {open && rect && createPortal(
        <div
          ref={popoverRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: 280 }}
          className="z-50 space-y-2 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3 shadow-lg"
        >
          {fields.map((f, i) => (
            <div key={f.key}>
              <label className="field-label">{f.label}</label>
              <input
                autoFocus={i === 0}
                type={f.type ?? 'text'}
                placeholder={f.placeholder}
                className="field-input w-full"
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save();
                  if (e.key === 'Escape') setOpen(false);
                }}
              />
              {f.hint && <p className="mt-1 text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">{f.hint}</p>}
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
              Cancel
            </button>
            <button type="button" onClick={save} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
              Save
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function PartnerTableView({
  partners,
  profiles,
  onOpenPartner,
  onChanged,
  donorStatMap = new Map(),
  interestMap = new Map(),
}: {
  partners: Partner[];
  profiles: Profile[];
  onOpenPartner: (id: string) => void;
  onChanged: () => void;
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
  // Only Partnerships staff change an MOU (Resident Services staff see it); the DB enforces it too.
  const { profile: me } = useAuth();
  const isPartnershipsStaff = me?.role === 'admin' || me?.department === 'partnerships';

  const [columnFilters, setColumnFilters] = useState<Partial<Record<FilterableKey, Set<string>>>>({});

  const givingMethodOptions = useMemo(() => {
    const values = new Set<string>();
    for (const p of partners) values.add(p.giving_method ?? NONE);
    return Array.from(values).sort().map((v) => ({ value: v, label: v }));
  }, [partners]);

  // Interest tags are open-ended (staff can create new ones), so -- same approach as Giving
  // Method above -- the filter lists whatever labels are actually in use right now rather
  // than a fixed preset list.
  const interestOptions = useMemo(() => {
    const values = new Set<string>();
    for (const list of interestMap.values()) {
      for (const i of list) values.add(i.label);
    }
    if (values.size === 0) return [{ value: NONE, label: 'None' }];
    return [...Array.from(values).sort().map((v) => ({ value: v, label: v })), { value: NONE, label: 'None' }];
  }, [interestMap]);

  const filterOptions: Record<FilterableKey, { value: string; label: string }[]> = {
    partner_provides: [...PARTNER_PROVIDES_PRESETS.map((t) => ({ value: t, label: t })), { value: NONE, label: 'None' }],
    sub_category: [
      ...(['individual', 'business', 'nonprofit', 'church', 'prayer'] as PartnerSubCategory[]).map((sc) => ({ value: sc, label: PARTNER_SUB_CATEGORY[sc] })),
      { value: NONE, label: 'None' },
    ],
    stage: STAGES.map((s) => ({ value: s, label: PARTNER_STAGE[s].label })),
    donor_tier: [...TIERS.map((t) => ({ value: t, label: DONOR_TIER[t] })), { value: NONE, label: 'None' }],
    mou_status: [...MOU_STATUSES.map((s) => ({ value: s, label: MOU_STATUS[s] })), { value: NONE, label: 'None' }],
    newsletter: [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }],
    owner: [...ownerProfiles.map((op) => ({ value: op.id, label: op.full_name })), { value: NONE, label: 'Unassigned' }],
    giving_method: givingMethodOptions,
    interests: interestOptions,
  };

  function renderHeaderExtra(key: ColKey): ReactNode {
    if (!FILTERABLE_KEYS.includes(key as FilterableKey)) return null;
    const fk = key as FilterableKey;
    return (
      <ColumnFilterButton
        options={filterOptions[fk]}
        selected={columnFilters[fk] ?? new Set()}
        onChange={(next) => setColumnFilters((prev) => ({ ...prev, [fk]: next }))}
      />
    );
  }

  const filtered = useMemo(() => {
    const active = (Object.entries(columnFilters) as [FilterableKey, Set<string>][]).filter(([, set]) => set.size > 0);
    if (active.length === 0) return partners;
    return partners.filter((p) => active.every(([key, set]) => filterValuesFor(key, p, interestMap).some((v) => set.has(v))));
  }, [partners, columnFilters, interestMap]);

  function compare(a: Partner, b: Partner, key: ColKey): number {
    switch (key) {
      case 'name': return displayPartnerName(a).localeCompare(displayPartnerName(b));
      case 'type': return a.type.localeCompare(b.type);
      case 'sub_category': return (a.sub_category ?? '').localeCompare(b.sub_category ?? '');
      case 'contact_name': return (a.contact_name ?? '').localeCompare(b.contact_name ?? '');
      case 'email': return (a.email ?? '').localeCompare(b.email ?? '');
      case 'phone': return (a.phone ?? '').localeCompare(b.phone ?? '');
      case 'address': return (a.address ?? '').localeCompare(b.address ?? '');
      case 'donor_tier': return (a.donor_tier ?? '').localeCompare(b.donor_tier ?? '');
      case 'stage': return a.stage.localeCompare(b.stage);
      case 'owner': return (a.owner_id ?? '').localeCompare(b.owner_id ?? '');
      case 'needs_touchpoint': return Number(a.needs_additional_touchpoint) - Number(b.needs_additional_touchpoint);
      case 'gift_count': return (donorStatMap.get(a.id)?.gift_count ?? 0) - (donorStatMap.get(b.id)?.gift_count ?? 0);
      case 'last_gift': return (donorStatMap.get(a.id)?.last_gift_date ?? '').localeCompare(donorStatMap.get(b.id)?.last_gift_date ?? '');
      case 'source': return (a.source ?? '').localeCompare(b.source ?? '');
      case 'mou_status': return (a.mou_status ?? '').localeCompare(b.mou_status ?? '');
      case 'giving_method': return (a.giving_method ?? '').localeCompare(b.giving_method ?? '');
      case 'newsletter': return Number(a.newsletter_subscribed) - Number(b.newsletter_subscribed);
      case 'first_gift_date': return (a.first_gift_date ?? '').localeCompare(b.first_gift_date ?? '');
      default: return 0;
    }
  }

  const layout = useColumnLayout(COLUMNS, STORAGE_PREFIX, DEFAULT_HIDDEN);
  const sortableKeys: ColKey[] = [
    'name', 'type', 'sub_category', 'contact_name', 'email', 'phone', 'address', 'donor_tier',
    'stage', 'owner', 'needs_touchpoint', 'gift_count', 'last_gift',
    'source', 'mou_status', 'giving_method', 'newsletter', 'first_gift_date',
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
    return [...filtered].sort((a, b) => compare(a, b, sortKey) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir, donorStatMap]);

  async function patch(id: string, update: Parameters<typeof updatePartner>[1]) {
    await updatePartner(id, update);
    onChanged();
  }

  function changeType(p: Partner, nextType: PartnerType) {
    if (nextType === p.type) return;
    // Changing the primary type shouldn't lose the old one — fold it into
    // secondary tags (and drop the new type from there if it was already tagged).
    const nextSecondary = Array.from(new Set([...(p.secondary_types ?? []).filter((t) => t !== nextType), p.type]));
    // Sub-category options differ per category — carry it forward only if still valid.
    const subStillValid = p.sub_category && SUB_CATEGORIES_FOR_TYPE[nextType].includes(p.sub_category);
    void patch(p.id, { type: nextType, secondary_types: nextSecondary, sub_category: subStillValid ? p.sub_category : null });
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
              {isPersonRecord(p) && (p.first_name || p.last_name) ? (
                // Plain "Last, First" text at rest (no gap between two fixed-width boxes);
                // clicking opens separate Last / First boxes, so nobody has to remember a
                // comma convention for it to save correctly.
                <SplitFieldCell
                  display={displayPartnerName(p)}
                  fields={[
                    { key: 'last', label: 'Last name', value: p.last_name ?? '' },
                    { key: 'first', label: 'First name', value: p.first_name ?? '' },
                  ]}
                  onSave={(v) => {
                    const last = v.last.trim() || null;
                    const first = v.first.trim() || null;
                    if (!last && !first) return; // never blank out a name
                    void patch(p.id, { last_name: last, first_name: first, name: composePartnerName(first, last) });
                  }}
                />
              ) : (
                // Also covers an individual record with no first/last split yet (e.g. a
                // genuinely ambiguous name a human hasn't set by hand) -- shows and edits
                // the plain name exactly like an organization would, never a blank pair of
                // boxes.
                <InlineText value={p.name} onSave={(v) => { if (v.trim()) void patch(p.id, { name: v.trim() }); }} />
              )}
              {(() => {
                const tier = derivedDonorTier(p.donor_tier, donorStatMap.get(p.id));
                if (tier === 'major') return <span className="whitespace-nowrap rounded-full bg-sparrow-gold/20 px-2 py-0.5 text-[10px] font-medium text-sparrow-ink dark:text-sparrow-dark-ink">Major</span>;
                if (tier === 'lapsed' && p.type === 'donor') return <span className="whitespace-nowrap rounded-full bg-orange-100 dark:bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-300">Lapsed giving</span>;
                if (tier === 'first_time' && p.type === 'donor') return <span className="whitespace-nowrap rounded-full bg-priority-p3/15 px-2 py-0.5 text-[10px] font-medium text-priority-p3">First gift</span>;
                return null;
              })()}
              {hasPartnershipTerms(p) && p.mou_status === 'needed' && (
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
      case 'sub_category':
        return (
          <InlineSelect
            value={p.sub_category ?? ''}
            onSave={(v) => void patch(p.id, { sub_category: (v || null) as PartnerSubCategory | null })}
            options={[{ value: '', label: '—' }, ...SUB_CATEGORIES_FOR_TYPE[p.type].map((sc) => ({ value: sc, label: PARTNER_SUB_CATEGORY[sc] }))]}
          />
        );
      case 'contact_name':
        // Contact person and their role stay separate fields; shown together ("Kari Kingsolver,
        // Executive Director") and edited in two labeled boxes so neither can bleed into the other.
        return (
          <Stop>
            <SplitFieldCell
              display={[p.contact_name, p.role].filter(Boolean).join(', ')}
              placeholder="—"
              fields={[
                { key: 'contact_name', label: 'Contact person', value: p.contact_name ?? '' },
                { key: 'role', label: 'Role / title', value: p.role ?? '' },
              ]}
              onSave={(v) => void patch(p.id, { contact_name: v.contact_name.trim() || null, role: v.role.trim() || null })}
            />
          </Stop>
        );
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
            onSave={(v) => void patch(p.id, stagePatch(v as PartnerStage))}
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
      case 'needs_touchpoint':
        return (
          <Stop>
            <div className="flex items-center gap-1.5">
              <InlineCheckbox
                checked={p.needs_additional_touchpoint}
                onSave={(v) => void patch(p.id, v
                  ? { needs_additional_touchpoint: true }
                  : { needs_additional_touchpoint: false, additional_touchpoint_label: null, additional_touchpoint_due: null })}
              />
              {p.needs_additional_touchpoint && (
                // One readable line ("Review MOU · due Sep 21, 2027"); clicking opens labeled
                // boxes with instructions, instead of two cramped inline boxes where only the
                // first word of the placeholder fit.
                <SplitFieldCell
                  display={[
                    p.additional_touchpoint_label,
                    p.additional_touchpoint_due ? `due ${new Date(`${p.additional_touchpoint_due}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : null,
                  ].filter(Boolean).join(' · ')}
                  placeholder="Click to say what's needed and when"
                  fields={[
                    {
                      key: 'label',
                      label: 'What needs to happen',
                      value: p.additional_touchpoint_label ?? '',
                      placeholder: 'e.g. Review MOU, Call about spring volunteer day',
                      hint: 'The touchpoint this record needs beyond TSM. It becomes a task for the owner when it comes due.',
                    },
                    { key: 'due', label: 'Due date', value: p.additional_touchpoint_due ?? '', type: 'date' },
                  ]}
                  onSave={(v) => void patch(p.id, { additional_touchpoint_label: v.label.trim() || null, additional_touchpoint_due: v.due || null })}
                />
              )}
            </div>
          </Stop>
        );
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
      case 'mou_status':
        return (
          <InlineSelect
            value={p.mou_status ?? ''}
            disabled={!isPartnershipsStaff}
            onSave={(v) => void patch(p.id, { mou_status: (v || null) as MouStatus | null })}
            options={[{ value: '', label: '—' }, ...MOU_STATUSES.map((s) => ({ value: s, label: MOU_STATUS[s] }))]}
          />
        );
      case 'giving_method':
        return (
          <Stop>
            <GivingMethodEditor
              value={p.giving_method}
              onSave={(v) => void patch(p.id, { giving_method: v })}
              inputClassName={`${editableBase} cursor-pointer text-sm text-sparrow-ink dark:text-sparrow-dark-ink`}
            />
          </Stop>
        );
      case 'newsletter':
        return <InlineCheckbox checked={p.newsletter_subscribed} onSave={(v) => void patch(p.id, { newsletter_subscribed: v })} />;
      case 'first_gift_date':
        return <Stop><InlineText type="date" value={p.first_gift_date ?? ''} onSave={(v) => void patch(p.id, { first_gift_date: v || null })} /></Stop>;
      case 'sparrow_provides':
        return <ExpandableText value={p.sparrow_provides} placeholder="—" onSave={(v) => void patch(p.id, { sparrow_provides: v })} />;
      case 'partner_provides':
        return (
          <Stop>
            <MultiSelectDropdown
              options={PARTNER_PROVIDES_PRESETS.map((t) => ({ value: t, label: t }))}
              selected={p.partner_provides_tags}
              onChange={(next) => void patch(p.id, { partner_provides_tags: next as PartnerProvidesTag[] })}
              placeholder="—"
            />
          </Stop>
        );
      default:
        return null;
    }
  }

  // Same grey-out rules as AddPartnerPanel/PartnerDetailPanel: a field that doesn't apply to
  // this record's category is dimmed and not editable inline (clicking it just opens the record).
  function fieldApplies(p: Partner, key: ColKey): boolean {
    switch (key) {
      case 'donor_tier': case 'giving_method': case 'first_gift_date':
        return p.type === 'donor';
      case 'mou_status': case 'sparrow_provides': case 'partner_provides':
        return p.type === 'community';
      case 'contact_name':
        return !isPersonRecord(p);
      default:
        return true;
    }
  }

  function renderCellWithGreyOut(p: Partner, key: ColKey) {
    if (fieldApplies(p, key)) return renderCell(p, key);
    return <div className="pointer-events-none w-full opacity-30" aria-disabled>{renderCell(p, key)}</div>;
  }

  if (partners.length === 0) {
    return <p className="py-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No partners in this view yet.</p>;
  }

  const filtersActive = Object.values(columnFilters).some((set) => set && set.size > 0);

  return (
    <GridTableShell
      layout={layout}
      sortKey={sortKey}
      sortDir={sortDir}
      onHeaderClick={handleHeaderClick}
      startResize={startResize}
      items={sorted}
      rowKey={(p) => p.id}
      renderCell={renderCellWithGreyOut}
      onRowClick={(p) => onOpenPartner(p.id)}
      rowClassName={() => 'cursor-pointer hover:bg-sparrow-mist/40 dark:hover:bg-sparrow-dark-surface2'}
      renderHeaderExtra={renderHeaderExtra}
      emptyMessage={filtersActive ? 'No partners match the current column filters.' : 'No partners in this view yet.'}
      toolbar={filtersActive ? (
        <button
          type="button"
          onClick={() => setColumnFilters({})}
          className="rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border px-2.5 py-1 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
        >
          Clear column filters
        </button>
      ) : undefined}
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

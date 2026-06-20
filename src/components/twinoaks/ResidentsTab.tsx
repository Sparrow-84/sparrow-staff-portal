import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { householdSortKey, type HouseholdMember, type Space, type Tenant } from '@/lib/housing-types';
import { fetchHouseholdMembers } from '@/lib/housing';

interface Props {
  spaces: Space[];
  tenants: Tenant[];
  onSelectSpace: (spaceId: string) => void;
}

interface HouseholdRow {
  space: Space;
  tenant: Tenant | null;
  members: HouseholdMember[];
  sortKey: string;
}

// Load all members lazily — fires once on mount
function useMembersBySpace(spaces: Space[]) {
  const [membersBySpace, setMembersBySpace] = useState<Map<string, HouseholdMember[]>>(new Map());
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || spaces.length === 0) return;
    loaded.current = true;
    void Promise.all(
      spaces.map((s) =>
        fetchHouseholdMembers(s.id)
          .then((m) => [s.id, m] as [string, HouseholdMember[]])
          .catch(() => [s.id, []] as [string, HouseholdMember[]]),
      ),
    ).then((entries) => setMembersBySpace(new Map(entries)));
  }, [spaces]);

  return membersBySpace;
}

function csvCell(val: string | number | null | undefined): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCSV(rows: HouseholdRow[]): string {
  const headers = [
    'Lot', 'Address', 'Household Name', 'Status', 'Designation', 'Move-in Date',
    'Children', 'Children Names', 'Adults', 'Phones', 'Emails', 'Emergency Contact Notes',
  ];
  const lines = [headers.map(csvCell).join(',')];

  for (const { space, tenant, members } of rows) {
    const designation = space.designation_type === 'lcp'
      ? (space.designation_label || 'LCP')
      : space.designation_type === 'sv' ? 'SV'
      : space.designation_type === 'pm' ? 'PM'
      : (space.designation_label || space.designation_type || '');

    const address = [space.street_number, space.street_name].filter(Boolean).join(' ');
    const primaryName = tenant?.name?.trim() || members[0]?.name || '';
    const adults = members.map((m) => m.name).join('; ');
    const phones = members.map((m) => m.phone ?? '').filter(Boolean).join('; ');
    const emails = members.map((m) => m.email ?? '').filter(Boolean).join('; ');

    lines.push([
      space.label,
      address,
      primaryName,
      tenant?.status ?? '',
      designation,
      tenant?.move_in_date ?? '',
      tenant?.children ?? '',
      tenant?.children_names ?? '',
      adults,
      phones,
      emails,
      tenant?.emergency_contact_notes ?? '',
    ].map(csvCell).join(','));
  }

  return lines.join('\r\n');
}

export function ResidentsTab({ spaces, tenants, onSelectSpace }: Props) {
  const [query, setQuery] = useState('');

  const membersBySpace = useMembersBySpace(spaces);

  const tenantBySpace = useMemo(() => {
    const map = new Map<string, Tenant>();
    for (const t of tenants) {
      if (t.space_id && (t.status === 'active' || t.status === 'applicant')) {
        map.set(t.space_id, t);
      }
    }
    return map;
  }, [tenants]);

  const rows = useMemo<HouseholdRow[]>(() => {
    const result: HouseholdRow[] = [];
    for (const space of spaces) {
      const tenant = tenantBySpace.get(space.id) ?? null;
      const members = membersBySpace.get(space.id) ?? [];
      if (!tenant && members.length === 0) continue;
      result.push({
        space,
        tenant,
        members,
        sortKey: householdSortKey(tenant, members[0] ?? null),
      });
    }
    return result.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [spaces, membersBySpace, tenantBySpace]);

  const exportCSV = useCallback(() => {
    const csv = buildCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `toc-residents-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows]);

  const q = query.toLowerCase().trim();
  const filtered = q
    ? rows.filter((r) => {
        if (r.space.label.includes(q)) return true;
        if (r.tenant?.name?.toLowerCase().includes(q)) return true;
        if (r.space.designation_label?.toLowerCase().includes(q)) return true;
        if (r.space.designation_type?.toLowerCase().includes(q)) return true;
        return r.members.some(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            (m.phone ?? '').includes(q) ||
            (m.email ?? '').toLowerCase().includes(q),
        );
      })
    : rows;

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3">
        <input
          className="field-input max-w-xs w-full"
          placeholder="Search by name, lot, phone, or detail…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          onClick={exportCSV}
          disabled={rows.length === 0}
          className="shrink-0 rounded-lg border border-sparrow-rule bg-white px-3 py-2 text-sm font-medium text-sparrow-ink hover:bg-sparrow-mist disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {filtered.length === 0 && (
        <p className="rounded-xl border border-dashed border-sparrow-rule p-8 text-center text-sm text-sparrow-gray">
          {q ? 'No matches.' : 'No current residents on file.'}
        </p>
      )}

      <ul className="divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
        {filtered.map(({ space, tenant, members }) => {
          const isPast = tenant && (tenant.status === 'moved_out' || tenant.status === 'evicted');
          const primaryName = tenant?.name?.trim() || members[0]?.name || '—';
          const others = tenant?.name?.trim() ? members : members.slice(1);

          return (
            <li key={space.id}>
              <button
                onClick={() => onSelectSpace(space.id)}
                className="flex w-full items-start gap-4 px-4 py-3 text-left hover:bg-sparrow-mist"
              >
                {/* Lot badge */}
                <span className="mt-0.5 shrink-0 rounded-lg border border-sparrow-rule bg-sparrow-mist px-2 py-1 text-xs font-semibold text-sparrow-gray">
                  {space.label}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sparrow-ink">{primaryName}</span>
                    {isPast && (
                      <span className="rounded-full bg-priority-p1/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-priority-p1">
                        {tenant?.status === 'evicted' ? 'Evicted' : 'Moved out'}
                      </span>
                    )}
                    {space.designation_type && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        space.designation_type === 'lcp' ? 'bg-purple-100 text-purple-700'
                        : space.designation_type === 'sv' ? 'bg-amber-100 text-amber-700'
                        : space.designation_type === 'pm' ? 'bg-teal-100 text-teal-700'
                        : 'bg-slate-100 text-slate-600'
                      }`}>
                        {space.designation_type === 'lcp' ? (space.designation_label || 'LCP')
                          : space.designation_type === 'sv' ? 'SV'
                          : space.designation_type === 'pm' ? 'PM'
                          : (space.designation_label || 'Special')}
                      </span>
                    )}
                  </div>

                  {/* Other adults in same household */}
                  {others.length > 0 && (
                    <div className="mt-1 border-l-2 border-sparrow-rule pl-3">
                      {others.map((m) => (
                        <p key={m.id} className="text-xs text-sparrow-gray">{m.name}</p>
                      ))}
                    </div>
                  )}

                  {/* Children if any */}
                  {(tenant?.children ?? 0) > 0 && (
                    <p className="mt-0.5 text-xs text-sparrow-gray">
                      {tenant!.children} child{tenant!.children !== 1 ? 'ren' : ''}
                      {tenant?.children_names ? `: ${tenant.children_names}` : ''}
                    </p>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

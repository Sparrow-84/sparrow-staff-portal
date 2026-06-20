import { useEffect, useMemo, useState } from 'react';
import { fetchMembersForTenant, fetchNoticesForTenant, type LotNoticeWithCreator } from '@/lib/housing';
import type { HouseholdMember, Space, Tenant } from '@/lib/housing-types';

function csvCell(val: string | number | null | undefined): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildArchiveCSV(pastTenants: Tenant[], spaceById: Map<string, Space>): string {
  const headers = ['Lot', 'Address', 'Household Name', 'Status', 'Move-in Date', 'Children', 'Children Names', 'Notes'];
  const lines = [headers.map(csvCell).join(',')];

  const sorted = [...pastTenants].sort((a, b) => {
    const lotA = Number(spaceById.get(a.space_id ?? '')?.label ?? 999);
    const lotB = Number(spaceById.get(b.space_id ?? '')?.label ?? 999);
    return lotA - lotB;
  });

  for (const t of sorted) {
    const space = spaceById.get(t.space_id ?? '');
    const address = space
      ? [space.street_number, space.street_name].filter(Boolean).join(' ')
      : '';
    lines.push([
      space?.label ?? '',
      address,
      t.name ?? '',
      t.status === 'evicted' ? 'Evicted' : 'Moved out',
      t.move_in_date ?? '',
      t.children ?? '',
      t.children_names ?? '',
      t.notes ?? '',
    ].map(csvCell).join(','));
  }

  return lines.join('\r\n');
}

interface Props {
  spaces: Space[];
  tenants: Tenant[];
}

function statusLabel(status: Tenant['status']): string {
  return status === 'evicted' ? 'Evicted' : 'Moved out';
}

function statusBadgeClass(status: Tenant['status']): string {
  return status === 'evicted'
    ? 'bg-priority-p1/10 text-priority-p1'
    : 'bg-sparrow-mist text-sparrow-gray';
}

// ── Archive detail panel ──────────────────────────────────────────────

interface PanelProps {
  open: boolean;
  tenant: Tenant | null;
  space: Space | null;
  onClose: () => void;
}

function ArchiveDetailPanel({ open, tenant, space, onClose }: PanelProps) {
  const [notices, setNotices] = useState<LotNoticeWithCreator[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !tenant) return;
    setLoading(true);
    void Promise.all([
      fetchNoticesForTenant(tenant.id).catch(() => [] as LotNoticeWithCreator[]),
      fetchMembersForTenant(tenant.id).catch(() => [] as HouseholdMember[]),
    ]).then(([n, m]) => {
      setNotices(n);
      setMembers(m);
    }).finally(() => setLoading(false));
  }, [open, tenant?.id]);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-sparrow-ink/30 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {tenant && (
          <>
            <div className="flex items-center justify-between border-b border-sparrow-rule px-5 py-4">
              <div>
                <h2 className="font-serif text-lg font-semibold">{tenant.name || 'Unnamed household'}</h2>
                <p className="text-xs text-sparrow-gray">
                  {space ? `Lot ${space.label} · ` : ''}{statusLabel(tenant.status)}
                </p>
              </div>
              <button onClick={onClose} className="btn-ghost" aria-label="Close">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-sm">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${statusBadgeClass(tenant.status)}`}>
                {statusLabel(tenant.status)}
              </span>

              {tenant.move_in_date && (
                <div>
                  <p className="field-label">Move-in date (as reported)</p>
                  <p className="text-sparrow-ink">{tenant.move_in_date}</p>
                </div>
              )}

              {/* Household adults */}
              {!loading && members.length > 0 && (
                <div>
                  <p className="field-label mb-2">Adults</p>
                  <div className="space-y-2">
                    {members.map((m) => (
                      <div key={m.id} className="rounded-lg border border-sparrow-rule p-2.5">
                        <p className="font-medium text-sparrow-ink">{m.name}</p>
                        {(m.phone || m.email) && (
                          <p className="text-xs text-sparrow-gray">
                            {[m.phone, m.email].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(tenant.children ?? 0) > 0 && (
                <div>
                  <p className="field-label">Children</p>
                  <p className="text-sparrow-ink">
                    {tenant.children} child{(tenant.children ?? 0) !== 1 ? 'ren' : ''}
                    {tenant.children_names ? `: ${tenant.children_names}` : ''}
                  </p>
                </div>
              )}

              {tenant.emergency_contact_notes && (
                <div>
                  <p className="field-label">Emergency contact</p>
                  <p className="rounded bg-sparrow-cream px-3 py-2 text-xs text-sparrow-ink">
                    {tenant.emergency_contact_notes}
                  </p>
                </div>
              )}

              {tenant.notes && (
                <div>
                  <p className="field-label">Notes</p>
                  <p className="rounded bg-sparrow-cream px-3 py-2 text-xs text-sparrow-ink">{tenant.notes}</p>
                </div>
              )}

              <div>
                <p className="field-label mb-2">Notices</p>
                {loading ? (
                  <p className="text-xs text-sparrow-gray">Loading…</p>
                ) : notices.length === 0 ? (
                  <p className="text-sparrow-gray">None on record.</p>
                ) : (
                  <ul className="divide-y divide-sparrow-rule rounded-xl border border-sparrow-rule">
                    {notices.map((n) => (
                      <li key={n.id} className="px-3 py-2">
                        <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-bold ${n.notice_type === 'E' ? 'bg-priority-p1 text-white' : 'bg-priority-p2 text-white'}`}>
                          {n.notice_type === 'E' ? 'Eviction' : `Notice ${n.notice_type}`}
                        </span>
                        <span className="text-xs text-sparrow-gray">{n.notice_date}</span>
                        <p className="mt-1 text-xs text-sparrow-ink">{n.description}</p>
                        {n.creator && (
                          <p className="mt-0.5 text-xs text-sparrow-gray/70">{n.creator.full_name}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

// ── Archive tab ───────────────────────────────────────────────────────

export function ArchiveTab({ spaces, tenants }: Props) {
  const [query, setQuery] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const pastTenants = useMemo(
    () => tenants.filter((t) => t.status === 'moved_out' || t.status === 'evicted'),
    [tenants],
  );

  const spaceById = useMemo(() => {
    const map = new Map<string, Space>();
    for (const s of spaces) map.set(s.id, s);
    return map;
  }, [spaces]);

  function exportCSV() {
    const csv = buildArchiveCSV(pastTenants, spaceById);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `toc-archive-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const byLot = useMemo(() => {
    const map = new Map<string, Tenant[]>();
    for (const t of pastTenants) {
      if (!t.space_id) continue;
      const arr = map.get(t.space_id) ?? [];
      arr.push(t);
      map.set(t.space_id, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) =>
        (b.move_in_date ?? b.created_at).localeCompare(a.move_in_date ?? a.created_at),
      );
    }
    return map;
  }, [pastTenants]);

  const lotsWithHistory = useMemo(
    () =>
      [...byLot.keys()]
        .map((id) => spaceById.get(id))
        .filter((s): s is Space => !!s)
        .sort((a, b) => Number(a.label) - Number(b.label)),
    [byLot, spaceById],
  );

  const q = query.toLowerCase().trim();
  const searchResults = useMemo(() => {
    if (!q) return [];
    return pastTenants
      .filter((t) => {
        const lot = spaceById.get(t.space_id ?? '');
        return (
          (lot?.label ?? '').includes(q) ||
          (t.name ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        (b.move_in_date ?? b.created_at).localeCompare(a.move_in_date ?? a.created_at),
      );
  }, [q, pastTenants, spaceById]);

  function openTenant(t: Tenant) {
    setSelectedTenant(t);
    setPanelOpen(true);
  }

  return (
    <>
      <div className="mt-6">
        <div className="mb-6 flex items-center gap-3">
          <input
            className="field-input max-w-xs w-full"
            placeholder="Search by name or lot number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            onClick={exportCSV}
            disabled={pastTenants.length === 0}
            className="shrink-0 rounded-lg border border-sparrow-rule bg-white px-3 py-2 text-sm font-medium text-sparrow-ink hover:bg-sparrow-mist disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>

        {q ? (
          searchResults.length === 0 ? (
            <p className="rounded-xl border border-dashed border-sparrow-rule bg-white p-8 text-center text-sm text-sparrow-gray">
              No matches.
            </p>
          ) : (
            <ul className="divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
              {searchResults.map((t) => {
                const lot = spaceById.get(t.space_id ?? '');
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => openTenant(t)}
                      className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-sparrow-mist"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sparrow-ink">{t.name || '—'}</p>
                        <p className="text-xs text-sparrow-gray">
                          {lot ? `Lot ${lot.label}` : 'Lot unknown'}
                          {t.move_in_date ? ` · Moved in ${t.move_in_date}` : ''}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadgeClass(t.status)}`}>
                        {statusLabel(t.status)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : pastTenants.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sparrow-rule bg-white p-8 text-center text-sm text-sparrow-gray">
            No archived residents yet.
          </p>
        ) : (
          <div className="space-y-4">
            {lotsWithHistory.map((space) => {
              const residents = byLot.get(space.id) ?? [];
              return (
                <section
                  key={space.id}
                  className="overflow-hidden rounded-xl border border-sparrow-rule bg-white"
                >
                  <div className="flex items-center justify-between border-b border-sparrow-rule bg-sparrow-mist/50 px-4 py-2.5">
                    <p className="text-sm font-semibold text-sparrow-ink">Lot {space.label}</p>
                    <p className="text-xs text-sparrow-gray">
                      {residents.length} past resident{residents.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <ul className="divide-y divide-sparrow-rule">
                    {residents.map((t) => (
                      <li key={t.id}>
                        <button
                          onClick={() => openTenant(t)}
                          className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-sparrow-mist"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sparrow-ink">{t.name || '—'}</p>
                            {t.move_in_date && (
                              <p className="text-xs text-sparrow-gray">Moved in {t.move_in_date}</p>
                            )}
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadgeClass(t.status)}`}>
                            {statusLabel(t.status)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <ArchiveDetailPanel
        open={panelOpen}
        tenant={selectedTenant}
        space={selectedTenant?.space_id ? (spaceById.get(selectedTenant.space_id) ?? null) : null}
        onClose={() => setPanelOpen(false)}
      />
    </>
  );
}

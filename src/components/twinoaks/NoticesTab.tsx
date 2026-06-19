import { useEffect, useState } from 'react';
import type { Space, Tenant } from '@/lib/housing-types';
import { fetchAllNotices, deleteNotice, type LotNoticeWithCreator } from '@/lib/housing';

interface Props {
  spaces: Space[];
  tenants: Tenant[];
  canManage: boolean;
  onSelectSpace: (spaceId: string) => void;
}

const NOTICE_COLOR: Record<string, string> = {
  E: 'bg-priority-p1 text-white',
  '3': 'bg-priority-p2 text-white',
  '2': 'bg-priority-p2/70 text-white',
  '1': 'bg-sparrow-gray/40 text-sparrow-ink',
};

export function NoticesTab({ spaces, tenants, canManage, onSelectSpace }: Props) {
  const [notices, setNotices] = useState<LotNoticeWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const lotLabelById = new Map(spaces.map((s) => [s.id, s.label]));
  const tenantNameBySpace = new Map(tenants.filter((t) => t.space_id).map((t) => [t.space_id!, t.name]));

  async function load() {
    try {
      setNotices(await fetchAllNotices());
    } catch { /* no-op */ }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.toLowerCase().trim();
  const filtered = q
    ? notices.filter((n) => {
        const lot = lotLabelById.get(n.space_id) ?? '';
        const name = tenantNameBySpace.get(n.space_id) ?? '';
        return (
          lot.includes(q) ||
          name.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q) ||
          n.notice_type.toLowerCase().includes(q)
        );
      })
    : notices;

  if (loading) return <p className="mt-8 text-sm text-sparrow-gray">Loading notices…</p>;

  return (
    <div className="mt-6">
      <div className="mb-4">
        <input
          className="field-input max-w-xs"
          placeholder="Search by lot, resident name, or description…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-sparrow-rule p-8 text-center text-sm text-sparrow-gray">
          {q ? 'No matching notices.' : 'No notices on record.'}
        </p>
      ) : (
        <ul className="divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
          {filtered.map((n) => {
            const lot = lotLabelById.get(n.space_id);
            const householdName = tenantNameBySpace.get(n.space_id);

            return (
              <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-bold ${NOTICE_COLOR[n.notice_type] ?? ''}`}>
                  {n.notice_type === 'E' ? 'Eviction' : `Notice ${n.notice_type}`}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    {lot && (
                      <button
                        onClick={() => onSelectSpace(n.space_id)}
                        className="text-sm font-semibold text-sparrow-green hover:underline"
                      >
                        Lot {lot}
                      </button>
                    )}
                    {householdName && <span className="text-sm text-sparrow-ink">{householdName}</span>}
                    <span className="text-xs text-sparrow-gray">{n.notice_date}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-sparrow-ink">{n.description}</p>
                  <p className="text-xs text-sparrow-gray capitalize">
                    {n.delivery_method.replace('_', ' ')}
                    {n.delivery_notes ? ` — ${n.delivery_notes}` : ''}
                    {n.creator ? ` · logged by ${n.creator.full_name}` : ''}
                  </p>
                </div>

                {canManage && (
                  <button
                    onClick={async () => { await deleteNotice(n.id); void load(); }}
                    className="shrink-0 text-xs text-sparrow-gray hover:text-priority-p1"
                    title="Delete notice"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

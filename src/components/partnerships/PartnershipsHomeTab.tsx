// Partnerships Room — "Home" view.
// Room-wide situational awareness: everything currently due or overdue across every
// recurring thing in the room, shown the same way to anyone with Partnerships access.
// This is NOT a personal to-do list — that's each owner's Incoming Tasks (routed via
// owner_id / emit_system_task, unrelated to this screen). Home is the shared "what does
// the room as a whole need this week" glance.
import { useEffect, useMemo, useState } from 'react';
import type { Profile } from '@/lib/types';
import { localDate } from '@/lib/date';
import { bucketFor, dueLabel } from '@/lib/tasks';
import { fetchHomeItems, type HomeItem, type HomeItemKind, type HomeNavTarget } from '@/lib/partnerships-home';
import { WidgetCard } from '@/components/home/widgets';

const KIND_ICON: Record<HomeItemKind, string> = {
  touchpoint: '🤝',
  collateral: '📦',
  connection: '🔗',
  social_post: '📱',
  newsletter: '📰',
};

interface Props {
  profiles: Profile[];
  onOpenPartner: (id: string) => void;
  onNavigateTab: (tab: HomeNavTarget) => void;
}

export function PartnershipsHomeTab({ profiles, onOpenPartner, onNavigateTab }: Props) {
  const [items, setItems] = useState<HomeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHomeItems()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load Home.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = localDate();
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const overdue = useMemo(
    () => items.filter((i) => bucketFor(i.due_date, false, today) === 'overdue'),
    [items, today],
  );
  const dueThisWeek = useMemo(
    () =>
      items.filter((i) => {
        const b = bucketFor(i.due_date, false, today);
        return b === 'today' || b === 'this_week';
      }),
    [items, today],
  );

  function ownerName(id: string): string {
    return profileById.get(id)?.full_name ?? 'Unassigned';
  }

  function open(item: HomeItem) {
    if (item.kind === 'touchpoint' && item.partnerId) {
      onOpenPartner(item.partnerId);
    } else if (item.navigateTab) {
      onNavigateTab(item.navigateTab);
    }
  }

  if (loading) return <p className="p-8 text-sm text-sparrow-gray">Loading Home…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-sparrow-gray">
        Everything due or overdue across the room this week — touchpoints, collateral
        reviews, connection follow-ups, social posting, and the newsletter calendar. This
        is a shared view: everyone with Partnerships access sees the same list.
      </p>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-sparrow-rule bg-white p-8 text-center shadow-card">
          <p className="text-sm font-medium text-sparrow-ink">Nothing due or overdue this week. 🎉</p>
          <p className="mt-1 text-sm text-sparrow-gray">
            The room is fully caught up on its stewardship rhythm.
          </p>
        </div>
      ) : (
        <>
          {overdue.length > 0 && (
            <WidgetCard title={`🔴 Overdue (${overdue.length})`}>
              <ItemsByOwner items={overdue} ownerName={ownerName} today={today} onOpen={open} />
            </WidgetCard>
          )}
          <WidgetCard title={`Due this week (${dueThisWeek.length})`}>
            {dueThisWeek.length === 0 ? (
              <p className="py-4 text-center text-sm text-sparrow-gray">
                Nothing else coming due this week.
              </p>
            ) : (
              <ItemsByOwner items={dueThisWeek} ownerName={ownerName} today={today} onOpen={open} />
            )}
          </WidgetCard>
        </>
      )}
    </div>
  );
}

function ItemsByOwner({
  items,
  ownerName,
  today,
  onOpen,
}: {
  items: HomeItem[];
  ownerName: (id: string) => string;
  today: string;
  onOpen: (item: HomeItem) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, HomeItem[]>();
    for (const item of items) {
      const list = map.get(item.owner_id) ?? [];
      list.push(item);
      map.set(item.owner_id, list);
    }
    return Array.from(map.entries()).sort((a, b) => ownerName(a[0]).localeCompare(ownerName(b[0])));
  }, [items, ownerName]);

  return (
    <div className="space-y-4">
      {groups.map(([ownerId, ownerItems]) => (
        <div key={ownerId}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
            {ownerName(ownerId)} · {ownerItems.length}
          </p>
          <ul className="space-y-1">
            {ownerItems.map((item) => (
              <li key={item.key}>
                <button
                  onClick={() => onOpen(item)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-sparrow-mist/50"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden>{KIND_ICON[item.kind]}</span>
                    <span className="truncate text-sparrow-ink">{item.title}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      bucketFor(item.due_date, false, today) === 'overdue'
                        ? 'bg-priority-p1/15 text-priority-p1'
                        : 'bg-sparrow-gold/20 text-sparrow-ink'
                    }`}
                  >
                    {dueLabel(item.due_date, today)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

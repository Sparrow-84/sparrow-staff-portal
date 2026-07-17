import { useEffect, useState } from 'react';
import { fetchNotifications, markAllRead, markRead, type AppNotification } from '@/lib/social';
import { setMyAttendance } from '@/lib/calendar';
import type { View } from './Sidebar';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function describe(n: AppNotification): string {
  const who = n.actor?.full_name ?? 'Someone';
  if (n.type === 'assigned') return `${who} assigned you a task`;
  if (n.type === 'edited') return `${who} updated a task assigned to you`;
  if (n.type === 'mentioned') return `${who} mentioned you in a message`;
  if (n.type === 'event_created') return `${who} posted a new All Staff event`;
  return `${who} commented on a task`;
}

function viewForNotification(n: AppNotification): View {
  if (n.type === 'mentioned') return 'messages';
  if (n.type === 'event_created') return 'calendar';
  return 'tasks';
}

export function NotificationBell({ onNavigate, currentUserId }: { onNavigate: (v: View) => void; currentUserId: string }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');
  const [responded, setResponded] = useState<Map<string, 'attending' | 'opted_out'>>(new Map());

  async function load() {
    try {
      setItems(await fetchNotifications());
    } catch {
      /* non-critical */
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, []);

  const unread = items.filter((n) => !n.read).length;
  const displayItems = filter === 'unread' ? items.filter((n) => !n.read) : items;

  async function openMenu() {
    setOpen(true);
    await load();
  }
  async function onItemClick(n: AppNotification) {
    setOpen(false);
    if (n.task_id) {
      sessionStorage.setItem('sparrow.pendingTaskOpen', n.task_id);
    }
    onNavigate(viewForNotification(n));
    if (!n.read) {
      await markRead(n.id);
      void load();
    }
  }
  async function clearAll() {
    await markAllRead();
    void load();
  }
  async function respond(n: AppNotification, status: 'attending' | 'opted_out') {
    if (!n.entity_id) return;
    await setMyAttendance(n.entity_id, currentUserId, status);
    setResponded((prev) => new Map(prev).set(n.id, status));
    if (!n.read) {
      await markRead(n.id);
      void load();
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => (open ? setOpen(false) : void openMenu())}
        className="relative rounded-lg p-2 text-sparrow-gray transition hover:bg-sparrow-mist hover:text-sparrow-ink"
        aria-label="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-priority-p1 px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="fixed right-4 top-16 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-sparrow-rule bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-sparrow-rule px-4 py-2">
              <div className="flex items-center gap-1 text-xs">
                <button
                  onClick={() => setFilter('unread')}
                  className={`rounded-full px-2 py-0.5 font-medium ${filter === 'unread' ? 'bg-sparrow-green/10 text-sparrow-green' : 'text-sparrow-gray hover:text-sparrow-ink'}`}
                >
                  Unread
                </button>
                <button
                  onClick={() => setFilter('all')}
                  className={`rounded-full px-2 py-0.5 font-medium ${filter === 'all' ? 'bg-sparrow-green/10 text-sparrow-green' : 'text-sparrow-gray hover:text-sparrow-ink'}`}
                >
                  All
                </button>
              </div>
              {unread > 0 && (
                <button onClick={() => void clearAll()} className="text-xs text-sparrow-green hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-96 divide-y divide-sparrow-rule overflow-y-auto">
              {displayItems.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-sparrow-gray">
                  {filter === 'unread' ? "You're all caught up." : 'No notifications yet.'}
                </li>
              )}
              {displayItems.map((n) => (
                <li key={n.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => void onItemClick(n)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void onItemClick(n); }}
                    className={`block w-full cursor-pointer px-4 py-3 text-left hover:bg-sparrow-mist ${n.read ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-sparrow-gray/40' : 'bg-sparrow-green'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-sparrow-ink">{describe(n)}</p>
                        {n.body && <p className="truncate text-xs text-sparrow-gray">{n.body}</p>}
                        <p className="mt-0.5 text-[11px] text-sparrow-gray/70">{timeAgo(n.created_at)}</p>
                        {n.type === 'event_created' && n.entity_id && (
                          responded.has(n.id) ? (
                            <p className="mt-1.5 text-xs font-medium text-sparrow-green">
                              {responded.get(n.id) === 'attending' ? "You're attending ✓" : "You said you're not attending"}
                            </p>
                          ) : (
                            <div className="mt-1.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <span className="text-xs text-sparrow-gray">Attending?</span>
                              <button
                                onClick={() => void respond(n, 'attending')}
                                className="rounded-md bg-sparrow-green px-2.5 py-1 text-xs font-medium text-white hover:bg-sparrow-green/90"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => void respond(n, 'opted_out')}
                                className="rounded-md bg-sparrow-mist px-2.5 py-1 text-xs font-medium text-sparrow-gray hover:text-sparrow-ink"
                              >
                                No
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

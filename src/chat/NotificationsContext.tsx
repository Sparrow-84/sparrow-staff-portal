import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchNotifications, type AppNotification } from '@/lib/social';

interface NotificationsState {
  items: AppNotification[];
  unread: number;
  refresh: () => void;
}

const NotificationsContext = createContext<NotificationsState>({ items: [], unread: 0, refresh: () => {} });

// Same idea as ChatContext's poll -- no realtime subscription for
// notifications yet, so this is the only freshness mechanism.
const POLL_MS = 30_000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([]);

  const refresh = useCallback(async () => {
    try {
      setItems(await fetchNotifications());
    } catch {
      /* non-critical: keep last good list */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const unread = items.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider value={{ items, unread, refresh }}>
      {children}
    </NotificationsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  return useContext(NotificationsContext);
}

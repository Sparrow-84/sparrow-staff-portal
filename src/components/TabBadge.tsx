import { useEffect } from 'react';
import { useChat } from '@/chat/ChatContext';
import { useNotifications } from '@/chat/NotificationsContext';
import { setTabBadge } from '@/lib/tabBadge';

/** No UI of its own -- just keeps the browser tab title/favicon in sync with
 *  unread chat + unread bell notifications, combined into one count. */
export function TabBadge() {
  const { unreadTotal } = useChat();
  const { unread } = useNotifications();

  useEffect(() => {
    void setTabBadge(unreadTotal + unread);
  }, [unreadTotal, unread]);

  return null;
}

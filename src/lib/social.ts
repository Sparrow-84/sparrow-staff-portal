import { supabase } from './supabase';

export interface Announcement {
  id: string;
  body: string;
  created_by: string | null;
  active: boolean;
  created_at: string;
}

export type NotificationType = 'assigned' | 'commented';

export interface AppNotification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  task_id: string | null;
  entity: string | null; // generic room pointer: 'task' | 'family' | 'work_order' | …
  entity_id: string | null;
  body: string | null;
  read: boolean;
  created_at: string;
  actor: { full_name: string } | null;
}

// ── Announcements ────────────────────────────────────────────────────
export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Announcement[];
}

export async function createAnnouncement(body: string, createdBy: string): Promise<void> {
  const { error } = await supabase.from('announcements').insert({ body, created_by: createdBy });
  if (error) throw new Error(error.message);
}

export async function dismissAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from('announcements').update({ active: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Notifications ────────────────────────────────────────────────────
export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*, actor:profiles!notifications_actor_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AppNotification[];
}

export async function markRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Marks all of the current user's unread notifications read (RLS scopes to them). */
export async function markAllRead(): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('read', false);
  if (error) throw new Error(error.message);
}

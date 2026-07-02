// Internal Chat (System 2) — types + data access. Mirrors supabase/migrations/0013_chat.sql.
// Membership-gated by RLS; channel creation goes through SECURITY DEFINER RPCs. Unread is
// derived from chat_members.last_read_at and is kept separate from the task notification bell.
import { supabase } from './supabase';

export type ChatChannelKind = 'direct' | 'group';

/** One row of the conversation list (from the chat_list_conversations RPC). */
export interface ChatConversation {
  channel_id: string;
  kind: ChatChannelKind;
  title: string | null;
  last_message_at: string;
  last_body: string | null;
  last_author_id: string | null;
  unread: number;
  other_id: string | null; // direct only: the other member
  other_name: string | null;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  voice_url: string | null;
  voice_duration: number | null;
  created_at: string;
}

/** A message joined with its author's name (for the thread view). */
export interface ChatMessageWithAuthor extends ChatMessage {
  author: { full_name: string } | null;
}

/** Directory entry used by the "new conversation" picker. */
export interface ChatPerson {
  id: string;
  full_name: string;
  department: string;
}

/** Display label for a conversation in the list / thread header. */
export function conversationLabel(c: ChatConversation): string {
  if (c.kind === 'direct') return c.other_name ?? 'Direct message';
  return c.title?.trim() || 'Group chat';
}

/** Initials for an avatar chip, e.g. "Susanna Basden" → "SB". */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ── Conversations ────────────────────────────────────────────────────
export async function listConversations(): Promise<ChatConversation[]> {
  const { data, error } = await supabase.rpc('chat_list_conversations');
  if (error) throw new Error(error.message);
  return (data ?? []) as ChatConversation[];
}

// ── Messages ─────────────────────────────────────────────────────────
export async function fetchMessages(channelId: string): Promise<ChatMessageWithAuthor[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*, author:profiles!chat_messages_author_id_fkey(full_name)')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ChatMessageWithAuthor[];
}

export async function sendMessage(
  channelId: string,
  authorId: string,
  body: string,
  voice?: { url: string; duration: number },
): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .insert({
      channel_id: channelId,
      author_id: authorId,
      body,
      ...(voice ? { voice_url: voice.url, voice_duration: voice.duration } : {}),
    });
  if (error) throw new Error(error.message);
}

export async function uploadVoiceBlob(
  blob: Blob,
  channelId: string,
  userId: string,
): Promise<{ url: string }> {
  const ext = blob.type.includes('mp4') || blob.type.includes('aac') ? 'm4a' : 'webm';
  const path = `${channelId}/${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('voice-messages')
    .upload(path, blob, { contentType: blob.type || 'audio/webm' });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('voice-messages').getPublicUrl(path);
  return { url: data.publicUrl };
}

/** Mark a conversation read up to now (clears its unread badge for me). */
export async function markRead(channelId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('channel_id', channelId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

// ── Starting conversations ───────────────────────────────────────────
export async function startDirect(otherId: string): Promise<string> {
  const { data, error } = await supabase.rpc('chat_start_direct', { p_other: otherId });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function createGroup(title: string, memberIds: string[]): Promise<string> {
  const { data, error } = await supabase.rpc('chat_create_group', {
    p_title: title,
    p_members: memberIds,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Parse @Full Name mentions from a message body and return the unique profile IDs
 * of the mentioned staff members. Same regex strategy as ChatThread.renderBody.
 */
export function parseMentionIds(body: string, staff: ChatPerson[]): string[] {
  if (!staff.length) return [];
  const escaped = staff.map((p) => p.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`@(${escaped.join('|')})`, 'g');
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const person = staff.find((p) => p.full_name === m![1]);
    if (person) ids.add(person.id);
  }
  return Array.from(ids);
}

/** Active staff directory (excludes me) for the new-conversation picker. */
export async function fetchStaff(meId: string): Promise<ChatPerson[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, department')
    .eq('active', true)
    .neq('id', meId)
    .order('full_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as ChatPerson[];
}

// ── Realtime ─────────────────────────────────────────────────────────
// Subscribe to message inserts. RLS limits delivery to channels the user belongs
// to, so the unfiltered variant safely drives the whole conversation list. Returns
// an unsubscribe function. If Realtime isn't enabled on the project this simply
// never fires and the polling fallback in ChatContext covers it.
export function subscribeToMessages(
  onInsert: (m: ChatMessage) => void,
  channelId?: string,
): () => void {
  const filter = channelId
    ? { event: 'INSERT' as const, schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${channelId}` }
    : { event: 'INSERT' as const, schema: 'public', table: 'chat_messages' };
  const ch = supabase
    .channel(channelId ? `chat:${channelId}` : 'chat:all')
    .on('postgres_changes', filter, (payload) => onInsert(payload.new as ChatMessage))
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

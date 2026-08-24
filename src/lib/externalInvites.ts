import { supabase } from './supabase';

export interface ExternalInvite {
  id: string;
  event_id: string;
  invited_email: string;
  note: string | null;
  invited_by: string | null;
  created_at: string;
}

export async function fetchExternalInvites(eventId: string): Promise<ExternalInvite[]> {
  const { data, error } = await supabase
    .from('event_external_invites')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) return []; // table may not exist until 0169 is applied
  return (data ?? []) as ExternalInvite[];
}

/**
 * Sends a branded calendar invite email to someone outside Sparrow, from the current
 * user's own real @sparrowinc.org address (via domain-delegated Gmail send in the
 * send-external-invite edge function), and records it here on success. Requires Byron
 * to have configured Workspace domain-wide delegation + the service account secret --
 * until then this will fail with a clear "not configured" error, not silently no-op.
 */
export async function inviteExternalToEvent(
  eventId: string,
  email: string,
  note: string | null,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('send-external-invite', {
    body: { eventId, email: email.trim(), note: note?.trim() || null },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
}

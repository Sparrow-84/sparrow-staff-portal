import { supabase } from './supabase';

export interface GoogleCalendarSyncStatus {
  exportToken: string | null;
  importUrl: string | null;
  lastSyncedAt: string | null;
}

export async function fetchGoogleCalendarSyncStatus(userId: string): Promise<GoogleCalendarSyncStatus> {
  const { data, error } = await supabase
    .from('profiles')
    .select('google_calendar_export_token, google_calendar_import_url, google_calendar_last_synced_at')
    .eq('id', userId)
    .single();
  if (error || !data) return { exportToken: null, importUrl: null, lastSyncedAt: null };
  return {
    exportToken: data.google_calendar_export_token,
    importUrl: data.google_calendar_import_url,
    lastSyncedAt: data.google_calendar_last_synced_at,
  };
}

/** Creates (or regenerates) this user's export token — regenerating invalidates the old
 * link immediately, for the case a link ever leaks. */
export async function regenerateExportToken(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  const { error } = await supabase
    .from('profiles')
    .update({ google_calendar_export_token: token })
    .eq('id', userId);
  if (error) throw new Error(error.message);
  return token;
}

export async function setGoogleImportUrl(userId: string, url: string | null): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ google_calendar_import_url: url })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

export function exportFeedUrl(token: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
  return `${base}/functions/v1/export-calendar-ics?token=${token}`;
}

/**
 * Best-effort pull of this user's own Google Calendar events into their Personal tab.
 * Fire-and-forget from fetchCalendar(), same convention as syncStaffBirthdayEvents() etc —
 * a no-op if the user hasn't pasted an import URL yet, and never throws (a broken/expired
 * Google link shouldn't take down the whole calendar load).
 */
export async function syncGoogleCalendarImport(): Promise<void> {
  try {
    await supabase.functions.invoke('sync-google-calendar-import', { body: {} });
  } catch {
    // best-effort — see comment above
  }
}

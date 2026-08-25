import { supabase } from './supabase';
import type { Grant, GrantContact, GrantDocument, GrantLink, GrantNotification, GrantNotificationCategory } from './grants-types';

// All reads/writes are gated by RLS to the ops tier (has_ops_access(): Andrew, Susanna,
// Shelly). Notifications are append-only (insert + select only — see 0078_grants.sql).

/** Fire-and-forget: ensures certification/deadline reminder tasks exist for anything
 * inside its owner's lead-time window, same pattern as calendar.ts's sync* helpers —
 * without this, reminders only ever appeared once a day when pg_cron happened to fire. */
async function syncGrantReminderTasks(): Promise<void> {
  try {
    await supabase.rpc('emit_grant_reminder_tasks');
  } catch {
    // best-effort — a failed sync just means reminders wait for the next cron run
  }
}

// ── Grants ───────────────────────────────────────────────────────────
export async function fetchGrants(): Promise<Grant[]> {
  await syncGrantReminderTasks();
  const { data, error } = await supabase.from('grants').select('*').order('funder_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Grant[];
}

export interface GrantInput {
  funder_name: string;
  amount: number | null;
  placed_in_service_date: string | null;
  affordability_period_end: string | null;
  certification_due_date: string | null;
  prior_consent_required: boolean;
  notes: string | null;
  owner_id: string | null;
  lead_time_days: number;
}

export async function createGrant(input: GrantInput, createdBy: string): Promise<Grant> {
  const { data, error } = await supabase
    .from('grants')
    .insert({ ...input, created_by: createdBy })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Grant;
}

export async function updateGrant(
  id: string,
  patch: Partial<GrantInput> & { last_certified_on?: string | null },
): Promise<void> {
  const { error } = await supabase.from('grants').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Mark this year's annual certification done: records the date and rolls the due date
 * forward exactly one year (so next year's reminder is already in place). Takes the due
 * date explicitly (the caller's current form value) rather than reading it off a `Grant`
 * prop — a typed-but-not-yet-saved due date must still be what gets rolled forward, not
 * whatever's still in the database. */
export async function markCertified(grantId: string, currentDueDate: string | null, completedOn: string): Promise<void> {
  let nextDue: string | null = null;
  if (currentDueDate) {
    const d = new Date(currentDueDate);
    d.setFullYear(d.getFullYear() + 1);
    nextDue = d.toISOString().slice(0, 10);
  }
  const { error } = await supabase
    .from('grants')
    .update({ last_certified_on: completedOn, certification_due_date: nextDue })
    .eq('id', grantId);
  if (error) throw new Error(error.message);
}

export async function deleteGrant(id: string): Promise<void> {
  const { error } = await supabase.from('grants').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Flags a grant Past — every field, link, and document stays exactly as it was; this
 * only changes which tab it shows up in. */
export async function setGrantStatus(id: string, status: Grant['status']): Promise<void> {
  const { error } = await supabase.from('grants').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Links (same shape as grant_prospect_links — copied over automatically when a
// prospect is awarded, see mark_prospect_awarded() in 0144) ─────────────────────
export async function fetchGrantLinks(grantId: string): Promise<GrantLink[]> {
  const { data, error } = await supabase
    .from('grant_links')
    .select('*')
    .eq('grant_id', grantId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as GrantLink[];
}

export async function addGrantLink(grantId: string, label: string, url: string, createdBy: string): Promise<void> {
  const { error } = await supabase.from('grant_links').insert({ grant_id: grantId, label, url, created_by: createdBy });
  if (error) throw new Error(error.message);
}

export async function deleteGrantLink(id: string): Promise<void> {
  const { error } = await supabase.from('grant_links').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Contacts (same shape as grant_prospect_contacts — carried over automatically when
// a prospect is awarded, see copy_prospect_contacts_to_grant() in 0171) ─────────────
export async function fetchGrantContacts(grantId: string): Promise<GrantContact[]> {
  const { data, error } = await supabase
    .from('grant_contacts')
    .select('*')
    .eq('grant_id', grantId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as GrantContact[];
}

export async function addGrantContact(
  grantId: string,
  input: { name: string; email: string | null; phone: string | null; note: string | null },
  createdBy: string,
): Promise<void> {
  const { error } = await supabase.from('grant_contacts').insert({ grant_id: grantId, ...input, created_by: createdBy });
  if (error) throw new Error(error.message);
}

export async function updateGrantContact(
  id: string,
  patch: Partial<{ name: string; email: string | null; phone: string | null; note: string | null }>,
): Promise<void> {
  const { error } = await supabase.from('grant_contacts').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteGrantContact(id: string): Promise<void> {
  const { error } = await supabase.from('grant_contacts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Notification event log (append-only) ────────────────────────────
export async function fetchGrantNotifications(grantId: string): Promise<GrantNotification[]> {
  const { data, error } = await supabase
    .from('grant_notifications')
    .select('*')
    .eq('grant_id', grantId)
    .order('sent_on', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GrantNotification[];
}

export async function addGrantNotification(
  grantId: string,
  category: GrantNotificationCategory,
  sentOn: string,
  notes: string | null,
  createdBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('grant_notifications')
    .insert({ grant_id: grantId, category, sent_on: sentOn, notes, created_by: createdBy });
  if (error) throw new Error(error.message);
}

// ── Document attachments ─────────────────────────────────────────────
// Files live in the private 'grant-documents' storage bucket (not public — grant
// agreements/correspondence). Mirrors the upload pattern in lib/housing.ts (lot photos)
// and lib/chat.ts (images/voice), but reads use a signed URL since the bucket is private.
export async function fetchGrantDocuments(grantId: string): Promise<GrantDocument[]> {
  const { data, error } = await supabase
    .from('grant_documents')
    .select('*')
    .eq('grant_id', grantId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GrantDocument[];
}

export async function uploadGrantDocument(
  grantId: string,
  label: string,
  file: File,
  createdBy: string,
): Promise<void> {
  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = `${grantId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('grant-documents')
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (upErr) throw new Error(upErr.message);

  const { error } = await supabase
    .from('grant_documents')
    .insert({ grant_id: grantId, label, storage_path: path, created_by: createdBy });
  if (error) throw new Error(error.message);
}

/** Signed URL for a private grant document (1 hour expiry — regenerate each time it's opened). */
export async function getGrantDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('grant-documents').createSignedUrl(storagePath, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function updateGrantDocumentSummary(id: string, summary: string | null): Promise<void> {
  const { error } = await supabase.from('grant_documents').update({ summary }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteGrantDocument(doc: GrantDocument): Promise<void> {
  const { error: storageErr } = await supabase.storage.from('grant-documents').remove([doc.storage_path]);
  if (storageErr) throw new Error(storageErr.message);
  const { error } = await supabase.from('grant_documents').delete().eq('id', doc.id);
  if (error) throw new Error(error.message);
}

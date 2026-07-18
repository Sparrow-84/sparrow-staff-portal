import { supabase } from './supabase';
import type { Grant, GrantDocument, GrantNotification, GrantNotificationCategory } from './grants-types';

// All reads/writes are gated by RLS to the ops tier (has_ops_access(): Andrew, Susanna,
// Shelly). Notifications are append-only (insert + select only — see 0078_grants.sql).

// ── Grants ───────────────────────────────────────────────────────────
export async function fetchGrants(): Promise<Grant[]> {
  const { data, error } = await supabase.from('grants').select('*').order('funder_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Grant[];
}

export interface GrantInput {
  funder_name: string;
  amount: number | null;
  placed_in_service_date: string | null;
  affordability_period_end: string | null;
  ohcs_contact_name: string | null;
  ohcs_contact_email: string | null;
  ohcs_contact_phone: string | null;
  certification_due_date: string | null;
  prior_consent_required: boolean;
  notes: string | null;
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
 * forward exactly one year (so next year's reminder is already in place). */
export async function markCertified(grant: Grant, completedOn: string): Promise<void> {
  let nextDue: string | null = null;
  if (grant.certification_due_date) {
    const d = new Date(grant.certification_due_date);
    d.setFullYear(d.getFullYear() + 1);
    nextDue = d.toISOString().slice(0, 10);
  }
  const { error } = await supabase
    .from('grants')
    .update({ last_certified_on: completedOn, certification_due_date: nextDue })
    .eq('id', grant.id);
  if (error) throw new Error(error.message);
}

export async function deleteGrant(id: string): Promise<void> {
  const { error } = await supabase.from('grants').delete().eq('id', id);
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

export async function deleteGrantDocument(doc: GrantDocument): Promise<void> {
  const { error: storageErr } = await supabase.storage.from('grant-documents').remove([doc.storage_path]);
  if (storageErr) throw new Error(storageErr.message);
  const { error } = await supabase.from('grant_documents').delete().eq('id', doc.id);
  if (error) throw new Error(error.message);
}

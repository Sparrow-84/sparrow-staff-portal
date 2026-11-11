import { supabase } from './supabase';
import type {
  GrantProspect,
  GrantProspectContact,
  GrantProspectDocument,
  GrantProspectLabel,
  GrantProspectLabelKind,
  GrantProspectLink,
  GrantProspectStatus,
  GrantProspectUpdate,
} from './grant-prospects-types';

// ── Labels (shared across ops tier — everyone with Grants access sees the same set) ──
export async function fetchProspectLabels(kind: GrantProspectLabelKind): Promise<GrantProspectLabel[]> {
  const { data, error } = await supabase
    .from('grant_prospect_labels')
    .select('*')
    .eq('kind', kind)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as GrantProspectLabel[];
}

export async function createProspectLabel(
  kind: GrantProspectLabelKind,
  name: string,
  color: string,
  createdBy: string,
): Promise<GrantProspectLabel> {
  const { data, error } = await supabase
    .from('grant_prospect_labels')
    .insert({ kind, name, color, created_by: createdBy })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as GrantProspectLabel;
}

export async function updateProspectLabel(id: string, name: string, color: string): Promise<void> {
  const { error } = await supabase.from('grant_prospect_labels').update({ name, color }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteProspectLabel(id: string): Promise<void> {
  const { error } = await supabase.from('grant_prospect_labels').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Prospects ─────────────────────────────────────────────────────────────────────
export async function fetchProspects(): Promise<GrantProspect[]> {
  const { data, error } = await supabase.from('grant_prospects').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GrantProspect[];
}

export interface ProspectInput {
  name: string;
  tier_label_id: string | null;
  source_label_id: string | null;
  status: GrantProspectStatus;
  application_opens: string | null;
  application_deadline: string | null;
  est_amount: number | null;
  findings: string | null;
  decision_reasoning: string | null;
  action_steps: string | null;
  owner_id: string | null;
  lead_time_days: number;
}

export async function createProspect(input: ProspectInput, createdBy: string): Promise<GrantProspect> {
  const { data, error } = await supabase
    .from('grant_prospects')
    .insert({ ...input, created_by: createdBy })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as GrantProspect;
}

export async function updateProspect(id: string, patch: Partial<ProspectInput>): Promise<void> {
  const { error } = await supabase.from('grant_prospects').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteProspect(id: string): Promise<void> {
  const { error } = await supabase.from('grant_prospects').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Marks a prospect Awarded via the DB function — creates the real Active Grant record
 * (pre-filled, findings/reasoning folded into its notes), carries its Updates log
 * forward to the new grant, and closes the prospect out. `outcomeDate` lets this be
 * backdated to when the award actually happened rather than always "today"; `note`
 * becomes the content of the auto-generated "Awarded" milestone entry. Returns the new
 * grant's id so the caller can jump straight to it. */
export async function markProspectAwarded(
  prospectId: string,
  createdBy: string,
  outcomeDate?: string,
  note?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('mark_prospect_awarded', {
    p_prospect_id: prospectId,
    p_created_by: createdBy,
    p_outcome_date: outcomeDate ?? new Date().toISOString().slice(0, 10),
    p_note: note || null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Records a Decided — No outcome with a date and an Updates entry, in one call — the
 * Declined counterpart to markProspectAwarded (which has its own DB function since it
 * also creates a Grant; a decline is just a status + outcome_date change). */
export async function markProspectDeclined(
  prospectId: string,
  outcomeDate: string,
  note: string | null,
  createdBy: string,
): Promise<void> {
  await updateProspect(prospectId, { status: 'decided_no' });
  const { error } = await supabase.from('grant_prospects').update({ outcome_date: outcomeDate }).eq('id', prospectId);
  if (error) throw new Error(error.message);
  await addProspectUpdate(prospectId, note || 'Declined.', 'Declined', createdBy);
}

/** Sets Applied Date and drops a matching milestone entry into the Updates log, in one
 * call — also bumps status to 'applied' if it isn't further along already (awarded/
 * declined shouldn't be walked back by marking an earlier Applied date). */
export async function markProspectApplied(
  prospectId: string,
  appliedDate: string,
  note: string | null,
  createdBy: string,
  currentStatus: GrantProspectStatus,
): Promise<void> {
  const patch: Partial<ProspectInput> & { applied_date?: string } = { applied_date: appliedDate };
  if (currentStatus !== 'awarded' && currentStatus !== 'decided_no') {
    patch.status = 'applied';
  }
  const { error } = await supabase.from('grant_prospects').update(patch).eq('id', prospectId);
  if (error) throw new Error(error.message);
  await addProspectUpdate(prospectId, note || 'Applied.', 'Applied', createdBy);
}

// ── Updates — an append-only timeline, separate from the current-state Findings/
// Decision Reasoning/Action Steps fields above (see grant-prospects-types.ts) ───────
export async function fetchProspectUpdates(prospectId: string): Promise<GrantProspectUpdate[]> {
  const { data, error } = await supabase
    .from('grant_prospect_updates')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GrantProspectUpdate[];
}

export async function addProspectUpdate(
  prospectId: string,
  body: string,
  milestone: string | null,
  createdBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('grant_prospect_updates')
    .insert({ prospect_id: prospectId, body, milestone, created_by: createdBy });
  if (error) throw new Error(error.message);
}

export async function deleteProspectUpdate(id: string): Promise<void> {
  const { error } = await supabase.from('grant_prospect_updates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Links ─────────────────────────────────────────────────────────────────────────
export async function fetchProspectLinks(prospectId: string): Promise<GrantProspectLink[]> {
  const { data, error } = await supabase
    .from('grant_prospect_links')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as GrantProspectLink[];
}

export async function addProspectLink(
  prospectId: string,
  label: string,
  url: string,
  createdBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('grant_prospect_links')
    .insert({ prospect_id: prospectId, label, url, created_by: createdBy });
  if (error) throw new Error(error.message);
}

export async function deleteProspectLink(id: string): Promise<void> {
  const { error } = await supabase.from('grant_prospect_links').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Contacts (independent of status — kept even for Not Moving Forward prospects in
// case they're revisited; carried forward automatically to the resulting Grant if this
// prospect is later awarded, see copy_prospect_contacts_to_grant() in 0171) ─────────
export async function fetchProspectContacts(prospectId: string): Promise<GrantProspectContact[]> {
  const { data, error } = await supabase
    .from('grant_prospect_contacts')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as GrantProspectContact[];
}

export async function addProspectContact(
  prospectId: string,
  input: { name: string; email: string | null; phone: string | null; note: string | null },
  createdBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('grant_prospect_contacts')
    .insert({ prospect_id: prospectId, ...input, created_by: createdBy });
  if (error) throw new Error(error.message);
}

export async function updateProspectContact(
  id: string,
  patch: Partial<{ name: string; email: string | null; phone: string | null; note: string | null }>,
): Promise<void> {
  const { error } = await supabase.from('grant_prospect_contacts').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteProspectContact(id: string): Promise<void> {
  const { error } = await supabase.from('grant_prospect_contacts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Documents (same private 'grant-documents' bucket as active grants) ────────────
export async function fetchProspectDocuments(prospectId: string): Promise<GrantProspectDocument[]> {
  const { data, error } = await supabase
    .from('grant_prospect_documents')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GrantProspectDocument[];
}

export async function uploadProspectDocument(
  prospectId: string,
  label: string,
  file: File,
  createdBy: string,
): Promise<void> {
  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = `prospect-${prospectId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('grant-documents')
    .upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (upErr) throw new Error(upErr.message);

  const { error } = await supabase
    .from('grant_prospect_documents')
    .insert({ prospect_id: prospectId, label, storage_path: path, created_by: createdBy });
  if (error) throw new Error(error.message);
}

export async function updateProspectDocumentSummary(id: string, summary: string | null): Promise<void> {
  const { error } = await supabase.from('grant_prospect_documents').update({ summary }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getProspectDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('grant-documents').createSignedUrl(storagePath, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function deleteProspectDocument(doc: GrantProspectDocument): Promise<void> {
  const { error: storageErr } = await supabase.storage.from('grant-documents').remove([doc.storage_path]);
  if (storageErr) throw new Error(storageErr.message);
  const { error } = await supabase.from('grant_prospect_documents').delete().eq('id', doc.id);
  if (error) throw new Error(error.message);
}

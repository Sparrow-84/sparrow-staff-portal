import { supabase } from './supabase';
import type {
  GrantProspect,
  GrantProspectDocument,
  GrantProspectLabel,
  GrantProspectLabelKind,
  GrantProspectLink,
  GrantProspectStatus,
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
 * (pre-filled, findings/reasoning folded into its notes) and closes the prospect out.
 * Returns the new grant's id so the caller can jump straight to it. */
export async function markProspectAwarded(prospectId: string, createdBy: string): Promise<string> {
  const { data, error } = await supabase.rpc('mark_prospect_awarded', {
    p_prospect_id: prospectId,
    p_created_by: createdBy,
  });
  if (error) throw new Error(error.message);
  return data as string;
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

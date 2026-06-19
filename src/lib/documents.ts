import { supabase } from './supabase';
import type { OrgDocument } from './documents-types';

export async function fetchOrgDocuments(): Promise<OrgDocument[]> {
  const { data, error } = await supabase
    .from('org_documents')
    .select('*')
    .order('category')
    .order('sort_order')
    .order('title');
  if (error) throw new Error(error.message);
  return (data ?? []) as OrgDocument[];
}

export async function addOrgDocument(
  input: Pick<OrgDocument, 'title' | 'category' | 'description' | 'url' | 'sort_order'>,
): Promise<void> {
  const { error } = await supabase.from('org_documents').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateOrgDocument(
  id: string,
  patch: Partial<Pick<OrgDocument, 'title' | 'category' | 'description' | 'url' | 'sort_order'>>,
): Promise<void> {
  const { error } = await supabase.from('org_documents').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteOrgDocument(id: string): Promise<void> {
  const { error } = await supabase.from('org_documents').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

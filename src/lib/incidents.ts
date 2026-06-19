import { supabase } from './supabase';
import type { Incident, IncidentWithLogger } from './incident-types';

const SELECT = '*, logger:profiles!toc_incidents_logged_by_fkey(id,full_name)';

export async function fetchIncidents(): Promise<IncidentWithLogger[]> {
  const { data, error } = await supabase
    .from('toc_incidents')
    .select(SELECT)
    .order('incident_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as IncidentWithLogger[];
}

export type IncidentInput = Pick<
  Incident,
  'incident_date' | 'lot_id' | 'lot_label' | 'incident_type' | 'severity' | 'description' | 'follow_up' | 'status' | 'logged_by'
>;

export async function createIncident(input: IncidentInput): Promise<void> {
  const { error } = await supabase.from('toc_incidents').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateIncident(
  id: string,
  patch: Partial<Omit<IncidentInput, 'logged_by'>>,
): Promise<void> {
  const { error } = await supabase
    .from('toc_incidents')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteIncident(id: string): Promise<void> {
  const { error } = await supabase.from('toc_incidents').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

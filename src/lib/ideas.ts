import { supabase } from './supabase';

export interface Idea {
  id: string;
  created_by: string;
  title: string;
  description: string;
  created_at: string;
  completed_at: string | null;
  shared: boolean;
}

export async function fetchMyIdeas(userId: string): Promise<Idea[]> {
  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });
  if (error) return []; // table may not exist until 0101 is applied
  return (data ?? []) as Idea[];
}

/** Every idea any staff member has flipped to shared -- includes the current
 *  user's own shared ideas too, so "Team Ideas" is a complete picture, not
 *  just everyone-else's. */
export async function fetchTeamIdeas(): Promise<Idea[]> {
  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .eq('shared', true)
    .order('created_at', { ascending: false });
  if (error) return []; // table/column may not exist until 0151 is applied
  return (data ?? []) as Idea[];
}

export async function setIdeaShared(id: string, shared: boolean): Promise<void> {
  const { error } = await supabase.from('ideas').update({ shared }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createIdea(userId: string, title: string, description: string): Promise<Idea> {
  const { data, error } = await supabase
    .from('ideas')
    .insert({ created_by: userId, title, description })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Idea;
}

export async function updateIdea(id: string, title: string, description: string): Promise<void> {
  const { error } = await supabase.from('ideas').update({ title, description }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setIdeaCompleted(id: string, completed: boolean): Promise<void> {
  const { error } = await supabase
    .from('ideas')
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteIdea(id: string): Promise<void> {
  const { error } = await supabase.from('ideas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

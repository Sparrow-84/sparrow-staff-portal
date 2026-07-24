import { supabase } from './supabase';

export interface Idea {
  id: string;
  created_by: string;
  title: string;
  description: string;
  created_at: string;
  completed_at: string | null;
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

export async function createIdea(userId: string, title: string, description: string): Promise<Idea> {
  const { data, error } = await supabase
    .from('ideas')
    .insert({ created_by: userId, title, description })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Idea;
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

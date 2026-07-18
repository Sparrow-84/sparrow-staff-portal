import { supabase } from './supabase';
import type { Department, Priority, Profile, TaskComment, TaskStatus, TaskWithPeople } from './types';

const TASK_SELECT =
  '*, assignee:profiles!tasks_assignee_id_fkey(id,full_name), creator:profiles!tasks_created_by_fkey(id,full_name)';

export interface TaskInput {
  title: string;
  notes: string | null;
  due_date: string | null;
  department: Department;
  priority: Priority;
  assignee_id: string;
  status: TaskStatus;
  label?: string | null;
  label_color?: string | null;
  recurrence_id?: string | null;
}

// ── Reads (RLS filters rows to what the signed-in user may see) ──────
export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('active', true)
    .order('full_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

export async function fetchTasks(): Promise<TaskWithPeople[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .order('priority')
    .order('due_date');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TaskWithPeople[];
}

export async function fetchComments(): Promise<TaskComment[]> {
  const { data, error } = await supabase.from('task_comments').select('*').order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskComment[];
}

// ── Writes (RLS enforces who may insert/update/delete) ───────────────
export async function createTask(input: TaskInput, createdBy: string): Promise<void> {
  let { error } = await supabase.from('tasks').insert({ ...input, created_by: createdBy });
  if (error?.message.includes('schema cache')) {
    // New columns (label, label_color, recurrence_id) not yet migrated — retry without them.
    const { label: _l, label_color: _lc, recurrence_id: _r, ...safe } = input;
    ({ error } = await supabase.from('tasks').insert({ ...safe, created_by: createdBy }));
  }
  if (error) throw new Error(error.message);
}

export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<void> {
  let { error } = await supabase.from('tasks').update(patch).eq('id', id);
  if (error?.message.includes('schema cache')) {
    const { label: _l, label_color: _lc, recurrence_id: _r, ...safe } = patch;
    ({ error } = await supabase.from('tasks').update(safe).eq('id', id));
  }
  if (error) throw new Error(error.message);
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const { error } = await supabase.from('tasks').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteFutureRecurringTasks(recurrenceId: string, fromDate: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('recurrence_id', recurrenceId)
    .gte('due_date', fromDate);
  if (error) throw new Error(error.message);
}

/**
 * "This + future" edit for a recurring series: applies non-date fields to every
 * occurrence from fromDueDate onward, then shifts each of those occurrences' own
 * due_date by deltaDays (so the rest of the series keeps its own spacing instead
 * of collapsing onto one date).
 */
export async function updateFutureRecurringTasks(
  recurrenceId: string,
  fromDueDate: string,
  fields: Partial<Pick<TaskInput, 'title' | 'notes' | 'department' | 'priority' | 'assignee_id' | 'label' | 'label_color'>>,
  deltaDays?: number,
): Promise<void> {
  if (Object.keys(fields).length > 0) {
    const { error } = await supabase
      .from('tasks')
      .update(fields)
      .eq('recurrence_id', recurrenceId)
      .gte('due_date', fromDueDate);
    if (error) throw new Error(error.message);
  }

  if (deltaDays) {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, due_date')
      .eq('recurrence_id', recurrenceId)
      .gte('due_date', fromDueDate);
    if (error) throw new Error(error.message);

    const updates = (data ?? [])
      .filter((row): row is { id: string; due_date: string } => !!row.due_date)
      .map((row) => {
        const d = new Date(row.due_date + 'T12:00:00');
        d.setDate(d.getDate() + deltaDays);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return { id: row.id, due_date: `${y}-${m}-${day}` };
      });

    await Promise.all(
      updates.map((u) =>
        supabase.from('tasks').update({ due_date: u.due_date }).eq('id', u.id)
          .then(({ error }) => { if (error) throw new Error(error.message); }),
      ),
    );
  }
}

export async function addComment(taskId: string, body: string, authorId: string): Promise<void> {
  const { error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, author_id: authorId, body });
  if (error) throw new Error(error.message);
}

// ── Incoming Tasks ───────────────────────────────────────────────────
// Assigned (or room-emitted) work lands triage_status='pending' for the recipient.
// They Accept it onto their day, Defer it to a date, or Push it back to the assigner.
export async function acceptTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').update({ triage_status: 'accepted' }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deferTask(id: string, dueDate: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ triage_status: 'accepted', due_date: dueDate })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Bounce a task back to its creator with a note explaining why (clears it from the
 * recipient's Incoming Tasks, lands it in the creator's). Runs as a single server-side
 * RPC so the reassignment doesn't depend on client-side RLS and the creator gets one
 * clear 'pushed_back' notification instead of a generic comment + reassignment pair.
 */
export async function pushBackTask(task: TaskWithPeople, note: string): Promise<void> {
  if (!task.created_by) throw new Error('This task has no assigner to push back to.');
  const { error } = await supabase.rpc('push_back_task', { p_task_id: task.id, p_note: note });
  if (error) throw new Error(error.message);
}

/** Insert 'mentioned' notifications for @mentions in a task comment. */
export async function notifyTaskCommentMentions(
  mentionedIds: string[],
  actorId: string,
  taskId: string,
  body: string,
): Promise<void> {
  if (!mentionedIds.length) return;
  const { error } = await supabase.rpc('task_comment_notify_mentions', {
    p_mentioned_ids: mentionedIds,
    p_actor_id: actorId,
    p_task_id: taskId,
    p_body: body,
  });
  if (error) throw new Error(error.message);
}

// ── Task labels — personal, reusable list feeding the label picker ──────
// The `tasks` table itself still just stores label/label_color as plain text;
// this is each person's own saved list (RLS-scoped to created_by = auth.uid()).

export interface TaskLabel {
  id: string;
  name: string;
  color: string; // matches a LABEL_COLORS id
  created_by: string;
}

export async function fetchTaskLabels(): Promise<TaskLabel[]> {
  const { data, error } = await supabase
    .from('task_labels')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return []; // table may not exist until 0073 is applied
  return (data ?? []) as TaskLabel[];
}

export async function createTaskLabel(input: { name: string; color: string; createdBy: string }): Promise<TaskLabel> {
  const { data, error } = await supabase
    .from('task_labels')
    .insert({ name: input.name, color: input.color, created_by: input.createdBy })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TaskLabel;
}

export async function updateTaskLabel(id: string, patch: { name?: string; color?: string }): Promise<void> {
  const { error } = await supabase.from('task_labels').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteTaskLabel(id: string): Promise<void> {
  const { error } = await supabase.from('task_labels').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

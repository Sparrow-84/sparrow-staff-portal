import { supabase } from './supabase';
import { localDate } from './date';
import type {
  Checklist,
  ChecklistKind,
  ChecklistStep,
  ChecklistTemplate,
  DocType,
  Issue,
  IssueStatus,
  Review,
  StaffDocument,
  StaffNote,
  Touchpoint,
} from './ops-types';

// All reads/writes are gated by RLS to the ops tier (has_ops_access(): Andrew, Susanna,
// Shelly) — except a new hire's own onboarding checklist, which their own client can read.

// ── Notes ────────────────────────────────────────────────────────────
export async function fetchNotes(staffId: string): Promise<StaffNote[]> {
  const { data, error } = await supabase
    .from('ops_staff_notes')
    .select('*')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffNote[];
}

export async function addNote(staffId: string, body: string, authorId: string): Promise<void> {
  const { error } = await supabase.from('ops_staff_notes').insert({ staff_id: staffId, body, author_id: authorId });
  if (error) throw new Error(error.message);
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('ops_staff_notes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Documents ────────────────────────────────────────────────────────
export interface DocumentInput {
  staff_id: string;
  label: string;
  url: string | null;
  doc_type: DocType;
}

export async function fetchDocuments(staffId: string): Promise<StaffDocument[]> {
  const { data, error } = await supabase
    .from('ops_staff_documents')
    .select('*')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffDocument[];
}

export async function addDocument(input: DocumentInput, createdBy: string): Promise<void> {
  const { error } = await supabase.from('ops_staff_documents').insert({ ...input, created_by: createdBy });
  if (error) throw new Error(error.message);
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase.from('ops_staff_documents').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Issues (HR log) ──────────────────────────────────────────────────
export async function fetchIssues(staffId: string): Promise<Issue[]> {
  const { data, error } = await supabase
    .from('ops_issues')
    .select('*')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Issue[];
}

export async function fetchOpenIssues(): Promise<Issue[]> {
  const { data, error } = await supabase.from('ops_issues').select('*').eq('status', 'open');
  if (error) throw new Error(error.message);
  return (data ?? []) as Issue[];
}

export async function addIssue(staffId: string, body: string, authorId: string): Promise<void> {
  const { error } = await supabase.from('ops_issues').insert({ staff_id: staffId, body, author_id: authorId });
  if (error) throw new Error(error.message);
}

export async function setIssueStatus(id: string, status: IssueStatus): Promise<void> {
  const patch = { status, resolved_at: status === 'resolved' ? new Date().toISOString() : null };
  const { error } = await supabase.from('ops_issues').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Touchpoints ──────────────────────────────────────────────────────
export async function fetchTouchpoints(staffId: string): Promise<Touchpoint[]> {
  const { data, error } = await supabase
    .from('ops_touchpoints')
    .select('*')
    .eq('staff_id', staffId)
    .order('met_on', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Touchpoint[];
}

export async function fetchAllTouchpoints(): Promise<Touchpoint[]> {
  const { data, error } = await supabase
    .from('ops_touchpoints')
    .select('*')
    .order('met_on', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Touchpoint[];
}

export async function addTouchpoint(
  staffId: string,
  metBy: string,
  metOn: string,
  note: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('ops_touchpoints')
    .insert({ staff_id: staffId, met_by: metBy, met_on: metOn, note });
  if (error) throw new Error(error.message);
}

// ── Reviews ──────────────────────────────────────────────────────────
export async function fetchReviews(staffId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('ops_reviews')
    .select('*')
    .eq('staff_id', staffId)
    .order('due_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Review[];
}

export async function fetchAllReviews(): Promise<Review[]> {
  const { data, error } = await supabase.from('ops_reviews').select('*').order('due_date');
  if (error) throw new Error(error.message);
  return (data ?? []) as Review[];
}

export async function addReview(staffId: string, dueDate: string, reviewerId: string): Promise<void> {
  const { error } = await supabase
    .from('ops_reviews')
    .insert({ staff_id: staffId, due_date: dueDate, reviewer_id: reviewerId });
  if (error) throw new Error(error.message);
}

export async function completeReview(id: string, notes: string | null): Promise<void> {
  const { error } = await supabase
    .from('ops_reviews')
    .update({ status: 'completed', completed_on: localDate(), notes })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Checklists (onboarding / offboarding) ────────────────────────────
export async function fetchTemplates(kind?: ChecklistKind): Promise<ChecklistTemplate[]> {
  let q = supabase.from('ops_checklist_templates').select('*').order('step_no');
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ChecklistTemplate[];
}

export async function fetchChecklistsForStaff(staffId: string): Promise<Checklist[]> {
  const { data, error } = await supabase
    .from('ops_checklists')
    .select('*')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Checklist[];
}

export async function fetchActiveChecklists(): Promise<Checklist[]> {
  const { data, error } = await supabase.from('ops_checklists').select('*').eq('status', 'active');
  if (error) throw new Error(error.message);
  return (data ?? []) as Checklist[];
}

export async function fetchChecklistSteps(checklistId: string): Promise<ChecklistStep[]> {
  const { data, error } = await supabase
    .from('ops_checklist_steps')
    .select('*')
    .eq('checklist_id', checklistId)
    .order('step_no');
  if (error) throw new Error(error.message);
  return (data ?? []) as ChecklistStep[];
}

/** Returns the current user's active onboarding checklist, or null if none. */
export async function fetchMyOnboardingChecklist(): Promise<Checklist | null> {
  const { data, error } = await supabase
    .from('ops_checklists')
    .select('*')
    .eq('kind', 'onboarding')
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Checklist | null;
}

/** Create a checklist for a staff member and copy the current template steps into it. */
export async function startChecklist(staffId: string, kind: ChecklistKind, createdBy: string): Promise<void> {
  const { data: run, error } = await supabase
    .from('ops_checklists')
    .insert({ staff_id: staffId, kind, created_by: createdBy })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const runId = (run as { id: string }).id;

  const { data: tmpl, error: tErr } = await supabase
    .from('ops_checklist_templates')
    .select('*')
    .eq('kind', kind)
    .order('step_no');
  if (tErr) throw new Error(tErr.message);

  const templates = (tmpl ?? []) as ChecklistTemplate[];
  const topLevel = templates.filter((t) => t.parent_id === null);
  const subtasks = templates.filter((t) => t.parent_id !== null);

  if (topLevel.length > 0) {
    const { error: sErr } = await supabase.from('ops_checklist_steps').insert(
      topLevel.map((t) => ({
        checklist_id: runId,
        step_no: t.step_no,
        title: t.title,
        description: t.description,
        url: t.url,
        estimated_minutes: t.estimated_minutes,
      })),
    );
    if (sErr) throw new Error(sErr.message);
  }

  if (subtasks.length > 0) {
    // Fetch inserted top-level steps to resolve parent_step_id by step_no
    const { data: insertedTop, error: fetchErr } = await supabase
      .from('ops_checklist_steps')
      .select('id, step_no')
      .eq('checklist_id', runId)
      .is('parent_step_id', null);
    if (fetchErr) throw new Error(fetchErr.message);

    // Map: template.id → step.id (top-level step_no is identical to template.step_no)
    const templateIdToStepId = new Map<number, string>();
    for (const t of topLevel) {
      const s = (insertedTop ?? []).find((x) => (x as { step_no: number }).step_no === t.step_no);
      if (s) templateIdToStepId.set(t.id, (s as { id: string }).id);
    }

    const { error: subErr } = await supabase.from('ops_checklist_steps').insert(
      subtasks.map((t) => ({
        checklist_id: runId,
        step_no: t.step_no,
        title: t.title,
        description: t.description,
        url: t.url,
        estimated_minutes: t.estimated_minutes,
        parent_step_id: t.parent_id ? (templateIdToStepId.get(t.parent_id) ?? null) : null,
      })),
    );
    if (subErr) throw new Error(subErr.message);
  }
}

export async function setStepDone(stepId: string, done: boolean, byId: string): Promise<void> {
  const patch = {
    done,
    done_by: done ? byId : null,
    done_at: done ? new Date().toISOString() : null,
  };
  const { error } = await supabase.from('ops_checklist_steps').update(patch).eq('id', stepId);
  if (error) throw new Error(error.message);
}

export async function completeChecklist(id: string): Promise<void> {
  const { error } = await supabase
    .from('ops_checklists')
    .update({ status: 'complete', completed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Template management (ops-tier only) ──────────────────────────────

export interface TemplateItemInput {
  kind: ChecklistKind;
  title: string;
  description?: string | null;
  url?: string | null;
  estimated_minutes?: number | null;
  parent_id?: number | null;
}

export async function addTemplateItem(input: TemplateItemInput): Promise<ChecklistTemplate> {
  // Determine next step_no within this (kind, parent_id) group
  let q = supabase
    .from('ops_checklist_templates')
    .select('step_no')
    .eq('kind', input.kind)
    .order('step_no', { ascending: false })
    .limit(1);
  q = input.parent_id ? q.eq('parent_id', input.parent_id) : q.is('parent_id', null);
  const { data: existing } = await q;
  const nextNo = (((existing?.[0] as { step_no: number } | undefined)?.step_no) ?? 0) + 1;

  const { data, error } = await supabase
    .from('ops_checklist_templates')
    .insert({
      kind: input.kind,
      step_no: nextNo,
      title: input.title,
      description: input.description ?? null,
      url: input.url ?? null,
      estimated_minutes: input.estimated_minutes ?? null,
      parent_id: input.parent_id ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as ChecklistTemplate;
}

export async function updateTemplateItem(
  id: number,
  patch: Partial<Pick<ChecklistTemplate, 'title' | 'description' | 'url' | 'estimated_minutes'>>,
): Promise<void> {
  const { error } = await supabase.from('ops_checklist_templates').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteTemplateItem(id: number): Promise<void> {
  // Cascades to subtasks via the parent_id FK
  const { error } = await supabase.from('ops_checklist_templates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Swap the step_no of two adjacent template items to reorder them. */
export async function swapTemplateItems(
  idA: number,
  stepNoA: number,
  idB: number,
  stepNoB: number,
): Promise<void> {
  await supabase.from('ops_checklist_templates').update({ step_no: stepNoB }).eq('id', idA);
  await supabase.from('ops_checklist_templates').update({ step_no: stepNoA }).eq('id', idB);
}

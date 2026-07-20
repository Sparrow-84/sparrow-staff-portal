import { supabase } from './supabase';
import { localDate, localDateOf } from './date';
import { withTzOffset, toLocalDate } from './calendar';
import type {
  Attendance,
  AttendanceStatus,
  CurriculumPhase,
  CurriculumSession,
  CurriculumSessionDetail,
  CurriculumUnit,
  EventKind,
  Family,
  FinanceMilestone,
  FamilyMilestoneProgress,
  Goal,
  GoalArea,
  GoalResponse,
  GoalStatus,
  Homework,
  HomeworkArea,
  HomeworkStatus,
  HouseholdAdult,
  HouseholdChild,
  LcpEvent,
  LcpMoveInRequest,
  LcpMoveInRequestDetail,
  LcpPhaseWithUnits,
  LcpUnitSlim,
  Message,
  ProgramFeeMethod,
  ProgramFeePayment,
  ProgramPosition,
  Redemption,
  Resource,
  ResourceAudience,
  ResourceKind,
  SessionAttendance,
  SessionLog,
  SessionLogType,
  StaffNote,
  TocSpaceSlim,
  Voucher,
} from './lcp-types';

// All reads/writes below are gated by RLS. Staff functions require the LCP "full"
// tier (Shelly, Audrey, Andrew); the participant app uses its own narrower client.

// ── Families ─────────────────────────────────────────────────────────
export async function fetchFamilies(): Promise<Family[]> {
  const { data, error } = await supabase
    .from('families')
    .select(
      'id, display_name, login_email, status, current_session_number, joined_unit_id, housing_savings_cents, active, created_at, toc_space_id, toc_tenant_id, move_in_date, program_end_date, emergency_contact_notes, toc_synced_at',
    )
    .eq('active', true)
    .order('display_name');
  if (error) {
    // joined_unit_id column missing (migration 0034 not yet applied) — fall back
    const { data: d2, error: e2 } = await supabase
      .from('families')
      .select('id, display_name, login_email, status, current_session_number, housing_savings_cents, active, created_at')
      .eq('active', true)
      .order('display_name');
    if (e2) throw new Error(e2.message);
    return ((d2 ?? []) as Omit<
      Family,
      'joined_unit_id' | 'toc_space_id' | 'toc_tenant_id' | 'move_in_date' | 'program_end_date' | 'emergency_contact_notes' | 'toc_synced_at'
    >[]).map((f) => ({
      ...f,
      joined_unit_id: null,
      toc_space_id: null,
      toc_tenant_id: null,
      move_in_date: null,
      program_end_date: null,
      emergency_contact_notes: null,
      toc_synced_at: null,
    }));
  }
  return (data ?? []) as Family[];
}

export async function updateFamily(
  id: string,
  patch: Partial<
    Pick<
      Family,
      'status' | 'current_session_number' | 'joined_unit_id' | 'housing_savings_cents' | 'toc_space_id' | 'emergency_contact_notes' | 'move_in_date'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('families').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export interface FamilyInput {
  display_name: string;
  login_email: string;
  current_session_number: number;
  emergency_contact_notes: string;
  adult: { full_name: string; phone: string };
  children: string[];
}

/**
 * Add a LifeChange family. `login_email` is both the participant's sign-in identity
 * AND their allowlist entry — handle_new_user() links a new sign-up only if it matches
 * a families.login_email, so creating the row is all that's needed for the mother to
 * register in the participant portal. Full LCP staff only (RLS: families_write).
 * `display_name` is the household's last name/label (not an individual's name) —
 * the mother's own name lives on the household adult record created here too.
 * Onboarding start date isn't collected here — it's just this row's created_at,
 * i.e. today, the day Shelly is actually adding them.
 */
export async function createFamily(input: FamilyInput): Promise<void> {
  const { data, error } = await supabase
    .from('families')
    .insert({
      display_name: input.display_name.trim(),
      login_email: input.login_email.trim().toLowerCase(),
      current_session_number: input.current_session_number,
      emergency_contact_notes: input.emergency_contact_notes.trim(),
    })
    .select('id')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('That email is already registered to another family.');
    }
    throw new Error(error.message);
  }
  await saveHouseholdAdult(data.id, input.adult);
  for (const name of input.children) {
    if (name.trim()) await addHouseholdChild(data.id, name);
  }
}

/** Soft cancel: drop a family from the active roster but keep all their records. */
export async function setFamilyActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('families').update({ active }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Hard delete: removes the family and cascades to all their LCP data (homework,
 * attendance, messages, notes, vouchers). Irreversible. Their auth login, if they
 * already registered, is NOT removed — an admin must delete it in Supabase separately.
 */
export async function deleteFamily(id: string): Promise<void> {
  const { error } = await supabase.from('families').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Curriculum (for the progress map + session picker) ───────────────
export async function fetchSessions(): Promise<CurriculumSession[]> {
  const { data, error } = await supabase
    .from('lcp_sessions')
    .select('id, session_number, title, unit:lcp_units(name, phase:lcp_phases(number, name))')
    .order('session_number');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CurriculumSession[];
}

export async function fetchPhasesWithUnits(): Promise<LcpPhaseWithUnits[]> {
  const { data, error } = await supabase
    .from('lcp_phases')
    .select('id, number, name, sort_order, units:lcp_units(id, name, sort_order, sessions:lcp_sessions(id, session_number, title, sort_order))')
    .order('sort_order');
  if (error) throw new Error(error.message);
  return ((data ?? []) as LcpPhaseWithUnits[]).map((p) => ({
    ...p,
    units: [...p.units]
      .sort((a: LcpUnitSlim, b: LcpUnitSlim) => a.sort_order - b.sort_order)
      .map((u) => ({
        ...u,
        sessions: [...u.sessions]
          .map((s) => ({ ...s, unit_id: u.id }))
          .sort((a, b) => a.session_number - b.session_number),
      })),
  }));
}

export async function fetchProgramPosition(): Promise<ProgramPosition | null> {
  const { data, error } = await supabase
    .from('lcp_program_position')
    .select('unit_id, session_id, unit:lcp_units(id, name, sort_order, phase:lcp_phases(id, number, name)), session:lcp_sessions(id, session_number, title)')
    .eq('id', 1)
    .maybeSingle();
  // Table doesn't exist yet (migration 0034 not applied) — degrade gracefully
  if (error) return null;
  if (!data) return null;
  const unit = data.unit as unknown as { id: number; name: string; sort_order: number; phase: { id: number; number: number; name: string } };
  const session = data.session as unknown as { id: number; session_number: number; title: string } | null;
  if (!unit) return null;
  return {
    unit_id: data.unit_id,
    unit_sort_order: unit.sort_order,
    unit_name: unit.name,
    phase_id: unit.phase.id,
    phase_number: unit.phase.number,
    phase_name: unit.phase.name,
    session_id: session?.id ?? null,
    session_number: session?.session_number ?? null,
    session_title: session?.title ?? null,
  };
}

// Manual unit-level override (LcpProgress "set position manually"/"complete unit").
// Clears session_id since a manual jump doesn't specify which session — the next
// Thursday filing will set it correctly via advanceProgramPosition below.
export async function updateProgramPosition(unitId: number, updatedBy?: string): Promise<void> {
  const { error } = await supabase
    .from('lcp_program_position')
    .upsert({ id: 1, unit_id: unitId, session_id: null, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null });
  if (error) throw new Error(error.message);
}

// Session-level advance, called when filing a Thursday Group session — records
// exactly which session the group just covered (what Monday Mentoring reads).
export async function advanceProgramPosition(sessionId: number, unitId: number, updatedBy?: string): Promise<void> {
  const { error } = await supabase
    .from('lcp_program_position')
    .upsert({ id: 1, unit_id: unitId, session_id: sessionId, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null });
  if (error) throw new Error(error.message);
}

export async function deleteProgramPosition(): Promise<void> {
  const { error } = await supabase.from('lcp_program_position').delete().eq('id', 1);
  if (error) throw new Error(error.message);
}

// ── Homework ─────────────────────────────────────────────────────────
export async function fetchAllHomework(): Promise<Homework[]> {
  const { data, error } = await supabase
    .from('lcp_homework')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Homework[];
}

export async function fetchHomeworkForFamily(familyId: string): Promise<Homework[]> {
  const { data, error } = await supabase
    .from('lcp_homework')
    .select('*')
    .eq('family_id', familyId)
    .order('due_date', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Homework[];
}

export interface HomeworkInput {
  family_id: string;
  session_id: number | null;
  area: HomeworkArea;
  title: string;
  description: string | null;
  due_date: string | null;
}

export async function assignHomework(input: HomeworkInput, assignedBy: string): Promise<void> {
  const { error } = await supabase.from('lcp_homework').insert({ ...input, assigned_by: assignedBy });
  if (error) throw new Error(error.message);
}

export async function setHomeworkStatus(id: string, status: HomeworkStatus): Promise<void> {
  const { error } = await supabase.from('lcp_homework').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteHomework(id: string): Promise<void> {
  const { error } = await supabase.from('lcp_homework').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Events / calendar ────────────────────────────────────────────────
export async function fetchEvents(): Promise<LcpEvent[]> {
  const { data, error } = await supabase
    .from('lcp_events')
    // NOTE: add show_on_org_calendar here after Byron runs migration 0039
    .select('id, kind, session_id, title, starts_at, ends_at, location, mandatory, rsvp_enabled, recurrence_id')
    .order('starts_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LcpEvent[];
}

export async function fetchOrgCalLcpEvents(): Promise<LcpEvent[]> {
  const { data, error } = await supabase
    .from('lcp_events')
    .select('id, kind, session_id, title, starts_at, ends_at, location, mandatory, rsvp_enabled, recurrence_id, show_on_org_calendar')
    .eq('show_on_org_calendar', true)
    .order('starts_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LcpEvent[];
}

export async function updateEvent(
  id: string,
  patch: Partial<Pick<LcpEvent, 'show_on_org_calendar' | 'mandatory' | 'location' | 'title' | 'starts_at' | 'ends_at'>>,
): Promise<void> {
  const { error } = await supabase.from('lcp_events').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateEventAndFuture(
  recurrenceId: string,
  fromStartsAt: string,
  fields: Partial<Pick<LcpEvent, 'kind' | 'title' | 'mandatory' | 'location'>>,
  startTime?: string,
  endTime?: string | null,
): Promise<void> {
  if (Object.keys(fields).length > 0) {
    const { error } = await supabase
      .from('lcp_events')
      .update(fields)
      .eq('recurrence_id', recurrenceId)
      .gte('starts_at', fromStartsAt);
    if (error) throw new Error(error.message);
  }

  if (startTime !== undefined) {
    const { data, error } = await supabase
      .from('lcp_events')
      .select('id, starts_at')
      .eq('recurrence_id', recurrenceId)
      .gte('starts_at', fromStartsAt);
    if (error) throw new Error(error.message);

    const updates = (data ?? []).map(row => ({
      id: row.id,
      starts_at: withTzOffset(toLocalDate(row.starts_at), startTime),
      ends_at: endTime ? withTzOffset(toLocalDate(row.starts_at), endTime) : null,
    }));

    await Promise.all(updates.map(u =>
      supabase.from('lcp_events')
        .update({ starts_at: u.starts_at, ends_at: u.ends_at })
        .eq('id', u.id)
        .then(({ error }) => { if (error) throw new Error(error.message); })
    ));
  }
}

export async function createEvents(
  inputs: Array<{
    title: string;
    kind: EventKind;
    starts_at: string;
    ends_at: string | null;
    location: string | null;
    mandatory: boolean;
    recurrence_id: string | null;
    // NOTE: add show_on_org_calendar here after Byron runs migration 0039
    created_by: string;
  }>,
): Promise<void> {
  const { error } = await supabase.from('lcp_events').insert(inputs);
  if (error) throw new Error(error.message);
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('lcp_events').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteEventAndFuture(recurrenceId: string, fromStartsAt: string): Promise<void> {
  const { error } = await supabase
    .from('lcp_events')
    .delete()
    .eq('recurrence_id', recurrenceId)
    .gte('starts_at', fromStartsAt);
  if (error) throw new Error(error.message);
}

// ── Attendance ───────────────────────────────────────────────────────
export async function fetchAttendanceForEvent(eventId: string): Promise<Attendance[]> {
  const { data, error } = await supabase
    .from('lcp_attendance')
    .select('id, event_id, family_id, status')
    .eq('event_id', eventId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Attendance[];
}

/** Upsert a family's attendance for an event (unique on event_id + family_id). */
export async function markAttendance(
  eventId: string,
  familyId: string,
  status: AttendanceStatus,
  markedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('lcp_attendance')
    .upsert(
      { event_id: eventId, family_id: familyId, status, marked_by: markedBy },
      { onConflict: 'event_id,family_id' },
    );
  if (error) throw new Error(error.message);
}

// ── Messages ─────────────────────────────────────────────────────────
export async function fetchMessages(familyId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('lcp_messages')
    .select('*')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export async function sendStaffMessage(familyId: string, body: string, senderId: string): Promise<void> {
  const { error } = await supabase
    .from('lcp_messages')
    .insert({ family_id: familyId, sender_kind: 'staff', sender_id: senderId, body });
  if (error) throw new Error(error.message);
}

// ── Staff notes (full LCP staff only) ────────────────────────────────
export async function fetchStaffNotes(familyId: string): Promise<StaffNote[]> {
  const { data, error } = await supabase
    .from('lcp_staff_notes')
    .select('id, family_id, author_id, session_id, session_log_id, body, created_at, updated_at, author:profiles(full_name)')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      ...row,
      author_name: (row.author as { full_name: string } | null)?.full_name ?? null,
    } as StaffNote;
  });
}

export async function addStaffNote(
  familyId: string,
  body: string,
  authorId: string,
  sessionId: number | null = null,
  sessionLogId: string | null = null,
): Promise<void> {
  const { error } = await supabase
    .from('lcp_staff_notes')
    .insert({ family_id: familyId, body, author_id: authorId, session_id: sessionId, session_log_id: sessionLogId });
  if (error) throw new Error(error.message);
}

export async function updateStaffNote(id: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('lcp_staff_notes')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Session logs ──────────────────────────────────────────────────────
export async function fetchRecentSessionLogs(weeksBack = 8): Promise<SessionLog[]> {
  const since = new Date();
  since.setDate(since.getDate() - weeksBack * 7);
  const { data, error } = await supabase
    .from('lcp_session_logs')
    .select(`
      id, session_date, session_type, event_id, group_note, created_by, created_at,
      created_by_profile:profiles!lcp_session_logs_created_by_fkey(full_name),
      attendance:lcp_session_attendance(id, session_log_id, family_id, status, voucher_awarded, marked_by, marked_at)
    `)
    .gte('session_date', localDateOf(since))
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      ...row,
      created_by_name: (row.created_by_profile as { full_name: string } | null)?.full_name ?? null,
    } as SessionLog;
  });
}

export async function fetchTodayEvents(): Promise<LcpEvent[]> {
  const today = localDate();
  const { data, error } = await supabase
    .from('lcp_events')
    .select('id, kind, session_id, title, starts_at, ends_at, location, mandatory, rsvp_enabled')
    .gte('starts_at', `${today}T00:00:00`)
    .lt('starts_at', `${today}T23:59:59`)
    .order('starts_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as LcpEvent[];
}

export async function createSessionLog(input: {
  session_date: string;
  session_type: SessionLogType;
  event_id: string | null;
  group_note: string | null;
  created_by: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('lcp_session_logs')
    .insert(input)
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function upsertSessionAttendance(
  sessionLogId: string,
  familyId: string,
  status: AttendanceStatus,
  voucherAwarded: boolean,
  markedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('lcp_session_attendance')
    .upsert(
      { session_log_id: sessionLogId, family_id: familyId, status, voucher_awarded: voucherAwarded, marked_by: markedBy },
      { onConflict: 'session_log_id,family_id' },
    );
  if (error) throw new Error(error.message);
}

export async function fetchAttendanceForSessionLog(sessionLogId: string): Promise<SessionAttendance[]> {
  const { data, error } = await supabase
    .from('lcp_session_attendance')
    .select('id, session_log_id, family_id, status, voucher_awarded, marked_by, marked_at')
    .eq('session_log_id', sessionLogId);
  if (error) throw new Error(error.message);
  return (data ?? []) as SessionAttendance[];
}

export async function fetchNotesForSessionLog(sessionLogId: string): Promise<StaffNote[]> {
  const { data, error } = await supabase
    .from('lcp_staff_notes')
    .select('id, family_id, author_id, session_id, session_log_id, body, created_at, updated_at, author:profiles(full_name)')
    .eq('session_log_id', sessionLogId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      ...row,
      author_name: (row.author as { full_name: string } | null)?.full_name ?? null,
    } as StaffNote;
  });
}

export async function updateSessionLog(id: string, groupNote: string | null): Promise<void> {
  const { error } = await supabase
    .from('lcp_session_logs')
    .update({ group_note: groupNote })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Vouchers + redemptions ───────────────────────────────────────────
export async function fetchVouchers(familyId: string): Promise<Voucher[]> {
  const { data, error } = await supabase
    .from('lcp_vouchers')
    .select('id, family_id, earned_for, earned_at, redemption_id')
    .eq('family_id', familyId)
    .order('earned_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Voucher[];
}

export async function awardVoucher(familyId: string, earnedFor: string, awardedBy: string): Promise<void> {
  const { error } = await supabase
    .from('lcp_vouchers')
    .insert({ family_id: familyId, kind: 'gift_card', earned_for: earnedFor, awarded_by: awardedBy });
  if (error) throw new Error(error.message);
}

export async function fetchRedemptions(): Promise<Redemption[]> {
  const { data, error } = await supabase
    .from('lcp_redemptions')
    .select('id, family_id, vouchers_spent, gift_card_value_cents, status, requested_at, fulfilled_at')
    .order('requested_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Redemption[];
}

/** Fulfill a redemption: spend the family's oldest unspent vouchers + close it out. */
export async function fulfillRedemption(
  redemptionId: string,
  familyId: string,
  vouchersToSpend: number,
  fulfilledBy: string,
): Promise<void> {
  const { data: unspent, error: vErr } = await supabase
    .from('lcp_vouchers')
    .select('id')
    .eq('family_id', familyId)
    .is('redemption_id', null)
    .order('earned_at', { ascending: true })
    .limit(vouchersToSpend);
  if (vErr) throw new Error(vErr.message);

  const ids = (unspent ?? []).map((v) => (v as { id: string }).id);
  if (ids.length > 0) {
    const { error: linkErr } = await supabase
      .from('lcp_vouchers')
      .update({ redemption_id: redemptionId })
      .in('id', ids);
    if (linkErr) throw new Error(linkErr.message);
  }

  const { error } = await supabase
    .from('lcp_redemptions')
    .update({ status: 'fulfilled', fulfilled_by: fulfilledBy, fulfilled_at: new Date().toISOString() })
    .eq('id', redemptionId);
  if (error) throw new Error(error.message);
}

// ── Curriculum admin (Shelly's editing workflow) ──────────────────────────────

/** Full phase → unit → session tree with all editable fields. */
export async function fetchCurriculum(): Promise<CurriculumPhase[]> {
  const { data, error } = await supabase
    .from('lcp_phases')
    .select(`
      id, number, name,
      units:lcp_units(
        id, name, month_label, artifact, supplement, encouragement_text,
        sessions:lcp_sessions(id, session_number, title, focus, scripture, mentor_brief, mentor_handout_echo, mentor_going_deeper)
      )
    `)
    .order('number');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as CurriculumPhase[]).map((phase) => ({
    ...phase,
    units: (phase.units ?? []).map((unit) => ({
      ...unit,
      sessions: [...(unit.sessions ?? [])].sort((a, b) => a.session_number - b.session_number),
    })),
  }));
}

export async function updateCurriculumSession(
  id: number,
  patch: Partial<Pick<CurriculumSessionDetail, 'title' | 'focus' | 'scripture' | 'mentor_brief' | 'mentor_handout_echo' | 'mentor_going_deeper'>>,
): Promise<void> {
  const { error } = await supabase.from('lcp_sessions').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// Every resource across every session, for the Curriculum Admin completion
// badges — cheap enough in one query (a few hundred rows at most across 48
// sessions) that per-session round trips aren't worth it.
export async function fetchAllResources(): Promise<Resource[]> {
  const { data, error } = await supabase
    .from('lcp_resources')
    .select('id, session_id, kind, audience, title, drive_url, content, response_prompt, due_date, locked, sort_order, created_at')
    .not('session_id', 'is', null);
  if (error) throw new Error(error.message);
  return (data ?? []) as Resource[];
}

// The one session Monday Mentoring needs — whatever the group most recently
// covered in Thursday Group (lcp_program_position.session_id).
export async function fetchSessionMentorContent(sessionId: number): Promise<CurriculumSessionDetail | null> {
  const { data, error } = await supabase
    .from('lcp_sessions')
    .select('id, session_number, title, focus, scripture, mentor_brief, mentor_handout_echo, mentor_going_deeper')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CurriculumSessionDetail) ?? null;
}

export async function updateCurriculumUnit(
  id: number,
  patch: Partial<Pick<CurriculumUnit, 'artifact' | 'supplement' | 'month_label' | 'encouragement_text'>>,
): Promise<void> {
  const { error } = await supabase.from('lcp_units').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchSessionResources(sessionId: number): Promise<Resource[]> {
  // Include 0040 columns; fall back to pre-0040 select if migration not yet applied.
  const { data, error } = await supabase
    .from('lcp_resources')
    .select('id, session_id, kind, audience, title, drive_url, content, response_prompt, due_date, locked, sort_order, created_at')
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    const { data: d2, error: e2 } = await supabase
      .from('lcp_resources')
      .select('id, session_id, kind, audience, title, drive_url, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (e2) throw new Error(e2.message);
    return ((d2 ?? []) as Omit<Resource, 'content' | 'response_prompt' | 'due_date' | 'locked' | 'sort_order'>[]).map(
      (r) => ({ ...r, content: null, response_prompt: null, due_date: null, locked: false, sort_order: 0 }),
    );
  }
  return (data ?? []) as Resource[];
}

export interface ResourceInput {
  session_id: number | null;
  kind: ResourceKind;
  audience: ResourceAudience;
  title: string;
  drive_url: string | null;
  content?: string | null;
  response_prompt?: string | null;
  due_date?: string | null;
  locked?: boolean;
  sort_order?: number;
  created_by: string;
}

export async function addResource(input: ResourceInput): Promise<void> {
  const { error } = await supabase.from('lcp_resources').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateResource(
  id: string,
  patch: Partial<Pick<Resource, 'content' | 'response_prompt' | 'due_date' | 'locked' | 'sort_order' | 'title' | 'kind' | 'audience' | 'drive_url'>>,
): Promise<void> {
  const { error } = await supabase.from('lcp_resources').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteResource(id: string): Promise<void> {
  const { error } = await supabase.from('lcp_resources').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Goals ─────────────────────────────────────────────────────────────────────

export async function fetchGoalsForFamily(familyId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('lcp_goals')
    .select('id, family_id, area, title, due_date, status, created_by, created_at, updated_at, met_at')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Goal[];
}

export async function fetchGoalResponsesForFamily(familyId: string): Promise<GoalResponse[]> {
  const { data, error } = await supabase
    .from('lcp_goal_responses')
    .select('id, goal_id, family_id, response, note, created_at')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GoalResponse[];
}

export interface GoalInput {
  family_id: string;
  area: GoalArea;
  title: string;
  due_date: string | null;
}

export async function createGoal(input: GoalInput, createdBy: string): Promise<void> {
  const { error } = await supabase.from('lcp_goals').insert({ ...input, created_by: createdBy });
  if (error) throw new Error(error.message);
}

export async function updateGoal(
  id: string,
  patch: Partial<Pick<Goal, 'title' | 'area' | 'due_date' | 'status' | 'met_at'>>,
): Promise<void> {
  const { error } = await supabase.from('lcp_goals').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markGoalMet(id: string): Promise<void> {
  const { error } = await supabase
    .from('lcp_goals')
    .update({ status: 'met' as GoalStatus, met_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function reopenGoal(id: string, newDueDate?: string): Promise<void> {
  const patch: Partial<Goal> = { status: 'active', met_at: null };
  if (newDueDate) patch.due_date = newDueDate;
  const { error } = await supabase.from('lcp_goals').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await supabase.from('lcp_goals').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Finance milestones ────────────────────────────────────────────────────────

export async function fetchFinanceMilestones(): Promise<FinanceMilestone[]> {
  const { data, error } = await supabase
    .from('lcp_finance_milestones')
    .select('id, sort_order, title, description')
    .order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as FinanceMilestone[];
}

export async function fetchMilestoneProgressForFamily(familyId: string): Promise<FamilyMilestoneProgress[]> {
  const { data, error } = await supabase
    .from('lcp_family_milestone_progress')
    .select('id, family_id, milestone_id, completed_at, completed_by')
    .eq('family_id', familyId);
  if (error) throw new Error(error.message);
  return (data ?? []) as FamilyMilestoneProgress[];
}

export async function completeMilestone(
  familyId: string,
  milestoneId: number,
  completedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('lcp_family_milestone_progress')
    .insert({ family_id: familyId, milestone_id: milestoneId, completed_by: completedBy });
  if (error) throw new Error(error.message);
}

export async function uncompleteMilestone(familyId: string, milestoneId: number): Promise<void> {
  const { error } = await supabase
    .from('lcp_family_milestone_progress')
    .delete()
    .eq('family_id', familyId)
    .eq('milestone_id', milestoneId);
  if (error) throw new Error(error.message);
}

// ── Household — one adult (Shelly's intake), and children, per family ──────────

export async function fetchHouseholdAdult(familyId: string): Promise<HouseholdAdult | null> {
  const { data, error } = await supabase
    .from('lcp_household_adults')
    .select('id, family_id, full_name, phone, created_at')
    .eq('family_id', familyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as HouseholdAdult | null;
}

/**
 * Upserts the family's one adult record — there's only ever one per family.
 * No email here: the adult is always the one who signs in, so her email is
 * families.login_email, not a separate value to keep in sync.
 */
export async function saveHouseholdAdult(
  familyId: string,
  adult: { full_name: string; phone: string },
): Promise<void> {
  const existing = await fetchHouseholdAdult(familyId);
  const row = {
    full_name: adult.full_name.trim(),
    phone: adult.phone.trim(),
  };
  if (existing) {
    const { error } = await supabase.from('lcp_household_adults').update(row).eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('lcp_household_adults').insert({ family_id: familyId, ...row });
    if (error) throw new Error(error.message);
  }
}

export async function fetchHouseholdChildren(familyId: string): Promise<HouseholdChild[]> {
  const { data, error } = await supabase
    .from('lcp_household_children')
    .select('id, family_id, full_name, created_at')
    .eq('family_id', familyId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as HouseholdChild[];
}

export async function addHouseholdChild(familyId: string, fullName: string): Promise<void> {
  const { error } = await supabase
    .from('lcp_household_children')
    .insert({ family_id: familyId, full_name: fullName.trim() });
  if (error) throw new Error(error.message);
}

export async function updateHouseholdChild(id: string, fullName: string): Promise<void> {
  const { error } = await supabase
    .from('lcp_household_children')
    .update({ full_name: fullName.trim() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteHouseholdChild(id: string): Promise<void> {
  const { error } = await supabase.from('lcp_household_children').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── TOC space lookup (for linking a family's home) ──────────────────────────────

export async function fetchLcpDesignatedSpaces(): Promise<TocSpaceSlim[]> {
  const { data, error } = await supabase
    .from('spaces')
    .select('id, label, street_number, street_name, designation_label')
    .eq('designation_type', 'lcp')
    .order('label');
  if (error) throw new Error(error.message);
  return (data ?? []) as TocSpaceSlim[];
}

export type LcpTocSyncResult = 'synced' | 'request_created' | 'already_requested' | 'incomplete' | 'not_found';

/**
 * Called after saving a move-in date, home unit, or household member edit.
 * If the family isn't linked to a Twin Oaks resident yet, this creates (or
 * leaves alone, if one's already open) a pending review request for TOC staff
 * — it never writes into tenants/household_members directly. If TOC staff have
 * already approved a link for this family, it instead pushes the LCP-owned
 * fields (contact info, move-in date, emergency contact, kids' names) into the
 * existing tenant + household_members records — no re-approval needed for
 * routine updates. Safe to call speculatively; no-ops with a status instead of
 * erroring.
 */
export async function requestOrSyncLcpToc(familyId: string): Promise<LcpTocSyncResult> {
  const { data, error } = await supabase.rpc('request_or_sync_lcp_toc', { p_family_id: familyId });
  if (error) throw new Error(error.message);
  return data as LcpTocSyncResult;
}

const MOVE_IN_REQUEST_COLUMNS =
  'id, family_id, toc_space_id, family_display_name, space_label, status, notes, requested_at, reviewed_by, reviewed_at';

/** The open (or most recent) move-in request for a family, for the LCP side to show its status. */
export async function fetchMoveInRequestForFamily(familyId: string): Promise<LcpMoveInRequest | null> {
  const { data, error } = await supabase
    .from('lcp_toc_move_in_requests')
    .select(MOVE_IN_REQUEST_COLUMNS)
    .eq('family_id', familyId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as LcpMoveInRequest | null;
}

/** All open requests, for the Twin Oaks side to triage. */
export async function fetchOpenLcpMoveInRequests(): Promise<LcpMoveInRequest[]> {
  const { data, error } = await supabase
    .from('lcp_toc_move_in_requests')
    .select(MOVE_IN_REQUEST_COLUMNS)
    .neq('status', 'approved')
    .order('requested_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as LcpMoveInRequest[];
}

/** Live resident-info preview for the review drawer — household adults, emergency contact, move-in date. */
export async function fetchMoveInRequestDetail(requestId: string): Promise<LcpMoveInRequestDetail | null> {
  const { data, error } = await supabase.rpc('fetch_lcp_move_in_request_detail', { p_request_id: requestId });
  if (error) throw new Error(error.message);
  return data as LcpMoveInRequestDetail | null;
}

/** TOC staff mark a request as needing more info from LCP, or leave a note. */
export async function updateMoveInRequestNotes(
  id: string,
  patch: { status?: 'pending' | 'needs_info'; notes?: string | null },
): Promise<void> {
  const { error } = await supabase.from('lcp_toc_move_in_requests').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export type ApproveMoveInResult = 'approved' | 'already_approved' | 'skipped_existing_tenant' | 'not_found';

/** TOC staff only — creates the real tenant + household_members records and links the family. */
export async function approveLcpMoveInRequest(requestId: string): Promise<ApproveMoveInResult> {
  const { data, error } = await supabase.rpc('approve_lcp_toc_move_in', { p_request_id: requestId });
  if (error) throw new Error(error.message);
  return data as ApproveMoveInResult;
}

// ── Program fee payments (Audrey's log) ─────────────────────────────────────────

export async function fetchAllProgramFeePayments(): Promise<Pick<ProgramFeePayment, 'family_id' | 'paid_date'>[]> {
  const { data, error } = await supabase.from('lcp_program_fee_payments').select('family_id, paid_date');
  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<ProgramFeePayment, 'family_id' | 'paid_date'>[];
}

export async function fetchProgramFeePayments(familyId: string): Promise<ProgramFeePayment[]> {
  const { data, error } = await supabase
    .from('lcp_program_fee_payments')
    .select('id, family_id, paid_date, amount_cents, method, comment, created_by, created_at, author:profiles(full_name)')
    .eq('family_id', familyId)
    .order('paid_date', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      ...row,
      author_name: (row.author as { full_name: string } | null)?.full_name ?? null,
    } as ProgramFeePayment;
  });
}

export async function addProgramFeePayment(
  payment: { family_id: string; paid_date: string; amount_cents: number; method: ProgramFeeMethod; comment: string | null },
  createdBy: string,
): Promise<void> {
  const { error } = await supabase.from('lcp_program_fee_payments').insert({ ...payment, created_by: createdBy });
  if (error) throw new Error(error.message);
}

export async function deleteProgramFeePayment(id: string): Promise<void> {
  const { error } = await supabase.from('lcp_program_fee_payments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// LifeChange Program (System 1) — staff-side types.
// Mirrors the schema in supabase/migrations/0005_lcp.sql. The participant app
// (sparrow-lcp-portal) has a parallel, slightly narrower copy of these types.

export const TOTAL_SESSIONS = 48;

export type FamilyStatus = 'onboarding' | 'on_track' | 'needs_attention' | 'graduated';
export type EventKind = 'curriculum' | 'dinner' | 'one_on_one' | 'volunteer' | 'other';
export type AttendanceStatus = 'on_time' | 'late' | 'no_show';
export type HomeworkArea = 'relational' | 'physical_financial' | 'spiritual' | 'emotional' | 'general';
export type HomeworkStatus = 'assigned' | 'submitted' | 'complete';
export type MessageSender = 'staff' | 'family';
export type RedemptionStatus = 'requested' | 'fulfilled' | 'cancelled';
export type SessionLogType = 'monday_mentoring' | 'thursday_group' | 'ad_hoc';

export interface Family {
  id: string;
  display_name: string;
  login_email: string;
  status: FamilyStatus;
  current_session_number: number;
  housing_savings_cents: number;
  active: boolean;
}

export interface Homework {
  id: string;
  family_id: string;
  session_id: number | null;
  area: HomeworkArea;
  title: string;
  description: string | null;
  due_date: string | null;
  status: HomeworkStatus;
  submission_text: string | null;
  submitted_at: string | null;
  assigned_by: string | null;
}

export interface LcpEvent {
  id: string;
  kind: EventKind;
  session_id: number | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  mandatory: boolean;
  rsvp_enabled: boolean;
  recurrence_id: string | null;
}

export interface Attendance {
  id: string;
  event_id: string;
  family_id: string;
  status: AttendanceStatus;
}

export interface Message {
  id: string;
  family_id: string;
  sender_kind: MessageSender;
  sender_id: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface StaffNote {
  id: string;
  family_id: string;
  author_id: string | null;
  author_name: string | null;
  session_id: number | null;
  session_log_id: string | null;
  body: string;
  created_at: string;
  updated_at: string | null;
}

export interface SessionLog {
  id: string;
  session_date: string;
  session_type: SessionLogType;
  event_id: string | null;
  group_note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  attendance: SessionAttendance[];
}

export interface SessionAttendance {
  id: string;
  session_log_id: string;
  family_id: string;
  status: AttendanceStatus;
  voucher_awarded: boolean;
  marked_by: string | null;
  marked_at: string;
}

export interface Voucher {
  id: string;
  family_id: string;
  earned_for: string | null;
  earned_at: string;
  redemption_id: string | null;
}

export interface Redemption {
  id: string;
  family_id: string;
  vouchers_spent: number;
  gift_card_value_cents: number;
  status: RedemptionStatus;
  requested_at: string;
  fulfilled_at: string | null;
}

export interface CurriculumSession {
  id: number;
  session_number: number;
  title: string;
  unit: { name: string; phase: { number: number; name: string } | null } | null;
}

export const FAMILY_STATUS: Record<FamilyStatus, { label: string; chip: string }> = {
  onboarding:      { label: 'Onboarding',      chip: 'bg-priority-p3/15 text-priority-p3' },
  on_track:        { label: 'On track',        chip: 'bg-sparrow-green/10 text-sparrow-green' },
  needs_attention: { label: 'Needs attention', chip: 'bg-priority-p1/15 text-priority-p1' },
  graduated:       { label: 'Graduated',       chip: 'bg-sparrow-gold/20 text-sparrow-ink' },
};

export const AREA_LABEL: Record<HomeworkArea, string> = {
  relational: 'Relational',
  physical_financial: 'Physical & Financial',
  spiritual: 'Spiritual',
  emotional: 'Emotional',
  general: 'General',
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  on_time: 'On time',
  late: 'Late',
  no_show: 'No show',
};

export const EVENT_LABEL: Record<EventKind, string> = {
  curriculum: 'Group session',
  dinner: 'Dinner',
  one_on_one: 'One-on-one',
  volunteer: 'Volunteer',
  other: 'Event',
};

export const HOMEWORK_AREAS: HomeworkArea[] = [
  'relational',
  'physical_financial',
  'spiritual',
  'emotional',
  'general',
];

export const SESSION_LOG_LABEL: Record<SessionLogType, string> = {
  monday_mentoring: 'Monday Mentoring',
  thursday_group:   'Thursday Group',
  ad_hoc:           'Ad-hoc Session',
};

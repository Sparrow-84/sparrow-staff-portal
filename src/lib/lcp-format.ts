export function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(
    cents / 100,
  );
}

// Date-only strings ("YYYY-MM-DD") must be parsed as local midnight, not UTC
// midnight -- `new Date(iso)` shifts a day behind in any timezone west of UTC.
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dobLabel(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function ageFromDob(iso: string | null): number | null {
  if (!iso) return null;
  const dob = parseLocalDate(iso);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

// Callers pass both shapes: plain dates ("YYYY-MM-DD", e.g. due_date/move_in_date)
// and full timestamps ("...T...Z", e.g. created_at/starts_at). parseLocalDate's
// split-on-'-' only works on the former -- feeding it a timestamp produces NaN
// and "Invalid Date". Timestamps already carry their own offset, so `new Date()`
// parses them correctly with no local-midnight adjustment needed.
export function dayLabel(iso: string): string {
  const d = iso.includes('T') ? new Date(iso) : parseLocalDate(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Any LCP-full staff can edit an individual session note now (2026-10-21,
// Susanna's call) -- previously author-only, which turned out to be a UI-only
// restriction (RLS never actually enforced it, see migration 0005's
// staff_notes_all policy). The safety net she asked for: a note locks 30 days
// after it was CREATED (not last edited -- otherwise editing would keep
// resetting its own clock), enforced client-side here for a clear "why can't
// I edit this" message, AND at the RLS level (migration 0187) so it's a real
// lock, not just a hidden button.
const NOTE_EDIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export function isNoteEditable(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < NOTE_EDIT_WINDOW_MS;
}

export function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return iso < todayISO;
}

/**
 * Earliest still-open post-program check-in milestone for a family that's
 * left, or null if none is due yet (no program_end_date known, or every
 * milestone up to today already has a check-in covering it). A milestone
 * opens CHECKIN_LEAD_DAYS before its due date, and a check-in "covers" it if
 * it was logged on or after that same opening day -- so calling a week early
 * counts. Staff aren't asked to tag which milestone they're answering, the
 * date alone does the matching (deliberate simplification, see wasp-nest
 * item 15 / tiger-den). Milestones are checked in ascending months order and
 * the first uncovered-and-open one wins, since later ones can't be open yet
 * if an earlier one isn't. The daily reminder job (emit_lcp_checkin_tasks,
 * migration 0192) uses the same window -- keep the two in step.
 */
export const CHECKIN_LEAD_DAYS = 7;

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Due date of a post-exit milestone, e.g. exit + 3 months. */
export function checkinDueIso(programEndDate: string, monthsAfterExit: number): string {
  const exit = parseLocalDate(programEndDate);
  return isoDate(new Date(exit.getFullYear(), exit.getMonth() + monthsAfterExit, exit.getDate()));
}

/** First day a check-in counts toward a milestone due on dueIso. */
export function checkinWindowOpensIso(dueIso: string): string {
  const due = parseLocalDate(dueIso);
  return isoDate(new Date(due.getFullYear(), due.getMonth(), due.getDate() - CHECKIN_LEAD_DAYS));
}

export function nextCheckinDue(
  programEndDate: string | null,
  checkinDates: (string | null)[],
  milestones: { label: string; months_after_exit: number }[],
): { label: string; dueDateIso: string } | null {
  if (!programEndDate) return null;
  const todayIso = isoDate(new Date());
  const knownDates = checkinDates.filter((d): d is string => !!d).sort();

  for (const m of [...milestones].sort((a, b) => a.months_after_exit - b.months_after_exit)) {
    const dueIso = checkinDueIso(programEndDate, m.months_after_exit);
    const opensIso = checkinWindowOpensIso(dueIso);
    if (opensIso > todayIso) return null;
    const covered = knownDates.some((d) => d >= opensIso);
    if (!covered) return { label: m.label, dueDateIso: dueIso };
  }
  return null;
}

/**
 * Overdue = no program fee payment logged since the start of last calendar
 * month, for a family that had already moved in by then. Pure recency check,
 * no amount/balance math — Audrey deliberately doesn't want a running-balance
 * calculation. The window runs through *today*, not just last month's end —
 * a payment already logged for the current month counts as current; without
 * that, everyone reads "overdue" for the first few weeks of every month,
 * until they also happen to have a payment on file for the prior month too.
 */
export function isFeeOverdue(
  moveInDate: string | null,
  status: 'onboarding' | 'on_track' | 'needs_attention' | 'graduated',
  paidDates: string[],
): boolean {
  if (!moveInDate || status === 'onboarding' || status === 'graduated') return false;
  const today = new Date();
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
  if (parseLocalDate(moveInDate) > lastMonthEnd) return false;
  return !paidDates.some((iso) => {
    const d = parseLocalDate(iso);
    return d >= lastMonthStart && d <= today;
  });
}

/**
 * Family status is computed, never staff-clicked. Onboarding = no move-in
 * date yet. Graduated is sticky -- once a family's graduated, nothing here
 * ever auto-changes it back (that only happens through the explicit
 * "Graduate"/"Left the program" actions). Otherwise: needs_attention if
 * they've got anything actually overdue (not just assigned with a future
 * date), or 2+ no-shows in their last 4 logged sessions -- otherwise
 * on_track. The no-show count is a live rolling window, not a one-time flag,
 * so attending again naturally clears it once older no-shows fall out of
 * the last-4 window.
 */
export function computeFamilyStatus(
  moveInDate: string | null,
  currentStatus: 'onboarding' | 'on_track' | 'needs_attention' | 'graduated',
  hasOverdueHomeworkOrGoal: boolean,
  recentNoShowCount: number,
): 'onboarding' | 'on_track' | 'needs_attention' | 'graduated' {
  if (currentStatus === 'graduated') return 'graduated';
  if (!moveInDate) return 'onboarding';
  if (hasOverdueHomeworkOrGoal || recentNoShowCount >= 2) return 'needs_attention';
  return 'on_track';
}

export function dueLabel(iso: string | null): string {
  if (!iso) return 'no due date';
  if (isOverdue(iso)) {
    const label = parseLocalDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `overdue · ${label}`;
  }
  return `due ${dayLabel(iso)}`;
}

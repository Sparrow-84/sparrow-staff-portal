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

export function dayLabel(iso: string): string {
  const d = parseLocalDate(iso);
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

export function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return iso < todayISO;
}

/**
 * Overdue = no program fee payment logged for last calendar month, for a family
 * that had already moved in by then. Pure recency check, no amount/balance math
 * — Audrey deliberately doesn't want a running-balance calculation.
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
    return d >= lastMonthStart && d <= lastMonthEnd;
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

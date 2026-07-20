export function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(
    cents / 100,
  );
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
  if (new Date(moveInDate) > lastMonthEnd) return false;
  return !paidDates.some((iso) => {
    const d = new Date(iso);
    return d >= lastMonthStart && d <= lastMonthEnd;
  });
}

export function dueLabel(iso: string | null): string {
  if (!iso) return 'no due date';
  if (isOverdue(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    const label = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `overdue · ${label}`;
  }
  return `due ${dayLabel(iso)}`;
}

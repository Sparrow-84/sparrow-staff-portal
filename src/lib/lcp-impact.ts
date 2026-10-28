// LCP Impact Report — the Charity Navigator Reach / Succeed counts, computed
// from records the room already keeps, so nobody has to redo the mental math
// each year. Pure functions only; LcpImpactReport.tsx fetches and renders.
//
// Definitions (as filed with Charity Navigator 2026-10-28 -- if these change
// there, change them here and in IMPACT_DEFINITIONS below):
//   Reach   -- a person is reached when their household stays enrolled at
//              least 6 months and the parent attends at least 80% of the
//              Monday and Thursday sessions offered during that time.
//   Succeed -- stably housed at program exit AND at a 3-month post-exit
//              check-in. Counted in the year the 3-month check-in falls due.
//   Counting unit -- people: the parent plus each child. A child counts in a
//              year if born on or before that year's last day.

import type { AttendanceStatus, Family, HouseholdChild, OutcomeCheckin, SessionLogType } from './lcp-types';
import { checkinDueIso, checkinWindowOpensIso } from './lcp-format';

export const REACH_MIN_MONTHS = 6;
export const REACH_MIN_ATTENDANCE = 0.8;
export const SUCCEED_CHECKIN_MONTHS = 3;

export const IMPACT_DEFINITIONS = {
  reachMeans:
    'A person is considered reached when their household remains enrolled for at least six months and the participating parent attends at least 80% of Monday and Thursday sessions offered during that time. Each household member is counted individually.',
  reachSources:
    'Staff record attendance at every Monday and Thursday session, including date, name, and homework status. Attendance is required to stay in program housing. Children attend program childcare whenever their parent attends.',
  succeedMeans:
    'A participant successfully gains long-term housing when they move into stable, independent housing at program exit and remain stably housed at a 3-month post-exit check-in. Each household member is counted individually.',
  succeedSources:
    'We confirm housing at program exit and again at a 3-month check-in. For graduates living in the community we own, tenant records confirm continuous residency; move-outs are documented. For graduates housed elsewhere, staff confirm directly.',
};

export interface ReportPeriod {
  startIso: string; // inclusive
  endIso: string; // inclusive
  label: string;
}

/** Sparrow's fiscal year runs July 1 – June 30 (confirmed against the 990). */
export function fiscalYear(startYear: number): ReportPeriod {
  return {
    startIso: `${startYear}-07-01`,
    endIso: `${startYear + 1}-06-30`,
    label: `July ${startYear} – June ${startYear + 1}`,
  };
}

/** Most recent fiscal year that has fully ended -- the one you'd report on. */
export function lastCompletedFiscalYearStart(today = new Date()): number {
  const y = today.getFullYear();
  return today.getMonth() >= 6 ? y - 1 : y - 2;
}

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type ChildSlim = Pick<HouseholdChild, 'id' | 'family_id' | 'full_name' | 'date_of_birth'>;

export interface HouseholdCount {
  people: number;
  /** Children counted with no birthday on file (assumed present). */
  childrenMissingBirthday: string[];
  /** Children born after the period ended (not counted this year). */
  childrenBornAfter: string[];
}

function countHousehold(familyId: string, children: ChildSlim[], period: ReportPeriod): HouseholdCount {
  const mine = children.filter((c) => c.family_id === familyId);
  const counted = mine.filter((c) => !c.date_of_birth || c.date_of_birth <= period.endIso);
  return {
    people: 1 + counted.length,
    childrenMissingBirthday: mine.filter((c) => !c.date_of_birth).map((c) => c.full_name),
    childrenBornAfter: mine.filter((c) => c.date_of_birth && c.date_of_birth > period.endIso).map((c) => c.full_name),
  };
}

export type ExitStatus = 'still_enrolled' | 'graduated' | 'left';

export interface ReachRow {
  family: Family;
  household: HouseholdCount;
  enrollStartIso: string;
  exitIso: string | null;
  /** Where the family stood on the period's last day. */
  statusAtEnd: ExitStatus;
  sixMonthsIso: string;
  metSixMonths: boolean;
  sessionsOffered: number;
  sessionsAttended: number;
  sessionsUnmarked: number;
  attendanceRate: number | null;
  /** First Mon/Thu session on record, when it's well after enrollment began
   *  (attendance before the portal existed isn't in the system). */
  attendanceRecordsFromIso: string | null;
  reached: boolean;
  reason: string | null;
}

export type SucceedOutcome = 'succeeded' | 'not_housed_at_exit' | 'not_housed_at_checkin' | 'no_exit_checkin' | 'checkin_missing' | 'checkin_not_due';

export interface SucceedRow {
  family: Family;
  household: HouseholdCount;
  exitIso: string;
  checkinDueIso: string;
  outcome: SucceedOutcome;
}

export interface ImpactReport {
  period: ReportPeriod;
  reach: ReachRow[]; // every household enrolled at any point in the period
  succeed: SucceedRow[]; // every household whose 3-month check-in falls due in the period
  reachedPeople: number;
  reachedHouseholds: number;
  succeededPeople: number;
  succeededHouseholds: number;
  /** Families that left but have no program end date -- can't be placed. */
  missingExitDate: Family[];
}

export const SUCCEED_OUTCOME_LABEL: Record<SucceedOutcome, string> = {
  succeeded: 'Housed at exit and at 3 months',
  not_housed_at_exit: 'Not stably housed at exit',
  not_housed_at_checkin: 'Not stably housed at the 3-month check-in',
  no_exit_checkin: 'No exit check-in logged',
  checkin_missing: '3-month check-in not logged yet',
  checkin_not_due: '3-month check-in not due yet',
};

export function computeImpactReport(input: {
  period: ReportPeriod;
  families: Family[]; // active + past
  children: ChildSlim[];
  checkins: OutcomeCheckin[];
  logs: { id: string; session_date: string; session_type: SessionLogType }[];
  attendance: { session_log_id: string; family_id: string; status: AttendanceStatus }[];
}): ImpactReport {
  const { period, families, children, checkins, logs, attendance } = input;
  const today = todayIso();

  // One "session offered" per date + type, even when two staff each filed a
  // Monday log for the same night.
  const sessionKeyByLog = new Map(logs.map((l) => [l.id, `${l.session_date}|${l.session_type}`]));
  const sessions = [...new Set(sessionKeyByLog.values())].map((k) => ({ key: k, date: k.split('|')[0] }));
  const earliestSessionIso = sessions.reduce<string | null>((min, s) => (min === null || s.date < min ? s.date : min), null);

  const markedByFamily = new Map<string, Map<string, boolean>>(); // family -> session key -> attended?
  for (const a of attendance) {
    const key = sessionKeyByLog.get(a.session_log_id);
    if (!key) continue;
    const m = markedByFamily.get(a.family_id) ?? new Map<string, boolean>();
    m.set(key, (m.get(key) ?? false) || a.status !== 'no_show');
    markedByFamily.set(a.family_id, m);
  }

  const checkinsByFamily = new Map<string, OutcomeCheckin[]>();
  for (const c of checkins) {
    const list = checkinsByFamily.get(c.family_id) ?? [];
    list.push(c);
    checkinsByFamily.set(c.family_id, list);
  }

  const missingExitDate: Family[] = [];
  const reach: ReachRow[] = [];
  const succeed: SucceedRow[] = [];

  for (const f of families) {
    const enrollStartIso = f.onboarding_start_date ?? f.created_at.slice(0, 10);
    const exitIso = f.active ? null : f.program_end_date;
    if (!f.active && !exitIso) {
      missingExitDate.push(f);
      continue;
    }
    const household = countHousehold(f.id, children, period);

    // ── Reach ──
    const enrolledInPeriod = enrollStartIso <= period.endIso && (exitIso === null || exitIso >= period.startIso);
    if (enrolledInPeriod) {
      const windowEnd = exitIso && exitIso < period.endIso ? exitIso : period.endIso;
      const sixMonthsIso = addMonthsIso(enrollStartIso, REACH_MIN_MONTHS);
      const metSixMonths = sixMonthsIso <= windowEnd;

      const offered = sessions.filter((s) => s.date >= enrollStartIso && s.date <= windowEnd);
      const marked = markedByFamily.get(f.id) ?? new Map<string, boolean>();
      const attended = offered.filter((s) => marked.get(s.key) === true).length;
      const unmarked = offered.filter((s) => !marked.has(s.key)).length;
      const rate = offered.length > 0 ? attended / offered.length : null;
      const attendanceRecordsFromIso =
        earliestSessionIso && earliestSessionIso > addMonthsIso(enrollStartIso, 1) ? earliestSessionIso : null;

      let reason: string | null = null;
      if (!metSixMonths) reason = `Not enrolled 6 months by ${windowEnd === period.endIso ? 'the end of the period' : 'program exit'}`;
      else if (rate === null) reason = 'No Monday/Thursday attendance on record';
      else if (rate < REACH_MIN_ATTENDANCE) reason = `Attended ${Math.round(rate * 100)}% (needs 80%)`;

      reach.push({
        family: f,
        household,
        enrollStartIso,
        exitIso,
        statusAtEnd: exitIso && exitIso <= period.endIso ? (f.status === 'graduated' ? 'graduated' : 'left') : 'still_enrolled',
        sixMonthsIso,
        metSixMonths,
        sessionsOffered: offered.length,
        sessionsAttended: attended,
        sessionsUnmarked: unmarked,
        attendanceRate: rate,
        attendanceRecordsFromIso,
        reached: reason === null,
        reason,
      });
    }

    // ── Succeed ── (counted in the year the 3-month check-in falls due)
    if (exitIso) {
      const dueIso = checkinDueIso(exitIso, SUCCEED_CHECKIN_MONTHS);
      if (dueIso >= period.startIso && dueIso <= period.endIso) {
        const list = [...(checkinsByFamily.get(f.id) ?? [])].sort((a, b) =>
          (a.checkin_date ?? '').localeCompare(b.checkin_date ?? '') || a.created_at.localeCompare(b.created_at),
        );
        const exitCheckin = list.find((c) => c.label === 'Exit') ?? list[0] ?? null;
        const opensIso = checkinWindowOpensIso(dueIso);
        const followUp = list.find((c) => c !== exitCheckin && !!c.checkin_date && c.checkin_date >= opensIso) ?? null;

        let outcome: SucceedOutcome;
        if (!exitCheckin) outcome = 'no_exit_checkin';
        else if (!exitCheckin.stably_housed) outcome = 'not_housed_at_exit';
        else if (!followUp) outcome = dueIso > today ? 'checkin_not_due' : 'checkin_missing';
        else outcome = followUp.stably_housed ? 'succeeded' : 'not_housed_at_checkin';

        succeed.push({ family: f, household, exitIso, checkinDueIso: dueIso, outcome });
      }
    }
  }

  const reached = reach.filter((r) => r.reached);
  const succeeded = succeed.filter((s) => s.outcome === 'succeeded');
  return {
    period,
    reach,
    succeed,
    reachedPeople: reached.reduce((n, r) => n + r.household.people, 0),
    reachedHouseholds: reached.length,
    succeededPeople: succeeded.reduce((n, s) => n + s.household.people, 0),
    succeededHouseholds: succeeded.length,
    missingExitDate,
  };
}

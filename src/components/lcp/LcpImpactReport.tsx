import { useEffect, useMemo, useState } from 'react';
import {
  familyDisplayName,
  fetchAllHouseholdChildrenSlim,
  fetchAllOutcomeCheckins,
  fetchFamilies,
  fetchImpactAttendance,
} from '@/lib/lcp';
import { dayLabel } from '@/lib/lcp-format';
import {
  IMPACT_DEFINITIONS,
  SUCCEED_OUTCOME_LABEL,
  computeImpactReport,
  fiscalYear,
  lastCompletedFiscalYearStart,
  type ExitStatus,
  type ImpactReport,
} from '@/lib/lcp-impact';
import type { Family, HouseholdChild, OutcomeCheckin } from '@/lib/lcp-types';

type Loaded = {
  families: Family[];
  children: Pick<HouseholdChild, 'id' | 'family_id' | 'full_name' | 'date_of_birth'>[];
  checkins: OutcomeCheckin[];
  logs: Awaited<ReturnType<typeof fetchImpactAttendance>>['logs'];
  attendance: Awaited<ReturnType<typeof fetchImpactAttendance>>['attendance'];
};

const STATUS_LABEL: Record<ExitStatus, string> = {
  still_enrolled: 'Still enrolled',
  graduated: 'Graduated',
  left: 'Left before finishing',
};

const card = 'rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-card';
const muted = 'text-sparrow-gray dark:text-sparrow-dark-gray';
const ink = 'text-sparrow-ink dark:text-sparrow-dark-ink';

/** Charity Navigator Reach / Succeed counts for one fiscal year, with the
 *  names behind every number so staff can sanity-check before filing. */
export function LcpImpactReport({ onOpenFamily }: { onOpenFamily: (id: string) => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startYear, setStartYear] = useState(() => lastCompletedFiscalYearStart());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [active, past, children, checkins, att] = await Promise.all([
          fetchFamilies(true),
          fetchFamilies(false),
          fetchAllHouseholdChildrenSlim(),
          fetchAllOutcomeCheckins(),
          fetchImpactAttendance('2000-01-01'),
        ]);
        if (!cancelled) setData({ families: [...active, ...past], children, checkins, logs: att.logs, attendance: att.attendance });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the report.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fiscal years from the earliest enrollment on file through the current one.
  const yearOptions = useMemo(() => {
    const now = new Date();
    const currentStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    let earliest = lastCompletedFiscalYearStart();
    for (const f of data?.families ?? []) {
      const iso = f.onboarding_start_date ?? f.created_at.slice(0, 10);
      const [y, m] = iso.split('-').map(Number);
      earliest = Math.min(earliest, m >= 7 ? y : y - 1);
    }
    const out: number[] = [];
    for (let y = currentStart; y >= earliest; y--) out.push(y);
    return { list: out, currentStart };
  }, [data]);

  const report: ImpactReport | null = useMemo(
    () => (data ? computeImpactReport({ period: fiscalYear(startYear), ...data }) : null),
    [data, startYear],
  );

  if (error) return <p className="mt-6 text-sm text-priority-p1">{error}</p>;
  if (!report) return <p className={`mt-6 text-sm ${muted}`}>Loading…</p>;

  const reachedRows = report.reach.filter((r) => r.reached);
  const byStatus = (s: ExitStatus) => reachedRows.filter((r) => r.statusAtEnd === s).reduce((n, r) => n + r.household.people, 0);
  const missingBirthdays = [...report.reach, ...report.succeed].flatMap((r) =>
    r.household.childrenMissingBirthday.map((c) => `${c} (${familyDisplayName(r.family)})`),
  );
  const uniqueMissingBirthdays = [...new Set(missingBirthdays)];
  const attendanceGap = report.reach.find((r) => r.attendanceRecordsFromIso)?.attendanceRecordsFromIso ?? null;
  const unmarkedTotal = report.reach.reduce((n, r) => n + r.sessionsUnmarked, 0);
  const pendingCheckins = report.succeed.filter((s) => s.outcome === 'checkin_missing');

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={`text-lg font-semibold ${ink}`}>Impact Report</h2>
          <p className={`text-sm ${muted}`}>
            Charity Navigator Reach and Succeed counts, in people (each parent and child). Click a name to open the family.
          </p>
        </div>
        <label className="text-sm">
          <span className="field-label">Fiscal year</span>
          <select className="field-input mt-1" value={startYear} onChange={(e) => setStartYear(Number(e.target.value))}>
            {yearOptions.list.map((y) => (
              <option key={y} value={y}>
                {fiscalYear(y).label}
                {y === yearOptions.currentStart ? ' (in progress)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={card}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Reach</p>
          <p className={`mt-1 text-3xl font-semibold ${ink}`}>
            {report.reachedPeople} <span className={`text-base font-normal ${muted}`}>people</span>
          </p>
          <p className={`text-sm ${muted}`}>
            {report.reachedHouseholds} household{report.reachedHouseholds === 1 ? '' : 's'}
            {report.reachedPeople > 0 &&
              ` · ${byStatus('still_enrolled')} still enrolled, ${byStatus('graduated')} graduated, ${byStatus('left')} left before finishing`}
          </p>
        </div>
        <div className={card}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Succeed</p>
          <p className={`mt-1 text-3xl font-semibold ${ink}`}>
            {report.succeededPeople} <span className={`text-base font-normal ${muted}`}>people</span>
          </p>
          <p className={`text-sm ${muted}`}>
            {report.succeededHouseholds} household{report.succeededHouseholds === 1 ? '' : 's'} housed at exit and at their 3-month
            check-in, which fell in this year
          </p>
        </div>
      </div>

      {(report.missingExitDate.length > 0 || uniqueMissingBirthdays.length > 0 || attendanceGap || unmarkedTotal > 0 || pendingCheckins.length > 0) && (
        <div className="rounded-2xl border border-sparrow-gold/40 bg-sparrow-cream dark:bg-sparrow-gold/10 p-4 text-sm">
          <p className={`font-medium ${ink}`}>Check before you file</p>
          <ul className={`mt-1 list-disc space-y-1 pl-5 ${muted}`}>
            {report.missingExitDate.length > 0 && (
              <li>
                Left the program with no program end date, so they can't be placed in a year:{' '}
                {report.missingExitDate.map((f) => familyDisplayName(f)).join(', ')}.
              </li>
            )}
            {uniqueMissingBirthdays.length > 0 && (
              <li>Children with no birthday on file (counted, but check): {uniqueMissingBirthdays.join(', ')}.</li>
            )}
            {attendanceGap && (
              <li>
                Attendance records start {dayLabel(attendanceGap)}. Sessions before then aren't in the portal, so attendance % only
                covers what's on record.
              </li>
            )}
            {unmarkedTotal > 0 && (
              <li>
                {unmarkedTotal} session{unmarkedTotal === 1 ? '' : 's'} with no attendance marked for an enrolled family (counted as
                missed).
              </li>
            )}
            {pendingCheckins.length > 0 && (
              <li>
                3-month check-ins due but not logged: {pendingCheckins.map((s) => familyDisplayName(s.family)).join(', ')}.
              </li>
            )}
          </ul>
        </div>
      )}

      <section className={card}>
        <h3 className={`text-sm font-semibold ${ink}`}>Reach: everyone enrolled during this year</h3>
        <p className={`text-xs ${muted}`}>Counted if enrolled 6+ months and the parent attended 80%+ of Monday/Thursday sessions.</p>
        {report.reach.length === 0 ? (
          <p className={`mt-3 text-sm ${muted}`}>No families were enrolled during this year.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className={`text-xs ${muted}`}>
                <tr>
                  <th className="py-1 pr-3 font-medium">Family</th>
                  <th className="py-1 pr-3 font-medium">People</th>
                  <th className="py-1 pr-3 font-medium">Enrolled</th>
                  <th className="py-1 pr-3 font-medium">Attendance</th>
                  <th className="py-1 pr-3 font-medium">At year end</th>
                  <th className="py-1 font-medium">Counted?</th>
                </tr>
              </thead>
              <tbody>
                {report.reach.map((r) => (
                  <tr key={r.family.id} className="border-t border-sparrow-rule dark:border-sparrow-dark-border align-top">
                    <td className="py-2 pr-3">
                      <button onClick={() => onOpenFamily(r.family.id)} className="font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
                        {familyDisplayName(r.family)}
                      </button>
                    </td>
                    <td className={`py-2 pr-3 ${ink}`}>
                      {r.household.people}
                      {r.household.childrenBornAfter.length > 0 && (
                        <span className={`block text-xs ${muted}`}>+ {r.household.childrenBornAfter.join(', ')} next year</span>
                      )}
                    </td>
                    <td className={`py-2 pr-3 ${muted}`}>
                      {dayLabel(r.enrollStartIso)}
                      {r.exitIso && ` – ${dayLabel(r.exitIso)}`}
                    </td>
                    <td className={`py-2 pr-3 ${muted}`}>
                      {r.attendanceRate === null
                        ? '—'
                        : `${Math.round(r.attendanceRate * 100)}% (${r.sessionsAttended} of ${r.sessionsOffered})`}
                    </td>
                    <td className={`py-2 pr-3 ${muted}`}>{STATUS_LABEL[r.statusAtEnd]}</td>
                    <td className="py-2">
                      {r.reached ? (
                        <span className="font-medium text-sparrow-green dark:text-sparrow-dark-green">✓ Counted</span>
                      ) : (
                        <span className={muted}>No: {r.reason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card}>
        <h3 className={`text-sm font-semibold ${ink}`}>Succeed: 3-month check-ins due this year</h3>
        <p className={`text-xs ${muted}`}>
          Counted if stably housed at exit and at the 3-month check-in. A family can succeed in a different year than they were
          reached.
        </p>
        {report.succeed.length === 0 ? (
          <p className={`mt-3 text-sm ${muted}`}>No 3-month check-ins fell due this year.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className={`text-xs ${muted}`}>
                <tr>
                  <th className="py-1 pr-3 font-medium">Family</th>
                  <th className="py-1 pr-3 font-medium">People</th>
                  <th className="py-1 pr-3 font-medium">Left program</th>
                  <th className="py-1 pr-3 font-medium">Check-in due</th>
                  <th className="py-1 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {report.succeed.map((s) => (
                  <tr key={s.family.id} className="border-t border-sparrow-rule dark:border-sparrow-dark-border align-top">
                    <td className="py-2 pr-3">
                      <button onClick={() => onOpenFamily(s.family.id)} className="font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
                        {familyDisplayName(s.family)}
                      </button>
                    </td>
                    <td className={`py-2 pr-3 ${ink}`}>{s.household.people}</td>
                    <td className={`py-2 pr-3 ${muted}`}>{dayLabel(s.exitIso)}</td>
                    <td className={`py-2 pr-3 ${muted}`}>{dayLabel(s.checkinDueIso)}</td>
                    <td className="py-2">
                      {s.outcome === 'succeeded' ? (
                        <span className="font-medium text-sparrow-green dark:text-sparrow-dark-green">✓ {SUCCEED_OUTCOME_LABEL[s.outcome]}</span>
                      ) : (
                        <span className={muted}>{SUCCEED_OUTCOME_LABEL[s.outcome]}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card}>
        <h3 className={`text-sm font-semibold ${ink}`}>Charity Navigator wording</h3>
        <p className={`text-xs ${muted}`}>What's on file with Charity Navigator, so the numbers above match how they're described.</p>
        <div className="mt-3 space-y-3">
          <CopyBlock title="Reach: what it means" text={IMPACT_DEFINITIONS.reachMeans} />
          <CopyBlock title="Reach: measurement sources and assumptions" text={IMPACT_DEFINITIONS.reachSources} />
          <CopyBlock title="Succeed: what it means" text={IMPACT_DEFINITIONS.succeedMeans} />
          <CopyBlock title="Succeed: measurement sources and assumptions" text={IMPACT_DEFINITIONS.succeedSources} />
        </div>
      </section>
    </div>
  );
}

function CopyBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="field-label">{title}</span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked -- text is still selectable */
            }
          }}
          className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <p className={`mt-1 text-sm ${ink}`}>{text}</p>
    </div>
  );
}

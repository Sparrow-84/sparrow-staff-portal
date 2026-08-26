import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  acknowledgeHousingSavingsAnnouncement,
  fetchAllAttendanceWithSessionDate,
  fetchAllComplianceFollowUps,
  fetchAllGoals,
  fetchAllProgramFeePayments,
  fetchEvents,
  fetchAllHomework,
  familyDisplayName,
  fetchFamilies,
  fetchLcpDesignatedSpaces,
  fetchOpenLcpMoveInRequests,
  fetchPhasesWithUnits,
  fetchProgramPosition,
  fetchRedemptions,
  fetchRecentSessionLogs,
  fetchSessions,
  recomputeLcpPerfectWeeks,
  updateFamily,
} from '@/lib/lcp';
import { fetchProfiles } from '@/lib/data';
import type { Profile } from '@/lib/types';
import { computeFamilyStatus, dayLabel, isFeeOverdue, isOverdue } from '@/lib/lcp-format';
import {
  FAMILY_STATUS,
  type AttendanceStatus,
  type ComplianceNote,
  type CurriculumSession,
  type Family,
  type Goal,
  type Homework,
  type LcpEvent,
  type LcpMoveInRequest,
  type LcpPhaseWithUnits,
  type ProgramFeePayment,
  type ProgramPosition,
  type Redemption,
  type SessionLog as SessionLogRecord,
  type TocSpaceSlim,
} from '@/lib/lcp-types';
import { RoomTour, useRoomTour, type TourStep } from '@/components/RoomTour';
import { FamilyDetailPanel, type FamilyDetailTab } from './FamilyDetailPanel';
import { SessionBriefPanel } from './SessionBriefPanel';
import { SessionLog } from './SessionLog';
import { SessionLogViewer } from './SessionLogViewer';
import { AddFamilyPanel } from './AddFamilyPanel';
import { AddEventPanel } from './AddEventPanel';
import { EventDetailPanel } from './EventDetailPanel';
import { LcpCalendar } from './LcpCalendar';
import { CurriculumAdmin } from './CurriculumAdmin';
import { DeptCalendar } from '@/components/calendar/DeptCalendar';
import { LcpProgress } from './LcpProgress';
import { PhaseProgressBar } from './PhaseProgressBar';
import { LcpHome } from './LcpHome';
import type { View } from '@/components/Sidebar';

const LCP_TOUR_STEPS: TourStep[] = [
  {
    icon: '🌱',
    image: '/brand/logo-primary-circle-green.png',
    title: 'LifeChange Program',
    body: "This room is where you work with LCP families — tracking their progress, logging sessions, setting goals, assigning homework, and staying in touch throughout the program.",
    tag: null,
  },
  {
    icon: '👨‍👩‍👧',
    title: 'Families',
    body: "The Families tab lists all your active participants. You can see current session, overdue homework, and program status at a glance. Click any family to open their full detail panel.",
    tag: { icon: '👨‍👩‍👧', label: 'Families' },
  },
  {
    icon: '📁',
    title: 'Family detail panel',
    body: "Inside each family's panel: session progress, goals you've set together, finance milestones, homework assignments, direct messages, and your private staff notes — all in one place.",
    tag: { icon: '📁', label: 'Family Detail' },
  },
  {
    icon: '📓',
    title: 'Session log',
    body: "After each group session, log it here. Notes, attendance, what was covered. This builds a running record of the program that the whole team can reference.",
    tag: { icon: '📓', label: 'Session Log' },
  },
  {
    icon: '📚',
    title: 'Curriculum admin',
    body: "This is where program content is managed — session materials, devotionals, homework, and pre-session encouragement notes. Content is written once by the program director and reused every time that session runs.",
    tag: { icon: '📚', label: 'Curriculum' },
  },
  {
    icon: '✨',
    title: "You're all set",
    body: "Start by opening a family's panel to see their full picture. If you're leading group, the Session Log is your spot right after each meeting.",
    tag: null,
  },
];

/** Status is computed, never staff-clicked (see computeFamilyStatus). Runs on
 *  every room load, updates only the families whose computed status actually
 *  changed, and returns the corrected array so the UI reflects it immediately
 *  without waiting on a second round-trip. */
async function recomputeFamilyStatuses(
  families: Family[],
  homework: Homework[],
  goals: Goal[],
  attendance: { family_id: string; status: AttendanceStatus; session_date: string }[],
): Promise<Family[]> {
  const attendanceByFamily = new Map<string, { status: AttendanceStatus; session_date: string }[]>();
  for (const a of attendance) {
    const list = attendanceByFamily.get(a.family_id) ?? [];
    list.push(a);
    attendanceByFamily.set(a.family_id, list);
  }

  const updates: Promise<void>[] = [];
  const corrected = families.map((f) => {
    if (f.status === 'graduated') return f;
    const hasOverdue =
      homework.some((h) => h.family_id === f.id && h.status !== 'complete' && isOverdue(h.due_date)) ||
      goals.some((g) => g.family_id === f.id && g.status !== 'met' && isOverdue(g.due_date));
    const recent = (attendanceByFamily.get(f.id) ?? [])
      .sort((a, b) => b.session_date.localeCompare(a.session_date))
      .slice(0, 4);
    const noShows = recent.filter((a) => a.status === 'no_show').length;
    const computed = computeFamilyStatus(f.move_in_date, f.status, hasOverdue, noShows);
    if (computed !== f.status) {
      updates.push(updateFamily(f.id, { status: computed }));
      return { ...f, status: computed };
    }
    return f;
  });

  if (updates.length > 0) await Promise.all(updates);
  return corrected;
}

export function LcpRoom({ onNavigate }: { onNavigate?: (view: View) => void }) {
  const { tourOpen, dismissTour } = useRoomTour('sparrow_lcp_toured_v1');
  const { profile } = useAuth();
  const canEditCurriculum = profile?.role === 'admin' || (profile?.lcp_role === 'full' && profile?.lcp_curriculum_access === true);
  const [families, setFamilies] = useState<Family[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [events, setEvents] = useState<LcpEvent[]>([]);
  const [sessionLogs, setSessionLogs] = useState<SessionLogRecord[]>([]);
  const [sessions, setSessions] = useState<CurriculumSession[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [phases, setPhases] = useState<LcpPhaseWithUnits[]>([]);
  const [programPosition, setProgramPosition] = useState<ProgramPosition | null>(null);
  const [tocSpaces, setTocSpaces] = useState<TocSpaceSlim[]>([]);
  const [feePayments, setFeePayments] = useState<Pick<ProgramFeePayment, 'family_id' | 'paid_date'>[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [complianceFollowUpNotes, setComplianceFollowUpNotes] = useState<ComplianceNote[]>([]);
  const [allGoals, setAllGoals] = useState<Goal[]>([]);
  const [tocRequests, setTocRequests] = useState<LcpMoveInRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'home' | 'families' | 'progress' | 'session-log' | 'session-cal' | 'team-cal' | 'curriculum'>('home');
  const [familiesView, setFamiliesView] = useState<'active' | 'past'>('active');
  const [pastFamilies, setPastFamilies] = useState<Family[]>([]);
  const [pastLoaded, setPastLoaded] = useState(false);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [familyOpenTab, setFamilyOpenTab] = useState<FamilyDetailTab | undefined>(undefined);
  const [event, setEvent] = useState<LcpEvent | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<LcpEvent | null>(null);
  const [calendarLog, setCalendarLog] = useState<SessionLogRecord | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      // Best-effort, same idiom as the calendar's birthday/stat-holiday sync --
      // evaluates any newly-elapsed weeks before families' cached totals are
      // read below, but a failure here (e.g. migration 0150 not run yet)
      // shouldn't block the rest of the room from loading.
      await recomputeLcpPerfectWeeks().catch(() => undefined);

      const [fam, hw, ev, logs, se, red, ph, pos, spaces, fees, profs, cf, goals, attendance, mir] = await Promise.all([
        fetchFamilies(),
        fetchAllHomework(),
        fetchEvents(),
        fetchRecentSessionLogs(52),
        fetchSessions(),
        fetchRedemptions(),
        fetchPhasesWithUnits(),
        fetchProgramPosition(),
        fetchLcpDesignatedSpaces(),
        fetchAllProgramFeePayments(),
        fetchProfiles(),
        // These three back LCP Home's live signal cards -- resilient to a
        // pending migration or one bad row so they never block the rest of
        // the room's own data (families, homework, etc.) from loading.
        fetchAllComplianceFollowUps().catch(() => []),
        fetchAllGoals(),
        fetchAllAttendanceWithSessionDate(),
        fetchOpenLcpMoveInRequests().catch(() => []),
      ]);
      const correctedFam = await recomputeFamilyStatuses(fam, hw, goals, attendance);
      setFamilies(correctedFam);
      setHomework(hw);
      setEvents(ev);
      setSessionLogs(logs);
      setComplianceFollowUpNotes(cf);
      setAllGoals(goals);
      setTocRequests(mir.filter((r) => r.status === 'needs_info'));
      setSessions(se);
      setRedemptions(red);
      setPhases(ph);
      setProgramPosition(pos);
      setTocSpaces(spaces);
      setFeePayments(fees);
      setProfiles(profs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load LifeChange data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (familiesView !== 'past' || pastLoaded) return;
    fetchFamilies(false).then((f) => {
      setPastFamilies(f);
      setPastLoaded(true);
    });
  }, [familiesView, pastLoaded]);

  const homeworkByFamily = useMemo(() => {
    const map = new Map<string, Homework[]>();
    for (const hw of homework) {
      const list = map.get(hw.family_id) ?? [];
      list.push(hw);
      map.set(hw.family_id, list);
    }
    return map;
  }, [homework]);

  const complianceFollowUps = useMemo(
    () => new Set(complianceFollowUpNotes.filter((n) => n.follow_up_needed).map((n) => n.family_id)),
    [complianceFollowUpNotes],
  );

  const feeDatesByFamily = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of feePayments) {
      const list = map.get(p.family_id) ?? [];
      list.push(p.paid_date);
      map.set(p.family_id, list);
    }
    return map;
  }, [feePayments]);
  const feeOverdue = (f: Family) => isFeeOverdue(f.move_in_date, f.status, feeDatesByFamily.get(f.id) ?? []);

  const stats = {
    active: families.length,
    onTrack: families.filter((f) => f.status === 'on_track').length,
    needs: families.filter((f) => f.status === 'needs_attention').length,
    onboarding: families.filter((f) => f.status === 'onboarding').length,
    feeOverdue: families.filter(feeOverdue).length,
  };

  function openFamily(id: string, tab?: FamilyDetailTab) {
    setFamilyId(id);
    setFamilyOpenTab(tab);
    setFamilyOpen(true);
  }
  function openBrief(ev: LcpEvent) {
    setEvent(ev);
    setBriefOpen(true);
  }

  if (loading) return <p className="p-8 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading LifeChange…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;


  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <RoomTour steps={LCP_TOUR_STEPS} open={tourOpen} onDismiss={dismissTour} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">LifeChange</h1>
          <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            {stats.active} families · {stats.onTrack} on track · {stats.needs} need attention · {stats.onboarding} onboarding
            {stats.feeOverdue > 0 && <span className="text-priority-p1"> · {stats.feeOverdue} program fee overdue</span>}
          </p>
        </div>
        {tab === 'families' && familiesView === 'active' && (
          <button onClick={() => setAddOpen(true)} className="btn-primary shrink-0">
            + Add family
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 inline-flex flex-wrap rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-1 text-sm">
        {(['home', 'families', 'progress', 'session-log', 'session-cal', 'team-cal', 'curriculum'] as const)
          .filter((t) => t !== 'curriculum' || canEditCurriculum)
          .map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              tab === t ? 'bg-sparrow-green text-white' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
            }`}
          >
            {t === 'session-log' ? 'Session Log'
              : t === 'session-cal' ? 'Session Cal'
              : t === 'team-cal' ? 'Team Cal'
              : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'home' ? (
        <LcpHome
          families={families}
          homework={homework}
          redemptions={redemptions}
          sessionLogs={sessionLogs}
          events={events}
          phases={phases}
          programPosition={programPosition}
          feeDatesByFamily={feeDatesByFamily}
          complianceFollowUps={complianceFollowUpNotes}
          goals={allGoals}
          tocRequests={tocRequests}
          currentUserId={profile?.id ?? ''}
          onOpenFamily={openFamily}
          onGoToSessionLog={() => setTab('session-log')}
          onGoToCurriculum={() => setTab('curriculum')}
          onGoToTwinOaks={() => onNavigate?.('twin-oaks')}
          canEditCurriculum={canEditCurriculum}
          onAcknowledgeSavingsAward={async (familyId, cents) => {
            await acknowledgeHousingSavingsAnnouncement(familyId, cents);
            void load();
          }}
        />
      ) : tab === 'session-log' ? (
        <div className="mt-6">
          <SessionLog
            families={families}
            homeworkByFamily={homeworkByFamily}
            currentUserId={profile?.id ?? ''}
            currentUserName={profile?.full_name ?? 'Staff'}
            phases={phases}
            programUnitId={programPosition?.unit_id ?? null}
            programSessionId={programPosition?.session_id ?? null}
            onChanged={load}
            onOpenFamily={(id) => openFamily(id, 'notes')}
          />
        </div>
      ) : tab === 'families' ? (
        <div className="mt-6 space-y-3">
          <div className="inline-flex rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-1 text-sm">
            {(['active', 'past'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setFamiliesView(v)}
                className={`rounded-md px-3 py-1 font-medium capitalize transition ${
                  familiesView === v ? 'bg-white dark:bg-sparrow-dark-surface text-sparrow-green dark:text-sparrow-dark-green shadow-sm' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {familiesView === 'past' ? (
            !pastLoaded ? (
              <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
            ) : pastFamilies.length === 0 ? (
              <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No families have left the program or graduated yet.</p>
            ) : (
              pastFamilies.map((f) => (
                <button
                  key={f.id}
                  onClick={() => openFamily(f.id)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 text-left shadow-card transition hover:border-sparrow-green/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{familyDisplayName(f)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${FAMILY_STATUS[f.status].chip}`}>
                        {FAMILY_STATUS[f.status].label}
                      </span>
                    </div>
                    {f.program_end_date && (
                      <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Program ended {dayLabel(f.program_end_date)}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sparrow-gray dark:text-sparrow-dark-gray">›</span>
                </button>
              ))
            )
          ) : (
            <>
              {families.map((f) => {
                const fhw = homeworkByFamily.get(f.id) ?? [];
                const open = fhw.filter((h) => h.status !== 'complete').length;
                return (
                  <button
                    key={f.id}
                    onClick={() => openFamily(f.id)}
                    className="flex w-full items-center gap-4 rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 text-left shadow-card transition hover:border-sparrow-green/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{familyDisplayName(f)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${FAMILY_STATUS[f.status].chip}`}>
                          {FAMILY_STATUS[f.status].label}
                        </span>
                        {complianceFollowUps.has(f.id) && (
                          <span className="rounded-full bg-sparrow-cream dark:bg-sparrow-gold/15 px-2 py-0.5 text-[10px] font-bold text-sparrow-gold">
                            ⚑ Follow-up
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                        {open} open homework
                      </p>
                      <div className="mt-2">
                        <PhaseProgressBar
                          phases={phases}
                          programUnitId={programPosition?.unit_id ?? null}
                          joinedUnitId={f.joined_unit_id}
                        />
                      </div>
                    </div>
                    {feeOverdue(f) && (
                      <span className="shrink-0 rounded-full bg-priority-p1/10 px-2 py-0.5 text-[10px] font-medium text-priority-p1">
                        Program fee overdue
                      </span>
                    )}
                    <span className="shrink-0 text-sparrow-gray dark:text-sparrow-dark-gray">›</span>
                  </button>
                );
              })}

              {/* Homework board — this week, one column per family */}
              <section className="mt-4">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Homework board</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {families.map((f) => {
                    const open = (homeworkByFamily.get(f.id) ?? []).filter((h) => h.status !== 'complete');
                    return (
                      <div key={f.id} className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3">
                        <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{familyDisplayName(f)}</p>
                        <ul className="mt-2 space-y-1.5">
                          {open.length === 0 && <li className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">All clear ✓</li>}
                          {open.map((h) => (
                            <li key={h.id} className="flex items-center gap-2 text-xs text-sparrow-ink dark:text-sparrow-dark-ink">
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  h.status === 'submitted' ? 'bg-sparrow-gold'
                                  : isOverdue(h.due_date) ? 'bg-priority-p1'
                                  : 'bg-sparrow-rule dark:bg-sparrow-dark-border'
                                }`}
                              />
                              <span className={`truncate ${isOverdue(h.due_date) ? 'text-priority-p1' : ''}`}>
                                {h.title}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      ) : tab === 'progress' ? (
        <LcpProgress
          phases={phases}
          position={programPosition}
          families={families}
          currentUserId={profile?.id ?? ''}
          onChanged={load}
        />
      ) : tab === 'curriculum' && canEditCurriculum ? (
        <CurriculumAdmin />
      ) : tab === 'team-cal' ? (
        <div className="mt-6">
          <DeptCalendar department="lcp" />
        </div>
      ) : (
        <div className="mt-6">
          {calendarLog ? (
            <SessionLogViewer
              key={calendarLog.id}
              log={calendarLog}
              families={families}
              currentUserId={profile?.id ?? ''}
              onBack={() => setCalendarLog(null)}
              onChanged={() => { setCalendarLog(null); void load(); }}
              onOpenFamily={(id) => openFamily(id, 'notes')}
            />
          ) : (
            <LcpCalendar
              events={events}
              logs={sessionLogs}
              onEventClick={(ev) => setDetailEvent(ev)}
              onLogClick={(log) => setCalendarLog(log)}
              onAdd={() => setAddEventOpen(true)}
            />
          )}
        </div>
      )}

      <FamilyDetailPanel
        open={familyOpen}
        family={familyId ? (families.find((f) => f.id === familyId) ?? pastFamilies.find((f) => f.id === familyId) ?? null) : null}
        sessions={sessions}
        phases={phases}
        programUnitId={programPosition?.unit_id ?? null}
        tocSpaces={tocSpaces}
        currentUserId={profile?.id ?? ''}
        onClose={() => setFamilyOpen(false)}
        onChanged={load}
        initialTab={familyOpenTab}
      />
      <SessionBriefPanel
        open={briefOpen}
        event={event}
        families={families}
        sessions={sessions}
        currentUserId={profile?.id ?? ''}
        onClose={() => setBriefOpen(false)}
        onChanged={load}
      />
      <AddFamilyPanel open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} />
      <EventDetailPanel
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onLogSession={(ev) => { setDetailEvent(null); openBrief(ev); }}
        onDeleted={() => { setDetailEvent(null); void load(); }}
        onChanged={load}
      />
      <AddEventPanel
        open={addEventOpen}
        currentUserId={profile?.id ?? ''}
        profiles={profiles}
        onClose={() => setAddEventOpen(false)}
        onCreated={() => { setAddEventOpen(false); void load(); }}
      />
    </div>
  );
}


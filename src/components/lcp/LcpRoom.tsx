import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchAllProgramFeePayments,
  fetchEvents,
  fetchAllHomework,
  fetchFamilies,
  fetchLcpDesignatedSpaces,
  fetchPhasesWithUnits,
  fetchProgramPosition,
  fetchRedemptions,
  fetchRecentSessionLogs,
  fetchSessions,
} from '@/lib/lcp';
import {
  FAMILY_STATUS,
  type CurriculumSession,
  type Family,
  type Homework,
  type LcpEvent,
  type LcpPhaseWithUnits,
  type ProgramFeePayment,
  type ProgramPosition,
  type Redemption,
  type SessionLog as SessionLogRecord,
  type TocSpaceSlim,
} from '@/lib/lcp-types';
import { isFeeOverdue, isOverdue } from '@/lib/lcp-format';
import { RoomTour, useRoomTour, type TourStep } from '@/components/RoomTour';
import { FamilyDetailPanel } from './FamilyDetailPanel';
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

export function LcpRoom() {
  const { tourOpen, dismissTour } = useRoomTour('sparrow_lcp_toured_v1');
  const { profile } = useAuth();
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'families' | 'progress' | 'session-log' | 'session-cal' | 'team-cal' | 'curriculum'>('families');
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [event, setEvent] = useState<LcpEvent | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<LcpEvent | null>(null);
  const [calendarLog, setCalendarLog] = useState<SessionLogRecord | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fam, hw, ev, logs, se, red, ph, pos, spaces, fees] = await Promise.all([
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
      ]);
      setFamilies(fam);
      setHomework(hw);
      setEvents(ev);
      setSessionLogs(logs);
      setSessions(se);
      setRedemptions(red);
      setPhases(ph);
      setProgramPosition(pos);
      setTocSpaces(spaces);
      setFeePayments(fees);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load LifeChange data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const homeworkByFamily = useMemo(() => {
    const map = new Map<string, Homework[]>();
    for (const hw of homework) {
      const list = map.get(hw.family_id) ?? [];
      list.push(hw);
      map.set(hw.family_id, list);
    }
    return map;
  }, [homework]);

  const pendingRedemptions = redemptions.filter((r) => r.status === 'requested');
  const familyName = (id: string) => families.find((f) => f.id === id)?.display_name ?? 'Family';

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

  function openFamily(id: string) {
    setFamilyId(id);
    setFamilyOpen(true);
  }
  function openBrief(ev: LcpEvent) {
    setEvent(ev);
    setBriefOpen(true);
  }

  if (loading) return <p className="p-8 text-sm text-sparrow-gray">Loading LifeChange…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;


  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <RoomTour steps={LCP_TOUR_STEPS} open={tourOpen} onDismiss={dismissTour} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">LifeChange</h1>
          <p className="mt-1 text-sm text-sparrow-gray">
            {stats.active} families · {stats.onTrack} on track · {stats.needs} need attention · {stats.onboarding} onboarding
            {stats.feeOverdue > 0 && <span className="text-priority-p1"> · {stats.feeOverdue} program fee overdue</span>}
          </p>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn-primary shrink-0">
          + Add family
        </button>
      </div>

      {pendingRedemptions.length > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-sparrow-gold/40 bg-sparrow-cream px-4 py-3 text-sm">
          <span>
            ✨ {pendingRedemptions.length} voucher redemption{pendingRedemptions.length > 1 ? 's' : ''} waiting to be
            fulfilled.
          </span>
          <button onClick={() => openFamily(pendingRedemptions[0].family_id)} className="font-medium text-sparrow-green">
            Open {familyName(pendingRedemptions[0].family_id)} →
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 inline-flex flex-wrap rounded-xl border border-sparrow-rule bg-white p-1 text-sm">
        {(['families', 'progress', 'session-log', 'session-cal', 'team-cal', 'curriculum'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              tab === t ? 'bg-sparrow-green text-white' : 'text-sparrow-gray hover:text-sparrow-ink'
            }`}
          >
            {t === 'session-log' ? 'Session Log'
              : t === 'session-cal' ? 'Session Cal'
              : t === 'team-cal' ? 'Team Cal'
              : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'session-log' ? (
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
          />
        </div>
      ) : tab === 'families' ? (
        <div className="mt-6 space-y-3">
          {families.map((f) => {
            const fhw = homeworkByFamily.get(f.id) ?? [];
            const open = fhw.filter((h) => h.status !== 'complete').length;
            return (
              <button
                key={f.id}
                onClick={() => openFamily(f.id)}
                className="flex w-full items-center gap-4 rounded-2xl border border-sparrow-rule bg-white p-4 text-left shadow-card transition hover:border-sparrow-green/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-sparrow-ink">{f.display_name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${FAMILY_STATUS[f.status].chip}`}>
                      {FAMILY_STATUS[f.status].label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-sparrow-gray">
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
                <span className="shrink-0 text-sparrow-gray">›</span>
              </button>
            );
          })}

          {/* Homework board — this week, one column per family */}
          <section className="mt-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Homework board</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {families.map((f) => {
                const open = (homeworkByFamily.get(f.id) ?? []).filter((h) => h.status !== 'complete');
                return (
                  <div key={f.id} className="rounded-xl border border-sparrow-rule bg-white p-3">
                    <p className="text-sm font-medium text-sparrow-ink">{f.display_name}</p>
                    <ul className="mt-2 space-y-1.5">
                      {open.length === 0 && <li className="text-xs text-sparrow-gray">All clear ✓</li>}
                      {open.map((h) => (
                        <li key={h.id} className="flex items-center gap-2 text-xs text-sparrow-ink">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              h.status === 'submitted' ? 'bg-sparrow-gold'
                              : isOverdue(h.due_date) ? 'bg-priority-p1'
                              : 'bg-sparrow-rule'
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
        </div>
      ) : tab === 'progress' ? (
        <LcpProgress
          phases={phases}
          position={programPosition}
          families={families}
          currentUserId={profile?.id ?? ''}
          onChanged={load}
        />
      ) : tab === 'curriculum' ? (
        <CurriculumAdmin />
      ) : tab === 'team-cal' ? (
        <div className="mt-6" style={{ height: '70vh' }}>
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
        family={familyId ? families.find((f) => f.id === familyId) ?? null : null}
        sessions={sessions}
        phases={phases}
        programUnitId={programPosition?.unit_id ?? null}
        tocSpaces={tocSpaces}
        currentUserId={profile?.id ?? ''}
        onClose={() => setFamilyOpen(false)}
        onChanged={load}
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
        onClose={() => setAddEventOpen(false)}
        onCreated={() => { setAddEventOpen(false); void load(); }}
      />
    </div>
  );
}


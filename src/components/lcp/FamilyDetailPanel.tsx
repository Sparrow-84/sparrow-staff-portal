import { useCallback, useEffect, useState } from 'react';
import { localDate } from '@/lib/date';
import {
  AREA_LABEL,
  ATTENDANCE_LABEL,
  FAMILY_STATUS,
  GOAL_AREA_LABEL,
  GOAL_AREAS,
  HOMEWORK_AREAS,
  SESSION_LOG_LABEL,
  type AttendanceHistoryEntry,
  type ChildInput,
  type ComplianceNote,
  type CurriculumSession,
  type Family,
  type Goal,
  type GoalArea,
  type GoalResponse,
  type Homework,
  type HomeworkArea,
  type HouseholdAdult,
  type HouseholdChild,
  type HousingSavingsMonth,
  type LcpMoveInRequest,
  type LcpPerfectWeek,
  type LcpPhaseWithUnits,
  type Message,
  type ProgramFeeMethod,
  type ProgramFeePayment,
  PROGRAM_FEE_METHOD_LABEL,
  type Redemption,
  type StaffNote,
  type TocSpaceSlim,
  type Voucher,
} from '@/lib/lcp-types';
import { PhaseProgressBar } from './PhaseProgressBar';
import {
  addComplianceNote,
  addHouseholdChild,
  addProgramFeePayment,
  addStaffNote,
  updateStaffNote,
  assignHomework,
  awardVoucher,
  createGoal,
  deleteFamily,
  deleteGoal,
  deleteHomework,
  deleteHouseholdChild,
  deleteProgramFeePayment,
  familyDisplayName,
  fetchAttendanceHistoryForFamily,
  fetchComplianceNotes,
  fetchGoalResponsesForFamily,
  fetchGoalsForFamily,
  fetchHomeworkForFamily,
  fetchHouseholdAdult,
  fetchHouseholdChildren,
  fetchHousingSavingsMonths,
  fetchPerfectWeeksForFamily,
  fetchMessages,
  fetchProgramFeePayments,
  fetchRedemptions,
  fetchStaffNotes,
  fetchVouchers,
  fulfillRedemption,
  graduateFamily,
  redeemVouchersInPerson,
  markGoalMet,
  reopenGoal,
  resolveComplianceFollowUp,
  saveHouseholdAdult,
  fetchMoveInRequestForFamily,
  requestOrSyncLcpToc,
  setFamilyActive,
  setHomeworkStatus,
  updateFamily,
  updateHomework,
  updateHouseholdChild,
} from '@/lib/lcp';
import { money, dayLabel, dueLabel, isFeeOverdue, isOverdue, ageFromDob } from '@/lib/lcp-format';
import { Drawer } from './Drawer';
import { StaffThread } from './StaffThread';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { ComplianceLabelPicker } from './ComplianceLabelPicker';
import { LabelPill } from '@/components/LabelPill';
import { RichTextField, RichOrPlainView } from './RichText';

export type FamilyDetailTab = 'general' | 'children' | 'progress' | 'finance' | 'compliance' | 'goals' | 'homework' | 'messages' | 'notes';
type Tab = FamilyDetailTab;
const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General Info' },
  { key: 'children', label: 'Children' },
  { key: 'progress', label: 'Progress' },
  { key: 'finance', label: 'Finance' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'goals', label: 'Goals' },
  { key: 'homework', label: 'Homework' },
  { key: 'messages', label: 'Messages' },
  { key: 'notes', label: 'Notes' },
];

export function FamilyDetailPanel({
  open,
  family,
  sessions,
  phases,
  programUnitId,
  tocSpaces,
  currentUserId,
  onClose,
  onChanged,
  initialTab,
}: {
  open: boolean;
  family: Family | null;
  sessions: CurriculumSession[];
  phases: LcpPhaseWithUnits[];
  programUnitId: number | null;
  tocSpaces: TocSpaceSlim[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>('general');
  const [homework, setHomework] = useState<Homework[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalResponses, setGoalResponses] = useState<GoalResponse[]>([]);
  const [feePayments, setFeePayments] = useState<ProgramFeePayment[]>([]);
  const [householdAdult, setHouseholdAdult] = useState<HouseholdAdult | null>(null);
  const [householdChildren, setHouseholdChildren] = useState<HouseholdChild[]>([]);
  const [housingSavingsMonths, setHousingSavingsMonths] = useState<HousingSavingsMonth[]>([]);
  const [perfectWeeks, setPerfectWeeks] = useState<LcpPerfectWeek[]>([]);
  const [complianceNotes, setComplianceNotes] = useState<ComplianceNote[]>([]);
  const [reloadError, setReloadError] = useState<string | null>(null);

  const familyId = family?.id;

  // Each tab's data loads independently -- one failing fetch (e.g. a table/
  // column not live yet because a migration hasn't run) must never block the
  // other 11 from refreshing, or a save on one tab looks broken on every tab.
  const reloadDetail = useCallback(async () => {
    if (!familyId) return;
    const [hw, msg, nt, vo, red, gl, gr, fp, ha, hc, sm, cn, pw] = await Promise.allSettled([
      fetchHomeworkForFamily(familyId),
      fetchMessages(familyId),
      fetchStaffNotes(familyId),
      fetchVouchers(familyId),
      fetchRedemptions(),
      fetchGoalsForFamily(familyId),
      fetchGoalResponsesForFamily(familyId),
      fetchProgramFeePayments(familyId),
      fetchHouseholdAdult(familyId),
      fetchHouseholdChildren(familyId),
      fetchHousingSavingsMonths(familyId),
      fetchComplianceNotes(familyId),
      fetchPerfectWeeksForFamily(familyId),
    ]);
    if (hw.status === 'fulfilled') setHomework(hw.value);
    if (msg.status === 'fulfilled') setMessages(msg.value);
    if (nt.status === 'fulfilled') setNotes(nt.value);
    if (vo.status === 'fulfilled') setVouchers(vo.value);
    if (red.status === 'fulfilled') setRedemptions(red.value.filter((r) => r.family_id === familyId));
    if (gl.status === 'fulfilled') setGoals(gl.value);
    if (gr.status === 'fulfilled') setGoalResponses(gr.value);
    if (fp.status === 'fulfilled') setFeePayments(fp.value);
    if (ha.status === 'fulfilled') setHouseholdAdult(ha.value);
    if (hc.status === 'fulfilled') setHouseholdChildren(hc.value);
    if (sm.status === 'fulfilled') setHousingSavingsMonths(sm.value);
    if (cn.status === 'fulfilled') setComplianceNotes(cn.value);
    if (pw.status === 'fulfilled') setPerfectWeeks(pw.value);

    const failed = [hw, msg, nt, vo, red, gl, gr, fp, ha, hc, sm, cn, pw].filter((r) => r.status === 'rejected');
    setReloadError(
      failed.length > 0
        ? `${failed.length} part${failed.length > 1 ? 's' : ''} of this family's record didn't load — probably a database update still pending. Other tabs are unaffected.`
        : null,
    );
  }, [familyId]);

  useEffect(() => {
    if (open && familyId) {
      setTab(initialTab ?? 'general');
      void reloadDetail();
    }
  }, [open, familyId, reloadDetail, initialTab]);

  if (!family) return null;

  return (
    <Drawer open={open} onClose={onClose} title={familyDisplayName(family)} subtitle={family.login_email} wide>
      <div className="mb-4 inline-flex rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-1 text-xs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
              tab === t.key ? 'bg-white dark:bg-sparrow-dark-surface text-sparrow-green dark:text-sparrow-dark-green shadow-sm' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {reloadError && (
        <p className="mb-4 rounded-lg bg-sparrow-gold/10 px-3 py-2 text-xs text-sparrow-gold">{reloadError}</p>
      )}

      {tab === 'general' && (
        <GeneralInfoTab
          key={family.id}
          family={family}
          tocSpaces={tocSpaces}
          householdAdult={householdAdult}
          feePayments={feePayments}
          onChanged={() => {
            void reloadDetail();
            onChanged();
          }}
        />
      )}
      {tab === 'children' && (
        <ChildrenTab
          key={family.id}
          familyId={family.id}
          kids={householdChildren}
          onChanged={() => {
            void reloadDetail();
            onChanged();
          }}
        />
      )}
      {tab === 'progress' && (
        <ProgressTab
          family={family}
          sessions={sessions}
          phases={phases}
          programUnitId={programUnitId}
          onChanged={onChanged}
          onRemoved={() => {
            onChanged();
            onClose();
          }}
        />
      )}
      {tab === 'finance' && (
        <FinanceTab
          family={family}
          payments={feePayments}
          vouchers={vouchers}
          redemptions={redemptions}
          housingSavingsMonths={housingSavingsMonths}
          perfectWeeks={perfectWeeks}
          currentUserId={currentUserId}
          onChanged={() => {
            void reloadDetail();
            onChanged();
          }}
        />
      )}
      {tab === 'compliance' && (
        <ComplianceTab
          family={family}
          notes={complianceNotes}
          currentUserId={currentUserId}
          onChanged={() => {
            void reloadDetail();
            onChanged();
          }}
        />
      )}
      {tab === 'goals' && (
        <GoalsTab
          family={family}
          goals={goals}
          goalResponses={goalResponses}
          currentUserId={currentUserId}
          onChanged={() => {
            void reloadDetail();
            onChanged();
          }}
        />
      )}
      {tab === 'homework' && (
        <HomeworkTab
          family={family}
          homework={homework}
          sessions={sessions}
          currentUserId={currentUserId}
          onChanged={() => {
            void reloadDetail();
            onChanged();
          }}
        />
      )}
      {tab === 'messages' && (
        <div key={family.id} className="h-[60vh]">
          <StaffThread
            familyId={family.id}
            currentUserId={currentUserId}
            messages={messages}
            onChanged={() => void reloadDetail()}
          />
        </div>
      )}
      {tab === 'notes' && (
        <NotesTab family={family} notes={notes} currentUserId={currentUserId} onChanged={reloadDetail} />
      )}
    </Drawer>
  );
}

// ── Progress ─────────────────────────────────────────────────────────
function ProgressTab({
  family,
  sessions,
  phases,
  programUnitId,
  onChanged,
  onRemoved,
}: {
  family: Family;
  sessions: CurriculumSession[];
  phases: LcpPhaseWithUnits[];
  programUnitId: number | null;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmGraduate, setConfirmGraduate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceHistoryEntry[]>([]);

  useEffect(() => {
    void fetchAttendanceHistoryForFamily(family.id).then(setAttendanceHistory);
  }, [family.id]);

  const allUnits = phases.flatMap((p) => p.units).sort((a, b) => a.sort_order - b.sort_order);
  const currentProgramUnit = programUnitId ? allUnits.find((u) => u.id === programUnitId) : null;
  const currentPhase = programUnitId
    ? phases.find((p) => p.units.some((u) => u.id === programUnitId))
    : null;

  async function setJoinedUnit(unitId: number | null) {
    setBusy(true);
    const patch: Record<string, unknown> = { joined_unit_id: unitId };
    if (unitId != null) {
      const unitName = phases.flatMap((p) => p.units).find((u) => u.id === unitId)?.name;
      if (unitName) {
        const unitSessions = sessions.filter((s) => s.unit?.name === unitName);
        if (unitSessions.length > 0) {
          patch.current_session_number = Math.min(...unitSessions.map((s) => s.session_number));
        }
      }
    }
    await updateFamily(family.id, patch);
    setBusy(false);
    onChanged();
  }
  async function cancelParticipation() {
    setBusy(true);
    setErr(null);
    try {
      await setFamilyActive(family.id, false);
      onRemoved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not cancel participation.');
      setBusy(false);
    }
  }
  async function graduate() {
    setBusy(true);
    setErr(null);
    try {
      await graduateFamily(family.id);
      onRemoved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not mark as graduated.');
      setBusy(false);
    }
  }
  async function removeForever() {
    setBusy(true);
    setErr(null);
    try {
      await deleteFamily(family.id);
      onRemoved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete the family.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-sparrow-gold">Building Your House</p>
        <p className="font-serif text-lg font-semibold text-sparrow-green dark:text-sparrow-dark-green">
          {currentPhase?.name ?? '—'}
        </p>
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          {currentProgramUnit?.name ?? 'Program position not set'}
        </p>
        <div className="mt-3">
          <PhaseProgressBar
            phases={phases}
            programUnitId={programUnitId}
            joinedUnitId={family.joined_unit_id}
            height="md"
          />
        </div>
      </div>

      <div>
        <span className="field-label">Curriculum entry</span>
        {family.joined_unit_id == null ? (
          <div className="mt-1.5 flex items-center justify-between rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-cream dark:bg-sparrow-dark-surface2 px-4 py-3">
            <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
              {familyDisplayName(family)} hasn&apos;t joined the curriculum yet.
            </p>
            <button
              disabled={busy || programUnitId == null}
              onClick={() => programUnitId && setJoinedUnit(programUnitId)}
              className="btn-primary shrink-0"
            >
              Join curriculum
            </button>
          </div>
        ) : (
          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
              Joined at:{' '}
              <span className="font-medium">
                {phases.flatMap((p) => p.units).find((u) => u.id === family.joined_unit_id)?.name ?? '—'}
              </span>
            </p>
            <select
              disabled={busy}
              value={family.joined_unit_id}
              onChange={(e) => setJoinedUnit(Number(e.target.value))}
              className="rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-2 py-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray"
            >
              {phases.map((phase) => (
                <optgroup key={phase.id} label={phase.name}>
                  {phase.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <span className="field-label">Status</span>
        <div className="mt-1">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${FAMILY_STATUS[family.status].chip}`}>
            {FAMILY_STATUS[family.status].label}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
          Set automatically — onboarding until a move-in date is entered below, then on track unless
          something's overdue or she's missed 2+ of her last 4 sessions.
        </p>
      </div>

      {attendanceHistory.length > 0 && (
        <div>
          <span className="field-label">Attendance history</span>
          <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            Every Monday/Thursday session, most recent first — select and copy to tally elsewhere.
          </p>
          <ul className="mt-1.5 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-2 text-sm">
            {attendanceHistory.map((a) => (
              <li key={a.session_log_id} className="text-sparrow-ink dark:text-sparrow-dark-ink">
                {dayLabel(a.session_date)} · {SESSION_LOG_LABEL[a.session_type]} · {ATTENDANCE_LABEL[a.status]}
                {a.reason && ` — ${a.reason}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border pt-4">
        <span className="field-label">Participation</span>
        <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
          Graduating and leaving early both remove {familyDisplayName(family)} from the active roster but
          keep every record. Deleting erases everything permanently.
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          {!confirmGraduate ? (
            <button
              disabled={busy}
              onClick={() => {
                setConfirmCancel(false);
                setConfirmDelete(false);
                setConfirmGraduate(true);
              }}
              className="btn-primary"
            >
              🎓 Graduate
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-sparrow-ink dark:text-sparrow-dark-ink">Mark {familyDisplayName(family)} as graduated?</span>
              <button disabled={busy} onClick={graduate} className="btn-primary">
                {busy ? 'Working…' : 'Yes, graduated'}
              </button>
              <button disabled={busy} onClick={() => setConfirmGraduate(false)} className="btn-ghost">
                Not yet
              </button>
            </div>
          )}

          {!confirmCancel && !confirmGraduate && (
            <button
              disabled={busy}
              onClick={() => {
                setConfirmDelete(false);
                setConfirmCancel(true);
              }}
              className="btn-ghost border border-sparrow-rule dark:border-sparrow-dark-border"
            >
              Left the program
            </button>
          )}
        </div>

        <div className="mt-2">
          {confirmCancel && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-sparrow-ink dark:text-sparrow-dark-ink">Mark as having left the program before graduating?</span>
              <button disabled={busy} onClick={cancelParticipation} className="btn-primary">
                {busy ? 'Working…' : 'Yes, they left'}
              </button>
              <button disabled={busy} onClick={() => setConfirmCancel(false)} className="btn-ghost">
                Keep active
              </button>
            </div>
          )}
        </div>

        <div className="mt-2">
          {!confirmDelete ? (
            <button
              disabled={busy}
              onClick={() => {
                setConfirmCancel(false);
                setConfirmDelete(true);
              }}
              className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray underline hover:text-priority-p1"
            >
              Delete permanently…
            </button>
          ) : (
            <div className="rounded-lg border border-priority-p1/30 bg-priority-p1/5 p-3">
              <p className="text-xs text-priority-p1">
                Permanently delete {familyDisplayName(family)} and all their homework, attendance,
                messages, notes, and vouchers? This can't be undone. If they already created a
                login, an admin must remove it in Supabase separately.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  disabled={busy}
                  onClick={removeForever}
                  className="rounded-lg bg-priority-p1 px-3 py-1.5 text-sm font-medium text-white"
                >
                  {busy ? 'Deleting…' : 'Delete permanently'}
                </button>
                <button disabled={busy} onClick={() => setConfirmDelete(false)} className="btn-ghost">
                  Keep
                </button>
              </div>
            </div>
          )}
        </div>

        {err && <p className="mt-2 text-sm text-priority-p1">{err}</p>}
      </div>
    </div>
  );
}

// ── Housing savings ──────────────────────────────────────────────────
// Migration 0150 replaced the old staff-answered "did she have a perfect
// month" system with a fully automatic one: every 4 perfect weeks (on-time
// both Monday Mentoring + Thursday Group, homework done on time -- need not
// be consecutive or line up with a calendar month) = $100, computed by
// recompute_lcp_perfect_weeks() and cached onto housing_savings_cents.
// `months` below is now purely historical -- whatever was answered under
// the old system before the switchover, kept visible but no longer
// editable (housing_savings_legacy_cents froze that total; nothing here
// recalculates it).
function monthStartFromIso(iso: string): Date {
  const [y, m] = iso.slice(0, 7).split('-').map(Number);
  return new Date(y, m - 1, 1);
}
function monthAbbrev(iso: string): string {
  return monthStartFromIso(iso).toLocaleDateString('en-US', { month: 'short' });
}
function weekAbbrev(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function HousingSavingsCard({
  family,
  months,
  weeks,
}: {
  family: Family;
  months: HousingSavingsMonth[];
  weeks: LcpPerfectWeek[];
}) {
  const completeCount = weeks.filter((w) => w.complete).length;
  const towardNext = completeCount % 4;

  return (
    <div className="rounded-xl bg-sparrow-cream dark:bg-sparrow-dark-surface2 p-4">
      <span className="font-serif text-base font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">🏡 Housing Savings</span>
      <p className="mt-1 font-serif text-lg font-semibold text-sparrow-green dark:text-sparrow-dark-green">{money(family.housing_savings_cents)}</p>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className="field-label">Perfect weeks (on-time both nights + homework on time)</span>
          <span className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">{towardNext} of 4 toward the next $100</span>
        </div>
        {weeks.length === 0 ? (
          <p className="mt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            No weeks evaluated yet -- this fills in automatically once both a Monday and a Thursday session have been logged for a week.
          </p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-3">
            {weeks.map((w) => (
              <div key={w.id} className="flex flex-col items-center gap-1 text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${
                    w.complete
                      ? 'bg-sparrow-green text-white'
                      : 'border-2 border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface text-transparent'
                  }`}
                >
                  {w.complete ? '✓' : ''}
                </span>
                <span>{weekAbbrev(w.week_start)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {months.length > 0 && (
        <div className="mt-4 border-t border-sparrow-rule/60 dark:border-sparrow-dark-border pt-3">
          <span className="field-label">Earned before the switch to weekly tracking</span>
          <div className="mt-1 flex flex-wrap gap-3">
            {months.map((m) => (
              <div key={m.id} className="flex flex-col items-center gap-1 text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${
                    m.awarded
                      ? 'bg-sparrow-green text-white'
                      : 'border-2 border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface text-transparent'
                  }`}
                >
                  {m.awarded ? '✓' : ''}
                </span>
                <span>{monthAbbrev(m.month)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Goals ─────────────────────────────────────────────────────────────
function GoalsTab({
  family,
  goals,
  goalResponses,
  currentUserId,
  onChanged,
}: {
  family: Family;
  goals: Goal[];
  goalResponses: GoalResponse[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<GoalArea>('relational');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [newDue, setNewDue] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const today = localDate();

  function latestResponse(goalId: string): GoalResponse | null {
    const rs = goalResponses.filter((r) => r.goal_id === goalId);
    if (!rs.length) return null;
    return rs.reduce((a, b) => (a.created_at > b.created_at ? a : b));
  }

  function needsTimeFlag(goal: Goal): boolean {
    const r = latestResponse(goal.id);
    return !!r && r.response === 'needs_time' && r.created_at > goal.updated_at;
  }

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    await createGoal({ family_id: family.id, area, title: title.trim(), due_date: due || null }, currentUserId);
    setTitle('');
    setDue('');
    setArea('relational');
    setBusy(false);
    onChanged();
  }

  async function markMet(goal: Goal) {
    await markGoalMet(goal.id);
    onChanged();
  }

  async function reopen(goal: Goal) {
    await reopenGoal(goal.id);
    onChanged();
  }

  async function extendDue(goal: Goal) {
    if (!newDue) return;
    await reopenGoal(goal.id, newDue);
    setExtendingId(null);
    setNewDue('');
    onChanged();
  }

  async function remove(id: string) {
    await deleteGoal(id);
    onChanged();
  }

  const active = goals.filter((g) => g.status === 'active');
  const met = goals.filter((g) => g.status === 'met');

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-3">
        <span className="field-label">Add a goal</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is the participant working toward?"
          className="field-input"
        />
        <div className="mt-2 flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-semibold text-sparrow-gray dark:text-sparrow-dark-gray">Goal area</label>
            <select value={area} onChange={(e) => setArea(e.target.value as GoalArea)} className="field-input mt-0 w-full">
              {GOAL_AREAS.map((a) => (
                <option key={a} value={a}>{GOAL_AREA_LABEL[a]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-sparrow-gray dark:text-sparrow-dark-gray">Due date</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field-input mt-0" />
          </div>
          <button onClick={add} disabled={busy || !title.trim()} className="btn-primary shrink-0">Add</button>
        </div>
      </div>

      {active.length === 0 && met.length === 0 && (
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No goals set yet. Add one above.</p>
      )}

      {active.length > 0 && (
        <ul className="space-y-2">
          {active.map((goal) => {
            const flag = needsTimeFlag(goal);
            const dueToday = goal.due_date === today;
            const overdue = goal.due_date && goal.due_date < today;
            const expanded = expandedId === goal.id;
            return (
              <li
                key={goal.id}
                onClick={() => setExpandedId(expanded ? null : goal.id)}
                className={`cursor-pointer rounded-xl border p-3 transition ${
                  flag ? 'border-sparrow-gold/50 bg-sparrow-gold/5'
                  : dueToday ? 'border-sparrow-green/40 bg-sparrow-green/5'
                  : overdue ? 'border-priority-p1/30 bg-priority-p1/5'
                  : 'border-sparrow-rule/70 hover:border-sparrow-green/40'
                }`}
              >
                <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{goal.title}</p>
                <p className={`text-xs ${overdue && !flag ? 'text-priority-p1' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}>
                  {GOAL_AREA_LABEL[goal.area]}
                  {goal.due_date && ` · due ${goal.due_date}`}
                  {dueToday && ' · today'}
                </p>
                {flag && (
                  <p className="mt-1 text-xs font-medium text-sparrow-gold">
                    ⚑ Participant needs more time — consider adjusting the date
                  </p>
                )}
                {expanded && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 flex cursor-default flex-wrap items-center gap-2 border-t border-sparrow-rule/50 pt-3"
                  >
                    <button onClick={() => markMet(goal)} className="btn-primary text-xs">Mark met</button>
                    {extendingId === goal.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={newDue}
                          onChange={(e) => setNewDue(e.target.value)}
                          className="field-input mt-0 w-36 text-xs"
                        />
                        <button onClick={() => extendDue(goal)} disabled={!newDue} className="btn-primary text-xs">Save</button>
                        <button onClick={() => setExtendingId(null)} className="btn-ghost text-xs">×</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setExtendingId(goal.id); setNewDue(goal.due_date ?? ''); }}
                        className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-green dark:hover:text-sparrow-dark-green"
                      >
                        Adjust date
                      </button>
                    )}
                    <button onClick={() => remove(goal.id)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">Delete</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {met.length > 0 && (
        <div>
          <span className="field-label text-sparrow-gray dark:text-sparrow-dark-gray">Completed goals</span>
          <ul className="mt-1 space-y-2">
            {met.map((goal) => (
              <li key={goal.id} className="flex items-start gap-2 rounded-xl border border-sparrow-rule/50 p-3 opacity-70">
                <div className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sparrow-green text-white text-xs">✓</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray line-through">{goal.title}</p>
                  <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{GOAL_AREA_LABEL[goal.area]}</p>
                </div>
                <button onClick={() => reopen(goal)} className="shrink-0 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
                  Reopen
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Program fee ──────────────────────────────────────────────────────
// Digitizes Audrey's paper log: a running payment log (date, amount, method,
// comment). Deliberately no totals or balance-owed math — Audrey wants a
// plain record, not calculations. Home/program-date fields live on General Info.
function ProgramFeeTab({
  family,
  payments,
  currentUserId,
  onChanged,
}: {
  family: Family;
  payments: ProgramFeePayment[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [paidDate, setPaidDate] = useState(localDate());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ProgramFeeMethod>('cash');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const dollars = parseFloat(amount);
  const { missingMessage, validate, fieldClass, fieldError, clear, reset: resetFeeValidation } = useRequiredFields([
    { key: 'fee-date', label: 'Date', valid: !!paidDate },
    { key: 'fee-amount', label: 'Amount', valid: !isNaN(dollars) && dollars > 0 },
  ]);

  async function addPayment() {
    if (!validate()) return;
    setBusy(true);
    await addProgramFeePayment(
      {
        family_id: family.id,
        paid_date: paidDate,
        amount_cents: Math.round(dollars * 100),
        method,
        comment: comment.trim() || null,
      },
      currentUserId,
    );
    setAmount('');
    setComment('');
    setMethod('cash');
    setBusy(false);
    resetFeeValidation();
    onChanged();
  }

  async function remove(id: string) {
    await deleteProgramFeePayment(id);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <span className="field-label">Log a payment</span>
      <div className="grid gap-2 sm:grid-cols-4">
        <div>
          <input
            id="fee-date"
            type="date"
            value={paidDate}
            onChange={(e) => { setPaidDate(e.target.value); clear('fee-date'); }}
            className={fieldClass('fee-date', 'field-input mt-0')}
          />
          {fieldError('fee-date') && <p className="mt-1 text-xs text-priority-p1">{fieldError('fee-date')}</p>}
        </div>
        <div>
          <input
            id="fee-amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); clear('fee-amount'); }}
            placeholder="Amount"
            className={fieldClass('fee-amount', 'field-input mt-0')}
          />
          {fieldError('fee-amount') && <p className="mt-1 text-xs text-priority-p1">{fieldError('fee-amount')}</p>}
        </div>
        <select value={method} onChange={(e) => setMethod(e.target.value as ProgramFeeMethod)} className="field-input mt-0">
          {(Object.keys(PROGRAM_FEE_METHOD_LABEL) as ProgramFeeMethod[]).map((m) => (
            <option key={m} value={m}>{PROGRAM_FEE_METHOD_LABEL[m]}</option>
          ))}
        </select>
        <button onClick={addPayment} disabled={busy} className="btn-primary">
          Add
        </button>
      </div>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comment (optional)"
        className="field-input"
      />
      {missingMessage && <p className="text-sm text-priority-p1">{missingMessage}</p>}

      <span className="field-label">Payment history</span>
      {payments.length === 0 && <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No payments logged yet.</p>}

      <ul className="space-y-2">
        {payments.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-2 rounded-xl border border-sparrow-rule/70 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
                {money(p.amount_cents)} · {dayLabel(p.paid_date)} · {PROGRAM_FEE_METHOD_LABEL[p.method]}
              </p>
              {p.comment && <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{p.comment}</p>}
              {p.author_name && <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Logged by {p.author_name}</p>}
            </div>
            <button onClick={() => remove(p.id)} className="shrink-0 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Finance (Program Fee + Housing Savings + Perks, all in one place) ──
function FinanceTab({
  family,
  payments,
  vouchers,
  redemptions,
  housingSavingsMonths,
  perfectWeeks,
  currentUserId,
  onChanged,
}: {
  family: Family;
  payments: ProgramFeePayment[];
  vouchers: Voucher[];
  redemptions: Redemption[];
  housingSavingsMonths: HousingSavingsMonth[];
  perfectWeeks: LcpPerfectWeek[];
  currentUserId: string;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 font-serif text-base font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">Program Fee</h3>
        <ProgramFeeTab family={family} payments={payments} currentUserId={currentUserId} onChanged={onChanged} />
      </div>

      <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border pt-4">
        <HousingSavingsCard family={family} months={housingSavingsMonths} weeks={perfectWeeks} />
      </div>

      <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border pt-4">
        <h3 className="mb-2 font-serif text-base font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">Perks</h3>
        <RewardsTab family={family} vouchers={vouchers} redemptions={redemptions} currentUserId={currentUserId} onChanged={onChanged} />
      </div>
    </div>
  );
}

// ── Compliance ────────────────────────────────────────────────────────
function ComplianceTab({
  family,
  notes,
  currentUserId,
  onChanged,
}: {
  family: Family;
  notes: ComplianceNote[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [labelId, setLabelId] = useState<string | null>(null);
  const [whatHappened, setWhatHappened] = useState('');
  const [howHandled, setHowHandled] = useState('');
  const [followUpNeeded, setFollowUpNeeded] = useState(false);
  const [followUpNote, setFollowUpNote] = useState('');
  const [busy, setBusy] = useState(false);

  const {
    fieldClass: complianceFieldClass,
    fieldError: complianceFieldError,
    clear: clearComplianceField,
    validate: validateCompliance,
  } = useRequiredFields([
    { key: 'comp-label', label: 'Label', valid: !!labelId },
    { key: 'comp-what', label: 'What happened', valid: whatHappened.trim().length > 0 },
    { key: 'comp-how', label: 'How it was handled', valid: howHandled.trim().length > 0 },
  ]);

  async function save() {
    if (!validateCompliance() || !labelId) return;
    setBusy(true);
    await addComplianceNote(
      {
        family_id: family.id,
        label_id: labelId,
        what_happened: whatHappened.trim(),
        how_handled: howHandled.trim(),
        follow_up_needed: followUpNeeded,
        follow_up_note: followUpNeeded ? followUpNote.trim() || null : null,
      },
      currentUserId,
    );
    setLabelId(null);
    setWhatHappened('');
    setHowHandled('');
    setFollowUpNeeded(false);
    setFollowUpNote('');
    setBusy(false);
    onChanged();
  }

  async function resolve(noteId: string) {
    setBusy(true);
    await resolveComplianceFollowUp(noteId, currentUserId);
    setBusy(false);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
        Internal only. The log for compliance issues and program rules broken by the participant — men on the
        property, substance use, childcare requirements — so there's a clear record of what happened and how it
        was handled.
      </p>

      <ComplianceLabelPicker
        value={labelId}
        currentUserId={currentUserId}
        onChange={(id) => { setLabelId(id); clearComplianceField('comp-label'); }}
        required
        invalid={!!complianceFieldError('comp-label')}
      />
      {complianceFieldError('comp-label') && <p className="text-xs text-priority-p1">{complianceFieldError('comp-label')}</p>}

      <div>
        <span className="field-label field-label-required">What happened</span>
        <textarea
          value={whatHappened}
          onChange={(e) => { setWhatHappened(e.target.value); clearComplianceField('comp-what'); }}
          placeholder="e.g. Missed the scheduled drug test on Tuesday, no notice given."
          rows={2}
          className={complianceFieldClass('comp-what', 'field-input mt-1')}
        />
        {complianceFieldError('comp-what') && <p className="mt-1 text-xs text-priority-p1">{complianceFieldError('comp-what')}</p>}
      </div>

      <div>
        <span className="field-label field-label-required">How it was handled</span>
        <textarea
          value={howHandled}
          onChange={(e) => { setHowHandled(e.target.value); clearComplianceField('comp-how'); }}
          placeholder="e.g. Met with her Wednesday, rescheduled for Friday, told her a second miss means a written warning per the handbook."
          rows={2}
          className={complianceFieldClass('comp-how', 'field-input mt-1')}
        />
        {complianceFieldError('comp-how') && <p className="mt-1 text-xs text-priority-p1">{complianceFieldError('comp-how')}</p>}
      </div>

      <div>
        <span className="field-label">Follow-up needed?</span>
        <div className="mt-1 flex gap-2">
          <button
            onClick={() => setFollowUpNeeded(true)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              followUpNeeded ? 'bg-sparrow-gold text-white' : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray'
            }`}
          >
            Yes
          </button>
          <button
            onClick={() => setFollowUpNeeded(false)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              !followUpNeeded ? 'bg-sparrow-green text-white' : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-gray dark:text-sparrow-dark-gray'
            }`}
          >
            No
          </button>
        </div>
        {followUpNeeded && (
          <input
            value={followUpNote}
            onChange={(e) => setFollowUpNote(e.target.value)}
            placeholder="e.g. Confirm Friday's test actually happened."
            className="field-input mt-2"
          />
        )}
      </div>

      <button onClick={save} disabled={busy} className="btn-primary">
        Save note
      </button>

      {notes.length === 0 && <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No compliance notes yet.</p>}

      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl border border-sparrow-rule/70 p-3">
            <div className="flex items-center gap-2">
              {n.label_name && <LabelPill label={n.label_name} color={n.label_color ?? 'blue'} />}
              {n.follow_up_needed ? (
                <span className="rounded-full bg-sparrow-cream dark:bg-sparrow-gold/15 px-2 py-0.5 text-[11px] font-bold text-sparrow-gold">
                  ⚑ Needs follow-up
                </span>
              ) : n.follow_up_resolved_at ? (
                <span className="rounded-full bg-sparrow-sage dark:bg-sparrow-green/15 px-2 py-0.5 text-[11px] font-bold text-sparrow-green dark:text-sparrow-dark-green">
                  ✓ Resolved {dayLabel(n.follow_up_resolved_at)}
                  {n.follow_up_resolved_by_name ? ` by ${n.follow_up_resolved_by_name}` : ''}
                </span>
              ) : null}
              <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{dayLabel(n.created_at)}</span>
            </div>
            <p className="mt-1.5 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
              <span className="font-semibold">What happened:</span> {n.what_happened}
            </p>
            <p className="mt-1 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
              <span className="font-semibold">Handled:</span> {n.how_handled}
            </p>
            {n.follow_up_note && (
              <p className="mt-1 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
                <span className="font-semibold">Follow-up:</span> {n.follow_up_note}
              </p>
            )}
            {n.author_name && <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Logged by {n.author_name}</p>}
            {n.follow_up_needed && (
              <button onClick={() => resolve(n.id)} disabled={busy} className="mt-2 text-xs font-semibold text-sparrow-green dark:text-sparrow-dark-green">
                Mark follow-up resolved
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── General info ─────────────────────────────────────────────────────
// A single view/edit toggle for the whole tab — opens read-only (this is
// saved, settled information) with one Edit button, not a form staff could
// accidentally change. Household (who this family actually is) comes first;
// program timeline, home unit/TOC link, and fee status follow. The parent
// FamilyDetailPanel renders this with key={family.id} so switching families
// always remounts fresh instead of carrying over stale local state.
function GeneralInfoTab({
  family,
  tocSpaces,
  householdAdult,
  feePayments,
  onChanged,
}: {
  family: Family;
  tocSpaces: TocSpaceSlim[];
  householdAdult: HouseholdAdult | null;
  feePayments: ProgramFeePayment[];
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>(householdAdult ? 'view' : 'edit');
  const [moveInRequest, setMoveInRequest] = useState<LcpMoveInRequest | null>(null);

  const reloadRequest = useCallback(async () => {
    setMoveInRequest(await fetchMoveInRequestForFamily(family.id));
  }, [family.id]);

  useEffect(() => {
    void reloadRequest();
  }, [reloadRequest]);

  // If not yet linked to a Twin Oaks resident record, this creates (or leaves
  // alone) a pending review request for TOC staff — it never writes into
  // tenants/household_members directly. If TOC staff already approved a link,
  // this instead pushes the LCP-owned fields into the existing records. Safe
  // to call any time — it no-ops quietly if there's nothing to do yet.
  async function attemptSync() {
    await requestOrSyncLcpToc(family.id);
    await reloadRequest();
  }

  return mode === 'view' ? (
    <GeneralInfoView
      family={family}
      tocSpaces={tocSpaces}
      adult={householdAdult}
      feePayments={feePayments}
      moveInRequest={moveInRequest}
      onEdit={() => setMode('edit')}
    />
  ) : (
    <GeneralInfoEdit
      family={family}
      tocSpaces={tocSpaces}
      adult={householdAdult}
      feePayments={feePayments}
      onDone={async () => {
        await onChanged();
        await attemptSync();
        setMode('view');
      }}
      onCancel={() => setMode('view')}
    />
  );
}

function SyncStatus({ family, moveInRequest }: { family: Family; moveInRequest: LcpMoveInRequest | null }) {
  if (family.toc_tenant_id) {
    return (
      <div className="mt-2 rounded-lg bg-sparrow-green/10 px-3 py-2 text-xs text-sparrow-green dark:text-sparrow-dark-green">
        ✓ Linked to Twin Oaks residents{family.toc_synced_at ? ` — last synced ${dayLabel(family.toc_synced_at)}` : ''}
      </div>
    );
  }
  if (moveInRequest?.status === 'needs_info') {
    return (
      <div className="mt-2 rounded-lg bg-sparrow-gold/15 px-3 py-2 text-xs">
        <p className="font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">⚑ Twin Oaks staff have a question:</p>
        <p className="mt-0.5 text-sparrow-ink dark:text-sparrow-dark-ink">{moveInRequest.notes || '(no note left)'}</p>
        <p className="mt-1 text-sparrow-gray dark:text-sparrow-dark-gray">Reply via chat or a task, then update this family's info here.</p>
      </div>
    );
  }
  if (moveInRequest?.status === 'pending') {
    return (
      <div className="mt-2 rounded-lg bg-sparrow-gold/15 px-3 py-2 text-xs font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
        ✓ Move-in request sent to Twin Oaks — waiting on their review.
      </div>
    );
  }
  return (
    <p className="mt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Set a home unit and a move-in date to send Twin Oaks a move-in request.</p>
  );
}

function GeneralInfoView({
  family,
  tocSpaces,
  adult,
  feePayments,
  moveInRequest,
  onEdit,
}: {
  family: Family;
  tocSpaces: TocSpaceSlim[];
  adult: HouseholdAdult | null;
  feePayments: ProgramFeePayment[];
  moveInRequest: LcpMoveInRequest | null;
  onEdit: () => void;
}) {
  const space = tocSpaces.find((s) => s.id === family.toc_space_id) ?? null;
  const overdue = isFeeOverdue(family.move_in_date, family.status, feePayments.map((p) => p.paid_date));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Saved information</span>
        <button onClick={onEdit} className="btn-primary">
          Edit
        </button>
      </div>

      <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-4">
        <span className="field-label">Mother&apos;s full name</span>
        {adult ? (
          <p className="mt-1 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
            {adult.full_name} · {adult.phone}
            {adult.date_of_birth && ` · 🎂 ${dayLabel(adult.date_of_birth)} · Age ${ageFromDob(adult.date_of_birth)}`}
          </p>
        ) : (
          <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No adult on file.</p>
        )}
        <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Children's names, birthdays, and childcare info now live on the Children tab.</p>

        <div className="mt-3">
          <span className="text-xs font-medium uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Emergency contact</span>
          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            Write as much as this family needs — one contact for everyone, a separate contact per
            person, several contacts, whatever fits.
          </p>
          <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink whitespace-pre-wrap">{family.emergency_contact_notes || '—'}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-3">
          <span className="field-label">Onboarding start</span>
          <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{dayLabel(family.created_at)}</p>
        </div>
        <div className="rounded-xl bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-3">
          <span className="field-label">Move-in date</span>
          <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{family.move_in_date ? dayLabel(family.move_in_date) : 'Not set yet'}</p>
        </div>
        {family.program_end_date && (
          <div className="rounded-xl bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-3 sm:col-span-2">
            <span className="field-label">Program end date</span>
            <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{dayLabel(family.program_end_date)}</p>
          </div>
        )}
      </div>

      <div>
        <span className="field-label">Home unit</span>
        <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
          {space ? `Unit ${space.label}${space.designation_label ? ` | ${space.designation_label}` : ''}` : 'Not assigned yet'}
        </p>
        {space && (
          <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            {[space.street_number, space.street_name].filter(Boolean).join(' ') || 'No address on file'}
          </p>
        )}
        <SyncStatus family={family} moveInRequest={moveInRequest} />
      </div>

      <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${overdue ? 'bg-priority-p1/10' : 'bg-sparrow-green/10'}`}>
        <span className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">Program fee status</span>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${overdue ? 'bg-priority-p1/20 text-priority-p1' : 'bg-sparrow-green/20 text-sparrow-green dark:text-sparrow-dark-green'}`}>
          {overdue ? 'Overdue' : 'Current'}
        </span>
      </div>
    </div>
  );
}

function GeneralInfoEdit({
  family,
  tocSpaces,
  adult,
  feePayments,
  onDone,
  onCancel,
}: {
  family: Family;
  tocSpaces: TocSpaceSlim[];
  adult: HouseholdAdult | null;
  feePayments: ProgramFeePayment[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [adultName, setAdultName] = useState(adult?.full_name ?? '');
  const [adultPhone, setAdultPhone] = useState(adult?.phone ?? '');
  const [adultDob, setAdultDob] = useState(adult?.date_of_birth ?? '');
  const [emergencyContact, setEmergencyContact] = useState(family.emergency_contact_notes ?? '');
  const [moveInDate, setMoveInDate] = useState(family.move_in_date ?? '');
  const [spaceId, setSpaceId] = useState(family.toc_space_id ?? '');
  const [busy, setBusy] = useState(false);
  const overdue = isFeeOverdue(family.move_in_date, family.status, feePayments.map((p) => p.paid_date));

  async function save() {
    setBusy(true);
    try {
      if (adultName.trim() || adultPhone.trim() || adultDob) {
        await saveHouseholdAdult(family.id, { full_name: adultName, phone: adultPhone, date_of_birth: adultDob || null });
      }

      const patch: Partial<{ emergency_contact_notes: string | null; move_in_date: string | null; toc_space_id: string | null }> = {};
      if (emergencyContact !== (family.emergency_contact_notes ?? '')) patch.emergency_contact_notes = emergencyContact.trim() || null;
      if (moveInDate !== (family.move_in_date ?? '')) patch.move_in_date = moveInDate || null;
      if (spaceId !== (family.toc_space_id ?? '')) patch.toc_space_id = spaceId || null;
      if (Object.keys(patch).length > 0) await updateFamily(family.id, patch);

      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-4">
        <span className="field-label">Mother&apos;s full name</span>

        <div className="mt-1">
          <input value={adultName} onChange={(e) => setAdultName(e.target.value)} placeholder="Full name" className="field-input" />
          <input value={adultPhone} onChange={(e) => setAdultPhone(e.target.value)} placeholder="Phone" className="field-input mt-2" />
          <input
            type="date"
            value={adultDob}
            onChange={(e) => setAdultDob(e.target.value)}
            aria-label="Birthday"
            className="field-input mt-2"
          />
          <p className="mt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Children's names, birthdays, and childcare info now live on the Children tab.</p>
        </div>

        <div className="mt-4">
          <span className="field-label">Emergency contact</span>
          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            Write as much as this family needs — one contact for everyone, a separate contact per
            person, several contacts, whatever fits.
          </p>
          <textarea
            value={emergencyContact}
            onChange={(e) => setEmergencyContact(e.target.value)}
            rows={4}
            className="field-input"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-3">
          <span className="field-label">Onboarding start</span>
          <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{dayLabel(family.created_at)}</p>
        </div>
        <div className="rounded-xl bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-3">
          <span className="field-label">Move-in date</span>
          <input
            type="date"
            value={moveInDate}
            onChange={(e) => setMoveInDate(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-2 py-1 text-sm"
          />
        </div>
        {family.program_end_date && (
          <div className="rounded-xl bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-3 sm:col-span-2">
            <span className="field-label">Program end date</span>
            <p className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{dayLabel(family.program_end_date)}</p>
          </div>
        )}
      </div>

      <div>
        <span className="field-label">Home unit</span>
        <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className="field-input">
          <option value="">Not assigned yet</option>
          {tocSpaces.map((s) => (
            <option key={s.id} value={s.id}>
              Unit {s.label}{s.designation_label ? ` | ${s.designation_label}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${overdue ? 'bg-priority-p1/10' : 'bg-sparrow-green/10'}`}>
        <span className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">Program fee status</span>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${overdue ? 'bg-priority-p1/20 text-priority-p1' : 'bg-sparrow-green/20 text-sparrow-green dark:text-sparrow-dark-green'}`}>
          {overdue ? 'Overdue' : 'Current'}
        </span>
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="btn-primary">
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} disabled={busy} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Children ─────────────────────────────────────────────────────────
// Childcare info from the signed Childcare Waiver/Release form. Kept off
// General Info and off the Twin Oaks sync (see migration 0148) -- this is
// staff-only, LCP-specific info for whoever's actually supervising the kids.
function ChildrenTab({
  familyId,
  kids,
  onChanged,
}: {
  familyId: string;
  kids: HouseholdChild[];
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);

  async function afterSave() {
    setEditingId(null);
    onChanged();
    await requestOrSyncLcpToc(familyId);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
        From the signed Childcare Waiver/Release form. Staff-only — never shown on the participant portal.
      </p>

      {kids.length === 0 && editingId !== 'new' && (
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No children on file yet.</p>
      )}

      <div className="space-y-3">
        {kids.map((child) =>
          editingId === child.id ? (
            <ChildEditCard
              key={child.id}
              familyId={familyId}
              child={child}
              onDone={afterSave}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <ChildViewCard key={child.id} child={child} onEdit={() => setEditingId(child.id)} />
          ),
        )}
      </div>

      {editingId === 'new' ? (
        <ChildEditCard familyId={familyId} onDone={afterSave} onCancel={() => setEditingId(null)} />
      ) : (
        <button onClick={() => setEditingId('new')} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
          + Add child
        </button>
      )}
    </div>
  );
}

function ChildViewCard({ child, onEdit }: { child: HouseholdChild; onEdit: () => void }) {
  const fields: [string, string | null][] = [
    ['Allergies (non-food)', child.allergies_general],
    ['Food allergies / dietary restrictions', child.allergies_food],
    ['Physical/sensory limitations', child.physical_limitations],
    ['Mental/behavioral', child.mental_behavioral],
    ['Other special instructions', child.special_instructions],
  ];
  const filled = fields.filter(([, v]) => v);

  return (
    <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{child.full_name}</p>
          {child.date_of_birth && (
            <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              🎂 {dayLabel(child.date_of_birth)} · Age {ageFromDob(child.date_of_birth)}
            </p>
          )}
        </div>
        <button onClick={onEdit} className="shrink-0 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
          Edit
        </button>
      </div>
      {filled.length > 0 ? (
        <dl className="mt-3 space-y-1.5">
          {filled.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">{label}</dt>
              <dd className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No allergies or special instructions on file.</p>
      )}
    </div>
  );
}

function ChildEditCard({
  familyId,
  child,
  onDone,
  onCancel,
}: {
  familyId: string;
  child?: HouseholdChild;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState(child?.full_name ?? '');
  const [dob, setDob] = useState(child?.date_of_birth ?? '');
  const [allergiesGeneral, setAllergiesGeneral] = useState(child?.allergies_general ?? '');
  const [allergiesFood, setAllergiesFood] = useState(child?.allergies_food ?? '');
  const [physicalLimitations, setPhysicalLimitations] = useState(child?.physical_limitations ?? '');
  const [mentalBehavioral, setMentalBehavioral] = useState(child?.mental_behavioral ?? '');
  const [specialInstructions, setSpecialInstructions] = useState(child?.special_instructions ?? '');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    if (!fullName.trim()) return;
    setBusy(true);
    const payload: ChildInput = {
      full_name: fullName,
      date_of_birth: dob || null,
      allergies_general: allergiesGeneral || null,
      allergies_food: allergiesFood || null,
      physical_limitations: physicalLimitations || null,
      mental_behavioral: mentalBehavioral || null,
      special_instructions: specialInstructions || null,
    };
    if (child) await updateHouseholdChild(child.id, payload);
    else await addHouseholdChild(familyId, payload);
    setBusy(false);
    onDone();
  }

  async function remove() {
    if (!child) return;
    setBusy(true);
    await deleteHouseholdChild(child.id);
    setBusy(false);
    onDone();
  }

  return (
    <div className="space-y-3 rounded-xl border border-sparrow-green/40 dark:border-sparrow-dark-green/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="field-label">Full name</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="field-input" />
        </div>
        <div>
          <span className="field-label">Birthday</span>
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="field-input" />
        </div>
      </div>
      <div>
        <span className="field-label">Allergies (non-food — bee stings, medications, etc.)</span>
        <input
          value={allergiesGeneral}
          onChange={(e) => setAllergiesGeneral(e.target.value)}
          placeholder="None on file"
          className="field-input"
        />
      </div>
      <div>
        <span className="field-label">Food allergies / dietary restrictions</span>
        <input
          value={allergiesFood}
          onChange={(e) => setAllergiesFood(e.target.value)}
          placeholder="None on file"
          className="field-input"
        />
      </div>
      <div>
        <span className="field-label">Physical/sensory limitations (hearing, sight, mobility, etc.)</span>
        <input
          value={physicalLimitations}
          onChange={(e) => setPhysicalLimitations(e.target.value)}
          placeholder="None on file"
          className="field-input"
        />
      </div>
      <div>
        <span className="field-label">Mental/behavioral</span>
        <input
          value={mentalBehavioral}
          onChange={(e) => setMentalBehavioral(e.target.value)}
          placeholder="None on file"
          className="field-input"
        />
      </div>
      <div>
        <span className="field-label">Other special instructions</span>
        <textarea
          value={specialInstructions}
          onChange={(e) => setSpecialInstructions(e.target.value)}
          rows={2}
          placeholder="Anything else staff or a childcare volunteer should know"
          className="field-input"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-2">
          <button onClick={save} disabled={busy || !fullName.trim()} className="btn-primary">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onCancel} disabled={busy} className="btn-ghost">
            Cancel
          </button>
        </div>
        {child &&
          (confirmDelete ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-sparrow-gray dark:text-sparrow-dark-gray">Remove {child.full_name}?</span>
              <button onClick={remove} disabled={busy} className="font-medium text-priority-p1">
                Yes, remove
              </button>
              <button onClick={() => setConfirmDelete(false)} disabled={busy} className="text-sparrow-gray dark:text-sparrow-dark-gray">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1"
            >
              Remove child
            </button>
          ))}
      </div>
    </div>
  );
}

// ── Homework ─────────────────────────────────────────────────────────
function HomeworkTab({
  family,
  homework,
  sessions,
  currentUserId,
  onChanged,
}: {
  family: Family;
  homework: Homework[];
  sessions: CurriculumSession[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<HomeworkArea>('general');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [newDue, setNewDue] = useState('');

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    await assignHomework(
      {
        family_id: family.id,
        session_id: family.current_session_number
          ? sessions.find((s) => s.session_number === family.current_session_number)?.id ?? null
          : null,
        session_type: 'ad_hoc',
        area,
        title: title.trim(),
        description: null,
        due_date: due || null,
      },
      currentUserId,
    );
    setTitle('');
    setDue('');
    setArea('general');
    setBusy(false);
    onChanged();
  }

  async function toggle(hw: Homework) {
    await setHomeworkStatus(hw.id, hw.status === 'complete' ? 'assigned' : 'complete');
    onChanged();
  }
  async function remove(id: string) {
    await deleteHomework(id);
    onChanged();
  }
  async function extendDue(hw: Homework) {
    if (!newDue) return;
    await updateHomework(hw.id, { due_date: newDue });
    setExtendingId(null);
    setNewDue('');
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-3">
        <span className="field-label">Assign homework</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What should they do this week?"
          className="field-input"
        />
        <div className="mt-2 flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-semibold text-sparrow-gray dark:text-sparrow-dark-gray">Homework area</label>
            <select value={area} onChange={(e) => setArea(e.target.value as HomeworkArea)} className="field-input mt-0 w-full">
              {HOMEWORK_AREAS.map((a) => (
                <option key={a} value={a}>
                  {AREA_LABEL[a]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-sparrow-gray dark:text-sparrow-dark-gray">Due date</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field-input mt-0" />
          </div>
          <button onClick={add} disabled={busy || !title.trim()} className="btn-primary shrink-0">
            Add
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {homework.length === 0 && <li className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No homework assigned.</li>}
        {homework.map((hw) => (
          <li key={hw.id} className={`flex items-start gap-2 rounded-xl border p-3 ${
            hw.status !== 'complete' && isOverdue(hw.due_date)
              ? 'border-priority-p1/30 bg-priority-p1/5'
              : 'border-sparrow-rule/70'
          }`}>
            <button
              onClick={() => toggle(hw)}
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-white ${
                hw.status === 'complete' ? 'border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green' : 'border-sparrow-rule dark:border-sparrow-dark-border'
              }`}
              aria-label="Toggle complete"
            >
              {hw.status === 'complete' && '✓'}
            </button>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${hw.status === 'complete' ? 'text-sparrow-gray dark:text-sparrow-dark-gray line-through' : 'text-sparrow-ink dark:text-sparrow-dark-ink'}`}>
                {hw.title}
              </p>
              <p className={`text-xs ${hw.status !== 'complete' && isOverdue(hw.due_date) ? 'text-priority-p1' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}>
                {AREA_LABEL[hw.area]} · {dueLabel(hw.due_date)}
                {hw.status === 'submitted' && ' · submitted online'}
              </p>
              {extendingId === hw.id && (
                <div className="mt-2 flex items-center gap-1">
                  <input
                    type="date"
                    value={newDue}
                    onChange={(e) => setNewDue(e.target.value)}
                    className="field-input mt-0 w-36 text-xs"
                  />
                  <button onClick={() => extendDue(hw)} disabled={!newDue} className="btn-primary text-xs">Save</button>
                  <button onClick={() => setExtendingId(null)} className="btn-ghost text-xs">×</button>
                </div>
              )}
            </div>
            {extendingId !== hw.id && (
              <button
                onClick={() => { setExtendingId(hw.id); setNewDue(hw.due_date ?? ''); }}
                className="shrink-0 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-green dark:hover:text-sparrow-dark-green"
              >
                Adjust date
              </button>
            )}
            <button onClick={() => remove(hw.id)} className="shrink-0 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Notes ────────────────────────────────────────────────────────────
function NotesTab({
  family,
  notes,
  currentUserId,
  onChanged,
}: {
  family: Family;
  notes: StaffNote[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [body, setBody] = useState('');
  const [composerKey, setComposerKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    await addStaffNote(family.id, body.trim(), currentUserId);
    setBody('');
    setComposerKey((k) => k + 1); // RichTextField is uncontrolled -- force a remount to actually clear it
    setBusy(false);
    onChanged();
  }

  async function saveEdit(id: string) {
    if (!editBody.trim()) return;
    setSaving(true);
    await updateStaffNote(id, editBody.trim());
    setEditingId(null);
    setSaving(false);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-sparrow-cream dark:bg-sparrow-dark-surface2 px-3 py-2 text-xs text-sparrow-ink dark:text-sparrow-dark-ink">
        🔒 Internal — never visible to the family or to non-LCP staff.
      </p>
      <div>
        <RichTextField
          key={composerKey}
          initialValue={body}
          onChange={setBody}
          toolbar
          minHeightRem={4}
          placeholder="Add a note for the LCP team…"
        />
        <button onClick={add} disabled={busy || !body.trim()} className="btn-primary mt-2">
          Add note
        </button>
      </div>
      <ul className="space-y-2">
        {notes.length === 0 && <li className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No notes yet.</li>}
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl border border-sparrow-rule/70 p-3">
            {editingId === n.id ? (
              <div className="space-y-2">
                <RichTextField
                  initialValue={editBody}
                  onChange={setEditBody}
                  toolbar
                  minHeightRem={4}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(n.id)}
                    disabled={saving || !editBody.trim()}
                    className="btn-primary text-xs"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    disabled={saving}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <RichOrPlainView text={n.body} />
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                    {n.updated_at && n.updated_at !== n.created_at
                      ? `Edited ${dayLabel(n.updated_at)}`
                      : dayLabel(n.created_at)}
                    {n.author_name && ` · ${n.author_name}`}
                  </p>
                  {n.author_id === currentUserId && (
                    <button
                      onClick={() => { setEditingId(n.id); setEditBody(n.body); }}
                      className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-green dark:hover:text-sparrow-dark-green"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Rewards ──────────────────────────────────────────────────────────
function RewardsTab({
  family,
  vouchers,
  redemptions,
  currentUserId,
  onChanged,
}: {
  family: Family;
  vouchers: Voucher[];
  redemptions: Redemption[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const unspent = vouchers.filter((v) => !v.redemption_id).length;
  const pending = redemptions.filter((r) => r.status === 'requested');
  const past = redemptions.filter((r) => r.status === 'fulfilled');

  async function award() {
    setBusy(true);
    await awardVoucher(family.id, 'On-time attendance + homework', currentUserId);
    setBusy(false);
    onChanged();
  }
  async function fulfill(r: Redemption) {
    setBusy(true);
    await fulfillRedemption(r.id, family.id, r.vouchers_spent, currentUserId);
    setBusy(false);
    onChanged();
  }
  async function redeemInPerson() {
    setBusy(true);
    await redeemVouchersInPerson(family.id, currentUserId);
    setBusy(false);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-sparrow-mist dark:bg-sparrow-dark-surface2 p-4">
        <div>
          <p className="font-serif text-2xl font-semibold text-sparrow-green dark:text-sparrow-dark-green">{unspent}</p>
          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">unspent vouchers</p>
        </div>
        <div className="flex gap-2">
          <button onClick={award} disabled={busy} className="btn-primary">
            + Award voucher
          </button>
          <button onClick={redeemInPerson} disabled={busy || unspent < 3} className="btn-ghost border border-sparrow-rule dark:border-sparrow-dark-border">
            Redeem 3 vouchers
          </button>
        </div>
      </div>

      {pending.length > 0 && (
        <div>
          <span className="field-label">Redemption requests</span>
          <ul className="mt-1 space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl border border-sparrow-gold/40 bg-sparrow-cream dark:bg-sparrow-dark-surface2 p-3">
                <span className="text-sm">
                  {money(r.gift_card_value_cents)} gift card · {r.vouchers_spent} vouchers
                </span>
                <button onClick={() => fulfill(r)} disabled={busy} className="btn-primary">
                  Mark gift card given
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <span className="field-label">Past redemptions</span>
          <ul className="mt-1 space-y-2">
            {past.map((r) => (
              <li key={r.id} className="rounded-xl border border-sparrow-rule/70 p-3 text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
                {money(r.gift_card_value_cents)} gift card · {r.vouchers_spent} vouchers
                <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                  Fulfilled {r.fulfilled_at ? dayLabel(r.fulfilled_at) : '—'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

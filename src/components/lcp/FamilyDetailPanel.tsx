import { useCallback, useEffect, useState } from 'react';
import { localDate } from '@/lib/date';
import {
  AREA_LABEL,
  FAMILY_STATUS,
  GOAL_AREA_LABEL,
  GOAL_AREAS,
  HOMEWORK_AREAS,
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
  answerHousingSavingsMonth,
  assignHomework,
  awardVoucher,
  createGoal,
  deleteFamily,
  deleteGoal,
  deleteHomework,
  deleteHouseholdChild,
  deleteProgramFeePayment,
  fetchComplianceNotes,
  fetchGoalResponsesForFamily,
  fetchGoalsForFamily,
  fetchHomeworkForFamily,
  fetchHouseholdAdult,
  fetchHouseholdChildren,
  fetchHousingSavingsMonths,
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
import { money, dayLabel, dueLabel, isFeeOverdue, isOverdue } from '@/lib/lcp-format';
import { Drawer } from './Drawer';
import { StaffThread } from './StaffThread';
import { useRequiredFields } from '@/hooks/useRequiredFields';
import { ComplianceLabelPicker } from './ComplianceLabelPicker';
import { LabelPill } from '@/components/LabelPill';

export type FamilyDetailTab = 'general' | 'progress' | 'finance' | 'compliance' | 'goals' | 'homework' | 'messages' | 'notes';
type Tab = FamilyDetailTab;
const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General Info' },
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
  const [complianceNotes, setComplianceNotes] = useState<ComplianceNote[]>([]);
  const [reloadError, setReloadError] = useState<string | null>(null);

  const familyId = family?.id;

  // Each tab's data loads independently -- one failing fetch (e.g. a table/
  // column not live yet because a migration hasn't run) must never block the
  // other 11 from refreshing, or a save on one tab looks broken on every tab.
  const reloadDetail = useCallback(async () => {
    if (!familyId) return;
    const [hw, msg, nt, vo, red, gl, gr, fp, ha, hc, sm, cn] = await Promise.allSettled([
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

    const failed = [hw, msg, nt, vo, red, gl, gr, fp, ha, hc, sm, cn].filter((r) => r.status === 'rejected');
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
    <Drawer open={open} onClose={onClose} title={family.display_name} subtitle={family.login_email} wide>
      <div className="mb-4 inline-flex rounded-xl border border-sparrow-rule bg-sparrow-mist p-1 text-xs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
              tab === t.key ? 'bg-white text-sparrow-green shadow-sm' : 'text-sparrow-gray hover:text-sparrow-ink'
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
          householdChildren={householdChildren}
          feePayments={feePayments}
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
          onChanged={() => void reloadDetail()}
        />
      )}
      {tab === 'goals' && (
        <GoalsTab
          family={family}
          goals={goals}
          goalResponses={goalResponses}
          currentUserId={currentUserId}
          onChanged={() => void reloadDetail()}
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
        <div className="h-[60vh]">
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
        <p className="font-serif text-lg font-semibold text-sparrow-green">
          {currentPhase?.name ?? '—'}
        </p>
        <p className="text-sm text-sparrow-gray">
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
          <div className="mt-1.5 flex items-center justify-between rounded-xl border border-sparrow-rule bg-sparrow-cream px-4 py-3">
            <p className="text-sm text-sparrow-gray">
              {family.display_name} hasn&apos;t joined the curriculum yet.
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
            <p className="text-sm text-sparrow-ink">
              Joined at:{' '}
              <span className="font-medium">
                {phases.flatMap((p) => p.units).find((u) => u.id === family.joined_unit_id)?.name ?? '—'}
              </span>
            </p>
            <select
              disabled={busy}
              value={family.joined_unit_id}
              onChange={(e) => setJoinedUnit(Number(e.target.value))}
              className="rounded-lg border border-sparrow-rule bg-white px-2 py-1 text-xs text-sparrow-gray"
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
        <p className="mt-1.5 text-xs text-sparrow-gray">
          Set automatically — onboarding until a move-in date is entered below, then on track unless
          something's overdue or she's missed 2+ of her last 4 sessions.
        </p>
      </div>

      <div className="border-t border-sparrow-rule pt-4">
        <span className="field-label">Participation</span>
        <p className="mt-1 text-xs text-sparrow-gray">
          Graduating and leaving early both remove {family.display_name} from the active roster but
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
              <span className="text-sparrow-ink">Mark {family.display_name} as graduated?</span>
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
              className="btn-ghost border border-sparrow-rule"
            >
              Left the program
            </button>
          )}
        </div>

        <div className="mt-2">
          {confirmCancel && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-sparrow-ink">Mark as having left the program before graduating?</span>
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
              className="text-xs text-sparrow-gray underline hover:text-priority-p1"
            >
              Delete permanently…
            </button>
          ) : (
            <div className="rounded-lg border border-priority-p1/30 bg-priority-p1/5 p-3">
              <p className="text-xs text-priority-p1">
                Permanently delete {family.display_name} and all their homework, attendance,
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
// Replaces the old freeform +/-$100 buttons with a real per-month record:
// one $100 award per full calendar month in the program, answered yes/no by
// staff. Open-ended (no cap) -- keeps going until the family leaves the
// program. A month locks once answered; correcting one requires an explicit
// confirm step first (never a single misclick away from changing history).
function monthStartFromIso(iso: string): Date {
  const [y, m] = iso.slice(0, 7).split('-').map(Number);
  return new Date(y, m - 1, 1);
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function fullMonthsSince(startIso: string): string[] {
  const cursor = monthStartFromIso(startIso);
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const months: string[] = [];
  while (cursor < thisMonth) {
    months.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}
function monthAbbrev(iso: string): string {
  return monthStartFromIso(iso).toLocaleDateString('en-US', { month: 'short' });
}
function monthFull(iso: string): string {
  return monthStartFromIso(iso).toLocaleDateString('en-US', { month: 'long' });
}

function HousingSavingsCard({
  family,
  months,
  currentUserId,
  onChanged,
}: {
  family: Family;
  months: HousingSavingsMonth[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Two-step correction: clicking an already-answered month asks for
  // confirmation first; only after that does the Yes/No re-answer show.
  const [correcting, setCorrecting] = useState<{ month: string; confirmed: boolean } | null>(null);

  const byMonth = new Map(months.map((m) => [m.month, m]));
  const eligible = fullMonthsSince(family.move_in_date ?? family.created_at);
  const pendingMonth = eligible.find((m) => !byMonth.has(m)) ?? null;

  async function answer(month: string, awarded: boolean) {
    setBusy(true);
    await answerHousingSavingsMonth(family.id, month, awarded, currentUserId);
    setBusy(false);
    setCorrecting(null);
    onChanged();
  }

  return (
    <div className="rounded-xl bg-sparrow-cream p-4">
      <span className="font-serif text-base font-semibold text-sparrow-ink">🏡 Housing Savings</span>
      <p className="mt-1 font-serif text-lg font-semibold text-sparrow-green">{money(family.housing_savings_cents)}</p>

      {pendingMonth && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sparrow-gold/40 bg-sparrow-mist p-2.5 text-sm">
          <span>
            Did {family.display_name} have a perfect month in {monthFull(pendingMonth)}?
          </span>
          <div className="flex shrink-0 gap-2">
            <button disabled={busy} onClick={() => answer(pendingMonth, true)} className="btn-primary">
              Yes, +$100
            </button>
            <button disabled={busy} onClick={() => answer(pendingMonth, false)} className="btn-ghost border border-sparrow-rule">
              No
            </button>
          </div>
        </div>
      )}

      {eligible.length > 0 && (
        <div className="mt-3">
          <span className="field-label">Full months in the program</span>
          <div className="mt-1 flex flex-wrap gap-3">
            {eligible.map((m) => {
              const answered = byMonth.get(m);
              const isCorrecting = correcting?.month === m;
              return (
                <div key={m} className="flex flex-col items-center gap-1 text-[11px] text-sparrow-gray">
                  {!answered ? (
                    <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-sparrow-rule" />
                  ) : isCorrecting && !correcting.confirmed ? (
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={() => setCorrecting({ month: m, confirmed: true })}
                        className="whitespace-nowrap rounded-full border border-sparrow-rule px-1.5 py-0.5 text-[10px] font-medium text-sparrow-ink"
                      >
                        Change?
                      </button>
                      <button onClick={() => setCorrecting(null)} className="text-[10px] text-sparrow-gray underline">
                        Cancel
                      </button>
                    </div>
                  ) : isCorrecting && correcting.confirmed ? (
                    <div className="flex gap-1">
                      <button disabled={busy} onClick={() => answer(m, true)} className="rounded-full border border-sparrow-rule px-1.5 py-0.5 text-[10px] font-medium">
                        Yes
                      </button>
                      <button disabled={busy} onClick={() => answer(m, false)} className="rounded-full border border-sparrow-rule px-1.5 py-0.5 text-[10px] font-medium">
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCorrecting({ month: m, confirmed: false })}
                      className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${
                        answered.awarded ? 'bg-sparrow-green text-white' : 'border-2 border-sparrow-rule bg-white text-transparent'
                      }`}
                    >
                      {answered.awarded ? '✓' : ''}
                    </button>
                  )}
                  <span>{monthAbbrev(m)}</span>
                </div>
              );
            })}
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
      <div className="rounded-xl border border-sparrow-rule p-3">
        <span className="field-label">Add a goal</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is the participant working toward?"
          className="field-input"
        />
        <div className="mt-2 flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-semibold text-sparrow-gray">Goal area</label>
            <select value={area} onChange={(e) => setArea(e.target.value as GoalArea)} className="field-input mt-0 w-full">
              {GOAL_AREAS.map((a) => (
                <option key={a} value={a}>{GOAL_AREA_LABEL[a]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-sparrow-gray">Due date</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field-input mt-0" />
          </div>
          <button onClick={add} disabled={busy || !title.trim()} className="btn-primary shrink-0">Add</button>
        </div>
      </div>

      {active.length === 0 && met.length === 0 && (
        <p className="text-sm text-sparrow-gray">No goals set yet. Add one above.</p>
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
                <p className="text-sm text-sparrow-ink">{goal.title}</p>
                <p className={`text-xs ${overdue && !flag ? 'text-priority-p1' : 'text-sparrow-gray'}`}>
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
                        className="text-xs text-sparrow-gray hover:text-sparrow-green"
                      >
                        Adjust date
                      </button>
                    )}
                    <button onClick={() => remove(goal.id)} className="text-xs text-sparrow-gray hover:text-priority-p1">Delete</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {met.length > 0 && (
        <div>
          <span className="field-label text-sparrow-gray">Completed goals</span>
          <ul className="mt-1 space-y-2">
            {met.map((goal) => (
              <li key={goal.id} className="flex items-start gap-2 rounded-xl border border-sparrow-rule/50 p-3 opacity-70">
                <div className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sparrow-green text-white text-xs">✓</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-sparrow-gray line-through">{goal.title}</p>
                  <p className="text-xs text-sparrow-gray">{GOAL_AREA_LABEL[goal.area]}</p>
                </div>
                <button onClick={() => reopen(goal)} className="shrink-0 text-xs text-sparrow-gray hover:text-sparrow-ink">
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
  const { missingMessage, validate, fieldClass, clear, reset: resetFeeValidation } = useRequiredFields([
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
        <input
          id="fee-date"
          type="date"
          value={paidDate}
          onChange={(e) => { setPaidDate(e.target.value); clear('fee-date'); }}
          className={fieldClass('fee-date', 'field-input mt-0')}
        />
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
      {payments.length === 0 && <p className="text-sm text-sparrow-gray">No payments logged yet.</p>}

      <ul className="space-y-2">
        {payments.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-2 rounded-xl border border-sparrow-rule/70 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-sparrow-ink">
                {money(p.amount_cents)} · {dayLabel(p.paid_date)} · {PROGRAM_FEE_METHOD_LABEL[p.method]}
              </p>
              {p.comment && <p className="mt-0.5 text-xs text-sparrow-gray">{p.comment}</p>}
              {p.author_name && <p className="mt-0.5 text-xs text-sparrow-gray">Logged by {p.author_name}</p>}
            </div>
            <button onClick={() => remove(p.id)} className="shrink-0 text-xs text-sparrow-gray hover:text-priority-p1">
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
  currentUserId,
  onChanged,
}: {
  family: Family;
  payments: ProgramFeePayment[];
  vouchers: Voucher[];
  redemptions: Redemption[];
  housingSavingsMonths: HousingSavingsMonth[];
  currentUserId: string;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 font-serif text-base font-semibold text-sparrow-ink">Program Fee</h3>
        <ProgramFeeTab family={family} payments={payments} currentUserId={currentUserId} onChanged={onChanged} />
      </div>

      <div className="border-t border-sparrow-rule pt-4">
        <HousingSavingsCard family={family} months={housingSavingsMonths} currentUserId={currentUserId} onChanged={onChanged} />
      </div>

      <div className="border-t border-sparrow-rule pt-4">
        <h3 className="mb-2 font-serif text-base font-semibold text-sparrow-ink">Perks</h3>
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

  async function save() {
    if (!labelId || !whatHappened.trim() || !howHandled.trim()) return;
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
      <p className="text-xs text-sparrow-gray">
        Internal only. The log for compliance issues and program rules broken by the participant — men on the
        property, substance use, childcare requirements — so there's a clear record of what happened and how it
        was handled.
      </p>

      <ComplianceLabelPicker value={labelId} currentUserId={currentUserId} onChange={setLabelId} />

      <div>
        <span className="field-label">What happened</span>
        <textarea
          value={whatHappened}
          onChange={(e) => setWhatHappened(e.target.value)}
          placeholder="e.g. Missed the scheduled drug test on Tuesday, no notice given."
          rows={2}
          className="field-input mt-1"
        />
      </div>

      <div>
        <span className="field-label">How it was handled</span>
        <textarea
          value={howHandled}
          onChange={(e) => setHowHandled(e.target.value)}
          placeholder="e.g. Met with her Wednesday, rescheduled for Friday, told her a second miss means a written warning per the handbook."
          rows={2}
          className="field-input mt-1"
        />
      </div>

      <div>
        <span className="field-label">Follow-up needed?</span>
        <div className="mt-1 flex gap-2">
          <button
            onClick={() => setFollowUpNeeded(true)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              followUpNeeded ? 'bg-sparrow-gold text-white' : 'bg-sparrow-mist text-sparrow-gray'
            }`}
          >
            Yes
          </button>
          <button
            onClick={() => setFollowUpNeeded(false)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              !followUpNeeded ? 'bg-sparrow-green text-white' : 'bg-sparrow-mist text-sparrow-gray'
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

      <button onClick={save} disabled={busy || !labelId || !whatHappened.trim() || !howHandled.trim()} className="btn-primary">
        Save note
      </button>

      {notes.length === 0 && <p className="text-sm text-sparrow-gray">No compliance notes yet.</p>}

      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl border border-sparrow-rule/70 p-3">
            <div className="flex items-center gap-2">
              {n.label_name && <LabelPill label={n.label_name} color={n.label_color ?? 'blue'} />}
              {n.follow_up_needed ? (
                <span className="rounded-full bg-sparrow-cream px-2 py-0.5 text-[11px] font-bold text-sparrow-gold">
                  ⚑ Needs follow-up
                </span>
              ) : n.follow_up_resolved_at ? (
                <span className="rounded-full bg-sparrow-sage px-2 py-0.5 text-[11px] font-bold text-sparrow-green">
                  ✓ Resolved {dayLabel(n.follow_up_resolved_at)}
                  {n.follow_up_resolved_by_name ? ` by ${n.follow_up_resolved_by_name}` : ''}
                </span>
              ) : null}
              <span className="text-xs text-sparrow-gray">{dayLabel(n.created_at)}</span>
            </div>
            <p className="mt-1.5 text-sm text-sparrow-ink">
              <span className="font-semibold">What happened:</span> {n.what_happened}
            </p>
            <p className="mt-1 text-sm text-sparrow-ink">
              <span className="font-semibold">Handled:</span> {n.how_handled}
            </p>
            {n.follow_up_note && (
              <p className="mt-1 text-sm text-sparrow-ink">
                <span className="font-semibold">Follow-up:</span> {n.follow_up_note}
              </p>
            )}
            {n.author_name && <p className="mt-1 text-xs text-sparrow-gray">Logged by {n.author_name}</p>}
            {n.follow_up_needed && (
              <button onClick={() => resolve(n.id)} disabled={busy} className="mt-2 text-xs font-semibold text-sparrow-green">
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
  householdChildren,
  feePayments,
  onChanged,
}: {
  family: Family;
  tocSpaces: TocSpaceSlim[];
  householdAdult: HouseholdAdult | null;
  householdChildren: HouseholdChild[];
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
      kids={householdChildren}
      feePayments={feePayments}
      moveInRequest={moveInRequest}
      onEdit={() => setMode('edit')}
    />
  ) : (
    <GeneralInfoEdit
      family={family}
      tocSpaces={tocSpaces}
      adult={householdAdult}
      kids={householdChildren}
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
      <div className="mt-2 rounded-lg bg-sparrow-green/10 px-3 py-2 text-xs text-sparrow-green">
        ✓ Linked to Twin Oaks residents{family.toc_synced_at ? ` — last synced ${dayLabel(family.toc_synced_at)}` : ''}
      </div>
    );
  }
  if (moveInRequest?.status === 'needs_info') {
    return (
      <div className="mt-2 rounded-lg bg-sparrow-gold/15 px-3 py-2 text-xs">
        <p className="font-semibold text-sparrow-ink">⚑ Twin Oaks staff have a question:</p>
        <p className="mt-0.5 text-sparrow-ink">{moveInRequest.notes || '(no note left)'}</p>
        <p className="mt-1 text-sparrow-gray">Reply via chat or a task, then update this family's info here.</p>
      </div>
    );
  }
  if (moveInRequest?.status === 'pending') {
    return (
      <div className="mt-2 rounded-lg bg-sparrow-gold/15 px-3 py-2 text-xs font-medium text-sparrow-ink">
        ✓ Move-in request sent to Twin Oaks — waiting on their review.
      </div>
    );
  }
  return (
    <p className="mt-2 text-xs text-sparrow-gray">Set a home unit and a move-in date to send Twin Oaks a move-in request.</p>
  );
}

function GeneralInfoView({
  family,
  tocSpaces,
  adult,
  kids,
  feePayments,
  moveInRequest,
  onEdit,
}: {
  family: Family;
  tocSpaces: TocSpaceSlim[];
  adult: HouseholdAdult | null;
  kids: HouseholdChild[];
  feePayments: ProgramFeePayment[];
  moveInRequest: LcpMoveInRequest | null;
  onEdit: () => void;
}) {
  const space = tocSpaces.find((s) => s.id === family.toc_space_id) ?? null;
  const overdue = isFeeOverdue(family.move_in_date, family.status, feePayments.map((p) => p.paid_date));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-sparrow-gray">Saved information</span>
        <button onClick={onEdit} className="btn-primary">
          Edit
        </button>
      </div>

      <div className="rounded-xl border border-sparrow-rule p-4">
        <span className="field-label">Household</span>
        {adult ? (
          <p className="mt-1 text-sm text-sparrow-ink">{adult.full_name} · {adult.phone}</p>
        ) : (
          <p className="mt-1 text-sm text-sparrow-gray">No adult on file.</p>
        )}

        <div className="mt-3">
          <span className="text-xs font-medium uppercase tracking-wide text-sparrow-gray">Children</span>
          {kids.length === 0 ? (
            <p className="text-sm text-sparrow-gray">None on file.</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {kids.map((c) => (
                <li key={c.id} className="text-sm text-sparrow-ink">{c.full_name}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3">
          <span className="text-xs font-medium uppercase tracking-wide text-sparrow-gray">Emergency contact</span>
          <p className="text-sm text-sparrow-ink">{family.emergency_contact_notes || '—'}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-sparrow-mist p-3">
          <span className="field-label">Onboarding start</span>
          <p className="text-sm text-sparrow-ink">{dayLabel(family.created_at)}</p>
        </div>
        <div className="rounded-xl bg-sparrow-mist p-3">
          <span className="field-label">Move-in date</span>
          <p className="text-sm text-sparrow-ink">{family.move_in_date ? dayLabel(family.move_in_date) : 'Not set yet'}</p>
        </div>
        {family.program_end_date && (
          <div className="rounded-xl bg-sparrow-mist p-3 sm:col-span-2">
            <span className="field-label">Program end date</span>
            <p className="text-sm text-sparrow-ink">{dayLabel(family.program_end_date)}</p>
          </div>
        )}
      </div>

      <div>
        <span className="field-label">Home unit</span>
        <p className="text-sm text-sparrow-ink">
          {space ? `Unit ${space.label}${space.designation_label ? ` | ${space.designation_label}` : ''}` : 'Not assigned yet'}
        </p>
        {space && (
          <p className="mt-1 text-xs text-sparrow-gray">
            {[space.street_number, space.street_name].filter(Boolean).join(' ') || 'No address on file'}
          </p>
        )}
        <SyncStatus family={family} moveInRequest={moveInRequest} />
      </div>

      <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${overdue ? 'bg-priority-p1/10' : 'bg-sparrow-green/10'}`}>
        <span className="text-sm text-sparrow-ink">Program fee status</span>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${overdue ? 'bg-priority-p1/20 text-priority-p1' : 'bg-sparrow-green/20 text-sparrow-green'}`}>
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
  kids,
  feePayments,
  onDone,
  onCancel,
}: {
  family: Family;
  tocSpaces: TocSpaceSlim[];
  adult: HouseholdAdult | null;
  kids: HouseholdChild[];
  feePayments: ProgramFeePayment[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [adultName, setAdultName] = useState(adult?.full_name ?? '');
  const [adultPhone, setAdultPhone] = useState(adult?.phone ?? '');
  const [childRows, setChildRows] = useState<{ id: string | null; name: string }[]>(
    kids.length ? kids.map((c) => ({ id: c.id, name: c.full_name })) : [{ id: null, name: '' }],
  );
  const [emergencyContact, setEmergencyContact] = useState(family.emergency_contact_notes ?? '');
  const [moveInDate, setMoveInDate] = useState(family.move_in_date ?? '');
  const [spaceId, setSpaceId] = useState(family.toc_space_id ?? '');
  const [busy, setBusy] = useState(false);
  const overdue = isFeeOverdue(family.move_in_date, family.status, feePayments.map((p) => p.paid_date));

  function setChildName(i: number, name: string) {
    setChildRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, name } : r)));
  }
  function addChildRow() {
    setChildRows((rows) => [...rows, { id: null, name: '' }]);
  }
  function removeChildRow(i: number) {
    setChildRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function save() {
    setBusy(true);
    try {
      if (adultName.trim() || adultPhone.trim()) {
        await saveHouseholdAdult(family.id, { full_name: adultName, phone: adultPhone });
      }

      const originalIds = new Set(kids.map((c) => c.id));
      const keptIds = new Set(childRows.filter((r) => r.id).map((r) => r.id));
      for (const id of originalIds) {
        if (!keptIds.has(id)) await deleteHouseholdChild(id!);
      }
      for (const row of childRows) {
        if (!row.name.trim()) continue;
        if (row.id) await updateHouseholdChild(row.id, row.name);
        else await addHouseholdChild(family.id, row.name);
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
      <div className="rounded-xl border border-sparrow-rule p-4">
        <span className="field-label">Household</span>

        <div className="mt-1">
          <span className="text-xs font-medium uppercase tracking-wide text-sparrow-gray">Adult</span>
          <input value={adultName} onChange={(e) => setAdultName(e.target.value)} placeholder="Full name" className="field-input" />
          <input value={adultPhone} onChange={(e) => setAdultPhone(e.target.value)} placeholder="Phone" className="field-input mt-2" />
          <p className="mt-1 text-xs text-sparrow-gray">Her email is the sign-in email at the top of this panel — no separate email needed here.</p>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-sparrow-gray">Children</span>
            <button onClick={addChildRow} className="text-xs font-medium text-sparrow-green">
              + Add child
            </button>
          </div>
          <div className="mt-1 space-y-2">
            {childRows.map((row, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="field-input mt-0 flex-1"
                  value={row.name}
                  onChange={(e) => setChildName(i, e.target.value)}
                  placeholder="Full name"
                />
                {childRows.length > 1 && (
                  <button onClick={() => removeChildRow(i)} className="shrink-0 text-xs text-sparrow-gray hover:text-priority-p1">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <span className="text-xs font-medium uppercase tracking-wide text-sparrow-gray">Emergency contact</span>
          <textarea
            value={emergencyContact}
            onChange={(e) => setEmergencyContact(e.target.value)}
            rows={2}
            className="field-input"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-sparrow-mist p-3">
          <span className="field-label">Onboarding start</span>
          <p className="text-sm text-sparrow-ink">{dayLabel(family.created_at)}</p>
        </div>
        <div className="rounded-xl bg-sparrow-mist p-3">
          <span className="field-label">Move-in date</span>
          <input
            type="date"
            value={moveInDate}
            onChange={(e) => setMoveInDate(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-sparrow-rule bg-white px-2 py-1 text-sm"
          />
        </div>
        {family.program_end_date && (
          <div className="rounded-xl bg-sparrow-mist p-3 sm:col-span-2">
            <span className="field-label">Program end date</span>
            <p className="text-sm text-sparrow-ink">{dayLabel(family.program_end_date)}</p>
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
        <span className="text-sm text-sparrow-ink">Program fee status</span>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${overdue ? 'bg-priority-p1/20 text-priority-p1' : 'bg-sparrow-green/20 text-sparrow-green'}`}>
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
      <div className="rounded-xl border border-sparrow-rule p-3">
        <span className="field-label">Assign homework</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What should they do this week?"
          className="field-input"
        />
        <div className="mt-2 flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-semibold text-sparrow-gray">Homework area</label>
            <select value={area} onChange={(e) => setArea(e.target.value as HomeworkArea)} className="field-input mt-0 w-full">
              {HOMEWORK_AREAS.map((a) => (
                <option key={a} value={a}>
                  {AREA_LABEL[a]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-sparrow-gray">Due date</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field-input mt-0" />
          </div>
          <button onClick={add} disabled={busy || !title.trim()} className="btn-primary shrink-0">
            Add
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {homework.length === 0 && <li className="text-sm text-sparrow-gray">No homework assigned.</li>}
        {homework.map((hw) => (
          <li key={hw.id} className={`flex items-start gap-2 rounded-xl border p-3 ${
            hw.status !== 'complete' && isOverdue(hw.due_date)
              ? 'border-priority-p1/30 bg-priority-p1/5'
              : 'border-sparrow-rule/70'
          }`}>
            <button
              onClick={() => toggle(hw)}
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-white ${
                hw.status === 'complete' ? 'border-sparrow-green bg-sparrow-green' : 'border-sparrow-rule'
              }`}
              aria-label="Toggle complete"
            >
              {hw.status === 'complete' && '✓'}
            </button>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${hw.status === 'complete' ? 'text-sparrow-gray line-through' : 'text-sparrow-ink'}`}>
                {hw.title}
              </p>
              <p className={`text-xs ${hw.status !== 'complete' && isOverdue(hw.due_date) ? 'text-priority-p1' : 'text-sparrow-gray'}`}>
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
                className="shrink-0 text-xs text-sparrow-gray hover:text-sparrow-green"
              >
                Adjust date
              </button>
            )}
            <button onClick={() => remove(hw.id)} className="shrink-0 text-xs text-sparrow-gray hover:text-priority-p1">
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
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    await addStaffNote(family.id, body.trim(), currentUserId);
    setBody('');
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
      <p className="rounded-lg bg-sparrow-cream px-3 py-2 text-xs text-sparrow-ink">
        🔒 Internal — never visible to the family or to non-LCP staff.
      </p>
      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add a note for the LCP team…"
          className="field-input"
        />
        <button onClick={add} disabled={busy || !body.trim()} className="btn-primary mt-2">
          Add note
        </button>
      </div>
      <ul className="space-y-2">
        {notes.length === 0 && <li className="text-sm text-sparrow-gray">No notes yet.</li>}
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl border border-sparrow-rule/70 p-3">
            {editingId === n.id ? (
              <div className="space-y-2">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={3}
                  className="field-input"
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
                <p className="text-sm text-sparrow-ink">{n.body}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-sparrow-gray">
                    {n.updated_at && n.updated_at !== n.created_at
                      ? `Edited ${dayLabel(n.updated_at)}`
                      : dayLabel(n.created_at)}
                    {n.author_name && ` · ${n.author_name}`}
                  </p>
                  {n.author_id === currentUserId && (
                    <button
                      onClick={() => { setEditingId(n.id); setEditBody(n.body); }}
                      className="text-xs text-sparrow-gray hover:text-sparrow-green"
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
      <div className="flex items-center justify-between rounded-xl bg-sparrow-mist p-4">
        <div>
          <p className="font-serif text-2xl font-semibold text-sparrow-green">{unspent}</p>
          <p className="text-xs text-sparrow-gray">unspent vouchers</p>
        </div>
        <div className="flex gap-2">
          <button onClick={award} disabled={busy} className="btn-primary">
            + Award voucher
          </button>
          <button onClick={redeemInPerson} disabled={busy || unspent < 3} className="btn-ghost border border-sparrow-rule">
            Redeem 3 vouchers
          </button>
        </div>
      </div>

      {pending.length > 0 && (
        <div>
          <span className="field-label">Redemption requests</span>
          <ul className="mt-1 space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl border border-sparrow-gold/40 bg-sparrow-cream p-3">
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
              <li key={r.id} className="rounded-xl border border-sparrow-rule/70 p-3 text-sm text-sparrow-ink">
                {money(r.gift_card_value_cents)} gift card · {r.vouchers_spent} vouchers
                <p className="mt-0.5 text-xs text-sparrow-gray">
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

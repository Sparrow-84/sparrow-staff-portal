import { useCallback, useEffect, useState } from 'react';
import { localDate } from '@/lib/date';
import {
  AREA_LABEL,
  FAMILY_STATUS,
  GOAL_AREA_LABEL,
  GOAL_AREAS,
  HOMEWORK_AREAS,
  type CurriculumSession,
  type Family,
  type FamilyMilestoneProgress,
  type FamilyStatus,
  type FinanceMilestone,
  type Goal,
  type GoalArea,
  type GoalResponse,
  type Homework,
  type HomeworkArea,
  type HouseholdAdult,
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
  addHouseholdAdult,
  addProgramFeePayment,
  addStaffNote,
  updateStaffNote,
  assignHomework,
  awardVoucher,
  completeMilestone,
  createGoal,
  deleteFamily,
  deleteGoal,
  deleteHomework,
  deleteHouseholdAdult,
  deleteProgramFeePayment,
  fetchFinanceMilestones,
  fetchGoalResponsesForFamily,
  fetchGoalsForFamily,
  fetchHomeworkForFamily,
  fetchHouseholdAdults,
  fetchMessages,
  fetchMilestoneProgressForFamily,
  fetchProgramFeePayments,
  fetchRedemptions,
  fetchStaffNotes,
  fetchVouchers,
  fulfillRedemption,
  markGoalMet,
  reopenGoal,
  sendStaffMessage,
  fetchMoveInRequestForFamily,
  requestOrSyncLcpToc,
  setFamilyActive,
  setHomeworkStatus,
  uncompleteMilestone,
  updateFamily,
} from '@/lib/lcp';
import { money, dayLabel, dueLabel, isFeeOverdue, isOverdue } from '@/lib/lcp-format';
import { Drawer } from './Drawer';
import { StaffThread } from './StaffThread';

type Tab = 'general' | 'progress' | 'goals' | 'milestones' | 'program_fee' | 'homework' | 'messages' | 'notes' | 'rewards';
const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General Info' },
  { key: 'progress', label: 'Progress' },
  { key: 'goals', label: 'Goals' },
  { key: 'milestones', label: 'Finance' },
  { key: 'program_fee', label: 'Program Fee' },
  { key: 'homework', label: 'Homework' },
  { key: 'messages', label: 'Messages' },
  { key: 'notes', label: 'Notes' },
  { key: 'rewards', label: 'Perks' },
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
}) {
  const [tab, setTab] = useState<Tab>('general');
  const [homework, setHomework] = useState<Homework[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalResponses, setGoalResponses] = useState<GoalResponse[]>([]);
  const [milestones, setMilestones] = useState<FinanceMilestone[]>([]);
  const [milestoneProgress, setMilestoneProgress] = useState<FamilyMilestoneProgress[]>([]);
  const [feePayments, setFeePayments] = useState<ProgramFeePayment[]>([]);
  const [householdAdults, setHouseholdAdults] = useState<HouseholdAdult[]>([]);

  const familyId = family?.id;

  const reloadDetail = useCallback(async () => {
    if (!familyId) return;
    const [hw, msg, nt, vo, red, gl, gr, ms, mp, fp, ha] = await Promise.all([
      fetchHomeworkForFamily(familyId),
      fetchMessages(familyId),
      fetchStaffNotes(familyId),
      fetchVouchers(familyId),
      fetchRedemptions(),
      fetchGoalsForFamily(familyId),
      fetchGoalResponsesForFamily(familyId),
      fetchFinanceMilestones(),
      fetchMilestoneProgressForFamily(familyId),
      fetchProgramFeePayments(familyId),
      fetchHouseholdAdults(familyId),
    ]);
    setHomework(hw);
    setMessages(msg);
    setNotes(nt);
    setVouchers(vo);
    setRedemptions(red.filter((r) => r.family_id === familyId));
    setGoals(gl);
    setGoalResponses(gr);
    setMilestones(ms);
    setMilestoneProgress(mp);
    setFeePayments(fp);
    setHouseholdAdults(ha);
  }, [familyId]);

  useEffect(() => {
    if (open && familyId) {
      setTab('general');
      void reloadDetail();
    }
  }, [open, familyId, reloadDetail]);

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

      {tab === 'general' && (
        <GeneralInfoTab
          family={family}
          tocSpaces={tocSpaces}
          householdAdults={householdAdults}
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
      {tab === 'goals' && (
        <GoalsTab
          family={family}
          goals={goals}
          goalResponses={goalResponses}
          currentUserId={currentUserId}
          onChanged={() => void reloadDetail()}
        />
      )}
      {tab === 'milestones' && (
        <MilestonesTab
          family={family}
          milestones={milestones}
          progress={milestoneProgress}
          currentUserId={currentUserId}
          onChanged={() => void reloadDetail()}
        />
      )}
      {tab === 'program_fee' && (
        <ProgramFeeTab
          family={family}
          payments={feePayments}
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
        <div className="h-[60vh]">
          <StaffThread
            messages={messages}
            onSend={async (body) => {
              await sendStaffMessage(family.id, body, currentUserId);
              await reloadDetail();
            }}
          />
        </div>
      )}
      {tab === 'notes' && (
        <NotesTab family={family} notes={notes} currentUserId={currentUserId} onChanged={reloadDetail} />
      )}
      {tab === 'rewards' && (
        <RewardsTab
          family={family}
          vouchers={vouchers}
          redemptions={redemptions}
          currentUserId={currentUserId}
          onChanged={() => {
            void reloadDetail();
            onChanged();
          }}
        />
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
  async function setStatus(status: FamilyStatus) {
    setBusy(true);
    await updateFamily(family.id, { status });
    setBusy(false);
    onChanged();
  }
  async function bumpHousing(deltaCents: number) {
    const next = Math.max(0, Math.min(120_000, family.housing_savings_cents + deltaCents));
    setBusy(true);
    await updateFamily(family.id, { housing_savings_cents: next });
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
        <div className="mt-1 flex flex-wrap gap-2">
          {(Object.keys(FAMILY_STATUS) as FamilyStatus[]).map((s) => (
            <button
              key={s}
              disabled={busy}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                family.status === s ? FAMILY_STATUS[s].chip : 'bg-sparrow-mist text-sparrow-gray'
              }`}
            >
              {FAMILY_STATUS[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-sparrow-cream p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-sparrow-ink">🏡 Housing savings</span>
          <span className="font-serif text-lg font-semibold text-sparrow-green">
            {money(family.housing_savings_cents)}
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          <button disabled={busy} onClick={() => bumpHousing(-10_000)} className="btn-ghost border border-sparrow-rule">
            − $100
          </button>
          <button disabled={busy} onClick={() => bumpHousing(10_000)} className="btn-ghost border border-sparrow-rule">
            + $100 (perfect month)
          </button>
        </div>
      </div>

      <div className="border-t border-sparrow-rule pt-4">
        <span className="field-label">Participation</span>
        <p className="mt-1 text-xs text-sparrow-gray">
          Marks {family.display_name} as having left the program before graduating — sets their
          program end date, removes them from the active roster, but keeps their records.
          Deleting erases everything permanently.
        </p>

        <div className="mt-2">
          {!confirmCancel ? (
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
          ) : (
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
        <div className="mt-2 flex gap-2">
          <select value={area} onChange={(e) => setArea(e.target.value as GoalArea)} className="field-input mt-0 flex-1">
            {GOAL_AREAS.map((a) => (
              <option key={a} value={a}>{GOAL_AREA_LABEL[a]}</option>
            ))}
          </select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field-input mt-0" />
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
            return (
              <li
                key={goal.id}
                className={`rounded-xl border p-3 ${
                  flag ? 'border-sparrow-gold/50 bg-sparrow-gold/5'
                  : dueToday ? 'border-sparrow-green/40 bg-sparrow-green/5'
                  : overdue ? 'border-priority-p1/30 bg-priority-p1/5'
                  : 'border-sparrow-rule/70'
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => markMet(goal)}
                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-sparrow-rule text-white hover:border-sparrow-green"
                    aria-label="Mark met"
                  />
                  <div className="min-w-0 flex-1">
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
                  </div>
                  <div className="flex shrink-0 gap-2">
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
                </div>
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

// ── Finance milestones ────────────────────────────────────────────────
function MilestonesTab({
  family,
  milestones,
  progress,
  currentUserId,
  onChanged,
}: {
  family: Family;
  milestones: FinanceMilestone[];
  progress: FamilyMilestoneProgress[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const completedIds = new Set(progress.map((p) => p.milestone_id));
  const completedCount = completedIds.size;

  async function toggle(milestoneId: number) {
    setBusy(milestoneId);
    if (completedIds.has(milestoneId)) {
      await uncompleteMilestone(family.id, milestoneId);
    } else {
      await completeMilestone(family.id, milestoneId, currentUserId);
    }
    setBusy(null);
    onChanged();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl bg-sparrow-mist px-4 py-3">
        <p className="text-sm text-sparrow-ink">
          <span className="font-serif text-2xl font-semibold text-sparrow-green">{completedCount}</span>
          <span className="ml-1.5 text-sparrow-gray">/ {milestones.length} milestones completed</span>
        </p>
        <p className="text-xs text-sparrow-gray">Check off with the family as they reach each step</p>
      </div>

      <ul className="space-y-2">
        {milestones.map((m) => {
          const done = completedIds.has(m.id);
          const prog = progress.find((p) => p.milestone_id === m.id);
          return (
            <li
              key={m.id}
              className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                done ? 'border-sparrow-green/30 bg-sparrow-green/5' : 'border-sparrow-rule/70'
              }`}
            >
              <button
                onClick={() => toggle(m.id)}
                disabled={busy === m.id}
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-white transition ${
                  done ? 'border-sparrow-green bg-sparrow-green' : 'border-sparrow-rule hover:border-sparrow-green'
                }`}
                aria-label={done ? 'Mark incomplete' : 'Mark complete'}
              >
                {done && '✓'}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${done ? 'text-sparrow-gray line-through' : 'text-sparrow-ink'}`}>
                  {m.sort_order}. {m.title}
                </p>
                <p className={`text-xs ${done ? 'text-sparrow-gray' : 'text-sparrow-gray'}`}>
                  {m.description}
                  {prog && ` · Completed ${dayLabel(prog.completed_at)}`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-sparrow-gray">
        Circle back with Andrew and Shelly on these milestones — this list will be refined.
      </p>
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

  async function addPayment() {
    const dollars = parseFloat(amount);
    if (!paidDate || !dollars || dollars <= 0) return;
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
    onChanged();
  }

  async function remove(id: string) {
    await deleteProgramFeePayment(id);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sparrow-rule p-3">
        <span className="field-label">Log a payment</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className="field-input mt-0" />
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="field-input mt-0"
          />
          <select value={method} onChange={(e) => setMethod(e.target.value as ProgramFeeMethod)} className="field-input mt-0">
            {(Object.keys(PROGRAM_FEE_METHOD_LABEL) as ProgramFeeMethod[]).map((m) => (
              <option key={m} value={m}>{PROGRAM_FEE_METHOD_LABEL[m]}</option>
            ))}
          </select>
          <button onClick={addPayment} disabled={busy || !amount} className="btn-primary">
            Add
          </button>
        </div>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comment (optional)"
          className="field-input mt-2"
        />
      </div>

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

// ── General info ─────────────────────────────────────────────────────
// At-a-glance intake summary: program timeline (onboarding start is just this
// row's created_at; program end is auto-tracked; move-in is staff-entered since
// only staff know the real date), home unit + address (linked to a real TOC
// space), fee status, and household member/contact info. Mirrors the Twin Oaks
// room's household_members pattern, scoped to LCP.
function GeneralInfoTab({
  family,
  tocSpaces,
  householdAdults,
  feePayments,
  onChanged,
}: {
  family: Family;
  tocSpaces: TocSpaceSlim[];
  householdAdults: HouseholdAdult[];
  feePayments: ProgramFeePayment[];
  onChanged: () => void;
}) {
  const [moveInDate, setMoveInDate] = useState(family.move_in_date ?? '');
  const [emergencyContact, setEmergencyContact] = useState(family.emergency_contact_notes ?? '');
  const [spaceBusy, setSpaceBusy] = useState(false);
  const [moveInRequest, setMoveInRequest] = useState<LcpMoveInRequest | null>(null);
  const [addingAdult, setAddingAdult] = useState(false);
  const [adultName, setAdultName] = useState('');
  const [adultPhone, setAdultPhone] = useState('');
  const [adultEmail, setAdultEmail] = useState('');
  const [childrenNames, setChildrenNames] = useState('');
  const [busy, setBusy] = useState(false);

  const space = tocSpaces.find((s) => s.id === family.toc_space_id) ?? null;
  const overdue = isFeeOverdue(family.move_in_date, family.status, feePayments.map((p) => p.paid_date));

  const reloadRequest = useCallback(async () => {
    setMoveInRequest(await fetchMoveInRequestForFamily(family.id));
  }, [family.id]);

  useEffect(() => {
    void reloadRequest();
  }, [reloadRequest]);

  // If not yet linked to a Twin Oaks resident record, this creates (or leaves
  // alone) a pending review request for TOC staff — it never writes into
  // tenants/household_members directly. If TOC staff already approved a link,
  // this instead pushes the LCP-owned fields into the existing records.
  async function attemptSync() {
    await requestOrSyncLcpToc(family.id);
    await reloadRequest();
    onChanged();
  }

  async function saveMoveInDate() {
    if (moveInDate === (family.move_in_date ?? '')) return;
    await updateFamily(family.id, { move_in_date: moveInDate || null });
    onChanged();
    if (moveInDate) await attemptSync();
  }

  async function saveEmergencyContact() {
    if (emergencyContact === (family.emergency_contact_notes ?? '')) return;
    await updateFamily(family.id, { emergency_contact_notes: emergencyContact.trim() || null });
    onChanged();
    if (family.toc_tenant_id) await attemptSync();
  }

  async function setSpace(spaceId: string) {
    setSpaceBusy(true);
    await updateFamily(family.id, { toc_space_id: spaceId || null });
    setSpaceBusy(false);
    onChanged();
    if (spaceId && family.move_in_date) await attemptSync();
  }

  async function addAdult() {
    if (!adultName.trim() || !adultPhone.trim() || !adultEmail.trim() || !childrenNames.trim()) return;
    setBusy(true);
    await addHouseholdAdult(family.id, {
      full_name: adultName,
      phone: adultPhone,
      email: adultEmail,
      children_names: childrenNames,
    });
    setAdultName('');
    setAdultPhone('');
    setAdultEmail('');
    setChildrenNames('');
    setAddingAdult(false);
    setBusy(false);
    onChanged();
    if (family.toc_tenant_id) await attemptSync();
  }

  async function removeAdult(id: string) {
    await deleteHouseholdAdult(id);
    onChanged();
    if (family.toc_tenant_id) await attemptSync();
  }

  return (
    <div className="space-y-5">
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
            onBlur={saveMoveInDate}
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
        <select
          value={family.toc_space_id ?? ''}
          onChange={(e) => setSpace(e.target.value)}
          disabled={spaceBusy}
          className="field-input"
        >
          <option value="">Not assigned yet</option>
          {tocSpaces.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        {space && (
          <p className="mt-1 text-xs text-sparrow-gray">
            {[space.street_number, space.street_name].filter(Boolean).join(' ') || 'No address on file'}
          </p>
        )}
        {family.toc_tenant_id ? (
          <p className="mt-1 text-xs text-sparrow-green">
            ✓ Linked to Twin Oaks residents{family.toc_synced_at ? ` — last synced ${dayLabel(family.toc_synced_at)}` : ''}
          </p>
        ) : moveInRequest?.status === 'needs_info' ? (
          <div className="mt-1 rounded-lg bg-sparrow-gold/10 px-2 py-1.5 text-xs">
            <p className="font-medium text-sparrow-ink">Twin Oaks staff have a question:</p>
            <p className="text-sparrow-gray">{moveInRequest.notes || '(no note left)'}</p>
            <p className="mt-1 text-sparrow-gray">Reply via chat or a task, then update this family's info here.</p>
          </div>
        ) : moveInRequest?.status === 'pending' ? (
          <p className="mt-1 text-xs text-sparrow-gray">Move-in request sent — waiting on Twin Oaks staff to review and create the resident record.</p>
        ) : (
          <p className="mt-1 text-xs text-sparrow-gray">Set a home unit and a move-in date to send Twin Oaks a move-in request.</p>
        )}
      </div>

      <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${overdue ? 'bg-priority-p1/10' : 'bg-sparrow-green/10'}`}>
        <span className="text-sm text-sparrow-ink">Program fee status</span>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${overdue ? 'bg-priority-p1/20 text-priority-p1' : 'bg-sparrow-green/20 text-sparrow-green'}`}>
          {overdue ? 'Overdue' : 'Current'}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="field-label">Household members</span>
          {!addingAdult && (
            <button onClick={() => setAddingAdult(true)} className="text-xs font-medium text-sparrow-green">
              + Add adult
            </button>
          )}
        </div>

        {addingAdult && (
          <div className="mt-2 rounded-xl border border-sparrow-rule p-3">
            <input value={adultName} onChange={(e) => setAdultName(e.target.value)} placeholder="Full name" className="field-input" />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input value={adultPhone} onChange={(e) => setAdultPhone(e.target.value)} placeholder="Phone" className="field-input mt-0" />
              <input value={adultEmail} onChange={(e) => setAdultEmail(e.target.value)} placeholder="Email" className="field-input mt-0" />
            </div>
            <input
              value={childrenNames}
              onChange={(e) => setChildrenNames(e.target.value)}
              placeholder="Children's full names"
              className="field-input mt-2"
            />
            <div className="mt-2 flex gap-2">
              <button onClick={addAdult} disabled={busy} className="btn-primary">Save</button>
              <button onClick={() => setAddingAdult(false)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        )}

        <ul className="mt-2 space-y-2">
          {householdAdults.length === 0 && !addingAdult && (
            <li className="text-sm text-sparrow-gray">No household members on file yet.</li>
          )}
          {householdAdults.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 rounded-xl border border-sparrow-rule/70 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-sparrow-ink">{a.full_name}</p>
                <p className="text-xs text-sparrow-gray">{a.phone} · {a.email}</p>
                <p className="text-xs text-sparrow-gray">Children: {a.children_names}</p>
              </div>
              <button onClick={() => removeAdult(a.id)} className="shrink-0 text-xs text-sparrow-gray hover:text-priority-p1">
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <span className="field-label">Emergency contact</span>
        <textarea
          value={emergencyContact}
          onChange={(e) => setEmergencyContact(e.target.value)}
          onBlur={saveEmergencyContact}
          rows={2}
          className="field-input"
        />
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

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    await assignHomework(
      {
        family_id: family.id,
        session_id: family.current_session_number
          ? sessions.find((s) => s.session_number === family.current_session_number)?.id ?? null
          : null,
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
        <div className="mt-2 flex gap-2">
          <select value={area} onChange={(e) => setArea(e.target.value as HomeworkArea)} className="field-input mt-0 flex-1">
            {HOMEWORK_AREAS.map((a) => (
              <option key={a} value={a}>
                {AREA_LABEL[a]}
              </option>
            ))}
          </select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field-input mt-0" />
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
            </div>
            <button onClick={() => remove(hw.id)} className="text-xs text-sparrow-gray hover:text-priority-p1">
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-sparrow-mist p-4">
        <div>
          <p className="font-serif text-2xl font-semibold text-sparrow-green">{unspent}</p>
          <p className="text-xs text-sparrow-gray">unspent vouchers</p>
        </div>
        <button onClick={award} disabled={busy} className="btn-primary">
          + Award voucher
        </button>
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
    </div>
  );
}

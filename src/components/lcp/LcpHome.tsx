import { useEffect, useMemo, useState } from 'react';
import {
  familyDisplayName,
  fetchMaterialsPreppedSessionIds,
  fetchUnreviewedCurriculumNotes,
  markMaterialsPrepped,
  unmarkMaterialsPrepped,
} from '@/lib/lcp';
import {
  type ComplianceNote,
  type Family,
  type Goal,
  type Homework,
  type LcpEvent,
  type LcpMoveInRequest,
  type LcpPhaseWithUnits,
  type ProgramPosition,
  type Redemption,
  type SessionLog,
} from '@/lib/lcp-types';
import { dayLabel, isFeeOverdue, isOverdue, money } from '@/lib/lcp-format';
import type { FamilyDetailTab } from './FamilyDetailPanel';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localDateOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  families: Family[];
  homework: Homework[];
  redemptions: Redemption[];
  sessionLogs: SessionLog[];
  events: LcpEvent[];
  phases: LcpPhaseWithUnits[];
  programPosition: ProgramPosition | null;
  feeDatesByFamily: Map<string, string[]>;
  complianceFollowUps: ComplianceNote[];
  goals: Goal[];
  tocRequests: LcpMoveInRequest[];
  currentUserId: string;
  onOpenFamily: (familyId: string, tab?: FamilyDetailTab) => void;
  onGoToSessionLog: () => void;
  onGoToCurriculum: () => void;
  onGoToTwinOaks: (requestId: string) => void;
  canEditCurriculum: boolean;
  onAcknowledgeSavingsAward: (familyId: string, currentCents: number) => Promise<void>;
}

export function LcpHome({
  families,
  homework,
  redemptions,
  sessionLogs,
  events,
  phases,
  programPosition,
  feeDatesByFamily,
  complianceFollowUps: complianceFollowUpNotes,
  goals,
  tocRequests,
  currentUserId,
  onOpenFamily,
  onGoToSessionLog,
  onGoToCurriculum,
  onGoToTwinOaks,
  canEditCurriculum,
  onAcknowledgeSavingsAward,
}: Props) {
  // Compliance follow-ups, goals, housing savings, and TOC requests all come
  // in as props (room-level state, refreshed by the same onChanged={load}
  // chain the family drawer already triggers) rather than being fetched
  // here -- this component used to fetch them itself, which meant they'd go
  // stale the moment a change was made through the drawer (which doesn't
  // unmount this component, unlike a real tab switch to Curriculum Admin).
  const complianceFollowUps = useMemo(
    () => complianceFollowUpNotes.filter((n) => n.follow_up_needed),
    [complianceFollowUpNotes],
  );
  const [curriculumNotes, setCurriculumNotes] = useState<{ id: number; session_number: number; title: string; curriculum_notes: string }[]>([]);
  const [preppedSessionIds, setPreppedSessionIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [justPrepped, setJustPrepped] = useState<number | null>(null);

  async function load() {
    // Each card's data loads independently -- one section failing (e.g. a
    // migration that hasn't run yet) must never leave the whole page stuck
    // on "Loading…" or block the sections that CAN load.
    try {
      const [cn, mp] = await Promise.all([
        fetchUnreviewedCurriculumNotes().catch(() => []),
        fetchMaterialsPreppedSessionIds().catch(() => new Set<number>()),
      ]);
      setCurriculumNotes(cn);
      setPreppedSessionIds(mp);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const familyName = (id: string) => {
    const f = families.find((f) => f.id === id);
    return f ? familyDisplayName(f) : 'Family';
  };

  const today = todayISO();

  // Thursday sessions whose date has passed with no filing -- checked against
  // the Session Cal event itself, not just existing session_logs rows. A log
  // row only gets created once someone actually opens the Thursday Group
  // screen; if nobody ever logged in that night (e.g. a forgotten password),
  // there's no draft row to find at all, so checking sessionLogs alone missed
  // this entirely. The calendar event is the one thing guaranteed to exist.
  const filedThursdayDates = new Set(
    sessionLogs.filter((l) => l.session_type === 'thursday_group' && l.filed_at).map((l) => l.session_date),
  );
  const unfiledSessions = events.filter(
    (ev) => ev.kind === 'curriculum' && localDateOf(ev.starts_at) < today && !filedThursdayDates.has(localDateOf(ev.starts_at)),
  );

  // Program fee overdue, room-wide (same logic already used per-family elsewhere).
  const feeOverdueFamilies = families.filter((f) => isFeeOverdue(f.move_in_date, f.status, feeDatesByFamily.get(f.id) ?? []));

  // Due today or overdue, not just "has a due date at all" -- a goal pushed
  // out to a future date (e.g. after a staff/participant conversation) is
  // meant to come OFF this list, not sit on it with its new date attached.
  const openHomework = homework.filter((h) => h.status !== 'complete' && h.due_date && h.due_date <= today);
  const openGoals = goals.filter((g) => g.status !== 'met' && g.due_date && g.due_date <= today);

  // Housing savings: fully automatic now (migration 0150) -- nothing to answer.
  // This is just a quiet FYI when a family's cached total has moved past what
  // staff were last shown, not a to-do -- doesn't count toward totalOpen below.
  const [busyAckId, setBusyAckId] = useState<string | null>(null);
  const savingsAwardsToShow = useMemo(
    () => families.filter((f) => f.housing_savings_cents > f.housing_savings_announced_cents),
    [families],
  );
  async function acknowledgeSavings(familyId: string, cents: number) {
    setBusyAckId(familyId);
    await onAcknowledgeSavingsAward(familyId, cents);
    setBusyAckId(null);
  }

  const pendingRedemptions = redemptions.filter((r) => r.status === 'requested');

  // The next unfiled Thursday session, for the materials-prep checklist --
  // same "whatever comes right after the last one filed" rule used everywhere
  // else in the room.
  const nextThursdaySession = useMemo(() => {
    const allUnits = phases.flatMap((p) => p.units).sort((a, b) => a.sort_order - b.sort_order);
    const allSessions = allUnits.flatMap((u) => u.sessions).sort((a, b) => a.session_number - b.session_number);
    const lastCompletedIndex = programPosition?.session_id != null ? allSessions.findIndex((s) => s.id === programPosition.session_id) : -1;
    return allSessions[lastCompletedIndex + 1] ?? null;
  }, [phases, programPosition]);

  const materialsNeedPrep = nextThursdaySession != null && !preppedSessionIds.has(nextThursdaySession.id);

  async function markMaterialsDone() {
    if (!nextThursdaySession) return;
    setBusy(true);
    await markMaterialsPrepped(nextThursdaySession.id, currentUserId);
    setPreppedSessionIds((prev) => new Set(prev).add(nextThursdaySession.id));
    setBusy(false);
    // The card disappears once checked (by design) -- show a brief undo
    // affordance in its place so a mistaken click isn't unrecoverable.
    setJustPrepped(nextThursdaySession.id);
    setTimeout(() => setJustPrepped(null), 6000);
  }

  async function undoMaterialsDone(sessionId: number) {
    setBusy(true);
    await unmarkMaterialsPrepped(sessionId);
    setPreppedSessionIds((prev) => { const next = new Set(prev); next.delete(sessionId); return next; });
    setBusy(false);
    setJustPrepped(null);
  }

  function respondToToc(requestId: string) {
    sessionStorage.setItem('sparrow.pendingTocRequestOpen', requestId);
    onGoToTwinOaks(requestId);
  }

  const totalOpen =
    unfiledSessions.length +
    tocRequests.length +
    complianceFollowUps.length +
    feeOverdueFamilies.length +
    openHomework.length +
    openGoals.length +
    (canEditCurriculum ? curriculumNotes.length : 0) +
    pendingRedemptions.length +
    (materialsNeedPrep ? 1 : 0);

  if (loading) return <p className="py-8 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>;

  const savingsFyi = savingsAwardsToShow.length > 0 && (
    <div className="space-y-2">
      {savingsAwardsToShow.map((f) => (
        <div
          key={f.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sparrow-gold/40 bg-sparrow-cream dark:bg-sparrow-dark-surface2 p-4 text-sm"
        >
          <span>
            🏡 <span className="font-medium">{familyDisplayName(f)}</span> just crossed into {money(f.housing_savings_cents)} in Housing Savings.
          </span>
          <button
            disabled={busyAckId === f.id}
            onClick={() => void acknowledgeSavings(f.id, f.housing_savings_cents)}
            className="btn-ghost border border-sparrow-rule dark:border-sparrow-dark-border text-xs"
          >
            Got it
          </button>
        </div>
      ))}
    </div>
  );

  if (totalOpen === 0 && justPrepped == null) {
    return (
      <div className="mt-6 space-y-3">
        {savingsFyi}
        <div className="flex items-center gap-3 rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-sage/60 dark:bg-sparrow-green/15 p-5 text-sm font-semibold text-sparrow-green dark:text-sparrow-dark-green">
          🎉 You're all caught up.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {savingsFyi}
      {unfiledSessions.length > 0 && (
        <SignalCard title="📅 Thursday sessions never filed" count={unfiledSessions.length} tone="urgent">
          {unfiledSessions.map((ev) => (
            <SignalRow
              key={ev.id}
              who={`${dayLabel(ev.starts_at)} — Thursday Group`}
              detail="Session date has passed, no log was ever filed"
              cta="File it →"
              onClick={onGoToSessionLog}
            />
          ))}
        </SignalCard>
      )}

      {tocRequests.length > 0 && (
        <SignalCard title="🏘️ TOC has a question" count={tocRequests.length} tone="wait">
          {tocRequests.map((r) => (
            <SignalRow
              key={r.id}
              who={`${r.family_display_name} — move-in request`}
              detail={r.notes ?? undefined}
              cta="Respond →"
              onClick={() => respondToToc(r.id)}
            />
          ))}
        </SignalCard>
      )}

      {complianceFollowUps.length > 0 && (
        <SignalCard title="🚩 Compliance follow-ups" count={complianceFollowUps.length} tone="urgent">
          {complianceFollowUps.map((n) => (
            <SignalRow
              key={n.id}
              who={`${familyName(n.family_id)} — ${n.label_name ?? 'Compliance'}`}
              detail={n.follow_up_note ?? undefined}
              cta="Open →"
              onClick={() => onOpenFamily(n.family_id, 'compliance')}
            />
          ))}
        </SignalCard>
      )}

      {feeOverdueFamilies.length > 0 && (
        <SignalCard title="💰 Program fee overdue" count={feeOverdueFamilies.length} tone="urgent">
          {feeOverdueFamilies.map((f) => (
            <SignalRow key={f.id} who={familyDisplayName(f)} cta="Open →" onClick={() => onOpenFamily(f.id, 'finance')} />
          ))}
        </SignalCard>
      )}

      {openHomework.length > 0 && (
        <SignalCard title="📚 Homework due or overdue" count={openHomework.length} tone="amber">
          {openHomework.map((h) => (
            <SignalRow
              key={h.id}
              who={familyName(h.family_id)}
              detail={`"${h.title}" — due ${dayLabel(h.due_date as string)}${isOverdue(h.due_date) ? ' (overdue)' : ''}`}
              cta="Open →"
              onClick={() => onOpenFamily(h.family_id, 'homework')}
            />
          ))}
        </SignalCard>
      )}

      {openGoals.length > 0 && (
        <SignalCard title="🎯 Goals due or overdue" count={openGoals.length} tone="amber">
          {openGoals.map((g) => (
            <SignalRow
              key={g.id}
              who={familyName(g.family_id)}
              detail={`"${g.title}" — due ${dayLabel(g.due_date as string)}${isOverdue(g.due_date) ? ' (overdue)' : ''}`}
              cta="Open →"
              onClick={() => onOpenFamily(g.family_id, 'goals')}
            />
          ))}
        </SignalCard>
      )}

      {canEditCurriculum && curriculumNotes.length > 0 && (
        <SignalCard title="🔔 Unreviewed curriculum notes" count={curriculumNotes.length} tone="amber">
          {curriculumNotes.map((s) => (
            <SignalRow
              key={s.id}
              who={`Session ${s.session_number} — ${s.title}`}
              detail={s.curriculum_notes}
              cta="Review →"
              onClick={onGoToCurriculum}
            />
          ))}
        </SignalCard>
      )}

      {pendingRedemptions.length > 0 && (
        <SignalCard title="🎁 Voucher redemptions pending" count={pendingRedemptions.length} tone="amber">
          {pendingRedemptions.map((r) => (
            <SignalRow
              key={r.id}
              who={familyName(r.family_id)}
              detail={`${r.vouchers_spent} vouchers · requested ${dayLabel(r.requested_at)}`}
              cta="Fulfill →"
              onClick={() => onOpenFamily(r.family_id, 'finance')}
            />
          ))}
        </SignalCard>
      )}

      {materialsNeedPrep && nextThursdaySession && (
        <div className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4">
          <p className="mb-2 text-sm font-bold text-sparrow-ink dark:text-sparrow-dark-ink">📦 Materials prep</p>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              disabled={busy}
              checked={false}
              onChange={() => void markMaterialsDone()}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-green dark:text-sparrow-dark-green focus:ring-sparrow-green dark:focus:ring-sparrow-dark-green"
            />
            <div className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
              Gather materials for Session {nextThursdaySession.session_number} — {nextThursdaySession.title}
              <span className="block text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                Check the Teacher Guide's "Materials Needed" list · check the box once gathered, comes back for the next session
              </span>
            </div>
          </div>
        </div>
      )}

      {justPrepped != null && nextThursdaySession?.id === justPrepped && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-sage/40 dark:bg-sparrow-green/15 p-4 text-sm">
          <span className="font-medium text-sparrow-green dark:text-sparrow-dark-green">📦 Materials marked gathered ✓</span>
          <button onClick={() => void undoMaterialsDone(justPrepped)} className="shrink-0 text-xs font-semibold text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

function SignalCard({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: 'urgent' | 'wait' | 'amber';
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'urgent' ? 'bg-priority-p1/15 text-priority-p1'
    : tone === 'wait' ? 'bg-[#7A5980]/15 text-[#7A5980]'
    : 'bg-sparrow-gold/15 text-sparrow-gold';
  return (
    <div className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm font-bold text-sparrow-ink dark:text-sparrow-dark-ink">{title}</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${toneClass}`}>{count}</span>
      </div>
      <div className="divide-y divide-sparrow-rule dark:divide-sparrow-dark-border">{children}</div>
    </div>
  );
}

function SignalRow({
  who,
  detail,
  cta,
  onClick,
}: {
  who: string;
  detail?: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{who}</p>
        {detail && <p className="truncate text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{detail}</p>}
      </div>
      <button onClick={onClick} className="shrink-0 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border px-2.5 py-1 text-xs font-semibold text-sparrow-green dark:text-sparrow-dark-green">
        {cta}
      </button>
    </div>
  );
}

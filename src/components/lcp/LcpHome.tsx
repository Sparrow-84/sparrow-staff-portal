import { useEffect, useMemo, useState } from 'react';
import {
  fetchAllComplianceFollowUps,
  fetchAllGoals,
  fetchAllHousingSavingsMonths,
  fetchMaterialsPreppedSessionIds,
  fetchOpenLcpMoveInRequests,
  fetchUnreviewedCurriculumNotes,
  markMaterialsPrepped,
  unmarkMaterialsPrepped,
} from '@/lib/lcp';
import {
  type ComplianceNote,
  type Family,
  type Goal,
  type Homework,
  type HousingSavingsMonth,
  type LcpMoveInRequest,
  type LcpPhaseWithUnits,
  type ProgramPosition,
  type Redemption,
  type SessionLog,
} from '@/lib/lcp-types';
import { dayLabel, isFeeOverdue, isOverdue } from '@/lib/lcp-format';
import type { FamilyDetailTab } from './FamilyDetailPanel';

function monthStartFromIso(iso: string): Date {
  const [y, m] = iso.slice(0, 7).split('-').map(Number);
  return new Date(y, m - 1, 1);
}
function fullMonthsSince(startIso: string): string[] {
  const cursor = monthStartFromIso(startIso);
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const months: string[] = [];
  while (cursor < thisMonth) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  families: Family[];
  homework: Homework[];
  redemptions: Redemption[];
  sessionLogs: SessionLog[];
  phases: LcpPhaseWithUnits[];
  programPosition: ProgramPosition | null;
  feeDatesByFamily: Map<string, string[]>;
  currentUserId: string;
  onOpenFamily: (familyId: string, tab?: FamilyDetailTab) => void;
  onGoToSessionLog: () => void;
  onGoToCurriculum: () => void;
  onGoToTwinOaks: (requestId: string) => void;
}

export function LcpHome({
  families,
  homework,
  redemptions,
  sessionLogs,
  phases,
  programPosition,
  feeDatesByFamily,
  currentUserId,
  onOpenFamily,
  onGoToSessionLog,
  onGoToCurriculum,
  onGoToTwinOaks,
}: Props) {
  const [complianceFollowUps, setComplianceFollowUps] = useState<ComplianceNote[]>([]);
  const [curriculumNotes, setCurriculumNotes] = useState<{ id: number; session_number: number; title: string; curriculum_notes: string }[]>([]);
  const [housingMonths, setHousingMonths] = useState<HousingSavingsMonth[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tocRequests, setTocRequests] = useState<LcpMoveInRequest[]>([]);
  const [preppedSessionIds, setPreppedSessionIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    // Each card's data loads independently -- one section failing (e.g. a
    // migration that hasn't run yet) must never leave the whole page stuck
    // on "Loading…" or block the sections that CAN load.
    try {
      const [cf, cn, hm, gl, mir, mp] = await Promise.all([
        fetchAllComplianceFollowUps().catch(() => []),
        fetchUnreviewedCurriculumNotes().catch(() => []),
        fetchAllHousingSavingsMonths().catch(() => []),
        fetchAllGoals().catch(() => []),
        fetchOpenLcpMoveInRequests().catch(() => []),
        fetchMaterialsPreppedSessionIds().catch(() => new Set<number>()),
      ]);
      setComplianceFollowUps(cf);
      setCurriculumNotes(cn);
      setHousingMonths(hm);
      setGoals(gl);
      setTocRequests(mir.filter((r) => r.status === 'needs_info'));
      setPreppedSessionIds(mp);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const familyName = (id: string) => families.find((f) => f.id === id)?.display_name ?? 'Family';

  const today = todayISO();

  // Thursday sessions whose date has passed with no filing.
  const unfiledSessions = sessionLogs.filter(
    (l) => l.session_type === 'thursday_group' && !l.filed_at && l.session_date < today,
  );

  // Program fee overdue, room-wide (same logic already used per-family elsewhere).
  const feeOverdueFamilies = families.filter((f) => isFeeOverdue(f.move_in_date, f.status, feeDatesByFamily.get(f.id) ?? []));

  // Overdue/due homework and goals -- "due" here means it has a due date at all
  // and isn't done yet; isOverdue() further flags the ones actually past it.
  const openHomework = homework.filter((h) => h.status !== 'complete' && h.due_date);
  const openGoals = goals.filter((g) => g.status !== 'met' && g.due_date);

  // Housing savings: which families have a completed month nobody's answered.
  const pendingSavingsPrompts = useMemo(() => {
    const byFamily = new Map<string, HousingSavingsMonth[]>();
    for (const m of housingMonths) {
      const list = byFamily.get(m.family_id) ?? [];
      list.push(m);
      byFamily.set(m.family_id, list);
    }
    return families
      .map((f) => {
        const answered = new Set((byFamily.get(f.id) ?? []).map((m) => m.month));
        const eligible = fullMonthsSince(f.move_in_date ?? f.created_at);
        const pending = eligible.find((m) => !answered.has(m));
        return pending ? { family: f, month: pending } : null;
      })
      .filter((x): x is { family: Family; month: string } => x !== null);
  }, [families, housingMonths]);

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

  async function toggleMaterialsPrepped() {
    if (!nextThursdaySession) return;
    setBusy(true);
    if (preppedSessionIds.has(nextThursdaySession.id)) {
      await unmarkMaterialsPrepped(nextThursdaySession.id);
      setPreppedSessionIds((prev) => { const next = new Set(prev); next.delete(nextThursdaySession.id); return next; });
    } else {
      await markMaterialsPrepped(nextThursdaySession.id, currentUserId);
      setPreppedSessionIds((prev) => new Set(prev).add(nextThursdaySession.id));
    }
    setBusy(false);
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
    curriculumNotes.length +
    pendingSavingsPrompts.length +
    pendingRedemptions.length +
    (materialsNeedPrep ? 1 : 0);

  if (loading) return <p className="py-8 text-sm text-sparrow-gray">Loading…</p>;

  if (totalOpen === 0) {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-sparrow-rule bg-sparrow-sage/60 p-5 text-sm font-semibold text-sparrow-green">
        🎉 You're all caught up.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {unfiledSessions.length > 0 && (
        <SignalCard title="📅 Thursday sessions never filed" count={unfiledSessions.length} tone="urgent">
          {unfiledSessions.map((l) => (
            <SignalRow
              key={l.id}
              who={`${dayLabel(l.session_date)} — Thursday Group`}
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
            <SignalRow key={f.id} who={f.display_name} cta="Open →" onClick={() => onOpenFamily(f.id, 'finance')} />
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

      {curriculumNotes.length > 0 && (
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

      {pendingSavingsPrompts.length > 0 && (
        <SignalCard title="🏡 Housing savings — needs an answer" count={pendingSavingsPrompts.length} tone="amber">
          {pendingSavingsPrompts.map(({ family, month }) => (
            <SignalRow
              key={family.id}
              who={family.display_name}
              detail={`Did she have a perfect month in ${monthStartFromIso(month).toLocaleDateString('en-US', { month: 'long' })}?`}
              cta="Answer →"
              onClick={() => onOpenFamily(family.id, 'finance')}
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
        <div className="rounded-2xl border border-sparrow-rule bg-white p-4">
          <p className="mb-2 text-sm font-bold text-sparrow-ink">📦 Materials prep</p>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              disabled={busy}
              checked={false}
              onChange={() => void toggleMaterialsPrepped()}
              className="h-4 w-4 rounded border-sparrow-rule text-sparrow-green focus:ring-sparrow-green"
            />
            <span className="text-sm text-sparrow-ink">
              Gather materials for Session {nextThursdaySession.session_number} — {nextThursdaySession.title}
              <span className="block text-xs text-sparrow-gray">
                Check the Teacher Guide's "Materials Needed" list · disappears once checked, comes back for the next session
              </span>
            </span>
          </label>
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
    <div className="rounded-2xl border border-sparrow-rule bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm font-bold text-sparrow-ink">{title}</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${toneClass}`}>{count}</span>
      </div>
      <div className="divide-y divide-sparrow-rule">{children}</div>
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
        <p className="text-sm font-medium text-sparrow-ink">{who}</p>
        {detail && <p className="truncate text-xs text-sparrow-gray">{detail}</p>}
      </div>
      <button onClick={onClick} className="shrink-0 rounded-lg border border-sparrow-rule px-2.5 py-1 text-xs font-semibold text-sparrow-green">
        {cta}
      </button>
    </div>
  );
}

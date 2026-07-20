import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchAllResources, fetchCurriculum, updateCurriculumUnit } from '@/lib/lcp';
import type {
  CurriculumPhase,
  CurriculumSessionDetail,
  CurriculumUnit,
  Resource,
} from '@/lib/lcp-types';
import { SessionEditPanel } from './SessionEditPanel';

interface SessionCompletion {
  monday: boolean;
  teacherGuide: boolean;
  slideshow: boolean;
  studentHandout: boolean;
  devotionalCount: number;
}

function buildCompletionMap(sessions: CurriculumSessionDetail[], resources: Resource[]): Map<number, SessionCompletion> {
  const bySession = new Map<number, Resource[]>();
  for (const r of resources) {
    if (r.session_id == null) continue;
    const list = bySession.get(r.session_id) ?? [];
    list.push(r);
    bySession.set(r.session_id, list);
  }
  const map = new Map<number, SessionCompletion>();
  for (const s of sessions) {
    const rs = bySession.get(s.id) ?? [];
    const teacherGuide = rs.find((r) => r.kind === 'teacher_guide');
    const slideshow = rs.find((r) => r.kind === 'ppt');
    const studentHandout = rs.find((r) => r.kind === 'handout');
    map.set(s.id, {
      monday: !!s.mentor_brief?.trim() && !!s.mentor_handout_echo?.trim() && !!s.mentor_going_deeper?.trim(),
      teacherGuide: !!teacherGuide && (!!teacherGuide.content || !!teacherGuide.drive_url),
      slideshow: !!slideshow && !!slideshow.drive_url,
      studentHandout: !!studentHandout && !!studentHandout.drive_url,
      devotionalCount: rs.filter((r) => r.kind === 'devotional' && r.audience === 'participant').length,
    });
  }
  return map;
}

const PHASE_COLORS = [
  // Phase 1 — Groundwork: Sparrow brand green
  {
    badge: 'bg-sparrow-green text-white',
    cardAccent: 'border-l-4 border-l-sparrow-green',
    sessionHover: 'hover:bg-sparrow-sage/20',
    sessionSelected: 'bg-sparrow-sage/30',
  },
  // Phase 2 — Heart of the Home: warm, nurturing, hearth-like
  {
    badge: 'bg-rose-700 text-white',
    cardAccent: 'border-l-4 border-l-rose-300',
    sessionHover: 'hover:bg-rose-50',
    sessionSelected: 'bg-rose-100',
  },
  // Phase 3 — Rest & Restoration: royal blue
  {
    badge: 'bg-blue-600 text-white',
    cardAccent: 'border-l-4 border-l-blue-400',
    sessionHover: 'hover:bg-blue-50',
    sessionSelected: 'bg-blue-100',
  },
  // Phase 4 — Purpose & Vision: deep violet
  {
    badge: 'bg-violet-700 text-white',
    cardAccent: 'border-l-4 border-l-violet-400',
    sessionHover: 'hover:bg-violet-50',
    sessionSelected: 'bg-violet-100',
  },
  // Phase 5 — Outer Life: natural, outward, community-facing emerald
  {
    badge: 'bg-emerald-700 text-white',
    cardAccent: 'border-l-4 border-l-emerald-400',
    sessionHover: 'hover:bg-emerald-50',
    sessionSelected: 'bg-emerald-100',
  },
  // Phase 6 — Whole House & Graduation: warm achievement gold
  {
    badge: 'bg-amber-700 text-white',
    cardAccent: 'border-l-4 border-l-amber-400',
    sessionHover: 'hover:bg-amber-50',
    sessionSelected: 'bg-amber-100',
  },
] as const;

type PhaseColor = (typeof PHASE_COLORS)[number];

export function CurriculumAdmin() {
  const { profile } = useAuth();
  const [phases, setPhases] = useState<CurriculumPhase[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editSession, setEditSession] = useState<CurriculumSessionDetail | null>(null);
  const [editUnitName, setEditUnitName] = useState('');
  const [editPhaseName, setEditPhaseName] = useState('');
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [ph, res] = await Promise.all([fetchCurriculum(), fetchAllResources()]);
      setPhases(ph);
      setResources(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load curriculum.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allSessions = useMemo(() => phases.flatMap((p) => p.units).flatMap((u) => u.sessions), [phases]);
  const completion = useMemo(() => buildCompletionMap(allSessions, resources), [allSessions, resources]);

  function handleSessionSaved(updated: CurriculumSessionDetail) {
    setPhases((prev) =>
      prev.map((ph) => ({
        ...ph,
        units: ph.units.map((u) => ({
          ...u,
          sessions: u.sessions.map((s) => (s.id === updated.id ? updated : s)),
        })),
      })),
    );
    setEditSession(updated);
    // Materials aren't touched by session save, but refresh keeps completion badges
    // in sync if a resource was added/removed while the drawer was open.
    void fetchAllResources().then(setResources);
  }

  async function handleUnitSave(
    unitId: number,
    patch: Partial<Pick<CurriculumUnit, 'artifact' | 'supplement' | 'month_label' | 'encouragement_text'>>,
  ) {
    await updateCurriculumUnit(unitId, patch);
    setEditingUnitId(null);
    void load();
  }

  if (loading) return <p className="mt-6 text-sm text-sparrow-gray">Loading curriculum…</p>;
  if (error) return (
    <div className="mt-6 rounded-xl border border-priority-p1/30 bg-priority-p1/5 px-4 py-3">
      <p className="text-sm font-medium text-priority-p1">Could not load curriculum</p>
      <p className="mt-0.5 text-xs text-priority-p1/80">{error}</p>
    </div>
  );
  if (phases.length === 0) return (
    <div className="mt-6 rounded-xl border border-sparrow-rule bg-white px-4 py-6 text-center">
      <p className="text-sm font-medium text-sparrow-ink">No curriculum data found</p>
      <p className="mt-1 text-xs text-sparrow-gray">
        The seed data may not have been applied to this database. Check Supabase → Table Editor → lcp_phases.
      </p>
    </div>
  );

  return (
    <>
      <div className="mt-6 space-y-8">
        {phases.map((phase) => {
          const color = PHASE_COLORS[(phase.number - 1) % PHASE_COLORS.length];
          return (
          <section key={phase.id}>
            <div className="mb-3 flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${color.badge}`}>
                Phase {phase.number}
              </span>
              <h2 className="font-serif text-lg font-semibold text-sparrow-ink">{phase.name}</h2>
            </div>

            <div className="space-y-3">
              {phase.units.map((unit) => (
                <UnitSection
                  key={unit.id}
                  unit={unit}
                  phaseColor={color}
                  completion={completion}
                  isEditing={editingUnitId === unit.id}
                  selectedSessionId={editSession?.id ?? null}
                  onToggleEdit={() =>
                    setEditingUnitId(editingUnitId === unit.id ? null : unit.id)
                  }
                  onUnitSave={(patch) => handleUnitSave(unit.id, patch)}
                  onSelectSession={(s) => {
                    setEditSession(s);
                    setEditUnitName(unit.name);
                    setEditPhaseName(phase.name);
                  }}
                />
              ))}
            </div>
          </section>
          );
        })}
      </div>

      <SessionEditPanel
        open={editSession !== null}
        session={editSession}
        unitName={editUnitName}
        phaseName={editPhaseName}
        currentUserId={profile?.id ?? ''}
        onClose={() => setEditSession(null)}
        onSaved={handleSessionSaved}
      />
    </>
  );
}

function UnitSection({
  unit,
  phaseColor,
  completion,
  isEditing,
  selectedSessionId,
  onToggleEdit,
  onUnitSave,
  onSelectSession,
}: {
  unit: CurriculumUnit;
  phaseColor: PhaseColor;
  completion: Map<number, SessionCompletion>;
  isEditing: boolean;
  selectedSessionId: number | null;
  onToggleEdit: () => void;
  onUnitSave: (
    patch: Partial<Pick<CurriculumUnit, 'artifact' | 'supplement' | 'month_label' | 'encouragement_text'>>,
  ) => Promise<void>;
  onSelectSession: (s: CurriculumSessionDetail) => void;
}) {
  const [artifact, setArtifact] = useState(unit.artifact ?? '');
  const [supplement, setSupplement] = useState(unit.supplement ?? '');
  const [monthLabel, setMonthLabel] = useState(unit.month_label ?? '');
  const [encouragementText, setEncouragementText] = useState(unit.encouragement_text ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setArtifact(unit.artifact ?? '');
    setSupplement(unit.supplement ?? '');
    setMonthLabel(unit.month_label ?? '');
    setEncouragementText(unit.encouragement_text ?? '');
  }, [unit.artifact, unit.supplement, unit.month_label, unit.encouragement_text]);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await onUnitSave({
        artifact: artifact.trim() || null,
        supplement: supplement.trim() || null,
        month_label: monthLabel.trim() || null,
        encouragement_text: encouragementText.trim() || null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save unit.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-sparrow-rule bg-white ${phaseColor.cardAccent}`}>
      {/* Unit header */}
      <div className="flex items-start justify-between px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium text-sparrow-ink">{unit.name}</span>
            {unit.month_label && (
              <span className="text-xs text-sparrow-gray">{unit.month_label}</span>
            )}
          </div>
          {unit.artifact && (
            <p className="mt-0.5 text-xs text-sparrow-gray">Artifact: {unit.artifact}</p>
          )}
          {unit.supplement && (
            <p className="text-xs text-sparrow-gray">Supplement: {unit.supplement}</p>
          )}
          {unit.encouragement_text && (
            <p className="mt-0.5 text-xs italic text-sparrow-gray">
              Pre-session note set ✓
            </p>
          )}
        </div>
        <button
          onClick={onToggleEdit}
          className="ml-3 shrink-0 text-xs text-sparrow-gray hover:text-sparrow-ink"
        >
          {isEditing ? 'Cancel' : 'Edit unit'}
        </button>
      </div>

      {/* Inline unit edit form */}
      {isEditing && (
        <div className="space-y-3 border-t border-sparrow-rule bg-sparrow-mist/30 px-4 py-3">
          <div>
            <label className="field-label">Month</label>
            <input
              type="text"
              value={monthLabel}
              onChange={(e) => setMonthLabel(e.target.value)}
              placeholder="e.g. Month 1–2"
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">
              Artifact{' '}
              <span className="font-normal text-sparrow-gray">(optional)</span>
            </label>
            <input
              type="text"
              value={artifact}
              onChange={(e) => setArtifact(e.target.value)}
              placeholder="e.g. Foundation stone"
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">
              Supplement track{' '}
              <span className="font-normal text-sparrow-gray">(optional)</span>
            </label>
            <input
              type="text"
              value={supplement}
              onChange={(e) => setSupplement(e.target.value)}
              placeholder="e.g. Parenting with Autism & ADHD"
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">
              Pre-session encouragement{' '}
              <span className="font-normal text-sparrow-gray">(optional — shown to participants before this unit's sessions)</span>
            </label>
            <textarea
              rows={4}
              value={encouragementText}
              onChange={(e) => setEncouragementText(e.target.value)}
              placeholder="Write a short note for participants — what's coming up this week, a scripture, an encouraging word. Plain text only."
              className="field-input"
            />
          </div>
          {err && <p className="text-sm text-priority-p1">{err}</p>}
          <button onClick={save} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : 'Save unit'}
          </button>
        </div>
      )}

      {/* Session rows */}
      <ul className="divide-y divide-sparrow-rule border-t border-sparrow-rule">
        {unit.sessions.map((s) => {
          const c = completion.get(s.id);
          return (
          <li key={s.id}>
            <button
              onClick={() => onSelectSession(s)}
              className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition ${phaseColor.sessionHover} ${
                selectedSessionId === s.id ? phaseColor.sessionSelected : ''
              }`}
            >
              <span className="mt-px w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-sparrow-gray">
                {s.session_number}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-sparrow-ink">{s.title}</p>
                {(s.focus || s.scripture) && (
                  <p className="mt-0.5 truncate text-xs text-sparrow-gray">
                    {[s.focus, s.scripture].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="mt-0.5 flex shrink-0 items-center gap-1.5" title="Monday · Teacher Guide · Slideshow · Student Handout · Devotionals">
                <CompletionDot ready={!!c?.monday} label="Monday Mentoring" />
                <CompletionDot ready={!!c?.teacherGuide} label="Teacher Guide" />
                <CompletionDot ready={!!c?.slideshow} label="Slideshow" />
                <CompletionDot ready={!!c?.studentHandout} label="Student Handout" />
                <span
                  className={`text-[10px] tabular-nums ${(c?.devotionalCount ?? 0) >= 5 ? 'text-sparrow-green' : 'text-sparrow-gray'}`}
                  title="Participant devotionals added, out of 5"
                >
                  {c?.devotionalCount ?? 0}/5
                </span>
              </div>
              <span className="mt-px shrink-0 text-xs text-sparrow-gray">›</span>
            </button>
          </li>
          );
        })}
      </ul>
    </div>
  );
}

function CompletionDot({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span
      title={`${label}: ${ready ? 'ready' : 'missing'}`}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? 'bg-sparrow-green' : 'bg-sparrow-rule'}`}
    />
  );
}

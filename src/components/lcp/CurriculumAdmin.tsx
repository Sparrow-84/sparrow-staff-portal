import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchCurriculum, updateCurriculumUnit } from '@/lib/lcp';
import type {
  CurriculumPhase,
  CurriculumSessionDetail,
  CurriculumUnit,
} from '@/lib/lcp-types';
import { SessionEditPanel } from './SessionEditPanel';

export function CurriculumAdmin() {
  const { profile } = useAuth();
  const [phases, setPhases] = useState<CurriculumPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editSession, setEditSession] = useState<CurriculumSessionDetail | null>(null);
  const [editUnitName, setEditUnitName] = useState('');
  const [editPhaseName, setEditPhaseName] = useState('');
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setPhases(await fetchCurriculum());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load curriculum.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
  }

  async function handleUnitSave(
    unitId: number,
    patch: Partial<Pick<CurriculumUnit, 'artifact' | 'supplement' | 'month_label'>>,
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
        {phases.map((phase) => (
          <section key={phase.id}>
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full bg-sparrow-green px-2.5 py-0.5 text-xs font-semibold text-white">
                Phase {phase.number}
              </span>
              <h2 className="font-serif text-lg font-semibold text-sparrow-ink">{phase.name}</h2>
            </div>

            <div className="space-y-3">
              {phase.units.map((unit) => (
                <UnitSection
                  key={unit.id}
                  unit={unit}
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
        ))}
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
  isEditing,
  selectedSessionId,
  onToggleEdit,
  onUnitSave,
  onSelectSession,
}: {
  unit: CurriculumUnit;
  isEditing: boolean;
  selectedSessionId: number | null;
  onToggleEdit: () => void;
  onUnitSave: (
    patch: Partial<Pick<CurriculumUnit, 'artifact' | 'supplement' | 'month_label'>>,
  ) => Promise<void>;
  onSelectSession: (s: CurriculumSessionDetail) => void;
}) {
  const [artifact, setArtifact] = useState(unit.artifact ?? '');
  const [supplement, setSupplement] = useState(unit.supplement ?? '');
  const [monthLabel, setMonthLabel] = useState(unit.month_label ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setArtifact(unit.artifact ?? '');
    setSupplement(unit.supplement ?? '');
    setMonthLabel(unit.month_label ?? '');
  }, [unit.artifact, unit.supplement, unit.month_label]);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await onUnitSave({
        artifact: artifact.trim() || null,
        supplement: supplement.trim() || null,
        month_label: monthLabel.trim() || null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save unit.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-sparrow-rule bg-white">
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
          {err && <p className="text-sm text-priority-p1">{err}</p>}
          <button onClick={save} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : 'Save unit'}
          </button>
        </div>
      )}

      {/* Session rows */}
      <ul className="divide-y divide-sparrow-rule border-t border-sparrow-rule">
        {unit.sessions.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onSelectSession(s)}
              className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-sparrow-sage/20 ${
                selectedSessionId === s.id ? 'bg-sparrow-sage/30' : ''
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
              <span className="mt-px shrink-0 text-xs text-sparrow-gray">›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

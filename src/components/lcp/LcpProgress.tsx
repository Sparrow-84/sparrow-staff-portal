import { useState } from 'react';
import { advanceAllFamiliesToSession, advanceProgramPosition, deleteProgramPosition, familyDisplayName, updateProgramPosition } from '@/lib/lcp';
import type { Family, LcpPhaseWithUnits, ProgramPosition } from '@/lib/lcp-types';
import { computeCurriculumTrack } from '@/lib/curriculum-track';
import { CurriculumTrackHorizontal } from './CurriculumTrack';
import { PHASE_COLORS, PhaseProgressBar } from './PhaseProgressBar';

export function LcpProgress({
  phases,
  position,
  families,
  currentUserId,
  onChanged,
}: {
  phases: LcpPhaseWithUnits[];
  position: ProgramPosition | null;
  families: Family[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualUnitId, setManualUnitId] = useState<number | null>(null);

  const allUnits = phases.flatMap((p) => p.units).sort((a, b) => a.sort_order - b.sort_order);
  const currentIndex = position ? allUnits.findIndex((u) => u.id === position.unit_id) : -1;
  const nextUnit = currentIndex === -1 ? allUnits[0] : allUnits[currentIndex + 1];
  const track = computeCurriculumTrack(phases, position?.unit_id ?? null, position?.session_id ?? null);

  async function moveTo(unitId: number) {
    setBusy(true);
    setErr(null);
    try {
      await updateProgramPosition(unitId, currentUserId);
      onChanged();
      setShowManual(false);
      setManualUnitId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update position.');
    } finally {
      setBusy(false);
    }
  }

  // Session-specific correction -- e.g. Shelly clicked "Not yet" by mistake
  // on a Thursday and the group actually did finish. Mirrors exactly what
  // a normal Thursday advance does (position + every family's own tracker),
  // just triggered manually instead of from that night's filing.
  async function moveToSession(sessionId: number, unitId: number, sessionNumber: number) {
    setBusy(true);
    setErr(null);
    try {
      await advanceProgramPosition(sessionId, unitId, currentUserId);
      await advanceAllFamiliesToSession(sessionNumber);
      onChanged();
      setShowManual(false);
      setManualUnitId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update position.');
    } finally {
      setBusy(false);
    }
  }

  async function undoPosition() {
    setBusy(true);
    setErr(null);
    try {
      if (currentIndex > 0) {
        await updateProgramPosition(allUnits[currentIndex - 1].id, currentUserId);
      } else {
        await deleteProgramPosition();
      }
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not undo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Program position card */}
      <div className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-5">
        {position && track.currentUnit ? (
          <>
            <p
              className="font-serif text-xl font-semibold"
              style={{ color: track.currentUnit.color }}
            >
              Phase {position.phase_number}: {position.phase_name}
            </p>
            <p className="mb-1.5 text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
              Unit {track.currentUnit.globalUnitIndex}: {position.unit_name}
            </p>
          </>
        ) : (
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            Not set yet — use the controls below to set the starting unit.
          </p>
        )}

        {(track.doneUnits.length > 0 || track.currentUnit) && (
          <div className="mt-4">
            <CurriculumTrackHorizontal track={track} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {nextUnit && (
            <button
              disabled={busy}
              onClick={() => moveTo(nextUnit.id)}
              className="btn-primary"
            >
              Complete unit
            </button>
          )}
          {position != null && (
            <button
              disabled={busy}
              onClick={undoPosition}
              className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray underline hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
            >
              ← Undo
            </button>
          )}
          <button
            onClick={() => {
              setShowManual((v) => !v);
              setManualUnitId(null);
            }}
            className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray underline hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
          >
            {showManual ? 'Cancel' : 'Set position manually'}
          </button>
        </div>

        {showManual && (
          <div className="mt-3 space-y-2">
            <select
              disabled={busy}
              value={manualUnitId ?? ''}
              onChange={(e) => setManualUnitId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-3 py-1.5 text-sm text-sparrow-ink dark:text-sparrow-dark-ink"
            >
              <option value="" disabled>Choose a unit…</option>
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

            {manualUnitId != null && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  disabled={busy}
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const unit = allUnits.find((u) => u.id === manualUnitId);
                    const session = unit?.sessions.find((s) => s.id === Number(e.target.value));
                    if (unit && session) void moveToSession(session.id, unit.id, session.session_number);
                  }}
                  className="rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-3 py-1.5 text-sm text-sparrow-ink dark:text-sparrow-dark-ink"
                >
                  <option value="" disabled>Choose a session…</option>
                  {allUnits
                    .find((u) => u.id === manualUnitId)
                    ?.sessions.map((session, i) => (
                      <option key={session.id} value={session.id}>
                        Session {i + 1} of {allUnits.find((u) => u.id === manualUnitId)!.sessions.length}: {session.title}
                      </option>
                    ))}
                </select>
                <button
                  disabled={busy}
                  onClick={() => moveTo(manualUnitId)}
                  className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray underline hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
                >
                  Just this unit, no specific session
                </button>
              </div>
            )}
          </div>
        )}

        {err && <p className="mt-2 text-sm text-priority-p1">{err}</p>}
      </div>

      {/* Phase legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {phases.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            <span
              className="inline-block h-2.5 w-3.5 rounded-sm"
              style={{ backgroundColor: PHASE_COLORS[i] }}
            />
            {p.name}
          </span>
        ))}
      </div>

      {/* Family progress matrix */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
          Family Progress
        </h2>
        <div className="space-y-2.5">
          {families.map((f) => (
            <div
              key={f.id}
              className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-4 py-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{familyDisplayName(f)}</span>
                {f.joined_unit_id == null && (
                  <span className="text-[11px] italic text-sparrow-gray dark:text-sparrow-dark-gray">entry point not set</span>
                )}
              </div>
              <PhaseProgressBar
                phases={phases}
                programUnitId={position?.unit_id ?? null}
                joinedUnitId={f.joined_unit_id}
                height="md"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

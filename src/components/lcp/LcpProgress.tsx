import { useState } from 'react';
import { deleteProgramPosition, updateProgramPosition } from '@/lib/lcp';
import type { Family, LcpPhaseWithUnits, ProgramPosition } from '@/lib/lcp-types';
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

  const allUnits = phases.flatMap((p) => p.units).sort((a, b) => a.sort_order - b.sort_order);
  const currentIndex = position ? allUnits.findIndex((u) => u.id === position.unit_id) : -1;
  const nextUnit = currentIndex === -1 ? allUnits[0] : allUnits[currentIndex + 1];

  async function moveTo(unitId: number) {
    setBusy(true);
    setErr(null);
    try {
      await updateProgramPosition(unitId, currentUserId);
      onChanged();
      setShowManual(false);
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
      <div className="rounded-2xl border border-sparrow-rule bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-sparrow-gold">
          Program is currently on
        </p>
        {position ? (
          <>
            <p className="mt-1 font-serif text-xl font-semibold text-sparrow-green">
              {position.phase_name}
            </p>
            <p className="text-sm text-sparrow-gray">{position.unit_name}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-sparrow-gray">
            Not set yet — use the controls below to set the starting unit.
          </p>
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
              className="text-xs text-sparrow-gray underline hover:text-sparrow-ink"
            >
              ← Undo
            </button>
          )}
          <button
            onClick={() => setShowManual((v) => !v)}
            className="text-xs text-sparrow-gray underline hover:text-sparrow-ink"
          >
            {showManual ? 'Cancel' : 'Set position manually'}
          </button>
        </div>

        {showManual && (
          <div className="mt-3">
            <select
              disabled={busy}
              defaultValue=""
              onChange={(e) => e.target.value && moveTo(Number(e.target.value))}
              className="rounded-lg border border-sparrow-rule bg-white px-3 py-1.5 text-sm text-sparrow-ink"
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
          </div>
        )}

        {err && <p className="mt-2 text-sm text-priority-p1">{err}</p>}
      </div>

      {/* Phase legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {phases.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1.5 text-xs text-sparrow-gray">
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
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
          Family Progress
        </h2>
        <div className="space-y-2.5">
          {families.map((f) => (
            <div
              key={f.id}
              className="rounded-xl border border-sparrow-rule bg-white px-4 py-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-sparrow-ink">{f.display_name}</span>
                {f.joined_unit_id == null && (
                  <span className="text-[11px] italic text-sparrow-gray">entry point not set</span>
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

        <div className="mt-4 flex flex-wrap gap-5 text-xs text-sparrow-gray">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-5 rounded-sm" style={{ backgroundColor: '#5A8F6A' }} />
            Completed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-5 rounded-sm" style={{ backgroundColor: '#5A8F6A', opacity: 0.2 }} />
            Not yet reached
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-5 rounded-sm"
              style={{
                backgroundColor: '#C2697A',
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgba(0,0,0,0.3) 0, rgba(0,0,0,0.3) 3px, transparent 3px, transparent 8px)',
                opacity: 0.45,
              }}
            />
            Gap — will cycle back
          </span>
        </div>
      </div>
    </div>
  );
}

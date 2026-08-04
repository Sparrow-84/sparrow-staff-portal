import type { LcpPhaseWithUnits } from './lcp-types';
import { PHASE_COLORS } from '@/components/lcp/PhaseProgressBar';

export type TrackSessionState = 'done' | 'current' | 'upcoming';

export interface TrackSession {
  id: number;
  sessionNumber: number;
  state: TrackSessionState;
}

export interface TrackUnit {
  id: number;
  name: string;
  color: string;
  sessionCount: number;
}

export interface CurrentTrackUnit extends TrackUnit {
  sessions: TrackSession[];
  /** 1-based position within this unit, or null if a session hasn't been pinned down
   *  (e.g. right after a manual "set position" unit-only override). */
  localIndex: number | null;
  /** The unit's real phase number (lcp_phases.number), for "3. Rest & Restoration" headers. */
  phaseNumber: number;
  /** 1-based position among all 13 units program-wide, for "6. Kids' Bedroom" headers. */
  globalUnitIndex: number;
  /** True once we're on the last session of the last unit — nothing left after this. */
  isFinalSession: boolean;
}

export interface CurriculumTrack {
  doneUnits: TrackUnit[];
  currentUnit: CurrentTrackUnit | null;
  upcomingUnits: TrackUnit[];
}

/** Builds the done/current/upcoming picture the hybrid progress dots need,
 *  from the same phases/programUnitId/programSessionId already threaded
 *  everywhere else in the LCP room — no new data, just a different shape. */
export function computeCurriculumTrack(
  phases: LcpPhaseWithUnits[],
  programUnitId: number | null,
  programSessionId: number | null,
): CurriculumTrack {
  const orderedPhases = [...phases].sort((a, b) => a.sort_order - b.sort_order);
  const allUnits = orderedPhases.flatMap((phase, phaseIndex) =>
    [...phase.units]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((unit) => ({ unit, color: PHASE_COLORS[phaseIndex] ?? '#888', phaseNumber: phase.number })),
  );

  const currentIndex = programUnitId != null ? allUnits.findIndex((u) => u.unit.id === programUnitId) : -1;

  const toTrackUnit = ({ unit, color }: (typeof allUnits)[number]): TrackUnit => ({
    id: unit.id,
    name: unit.name,
    color,
    sessionCount: unit.sessions.length,
  });

  if (currentIndex === -1) {
    return { doneUnits: [], currentUnit: null, upcomingUnits: allUnits.map(toTrackUnit) };
  }

  const { unit: currentUnitRaw, color: currentColor, phaseNumber } = allUnits[currentIndex];
  const sessions = [...currentUnitRaw.sessions].sort((a, b) => a.session_number - b.session_number);
  const currentSessionIdx = programSessionId != null ? sessions.findIndex((s) => s.id === programSessionId) : -1;
  const upcomingUnits = allUnits.slice(currentIndex + 1).map(toTrackUnit);

  return {
    doneUnits: allUnits.slice(0, currentIndex).map(toTrackUnit),
    currentUnit: {
      id: currentUnitRaw.id,
      name: currentUnitRaw.name,
      color: currentColor,
      sessionCount: sessions.length,
      localIndex: currentSessionIdx === -1 ? null : currentSessionIdx + 1,
      phaseNumber,
      globalUnitIndex: currentIndex + 1,
      isFinalSession: upcomingUnits.length === 0 && currentSessionIdx === sessions.length - 1,
      sessions: sessions.map((s, i) => ({
        id: s.id,
        sessionNumber: s.session_number,
        state: currentSessionIdx === -1 ? 'upcoming' : i < currentSessionIdx ? 'done' : i === currentSessionIdx ? 'current' : 'upcoming',
      })),
    },
    upcomingUnits,
  };
}

/** A lighter tint of a unit's own color, for "not reached yet" sessions
 *  within the current unit — deliberately not a neutral grey, so the whole
 *  cluster still reads as one unit. */
export function tintColor(color: string): string {
  return `color-mix(in srgb, ${color} 40%, white)`;
}

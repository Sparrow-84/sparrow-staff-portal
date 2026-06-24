import type { LcpPhaseWithUnits } from '@/lib/lcp-types';

const PHASE_COLORS = [
  '#8B7355', // Ph1 Groundwork
  '#C2697A', // Ph2 Heart of the Home
  '#7BA8BF', // Ph3 Rest & Restoration
  '#E8A030', // Ph4 Purpose & Vision
  '#5A8F6A', // Ph5 Outer Life
  '#7B6FA8', // Ph6 Whole House & Graduation
];

const TOTAL_UNITS = 13;

export function PhaseProgressBar({
  phases,
  programUnitId,
  joinedUnitId,
  height = 'sm',
}: {
  phases: LcpPhaseWithUnits[];
  programUnitId: number | null;
  joinedUnitId: number | null;
  height?: 'sm' | 'md';
}) {
  const allUnits = phases.flatMap((p) => p.units).sort((a, b) => a.sort_order - b.sort_order);
  const programSortOrder = programUnitId
    ? (allUnits.find((u) => u.id === programUnitId)?.sort_order ?? 0)
    : 0;
  const joinedSortOrder = joinedUnitId
    ? (allUnits.find((u) => u.id === joinedUnitId)?.sort_order ?? 1)
    : 1;

  const h = height === 'sm' ? 'h-2' : 'h-3';

  return (
    <div className={`flex w-full overflow-hidden rounded-full ${h}`}>
      {phases.map((phase, i) => {
        const color = PHASE_COLORS[i] ?? '#888';
        const phaseWidthPct = (phase.units.length / TOTAL_UNITS) * 100;

        const gapCount = phase.units.filter((u) => u.sort_order < joinedSortOrder && u.sort_order <= programSortOrder).length;
        const completedCount = phase.units.filter((u) => u.sort_order >= joinedSortOrder && u.sort_order <= programSortOrder).length;
        const upcomingCount = phase.units.filter((u) => u.sort_order > programSortOrder).length;
        const total = phase.units.length;

        const gapPct = (gapCount / total) * 100;
        const completedPct = (completedCount / total) * 100;
        const upcomingPct = (upcomingCount / total) * 100;

        return (
          <div key={phase.id} style={{ width: `${phaseWidthPct}%` }} className="flex">
            {gapPct > 0 && (
              <div
                style={{
                  width: `${gapPct}%`,
                  backgroundColor: color,
                  backgroundImage:
                    'repeating-linear-gradient(45deg, rgba(0,0,0,0.3) 0, rgba(0,0,0,0.3) 3px, transparent 3px, transparent 8px)',
                  opacity: 0.45,
                }}
                className="h-full"
              />
            )}
            {completedPct > 0 && (
              <div
                style={{ width: `${completedPct}%`, backgroundColor: color }}
                className="h-full"
              />
            )}
            {upcomingPct > 0 && (
              <div
                style={{ width: `${upcomingPct}%`, backgroundColor: color, opacity: 0.2 }}
                className="h-full"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export { PHASE_COLORS };

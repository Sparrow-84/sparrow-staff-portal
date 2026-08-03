import type { CurriculumTrack, TrackSessionState } from '@/lib/curriculum-track';
import { tintColor } from '@/lib/curriculum-track';

const GHOST_COLOR = '#C7C7C0';

export function BigDot({ color }: { color: string }) {
  return <span className="relative z-10 inline-block h-5 w-5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

export function SessionDot({ color, state }: { color: string; state: TrackSessionState }) {
  if (state === 'current') {
    return (
      <span
        className="relative z-10 inline-block h-[13px] w-[13px] shrink-0 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 0 2px white, 0 0 0 3px ${color}` }}
      />
    );
  }
  return (
    <span
      className="relative z-10 inline-block h-[7px] w-[7px] shrink-0 rounded-full"
      style={{ backgroundColor: state === 'done' ? color : tintColor(color) }}
    />
  );
}

export function GhostDot() {
  return (
    <span
      className="relative z-10 inline-block h-[7px] w-[7px] shrink-0 rounded-full border border-dashed"
      style={{ backgroundColor: '#E5E5E0', borderColor: GHOST_COLOR }}
    />
  );
}

/** A segment of the line threading through every dot — solid when the unit
 *  on each side is the same color (same phase), hard-split exactly at the
 *  boundary when it isn't. This is what lets a phase transition read on the
 *  line itself even where there's no dot marking it (e.g. the current unit
 *  expanding into small dots with no separate big dot of its own). */
function Segment({ from, to }: { from: string; to: string }) {
  const background = from === to ? from : `linear-gradient(to right, ${from} 50%, ${to} 50%)`;
  return <span className="h-0.5 w-3.5 shrink-0" style={{ background }} />;
}

function Connector({ vertical }: { vertical?: boolean }) {
  return vertical ? (
    <div className="h-2.5 w-px shrink-0 bg-sparrow-rule" />
  ) : (
    <div className="h-px w-4 shrink-0 bg-sparrow-rule" />
  );
}

/** Full horizontal arc — Progress tab. Done units collapse to one big dot
 *  each, threaded together by a line that shifts color at every phase
 *  boundary; the current unit expands session-by-session; only the very
 *  next upcoming unit gets a couple of preview ghost dots before the rest
 *  of the program folds into a single "+N more units" tail. */
export function CurriculumTrackHorizontal({ track }: { track: CurriculumTrack }) {
  const [nextUnit, ...restUnits] = track.upcomingUnits;
  const { doneUnits, currentUnit } = track;

  return (
    <div>
      <div className="flex flex-wrap items-center">
        {doneUnits.map((u, i) => (
          <span key={u.id} className="flex items-center">
            {i > 0 && <Segment from={doneUnits[i - 1].color} to={u.color} />}
            <BigDot color={u.color} />
          </span>
        ))}
        {doneUnits.length > 0 && currentUnit && (
          <Segment from={doneUnits[doneUnits.length - 1].color} to={currentUnit.color} />
        )}
        {currentUnit && (
          <div className="flex items-center gap-1.5 rounded-full bg-sparrow-sage px-2.5 py-1">
            {currentUnit.sessions.map((s) => (
              <SessionDot key={s.id} color={currentUnit.color} state={s.state} />
            ))}
          </div>
        )}
        {currentUnit && nextUnit && <Segment from={currentUnit.color} to={GHOST_COLOR} />}
        {nextUnit && (
          <div className="flex items-center">
            {Array.from({ length: Math.min(2, nextUnit.sessionCount) }).map((_, i) => (
              <span key={i} className="flex items-center">
                {i > 0 && <Segment from={GHOST_COLOR} to={GHOST_COLOR} />}
                <GhostDot />
              </span>
            ))}
          </div>
        )}
        {restUnits.length > 0 && (
          <span className="ml-2 whitespace-nowrap text-xs text-sparrow-gray">+{restUnits.length} more units</span>
        )}
      </div>
      <TrackCaption track={track} />
    </div>
  );
}

/** Compact vertical stack — Session Log home, "off to the side." Same
 *  done/current/upcoming picture, just rotated for a narrow sidebar. */
export function CurriculumTrackVertical({ track }: { track: CurriculumTrack }) {
  const lastDone = track.doneUnits[track.doneUnits.length - 1];
  const [nextUnit] = track.upcomingUnits;

  return (
    <div className="flex flex-col items-center gap-1">
      {lastDone && (
        <>
          <div className="flex flex-col items-center gap-1">
            <BigDot color={lastDone.color} />
            <p className="text-[11px] text-sparrow-gray">{lastDone.name}</p>
          </div>
          {track.currentUnit && <Connector vertical />}
        </>
      )}
      {track.currentUnit && (
        <div className="flex flex-col items-center gap-1 rounded-xl bg-sparrow-sage px-2.5 py-2">
          <div className="flex items-center gap-1">
            {track.currentUnit.sessions.map((s) => (
              <SessionDot key={s.id} color={track.currentUnit!.color} state={s.state} />
            ))}
          </div>
          <p className="text-center text-[11px] font-semibold text-sparrow-ink">
            {track.currentUnit.name}
            <br />
            {track.currentUnit.localIndex != null ? `${track.currentUnit.localIndex} of ${track.currentUnit.sessionCount}` : 'position not set'}
          </p>
        </div>
      )}
      {track.currentUnit && nextUnit && <Connector vertical />}
      {nextUnit && (
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(2, nextUnit.sessionCount) }).map((_, i) => (
              <GhostDot key={i} />
            ))}
          </div>
          <p className="text-center text-[11px] italic text-sparrow-gray">{nextUnit.name}<br />up next</p>
        </div>
      )}
    </div>
  );
}

function TrackCaption({ track }: { track: CurriculumTrack }) {
  if (!track.currentUnit) return null;
  const [nextUnit] = track.upcomingUnits;

  if (track.currentUnit.isFinalSession) {
    return (
      <p className="mt-2 text-xs font-semibold text-sparrow-ink">
        This is the last session of the whole program — Session {track.currentUnit.localIndex} of{' '}
        {track.currentUnit.sessionCount}.
      </p>
    );
  }

  return (
    <div className="mt-2 flex items-center justify-between text-xs">
      <span className="font-semibold text-sparrow-ink">
        {track.currentUnit.localIndex != null
          ? `Session ${track.currentUnit.localIndex} of ${track.currentUnit.sessionCount}`
          : 'Position within unit not set'}
      </span>
      {nextUnit && <span className="italic text-sparrow-gray">{nextUnit.name} next</span>}
    </div>
  );
}

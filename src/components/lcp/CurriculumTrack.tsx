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
function Segment({ from, to, vertical }: { from: string; to: string; vertical: boolean }) {
  const direction = vertical ? 'to bottom' : 'to right';
  const background = from === to ? from : `linear-gradient(${direction}, ${from} 50%, ${to} 50%)`;
  return <span className={vertical ? 'w-0.5 h-3.5 shrink-0' : 'h-0.5 w-3.5 shrink-0'} style={{ background }} />;
}

/** The actual dot track, shared by both orientations so they can never drift
 *  apart the way the old hand-duplicated vertical version did (missing the
 *  threaded line, a stale duplicate caption, etc). Done units collapse to
 *  one big dot each; the current unit expands session-by-session; only the
 *  next upcoming unit gets a couple of preview ghost dots before the rest
 *  of the program folds away. */
function TrackDots({ track, vertical }: { track: CurriculumTrack; vertical: boolean }) {
  const [nextUnit, ...restUnits] = track.upcomingUnits;
  const { doneUnits, currentUnit } = track;
  const row = vertical ? 'flex flex-col items-center' : 'flex flex-wrap items-center';
  const cluster = vertical ? 'flex flex-col items-center' : 'flex items-center';

  return (
    <div className={row}>
      {doneUnits.map((u, i) => (
        <span key={u.id} className={cluster}>
          {i > 0 && <Segment from={doneUnits[i - 1].color} to={u.color} vertical={vertical} />}
          <BigDot color={u.color} />
        </span>
      ))}
      {doneUnits.length > 0 && currentUnit && (
        <Segment from={doneUnits[doneUnits.length - 1].color} to={currentUnit.color} vertical={vertical} />
      )}
      {currentUnit && (
        <div className={`${cluster} gap-1.5 rounded-full bg-sparrow-sage px-2.5 py-1`}>
          {currentUnit.sessions.map((s) => (
            <SessionDot key={s.id} color={currentUnit.color} state={s.state} />
          ))}
        </div>
      )}
      {currentUnit && nextUnit && <Segment from={currentUnit.color} to={GHOST_COLOR} vertical={vertical} />}
      {nextUnit && (
        <div className={cluster}>
          {Array.from({ length: Math.min(2, nextUnit.sessionCount) }).map((_, i) => (
            <span key={i} className={cluster}>
              {i > 0 && <Segment from={GHOST_COLOR} to={GHOST_COLOR} vertical={vertical} />}
              <GhostDot />
            </span>
          ))}
        </div>
      )}
      {restUnits.length > 0 && !vertical && (
        <span className="ml-2 whitespace-nowrap text-xs text-sparrow-gray">+{restUnits.length} more units</span>
      )}
    </div>
  );
}

/** Full horizontal arc — Progress tab. */
export function CurriculumTrackHorizontal({ track }: { track: CurriculumTrack }) {
  return (
    <div>
      <TrackDots track={track} vertical={false} />
      <TrackCaption track={track} />
    </div>
  );
}

/** Same dots, rotated — Session Log home, "off to the side." Deliberately
 *  quieter on text than the Progress tab version: no phase/unit naming
 *  (already shown prominently there), just what's coming up next. */
export function CurriculumTrackVertical({ track }: { track: CurriculumTrack }) {
  const [nextUnit] = track.upcomingUnits;
  return (
    <div>
      <TrackDots track={track} vertical />
      {nextUnit && (
        <p className="mt-2 text-center text-[11px] italic text-sparrow-gray">
          {nextUnit.name}
          <br />
          up next
        </p>
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

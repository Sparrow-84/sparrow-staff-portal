import type { CurriculumTrack, TrackSessionState } from '@/lib/curriculum-track';
import { tintColor, upNextSession } from '@/lib/curriculum-track';

const GHOST_COLOR = '#C7C7C0';

export function BigDot({ color }: { color: string }) {
  return <span className="relative z-10 inline-block h-5 w-5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

// No ring here -- a session that's the position pointer is exactly as
// finished as the ones before it, not "in progress." Ringing it used to
// make the most recently completed session look unfinished.
export function SessionDot({ color, state }: { color: string; state: TrackSessionState }) {
  return (
    <span
      className="relative z-10 inline-block h-[9px] w-[9px] shrink-0 rounded-full"
      style={{ backgroundColor: state === 'done' ? color : tintColor(color) }}
    />
  );
}

// Faded to that unit's own real phase color, not a flat neutral grey --
// with a dashed border still marking it as preview/not-started, since the
// current-unit "not reached yet" dots already read as "same color, no
// dash" and this needs to look like a different, lesser-certain state.
export function GhostDot({ color }: { color: string }) {
  return (
    <span
      className="relative z-10 inline-block h-[7px] w-[7px] shrink-0 rounded-full border border-dashed"
      style={{ backgroundColor: tintColor(color), borderColor: GHOST_COLOR }}
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
  const { doneUnits, currentUnit, upcomingUnits } = track;
  const row = vertical ? 'flex flex-col items-center' : 'flex flex-wrap items-center';
  const cluster = vertical ? 'flex flex-col items-center' : 'flex items-center';

  // Only preview the next unit's ghost dots once the current unit is
  // actually exhausted -- otherwise its own remaining (tinted) sessions
  // already show what's next, and previewing the unit after it too early
  // reads as "that's what's coming" when really more of this one is left.
  const currentUnitDone = currentUnit != null && currentUnit.localIndex != null && currentUnit.localIndex >= currentUnit.sessionCount;
  const [nextUnit, ...restUnits] = currentUnit == null || currentUnitDone ? upcomingUnits : [];

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
      {currentUnit && nextUnit && (
        <Segment from={currentUnit.color} to={tintColor(nextUnit.color)} vertical={vertical} />
      )}
      {nextUnit && (
        <div className={cluster}>
          {Array.from({ length: Math.min(2, nextUnit.sessionCount) }).map((_, i) => (
            <span key={i} className={cluster}>
              {i > 0 && <Segment from={tintColor(nextUnit.color)} to={tintColor(nextUnit.color)} vertical={vertical} />}
              <GhostDot color={nextUnit.color} />
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

/** The most recently *completed* session — not necessarily in the current
 *  unit. If the current unit has a done session, that's it; if the current
 *  unit hasn't completed any yet (position just crossed into it), it's the
 *  final session of whichever unit finished right before. */
function mostRecentlyCompleted(track: CurriculumTrack): { name: string; index: number; total: number } | null {
  const cu = track.currentUnit;
  if (cu) {
    const doneCount = cu.sessions.filter((s) => s.state === 'done').length;
    if (doneCount > 0) return { name: cu.name, index: doneCount, total: cu.sessionCount };
  }
  const lastDone = track.doneUnits[track.doneUnits.length - 1];
  return lastDone ? { name: lastDone.name, index: lastDone.sessionCount, total: lastDone.sessionCount } : null;
}

/** Same dots, rotated — Session Log home, "off to the side." Deliberately
 *  quieter on text than the Progress tab version: no phase/unit naming
 *  (already shown prominently there), just what was just finished and
 *  what's coming up next. */
export function CurriculumTrackVertical({ track }: { track: CurriculumTrack }) {
  const recent = mostRecentlyCompleted(track);
  const next = upNextSession(track);
  return (
    <div>
      {recent && (
        <p className="mb-2 text-center text-[11px] font-medium text-sparrow-gray">
          {recent.name} {recent.index}/{recent.total} completed
        </p>
      )}
      <TrackDots track={track} vertical />
      {next && (
        <p className="mt-2 text-center text-[11px] italic text-sparrow-gray">
          {next.unitName} session {next.sessionNumber}
          <br />
          up next
        </p>
      )}
    </div>
  );
}

function TrackCaption({ track }: { track: CurriculumTrack }) {
  if (!track.currentUnit) return null;
  const next = upNextSession(track);

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
      {next && (
        <span className="italic text-sparrow-gray">
          {next.unitName} session {next.sessionNumber} next
        </span>
      )}
    </div>
  );
}

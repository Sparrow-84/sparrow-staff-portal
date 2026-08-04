import type { CurriculumTrack, TrackSessionState } from '@/lib/curriculum-track';
import { tintColor } from '@/lib/curriculum-track';

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

// A "header" for a whole unit, same size as a finished unit's solid BigDot
// so the two read as the same kind of mark at different states -- white/
// unfilled with a colored ring while the unit's still being worked, filling
// in solid the moment every session in it is done (at which point it's
// visually identical to a completed unit's dot, since that's what it now
// is). Only used for the current unit -- a not-yet-started unit's preview
// is a plain tinted BigDot instead (see TrackDots), so every "not reached
// yet" mark in the whole track reads as the same faded version of its real
// color, darkening in place once it's actually done.
function UnitHeaderDot({ color, filled }: { color: string; filled: boolean }) {
  return (
    <span
      className="relative z-10 inline-block h-5 w-5 shrink-0 rounded-full border-2"
      style={{ backgroundColor: filled ? color : 'white', borderColor: color }}
    />
  );
}

/** A segment of the line threading through every dot — solid when the unit
 *  on each side is the same color (same phase), hard-split exactly at the
 *  boundary when it isn't. This is what lets a phase transition read on the
 *  line itself even where there's no dot marking it (e.g. the current unit
 *  expanding into small dots with no separate big dot of its own). Every
 *  spacing between two dots is one of these — never a flex `gap` — so the
 *  line can never have a blank break in it. */
function Segment({ from, to, vertical }: { from: string; to: string; vertical: boolean }) {
  const direction = vertical ? 'to bottom' : 'to right';
  const background = from === to ? from : `linear-gradient(${direction}, ${from} 50%, ${to} 50%)`;
  // Vertical segments now exist between every dot, not just between big
  // unit dots like before -- so matching the old h-3.5 per segment still
  // adds up to a visibly longer track than it used to be. Cut well below
  // it instead.
  return <span className={vertical ? 'w-0.5 h-1 shrink-0' : 'h-0.5 w-3.5 shrink-0'} style={{ background }} />;
}

/** The actual dot track, shared by both orientations so they can never drift
 *  apart the way the old hand-duplicated vertical version did. Done units
 *  collapse to one big dot each; the current unit expands session-by-
 *  session with the position pointer ringed; only the next upcoming unit
 *  gets a couple of preview dots (same faded color as its unit, no special
 *  ghost styling), and only once the current unit is actually exhausted
 *  (otherwise its own remaining sessions already show what's next, and
 *  previewing the unit after it too early is misleading). The header dot
 *  sits *beside* its session dots on the horizontal track and *above* them
 *  on the vertical one — both driven by the same `cluster` direction so
 *  nothing ever floats onto its own row on the horizontal arc. No flex
 *  `gap` is used anywhere in here — every dot-to-dot space is an explicit
 *  Segment, so the connecting line is never broken by unfilled spacing. */
function TrackDots({ track, vertical }: { track: CurriculumTrack; vertical: boolean }) {
  const { doneUnits, currentUnit, upcomingUnits } = track;
  const row = vertical ? 'flex flex-col items-center' : 'flex flex-wrap items-center';
  const cluster = vertical ? 'flex flex-col items-center' : 'flex items-center';

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
        <div className={`${cluster} rounded-2xl bg-sparrow-sage px-2.5 py-2`}>
          <UnitHeaderDot color={currentUnit.color} filled={currentUnitDone} />
          <Segment from={currentUnit.color} to={currentUnit.color} vertical={vertical} />
          {currentUnit.sessions.map((s, i) => (
            <span key={s.id} className={cluster}>
              {i > 0 && <Segment from={currentUnit.color} to={currentUnit.color} vertical={vertical} />}
              <SessionDot color={currentUnit.color} state={s.state} />
            </span>
          ))}
        </div>
      )}
      {currentUnit && nextUnit && (
        <Segment from={currentUnit.color} to={tintColor(nextUnit.color)} vertical={vertical} />
      )}
      {nextUnit && (
        <div className={cluster}>
          <BigDot color={tintColor(nextUnit.color)} />
          <Segment from={tintColor(nextUnit.color)} to={tintColor(nextUnit.color)} vertical={vertical} />
          {Array.from({ length: Math.min(2, nextUnit.sessionCount) }).map((_, i) => (
            <span key={i} className={cluster}>
              {i > 0 && <Segment from={tintColor(nextUnit.color)} to={tintColor(nextUnit.color)} vertical={vertical} />}
              <SessionDot color={nextUnit.color} state="upcoming" />
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

/** Sessions strictly before the ring — "Completed: X". */
function completed(track: CurriculumTrack): { name: string; index: number; total: number } | null {
  const cu = track.currentUnit;
  if (cu) {
    const doneCount = cu.sessions.filter((s) => s.state === 'done').length;
    if (doneCount > 0) return { name: cu.name, index: doneCount, total: cu.sessionCount };
  }
  const lastDone = track.doneUnits[track.doneUnits.length - 1];
  return lastDone ? { name: lastDone.name, index: lastDone.sessionCount, total: lastDone.sessionCount } : null;
}

/** The ringed session itself — "Now on: Y". Distinct from "completed" so the
 *  ring never reads as skipped over between a completed-count and whatever
 *  comes after it. */
function nowOn(track: CurriculumTrack): { name: string; index: number; total: number } | null {
  const cu = track.currentUnit;
  return cu && cu.localIndex != null ? { name: cu.name, index: cu.localIndex, total: cu.sessionCount } : null;
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
 *  quieter on naming than the Progress tab version (no phase/unit numbers,
 *  already shown prominently there) but the same completed/now-on pair. */
export function CurriculumTrackVertical({ track }: { track: CurriculumTrack }) {
  const done = completed(track);
  const current = nowOn(track);
  return (
    <div>
      {done && (
        <p className="mb-2 text-center text-[11px] font-medium text-sparrow-gray">
          Completed: {done.name} {done.index}/{done.total}
        </p>
      )}
      <TrackDots track={track} vertical />
      {current && (
        <p className="mt-2 text-center text-[11px] font-semibold text-sparrow-ink">
          Now on: {current.name} {current.index}/{current.total}
        </p>
      )}
    </div>
  );
}

function TrackCaption({ track }: { track: CurriculumTrack }) {
  if (!track.currentUnit) return null;

  if (track.currentUnit.isFinalSession) {
    return (
      <p className="mt-2 text-xs font-semibold text-sparrow-ink">
        This is the last session of the whole program — Session {track.currentUnit.localIndex} of{' '}
        {track.currentUnit.sessionCount}.
      </p>
    );
  }

  const done = completed(track);
  const current = nowOn(track);

  return (
    <div className="mt-2 text-xs">
      {done && <span className="text-sparrow-gray">Completed: {done.name} {done.index}/{done.total}</span>}
      {done && current && <span className="mx-1.5 text-sparrow-rule">·</span>}
      {current && <span className="font-semibold text-sparrow-ink">Now on: {current.name} {current.index}/{current.total}</span>}
    </div>
  );
}

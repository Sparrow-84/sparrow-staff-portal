import type { CurriculumTrack, TrackSessionState } from '@/lib/curriculum-track';
import { tintColor } from '@/lib/curriculum-track';

export function BigDot({ color }: { color: string }) {
  return <span className="inline-block h-[15px] w-[15px] shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

export function SessionDot({ color, state }: { color: string; state: TrackSessionState }) {
  if (state === 'current') {
    return (
      <span
        className="inline-block h-[11px] w-[11px] shrink-0 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 0 2px white, 0 0 0 3px ${color}` }}
      />
    );
  }
  return (
    <span
      className="inline-block h-[9px] w-[9px] shrink-0 rounded-full"
      style={{ backgroundColor: state === 'done' ? color : tintColor(color) }}
    />
  );
}

export function GhostDot() {
  return (
    <span
      className="inline-block h-[9px] w-[9px] shrink-0 rounded-full border border-dashed"
      style={{ backgroundColor: '#E5E5E0', borderColor: '#C7C7C0' }}
    />
  );
}

function Connector({ vertical }: { vertical?: boolean }) {
  return vertical ? (
    <div className="h-2.5 w-px shrink-0 bg-sparrow-rule" />
  ) : (
    <div className="h-px w-4 shrink-0 bg-sparrow-rule" />
  );
}

/** Full horizontal arc — Progress tab. Done units collapse to one big dot
 *  each; the current unit expands session-by-session; only the very next
 *  upcoming unit gets a couple of preview ghost dots before the rest of the
 *  program folds into a single "+N more units" tail. */
export function CurriculumTrackHorizontal({ track }: { track: CurriculumTrack }) {
  const [nextUnit, ...restUnits] = track.upcomingUnits;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {track.doneUnits.map((u) => (
          <div key={u.id} className="flex items-center gap-2">
            <BigDot color={u.color} />
          </div>
        ))}
        {track.doneUnits.length > 0 && track.currentUnit && <Connector />}
        {track.currentUnit && (
          <div className="flex items-center gap-1.5 rounded-full bg-sparrow-sage px-2.5 py-1">
            {track.currentUnit.sessions.map((s) => (
              <SessionDot key={s.id} color={track.currentUnit!.color} state={s.state} />
            ))}
          </div>
        )}
        {track.currentUnit && nextUnit && <Connector />}
        {nextUnit && (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: Math.min(2, nextUnit.sessionCount) }).map((_, i) => (
              <GhostDot key={i} />
            ))}
          </div>
        )}
        {restUnits.length > 0 && (
          <span className="ml-1 whitespace-nowrap text-xs text-sparrow-gray">+ {restUnits.length} more units</span>
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
          <p className="text-center text-[11px] font-semibold text-sparrow-green">
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
  return (
    <div className="mt-2 flex items-center justify-between text-xs">
      <span className="font-semibold text-sparrow-green">
        {track.currentUnit.name}
        {' · '}
        {track.currentUnit.localIndex != null
          ? `Session ${track.currentUnit.localIndex} of ${track.currentUnit.sessionCount}`
          : 'position within unit not set'}
      </span>
      {nextUnit && <span className="italic text-sparrow-gray">{nextUnit.name} next</span>}
    </div>
  );
}

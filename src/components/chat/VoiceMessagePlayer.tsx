import { useEffect, useRef, useState } from 'react';

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const SPEEDS = [1, 1.5, 2] as const;
type Speed = (typeof SPEEDS)[number];

export function VoiceMessagePlayer({
  url,
  duration,
  mine,
}: {
  url: string;
  duration: number;
  mine: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState(duration);
  const [speed, setSpeed] = useState<Speed>(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setElapsed(Math.floor(audio.currentTime));
    const onEnded = () => { setPlaying(false); setElapsed(0); };
    const onMeta = () => {
      if (audio.duration && isFinite(audio.duration)) setTotal(Math.floor(audio.duration));
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onMeta);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onMeta);
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.playbackRate = speed;
      void audio.play();
      setPlaying(true);
    }
  }

  function changeSpeed(s: Speed) {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  }

  const playBg = mine ? 'bg-white/20 hover:bg-white/30' : 'bg-sparrow-green/10 hover:bg-sparrow-green/20';
  const playColor = mine ? 'text-white' : 'text-sparrow-green';
  const timeColor = mine ? 'text-white/75' : 'text-sparrow-gray';
  const speedActive = mine ? 'bg-white/20 text-white' : 'bg-sparrow-green/15 text-sparrow-green';
  const speedInactive = mine ? 'text-white/50 hover:text-white/75' : 'text-sparrow-gray hover:text-sparrow-ink';

  return (
    <div className="flex items-center gap-2 py-0.5">
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Play / Pause */}
      <button
        onClick={togglePlay}
        aria-label={playing ? 'Pause' : 'Play'}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${playBg}`}
      >
        {playing ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className={playColor} aria-hidden>
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className={playColor} aria-hidden>
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>

      {/* Time */}
      <span className={`min-w-[2.8rem] text-xs tabular-nums ${timeColor}`}>
        {playing ? fmt(elapsed) : fmt(total)}
      </span>

      {/* Speed */}
      <div className="flex items-center gap-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => changeSpeed(s)}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${speed === s ? speedActive : speedInactive}`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Mp3Recorder } from '@/lib/mp3Recorder';

type Phase = 'recording' | 'preview' | 'sending';

const MAX_SECONDS = 120; // 2-minute cap — keeps files well under the 5 MB bucket limit

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function VoiceRecorder({
  onClose,
  onSend,
}: {
  onClose: () => void;
  onSend: (blob: Blob, duration: number) => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>('recording');
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const recorderRef = useRef<Mp3Recorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);
  const blobRef = useRef<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void start();
    return () => {
      clearTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Auto-stop when the 2-minute limit is reached
  useEffect(() => {
    if (seconds >= MAX_SECONDS && phase === 'recording') {
      void stopRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      recorderRef.current = new Mp3Recorder(stream);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      onClose();
    }
  }

  function discard() {
    clearTimer();
    audioRef.current?.pause();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recorderRef.current?.stop();
    onClose();
  }

  async function stopRecording() {
    if (!recorderRef.current || phase !== 'recording') return;
    clearTimer();
    durationRef.current = seconds;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const blob = recorderRef.current.stop();
    blobRef.current = blob;
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    setPhase('preview');
  }

  function togglePreview() {
    const audio = audioRef.current;
    if (!audio) return;
    if (previewPlaying) {
      audio.pause();
      setPreviewPlaying(false);
    } else {
      void audio.play();
      setPreviewPlaying(true);
    }
  }

  async function send() {
    if (!blobRef.current || phase !== 'preview') return;
    setPhase('sending');
    try {
      await onSend(blobRef.current, durationRef.current);
    } finally {
      onClose();
    }
  }

  if (phase === 'sending') {
    return (
      <div className="flex items-center gap-3 border-t border-sparrow-rule px-4 py-3">
        <span className="text-sm text-sparrow-gray">Sending…</span>
      </div>
    );
  }

  if (phase === 'preview') {
    return (
      <div className="flex items-center gap-3 border-t border-sparrow-rule px-4 py-3">
        {/* Hidden audio element for preview playback */}
        {previewUrl && (
          <audio
            ref={audioRef}
            src={previewUrl}
            onEnded={() => setPreviewPlaying(false)}
          />
        )}

        {/* Discard */}
        <button
          onClick={discard}
          aria-label="Discard recording"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Preview play/pause + duration */}
        <div className="flex flex-1 items-center gap-2">
          <button
            onClick={togglePreview}
            aria-label={previewPlaying ? 'Pause preview' : 'Play preview'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sparrow-green/10 text-sparrow-green hover:bg-sparrow-green/20 transition"
          >
            {previewPlaying ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>
          <span className="text-sm font-medium tabular-nums text-sparrow-ink">{fmt(durationRef.current)}</span>
          <span className="text-xs text-sparrow-gray">Tap play to preview</span>
        </div>

        {/* Send */}
        <button onClick={() => void send()} className="btn-primary">
          Send
        </button>
      </div>
    );
  }

  // phase === 'recording'
  return (
    <div className="flex items-center gap-3 border-t border-sparrow-rule px-4 py-3">
      {/* Cancel/Discard */}
      <button
        onClick={discard}
        aria-label="Cancel recording"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Recording indicator + timer */}
      <div className="flex flex-1 items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
        <span className={`text-sm font-medium tabular-nums ${seconds >= MAX_SECONDS - 15 ? 'text-red-500' : 'text-sparrow-ink'}`}>
          {fmt(seconds)}
        </span>
        <span className="text-xs text-sparrow-gray">
          {seconds >= MAX_SECONDS - 15 ? `Stopping at ${fmt(MAX_SECONDS)}` : 'Recording…'}
        </span>
      </div>

      {/* Stop */}
      <button
        onClick={() => void stopRecording()}
        aria-label="Stop recording"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      </button>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

type Phase = 'recording' | 'sending';

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
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('audio/webm');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void start();
    return () => {
      clearTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mimeTypeRef.current = mr.mimeType;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start();
      mediaRef.current = mr;
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      onClose();
    }
  }

  function cancel() {
    clearTimer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop();
    }
    onClose();
  }

  async function send() {
    if (!mediaRef.current || phase !== 'recording') return;
    setPhase('sending');
    clearTimer();
    const duration = seconds;
    await new Promise<void>((resolve) => {
      mediaRef.current!.onstop = () => resolve();
      mediaRef.current!.stop();
    });
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      await onSend(blob, duration);
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

  return (
    <div className="flex items-center gap-3 border-t border-sparrow-rule px-4 py-3">
      {/* Cancel */}
      <button
        onClick={cancel}
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
        <span className="text-sm font-medium tabular-nums text-sparrow-ink">{fmt(seconds)}</span>
      </div>

      {/* Send */}
      <button onClick={() => void send()} className="btn-primary">
        Send
      </button>
    </div>
  );
}

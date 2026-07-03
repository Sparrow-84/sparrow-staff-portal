import { useEffect, useRef, useState } from 'react';

type Phase = 'selecting' | 'preview' | 'sending';

export function ImagePicker({
  onClose,
  onSend,
  initialFile,
}: {
  onClose: () => void;
  onSend: (file: File) => Promise<void>;
  initialFile?: File;
}) {
  const [phase, setPhase] = useState<Phase>(initialFile ? 'preview' : 'selecting');
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    initialFile ? URL.createObjectURL(initialFile) : null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  // Ref instead of state so the focus-dismiss guard always sees the current value.
  const fileSelectedRef = useRef(!!initialFile);

  useEffect(() => {
    if (initialFile) return;
    inputRef.current?.click();
  }, []);

  // If user dismisses the OS picker without choosing a file, close the bar.
  useEffect(() => {
    if (phase !== 'selecting') return;
    function onFocus() {
      setTimeout(() => {
        if (!fileSelectedRef.current) onClose();
      }, 500);
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [phase, onClose]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) { onClose(); return; }
    fileSelectedRef.current = true;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setPhase('preview');
  }

  function cancel() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    onClose();
  }

  async function send() {
    if (!file) return;
    setPhase('sending');
    try {
      await onSend(file);
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
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
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />

      {phase === 'selecting' && (
        <span className="text-sm text-sparrow-gray">Choose a photo…</span>
      )}

      {phase === 'preview' && previewUrl && (
        <>
          <button
            onClick={cancel}
            aria-label="Cancel"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <img
            src={previewUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
          />

          <span className="flex-1 truncate text-sm text-sparrow-gray">
            {file?.name}
          </span>

          <button onClick={() => void send()} className="btn-primary">
            Send
          </button>
        </>
      )}
    </div>
  );
}

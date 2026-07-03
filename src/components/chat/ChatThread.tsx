import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChatMessageWithAuthor, ChatPerson } from '@/lib/chat';
import { MentionInput } from './MentionInput';
import { VoiceRecorder } from './VoiceRecorder';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { ImagePicker } from './ImagePicker';

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return 'Today';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function renderBody(body: string, staff: ChatPerson[], mine: boolean): ReactNode {
  if (!staff.length) return body;
  const escaped = staff.map((p) => p.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`@(${escaped.join('|')})`, 'g');
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(
      <span
        key={m.index}
        className={mine ? 'font-semibold underline decoration-white/50' : 'font-semibold text-sparrow-green'}
      >
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts.length ? <>{parts}</> : body;
}

export function ChatThread({
  messages,
  meId,
  isGroup,
  onSend,
  onSendVoice,
  onSendImage,
  staff,
}: {
  messages: ChatMessageWithAuthor[];
  meId: string;
  isGroup: boolean;
  onSend: (body: string) => Promise<void>;
  onSendVoice: (blob: Blob, duration: number) => Promise<void>;
  onSendImage: (file: File) => Promise<void>;
  staff: ChatPerson[];
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f || !f.type.startsWith('image/')) return;
    setDroppedFile(f);
    setPickingImage(true);
  }

  // Pin to the newest message as the thread grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function submit() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onSend(body);
      setDraft('');
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-sparrow-green bg-sparrow-green/10">
          <p className="font-medium text-sparrow-green">Drop image to send</p>
        </div>
      )}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-sparrow-gray">
            No messages yet — say hello.
          </p>
        ) : (
          messages.map((m, i) => {
            const mine = m.author_id === meId;
            const prev = messages[i - 1];
            const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
            // In group threads, show the sender's name above their first message in a run.
            const showName = isGroup && !mine && (!prev || prev.author_id !== m.author_id || newDay);
            return (
              <div key={m.id}>
                {newDay && (
                  <p className="my-3 text-center text-[11px] font-medium uppercase tracking-wide text-sparrow-gray">
                    {dayLabel(m.created_at)}
                  </p>
                )}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[80%]">
                    {showName && (
                      <p className="mb-0.5 pl-1 text-[11px] font-medium text-sparrow-gray">
                        {m.author?.full_name ?? 'Staff'}
                      </p>
                    )}
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm ${
                        mine
                          ? 'rounded-br-sm bg-sparrow-green text-white'
                          : 'rounded-bl-sm bg-sparrow-mist text-sparrow-ink'
                      }`}
                    >
                      {m.image_url ? (
                        <img
                          src={m.image_url}
                          alt=""
                          loading="lazy"
                          className="max-h-64 w-auto max-w-full rounded-lg"
                        />
                      ) : m.voice_url ? (
                        <VoiceMessagePlayer url={m.voice_url} duration={m.voice_duration ?? 0} mine={mine} />
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{renderBody(m.body, staff, mine)}</p>
                      )}
                      <p className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-sparrow-gray'}`}>
                        {timeLabel(m.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {recording ? (
        <VoiceRecorder onClose={() => setRecording(false)} onSend={onSendVoice} />
      ) : pickingImage ? (
        <ImagePicker
          onClose={() => { setPickingImage(false); setDroppedFile(null); }}
          onSend={onSendImage}
          initialFile={droppedFile ?? undefined}
        />
      ) : (
        <div className="flex items-end gap-2 border-t border-sparrow-rule px-4 py-3">
          <MentionInput
            value={draft}
            onChange={setDraft}
            onKeyDown={onKeyDown}
            staff={staff}
            disabled={busy}
            placeholder="Write a message… (type @ to mention)"
            className="field-input mt-0 max-h-32 w-full resize-none"
          />
          {/* Photo */}
          <button
            onClick={() => setPickingImage(true)}
            disabled={busy}
            aria-label="Send a photo"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-green disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
          {/* Voice */}
          <button
            onClick={() => setRecording(true)}
            disabled={busy}
            aria-label="Send a voice message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-green disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
          <button onClick={() => void submit()} disabled={busy || !draft.trim()} className="btn-primary">
            Send
          </button>
        </div>
      )}
    </div>
  );
}

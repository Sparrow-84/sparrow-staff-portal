import { useState } from 'react';
import type { Message } from '@/lib/lcp-types';
import { dayLabel, timeLabel } from '@/lib/lcp-format';
import { ImagePicker } from '@/components/chat/ImagePicker';

export function StaffThread({
  messages,
  onSend,
  onSendImage,
}: {
  messages: Message[];
  onSend: (body: string) => Promise<void>;
  onSendImage: (file: File) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [pastedFile, setPastedFile] = useState<File | null>(null);

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    await onSend(body);
    setDraft('');
    setBusy(false);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    const f = item?.getAsFile();
    if (!f) return;
    e.preventDefault();
    setPastedFile(f);
    setPickingImage(true);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-sparrow-gray">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const fromStaff = m.sender_kind === 'staff';
            return (
              <div key={m.id} className={`flex ${fromStaff ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                    fromStaff
                      ? 'rounded-br-sm bg-sparrow-green text-white'
                      : 'rounded-bl-sm bg-sparrow-mist text-sparrow-ink'
                  }`}
                >
                  {m.image_url ? (
                    <img src={m.image_url} alt="" loading="lazy" className="max-h-64 w-auto max-w-full rounded-lg" />
                  ) : (
                    <p>{m.body}</p>
                  )}
                  <p className={`mt-1 text-[10px] ${fromStaff ? 'text-white/70' : 'text-sparrow-gray'}`}>
                    {fromStaff ? 'Staff' : 'Family'} · {dayLabel(m.created_at)} {timeLabel(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      {pickingImage ? (
        <ImagePicker
          onClose={() => { setPickingImage(false); setPastedFile(null); }}
          onSend={onSendImage}
          initialFile={pastedFile ?? undefined}
        />
      ) : (
        <div className="mt-3 flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={handlePaste}
            rows={2}
            placeholder="Reply to the family…"
            className="field-input mt-0 min-w-0 flex-1 resize-none"
          />
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
          <button onClick={submit} disabled={busy || !draft.trim()} className="btn-primary">
            Send
          </button>
        </div>
      )}
    </div>
  );
}

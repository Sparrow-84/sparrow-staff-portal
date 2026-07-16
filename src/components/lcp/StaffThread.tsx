import { useState } from 'react';
import type { Message } from '@/lib/lcp-types';
import { dayLabel, timeLabel } from '@/lib/lcp-format';

export function StaffThread({
  messages,
  onSend,
}: {
  messages: Message[];
  onSend: (body: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    await onSend(body);
    setDraft('');
    setBusy(false);
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
                  <p>{m.body}</p>
                  <p className={`mt-1 text-[10px] ${fromStaff ? 'text-white/70' : 'text-sparrow-gray'}`}>
                    {fromStaff ? 'Staff' : 'Family'} · {dayLabel(m.created_at)} {timeLabel(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Reply to the family…"
          className="field-input mt-0 min-w-0 flex-1 resize-none"
        />
        <button onClick={submit} disabled={busy || !draft.trim()} className="btn-primary">
          Send
        </button>
      </div>
    </div>
  );
}

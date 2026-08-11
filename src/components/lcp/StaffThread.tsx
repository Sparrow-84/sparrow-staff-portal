import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Message, MessageReaction } from '@/lib/lcp-types';
import { dayLabel, timeLabel } from '@/lib/lcp-format';
import {
  addLcpReaction, deleteStaffMessage, editStaffMessage, fetchLcpReactions,
  removeLcpReaction, sendStaffMessage, uploadStaffLcpImage, uploadStaffLcpVoice,
} from '@/lib/lcp';
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import { VoiceMessagePlayer } from '@/components/chat/VoiceMessagePlayer';
import { ImagePicker } from '@/components/chat/ImagePicker';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🙌'];
const MAX_TEXTAREA_HEIGHT = 128; // max-h-32
const draftKey = (familyId: string) => `lcp-staff-draft:${familyId}`;

function renderBody(body: string): ReactNode {
  const re = /\*\*((?:[^*]|\*(?!\*))+)\*\*|\*([^*\n]+)\*/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) nodes.push(body.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined) nodes.push(<em key={key++}>{m[2]}</em>);
    last = m.index + m[0].length;
  }
  if (last < body.length) nodes.push(body.slice(last));
  return nodes.length ? <>{nodes}</> : body;
}

export function StaffThread({
  familyId,
  currentUserId,
  messages,
  onChanged,
}: {
  familyId: string;
  currentUserId: string;
  messages: Message[];
  onChanged: () => void;
}) {
  // Persisted per family so navigating away and back (which unmounts this
  // component entirely) doesn't wipe out what Shelly was typing.
  const [draft, setDraft] = useState(() => localStorage.getItem(draftKey(familyId)) ?? '');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  // Reply / quote
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  // Reactions
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [emojiPickerId, setEmojiPickerId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void fetchLcpReactions(familyId).then(setReactions);
  }, [familyId, messages.length]);

  useEffect(() => {
    if (draft) localStorage.setItem(draftKey(familyId), draft);
    else localStorage.removeItem(draftKey(familyId));
  }, [draft, familyId]);

  useEffect(() => {
    if (!emojiPickerId) return;
    function handleClick() { setEmojiPickerId(null); }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [emojiPickerId]);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    const capped = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${capped}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
  }

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || draft) return;
    ta.style.height = 'auto';
    ta.style.overflowY = 'hidden';
  }, [draft]);

  // Wrap the current text selection (or cursor position) with a markdown marker pair.
  function wrapSelection(marker: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const inner = draft.slice(start, end);
    const newVal = draft.slice(0, start) + marker + inner + marker + draft.slice(end);
    setDraft(newVal);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + marker.length, end + marker.length);
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); wrapSelection('**'); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); wrapSelection('*'); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    const f = item?.getAsFile();
    if (!f) return;
    e.preventDefault();
    setPastedFile(f);
    setPickingImage(true);
  }

  async function submit() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await sendStaffMessage(familyId, body, currentUserId, undefined, undefined, replyTo?.id);
      setDraft('');
      setReplyTo(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleSendVoice(blob: Blob, duration: number) {
    const { url } = await uploadStaffLcpVoice(blob, familyId);
    await sendStaffMessage(familyId, '', currentUserId, { url, duration });
    onChanged();
  }

  async function handleSendImage(file: File) {
    const { url } = await uploadStaffLcpImage(file, familyId);
    await sendStaffMessage(familyId, '', currentUserId, undefined, url);
    onChanged();
  }

  async function handleDelete(msgId: string) {
    await deleteStaffMessage(msgId);
    onChanged();
  }

  async function saveEdit(msgId: string) {
    const body = editDraft.trim();
    if (!body) return;
    await editStaffMessage(msgId, body);
    setEditingId(null);
    onChanged();
  }

  async function toggleReaction(msgId: string, emoji: string) {
    const already = reactions.some((r) => r.message_id === msgId && r.user_id === currentUserId && r.emoji === emoji);
    if (already) {
      await removeLcpReaction(msgId, emoji, currentUserId);
      setReactions((prev) => prev.filter((r) => !(r.message_id === msgId && r.user_id === currentUserId && r.emoji === emoji)));
    } else {
      await addLcpReaction(familyId, msgId, emoji, currentUserId);
      setReactions((prev) => [...prev, { id: crypto.randomUUID(), message_id: msgId, user_id: currentUserId, emoji }]);
    }
    setEmojiPickerId(null);
  }

  function reactionsFor(msgId: string): { emoji: string; count: number; iMine: boolean }[] {
    const byEmoji = new Map<string, { count: number; iMine: boolean }>();
    for (const r of reactions) {
      if (r.message_id !== msgId) continue;
      const cur = byEmoji.get(r.emoji) ?? { count: 0, iMine: false };
      byEmoji.set(r.emoji, { count: cur.count + 1, iMine: cur.iMine || r.user_id === currentUserId });
    }
    return Array.from(byEmoji.entries()).map(([emoji, v]) => ({ emoji, ...v }));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const fromStaff = m.sender_kind === 'staff';
            const isEditing = editingId === m.id;
            const msgReactions = reactionsFor(m.id);
            const quotedMsg = m.reply_to_id
              ? messages.find((x) => x.id === m.reply_to_id) ?? null
              : null;

            return (
              <div key={m.id} className="group">
                <div className={`flex items-end gap-1.5 ${fromStaff ? 'justify-end' : 'justify-start'}`}>

                  {/* Actions — left for received (family) */}
                  {!fromStaff && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <MsgActionBtn title="React" onClick={(e) => { e.stopPropagation(); setEmojiPickerId(m.id); }}>
                        <EmojiIcon />
                      </MsgActionBtn>
                      <MsgActionBtn title="Reply" onClick={() => setReplyTo(m)}>
                        <ReplyIcon />
                      </MsgActionBtn>
                    </div>
                  )}

                  <div className="max-w-[80%]">
                    {isEditing ? (
                      <div className="rounded-2xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-3 py-2">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveEdit(m.id); }
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                          rows={2}
                          spellCheck
                          className="w-full resize-none text-sm text-sparrow-ink dark:text-sparrow-dark-ink focus:outline-none"
                        />
                        <div className="mt-1.5 flex justify-end gap-2">
                          <button onClick={() => setEditingId(null)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">Cancel</button>
                          <button onClick={() => void saveEdit(m.id)} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`rounded-2xl px-3.5 py-2 text-sm ${
                          fromStaff
                            ? 'rounded-br-sm bg-sparrow-green text-white'
                            : 'rounded-bl-sm bg-sparrow-mist dark:bg-sparrow-dark-surface2 text-sparrow-ink dark:text-sparrow-dark-ink'
                        }`}
                      >
                        {/* Quote preview */}
                        {quotedMsg && (
                          <div className={`mb-2 rounded-lg border-l-2 pl-2 pr-2 py-1 text-xs ${fromStaff ? 'border-white/40 bg-white/10 text-white/80' : 'border-sparrow-green/40 bg-white/50 text-sparrow-gray dark:text-sparrow-dark-gray'}`}>
                            <p className="font-medium">{quotedMsg.sender_kind === 'staff' ? 'Staff' : 'Family'}</p>
                            <p className="truncate">{quotedMsg.body || (quotedMsg.voice_url ? '🎤 Voice message' : quotedMsg.image_url ? '🖼 Photo' : '')}</p>
                          </div>
                        )}

                        {/* Content */}
                        {m.image_url ? (
                          <img src={m.image_url} alt="" loading="lazy" className="max-h-64 w-auto max-w-full rounded-lg" />
                        ) : m.voice_url ? (
                          <VoiceMessagePlayer url={m.voice_url} duration={m.voice_duration ?? 0} mine={fromStaff} />
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{renderBody(m.body)}</p>
                        )}

                        <p className={`mt-1 text-[10px] ${fromStaff ? 'text-white/70' : 'text-sparrow-gray dark:text-sparrow-dark-gray'}`}>
                          {fromStaff ? 'Staff' : 'Family'} · {dayLabel(m.created_at)} {timeLabel(m.created_at)}
                          {m.edited_at && <span className="ml-1">(edited)</span>}
                        </p>
                      </div>
                    )}

                    {/* Reaction pills */}
                    {msgReactions.length > 0 && (
                      <div className={`mt-1 flex flex-wrap gap-1 ${fromStaff ? 'justify-end' : 'justify-start'}`}>
                        {msgReactions.map(({ emoji, count, iMine }) => (
                          <button
                            key={emoji}
                            onClick={() => void toggleReaction(m.id, emoji)}
                            className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition ${
                              iMine
                                ? 'border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green/10 text-sparrow-green dark:text-sparrow-dark-green'
                                : 'border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface text-sparrow-ink dark:text-sparrow-dark-ink hover:border-sparrow-green/40'
                            }`}
                          >
                            {emoji} {count}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions — right for sent (staff) */}
                  {fromStaff && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <MsgActionBtn title="React" onClick={(e) => { e.stopPropagation(); setEmojiPickerId(m.id); }}>
                        <EmojiIcon />
                      </MsgActionBtn>
                      <MsgActionBtn title="Reply" onClick={() => setReplyTo(m)}>
                        <ReplyIcon />
                      </MsgActionBtn>
                      {!m.voice_url && !m.image_url && (
                        <MsgActionBtn title="Edit" onClick={() => { setEditingId(m.id); setEditDraft(m.body); }}>
                          <EditIcon />
                        </MsgActionBtn>
                      )}
                      <MsgActionBtn title="Delete" onClick={() => void handleDelete(m.id)} danger>
                        <TrashIcon />
                      </MsgActionBtn>
                    </div>
                  )}
                </div>

                {/* Emoji picker */}
                {emojiPickerId === m.id && (
                  <div
                    className={`mt-1 flex items-center gap-1 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-1.5 shadow-md ${fromStaff ? 'justify-end' : 'justify-start'}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => void toggleReaction(m.id, emoji)}
                        className="rounded-lg p-1.5 text-lg leading-none hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 transition"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Input area */}
      {recording ? (
        <VoiceRecorder onClose={() => setRecording(false)} onSend={handleSendVoice} />
      ) : pickingImage ? (
        <ImagePicker
          onClose={() => { setPickingImage(false); setPastedFile(null); }}
          onSend={handleSendImage}
          initialFile={pastedFile ?? undefined}
        />
      ) : (
        <div className="mt-3">
          {/* Reply bar */}
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-sparrow-gray dark:text-sparrow-dark-gray">
                  Replying to {replyTo.sender_kind === 'staff' ? 'yourself' : 'the family'}
                </p>
                <p className="truncate text-xs text-sparrow-ink dark:text-sparrow-dark-ink">
                  {replyTo.body || (replyTo.voice_url ? '🎤 Voice message' : replyTo.image_url ? '🖼 Photo' : '')}
                </p>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className="shrink-0 text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => { autoResize(e.target); setDraft(e.target.value); }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Reply to the family… (⌘B bold · ⌘I italic · ⌘↵ send)"
              rows={2}
              disabled={busy}
              spellCheck
              className="field-input mt-0 max-h-32 min-w-0 flex-1 resize-none"
              style={{ overflowY: 'hidden' }}
            />
            <button
              onClick={() => setPickingImage(true)}
              disabled={busy}
              aria-label="Send a photo"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-green dark:hover:text-sparrow-dark-green disabled:opacity-40"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            <button
              onClick={() => setRecording(true)}
              disabled={busy}
              aria-label="Send a voice message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-green dark:hover:text-sparrow-dark-green disabled:opacity-40"
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
        </div>
      )}
    </div>
  );
}

function MsgActionBtn({
  title,
  onClick,
  danger = false,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
        danger
          ? 'text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-red-50 hover:text-red-500'
          : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
      }`}
    >
      {children}
    </button>
  );
}

function EmojiIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 13s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="9,17 4,12 9,7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3,6 5,6 21,6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

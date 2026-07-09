import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChatMessageWithAuthor, ChatPerson, ChatReaction } from '@/lib/chat';
import {
  addReaction, deleteMessage, editMessage, fetchOtherMemberReadAt,
  fetchReactions, removeReaction,
} from '@/lib/chat';
import { MentionInput } from './MentionInput';
import { VoiceRecorder } from './VoiceRecorder';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { ImagePicker } from './ImagePicker';

// ── Emoji reactions ───────────────────────────────────────────────────────────

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🙌'];

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
  const hasMentions = staff.length > 0;
  const escaped = staff.map((p) => p.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  const pats: string[] = [];
  if (hasMentions) pats.push(`@(${escaped.join('|')})`);
  pats.push('\\*\\*((?:[^*]|\\*(?!\\*))+)\\*\\*');
  pats.push('\\*([^*\\n]+)\\*');

  const re = new RegExp(pats.join('|'), 'g');
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  const boldGroup   = hasMentions ? 2 : 1;
  const italicGroup = hasMentions ? 3 : 2;

  while ((m = re.exec(body)) !== null) {
    if (m.index > last) nodes.push(body.slice(last, m.index));
    if (hasMentions && m[1] !== undefined) {
      nodes.push(
        <span key={key++} className={mine ? 'font-semibold underline decoration-white/50' : 'font-semibold text-sparrow-green'}>
          {m[0]}
        </span>,
      );
    } else if (m[boldGroup] !== undefined) {
      nodes.push(<strong key={key++}>{m[boldGroup]}</strong>);
    } else if (m[italicGroup] !== undefined) {
      nodes.push(<em key={key++}>{m[italicGroup]}</em>);
    }
    last = m.index + m[0].length;
  }

  if (last < body.length) nodes.push(body.slice(last));
  return nodes.length ? <>{nodes}</> : body;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatThread({
  messages,
  meId,
  isGroup,
  channelId,
  onSend,
  onSendVoice,
  onSendImage,
  staff,
  onMessageDeleted,
  onMessageEdited,
}: {
  messages: ChatMessageWithAuthor[];
  meId: string;
  isGroup: boolean;
  channelId: string;
  onSend: (body: string, replyToId?: string) => Promise<void>;
  onSendVoice: (blob: Blob, duration: number) => Promise<void>;
  onSendImage: (file: File) => Promise<void>;
  staff: ChatPerson[];
  onMessageDeleted?: (id: string) => void;
  onMessageEdited?: (id: string, newBody: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Reply / quote
  const [replyTo, setReplyTo] = useState<ChatMessageWithAuthor | null>(null);
  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  // Reactions
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [emojiPickerId, setEmojiPickerId] = useState<string | null>(null);
  // Read receipts (direct only)
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave() { setDragOver(false); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f || !f.type.startsWith('image/')) return;
    setDroppedFile(f);
    setPickingImage(true);
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    void fetchReactions(channelId).then(setReactions);
    if (!isGroup) void fetchOtherMemberReadAt(channelId).then(setOtherReadAt);
  }, [channelId, isGroup, messages.length]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!emojiPickerId) return;
    function handleClick() { setEmojiPickerId(null); }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [emojiPickerId]);

  async function submit() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onSend(body, replyTo?.id);
      setDraft('');
      setReplyTo(null);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }

  async function handleDelete(msgId: string) {
    await deleteMessage(msgId);
    onMessageDeleted?.(msgId);
  }

  async function saveEdit(msgId: string) {
    const body = editDraft.trim();
    if (!body) return;
    await editMessage(msgId, body);
    onMessageEdited?.(msgId, body);
    setEditingId(null);
  }

  function startEdit(msg: ChatMessageWithAuthor) {
    setEditingId(msg.id);
    setEditDraft(msg.body);
    setEmojiPickerId(null);
  }

  async function toggleReaction(msgId: string, emoji: string) {
    const already = reactions.some((r) => r.message_id === msgId && r.user_id === meId && r.emoji === emoji);
    if (already) {
      await removeReaction(msgId, emoji);
      setReactions((prev) => prev.filter((r) => !(r.message_id === msgId && r.user_id === meId && r.emoji === emoji)));
    } else {
      await addReaction(channelId, msgId, emoji);
      setReactions((prev) => [...prev, { message_id: msgId, user_id: meId, emoji }]);
    }
    setEmojiPickerId(null);
  }

  // Group reactions by message_id → emoji → {count, iMine}
  function reactionsFor(msgId: string): { emoji: string; count: number; iMine: boolean }[] {
    const byEmoji = new Map<string, { count: number; iMine: boolean }>();
    for (const r of reactions) {
      if (r.message_id !== msgId) continue;
      const cur = byEmoji.get(r.emoji) ?? { count: 0, iMine: false };
      byEmoji.set(r.emoji, { count: cur.count + 1, iMine: cur.iMine || r.user_id === meId });
    }
    return Array.from(byEmoji.entries()).map(([emoji, v]) => ({ emoji, ...v }));
  }

  // The index of the last message I sent that the other person has seen.
  const seenIdx = !isGroup && otherReadAt
    ? (() => {
        let idx = -1;
        messages.forEach((m, i) => {
          if (m.author_id === meId && otherReadAt && m.created_at <= otherReadAt) idx = i;
        });
        return idx;
      })()
    : -1;

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

      {/* Message list */}
      <div className="flex-1 space-y-2 overflow-x-hidden overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-sparrow-gray">No messages yet — say hello.</p>
        ) : (
          messages.map((m, i) => {
            const mine = m.author_id === meId;
            const prev = messages[i - 1];
            const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
            const showName = isGroup && !mine && (!prev || prev.author_id !== m.author_id || newDay);
            const msgReactions = reactionsFor(m.id);
            const isEditing = editingId === m.id;
            const isSeenMsg = i === seenIdx;

            // Look up the replied-to message in the loaded messages
            const quotedMsg = m.reply_to_id
              ? messages.find((x) => x.id === m.reply_to_id) ?? null
              : null;

            return (
              <div key={m.id} className="group">
                {newDay && (
                  <p className="my-3 text-center text-[11px] font-medium uppercase tracking-wide text-sparrow-gray">
                    {dayLabel(m.created_at)}
                  </p>
                )}
                <div className={`flex items-end ${mine ? 'justify-end' : 'justify-start'}`}>

                  <div className="relative max-w-[78%]">
                    {/* Action buttons float above the bubble — no layout footprint, no horizontal overflow */}
                    <div className={`absolute -top-7 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${mine ? 'right-0' : 'left-0'}`}>
                      <ActionButtons
                        mine={mine}
                        onReact={(e) => { e.stopPropagation(); setEmojiPickerId(m.id); }}
                        onReply={() => setReplyTo(m)}
                        onEdit={() => { if (mine) startEdit(m); }}
                        onDelete={() => { if (mine) void handleDelete(m.id); }}
                      />
                    </div>
                    {showName && (
                      <p className="mb-0.5 pl-1 text-[11px] font-medium text-sparrow-gray">
                        {m.author?.full_name ?? 'Staff'}
                      </p>
                    )}

                    {/* Bubble */}
                    {isEditing ? (
                      <div className="rounded-2xl border border-sparrow-rule bg-white px-3 py-2">
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
                          className="w-full resize-none text-sm text-sparrow-ink focus:outline-none"
                        />
                        <div className="mt-1.5 flex justify-end gap-2">
                          <button onClick={() => setEditingId(null)} className="text-xs text-sparrow-gray hover:text-sparrow-ink">Cancel</button>
                          <button onClick={() => void saveEdit(m.id)} className="text-xs font-medium text-sparrow-green hover:underline">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`rounded-2xl px-3.5 py-2 text-sm ${
                          mine
                            ? 'rounded-br-sm bg-sparrow-green text-white'
                            : 'rounded-bl-sm bg-sparrow-mist text-sparrow-ink'
                        }`}
                      >
                        {/* Quote preview */}
                        {quotedMsg && (
                          <div className={`mb-2 rounded-lg border-l-2 pl-2 pr-2 py-1 text-xs ${mine ? 'border-white/40 bg-white/10 text-white/80' : 'border-sparrow-green/40 bg-white/50 text-sparrow-gray'}`}>
                            <p className="font-medium">{quotedMsg.author?.full_name ?? 'Staff'}</p>
                            <p className="truncate">{quotedMsg.body || (quotedMsg.voice_url ? '🎤 Voice message' : quotedMsg.image_url ? '🖼 Photo' : '')}</p>
                          </div>
                        )}

                        {/* Content */}
                        {m.image_url ? (
                          <img src={m.image_url} alt="" loading="lazy" className="max-h-64 w-auto max-w-full rounded-lg" />
                        ) : m.voice_url ? (
                          <VoiceMessagePlayer url={m.voice_url} duration={m.voice_duration ?? 0} mine={mine} />
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{renderBody(m.body, staff, mine)}</p>
                        )}

                        <p className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-sparrow-gray'}`}>
                          {timeLabel(m.created_at)}
                          {m.edited_at && <span className="ml-1">(edited)</span>}
                        </p>
                      </div>
                    )}

                    {/* Reaction pills */}
                    {msgReactions.length > 0 && (
                      <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                        {msgReactions.map(({ emoji, count, iMine }) => (
                          <button
                            key={emoji}
                            onClick={() => void toggleReaction(m.id, emoji)}
                            className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition ${
                              iMine
                                ? 'border-sparrow-green bg-sparrow-green/10 text-sparrow-green'
                                : 'border-sparrow-rule bg-white text-sparrow-ink hover:border-sparrow-green/40'
                            }`}
                          >
                            {emoji} {count}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* "Seen" indicator (direct chats only, last seen message) */}
                    {isSeenMsg && (
                      <p className={`mt-0.5 text-[10px] text-sparrow-gray ${mine ? 'text-right' : ''}`}>Seen</p>
                    )}
                  </div>
                </div>

                {/* Emoji picker */}
                {emojiPickerId === m.id && (
                  <div
                    className={`mt-1 flex items-center gap-1 rounded-xl border border-sparrow-rule bg-white p-1.5 shadow-md ${mine ? 'justify-end' : 'justify-start'}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => void toggleReaction(m.id, emoji)}
                        className="rounded-lg p-1.5 text-lg leading-none hover:bg-sparrow-mist transition"
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
        <div ref={endRef} />
      </div>

      {/* Input area */}
      {recording ? (
        <VoiceRecorder onClose={() => setRecording(false)} onSend={onSendVoice} />
      ) : pickingImage ? (
        <ImagePicker
          onClose={() => { setPickingImage(false); setDroppedFile(null); }}
          onSend={onSendImage}
          initialFile={droppedFile ?? undefined}
        />
      ) : (
        <div className="border-t border-sparrow-rule">
          {/* Reply bar */}
          {replyTo && (
            <div className="flex items-center gap-2 border-b border-sparrow-rule bg-sparrow-mist px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-sparrow-gray">
                  Replying to {replyTo.author?.full_name ?? 'Staff'}
                </p>
                <p className="truncate text-xs text-sparrow-ink">
                  {replyTo.body || (replyTo.voice_url ? '🎤 Voice message' : replyTo.image_url ? '🖼 Photo' : '')}
                </p>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className="shrink-0 text-sparrow-gray hover:text-sparrow-ink"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 px-4 py-3">
            <MentionInput
              value={draft}
              onChange={setDraft}
              onKeyDown={onKeyDown}
              staff={staff}
              disabled={busy}
              placeholder="Write a message… (@ mention · ⌘B bold · ⌘I italic · ⌘↵ send)"
              className="field-input mt-0 max-h-32 w-full resize-none"
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
        </div>
      )}
    </div>
  );
}

// ── Action button row ─────────────────────────────────────────────────────────

function ActionButtons({
  mine,
  onReact,
  onReply,
  onEdit,
  onDelete,
}: {
  mine: boolean;
  onReact: (e: React.MouseEvent) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <button
        onClick={onReact}
        title="React"
        className="flex h-7 w-7 items-center justify-center rounded-full text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink transition"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path d="M8 13s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </button>
      <button
        onClick={onReply}
        title="Reply"
        className="flex h-7 w-7 items-center justify-center rounded-full text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink transition"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="9,17 4,12 9,7" />
          <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
        </svg>
      </button>
      {mine && (
        <>
          <button
            onClick={onEdit}
            title="Edit"
            className="flex h-7 w-7 items-center justify-center rounded-full text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink transition"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="flex h-7 w-7 items-center justify-center rounded-full text-sparrow-gray hover:bg-red-50 hover:text-red-500 transition"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="3,6 5,6 21,6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" /><path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </>
      )}
    </>
  );
}

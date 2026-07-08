import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useChat } from '@/chat/ChatContext';
import { ChatThread } from '@/components/chat/ChatThread';
import { NewConversationPanel } from '@/components/chat/NewConversationPanel';
import {
  conversationLabel,
  deleteChannel,
  fetchMessages,
  fetchStaff,
  initials,
  markRead,
  parseMentionIds,
  renameChannel,
  sendMessage,
  subscribeToMessages,
  uploadImageFile,
  uploadVoiceBlob,
  type ChatConversation,
  type ChatMessageWithAuthor,
  type ChatPerson,
} from '@/lib/chat';
import { createMentionNotifications } from '@/lib/social';

function previewTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MessagesView({ embedded, onClose }: { embedded?: boolean; onClose?: () => void }) {
  const { profile } = useAuth();
  const { conversations, refresh } = useChat();
  const meId = profile?.id ?? '';
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageWithAuthor[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [staff, setStaff] = useState<ChatPerson[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!meId) return;
    void fetchStaff(meId).then(setStaff);
  }, [meId]);
  const active = conversations.find((c) => c.channel_id === activeId) ?? null;

  // Reset group management UI when switching threads.
  useEffect(() => {
    setRenaming(false);
    setMenuOpen(false);
    setConfirmDelete(false);
  }, [activeId]);

  // Load + live-update the open thread; mark it read on open and refresh badges.
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let live = true;
    void fetchMessages(activeId).then((m) => {
      if (live) setMessages(m);
    });
    void markRead(activeId, meId).then(() => refresh());

    const unsub = subscribeToMessages(() => {
      void fetchMessages(activeId).then((m) => {
        if (live) setMessages(m);
      });
      void markRead(activeId, meId);
    }, activeId);

    return () => {
      live = false;
      unsub();
    };
  }, [activeId, meId, refresh]);

  async function handleSend(body: string, replyToId?: string) {
    if (!activeId) return;
    await sendMessage(activeId, meId, body, undefined, undefined, replyToId);
    const mentionedIds = parseMentionIds(body, staff);
    if (mentionedIds.length) {
      void createMentionNotifications(mentionedIds, meId, activeId, body).catch(() => {});
    }
    setMessages(await fetchMessages(activeId));
    refresh();
  }

  async function handleSendVoice(blob: Blob, duration: number) {
    if (!activeId) return;
    const { url } = await uploadVoiceBlob(blob, activeId, meId);
    await sendMessage(activeId, meId, '', { url, duration });
    setMessages(await fetchMessages(activeId));
    refresh();
  }

  async function handleSendImage(file: File) {
    if (!activeId) return;
    const { url } = await uploadImageFile(file, activeId, meId);
    await sendMessage(activeId, meId, '', undefined, url);
    setMessages(await fetchMessages(activeId));
    refresh();
  }

  function openConversation(c: ChatConversation) {
    setActiveId(c.channel_id);
  }

  function startRename() {
    if (!active) return;
    setRenameValue(conversationLabel(active));
    setRenaming(true);
  }

  async function saveRename() {
    const title = renameValue.trim();
    setRenaming(false);
    if (!title || !activeId || title === conversationLabel(active!)) return;
    try {
      await renameChannel(activeId, title);
      refresh();
    } catch { /* non-critical — server will have rejected, local state reverts on refresh */ }
  }

  async function handleDelete() {
    if (!activeId) return;
    try {
      await deleteChannel(activeId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not delete this group.');
      return;
    }
    setConfirmDelete(false);
    setActiveId(null);
    refresh();
  }

  return (
    <div className={`flex ${embedded ? 'h-full' : 'h-[calc(100vh-7.5rem)]'}`}>
      {/* Conversation list */}
      <div
        className={`flex w-full flex-col border-r border-sparrow-rule bg-white ${
          embedded ? '' : 'md:w-80 md:shrink-0'
        } ${active ? (embedded ? 'hidden' : 'hidden md:flex') : 'flex'}`}
      >
        <div className="flex items-center justify-between border-b border-sparrow-rule px-4 py-3">
          <h1 className="font-serif text-lg font-semibold">Messages</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setNewOpen(true)} className="btn-primary !px-3 !py-1.5 text-xs">
              New
            </button>
            {embedded && onClose && (
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
                aria-label="Close messages"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-sparrow-gray">
              No conversations yet. Start one with “New.”
            </li>
          )}
          {conversations.map((c) => {
            const label = conversationLabel(c);
            const isActive = c.channel_id === activeId;
            return (
              <li key={c.channel_id}>
                <button
                  onClick={() => openConversation(c)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                    isActive ? 'bg-sparrow-sage' : 'hover:bg-sparrow-mist'
                  }`}
                >
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sparrow-green text-sm font-semibold text-white">
                    {c.kind === 'group' ? '#' : initials(c.other_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-sparrow-ink">{label}</span>
                      <span className="shrink-0 text-[11px] text-sparrow-gray">
                        {previewTime(c.last_message_at)}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 truncate text-xs text-sparrow-gray">
                        {c.last_attachment_kind === 'voice' ? (
                          <>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                              <line x1="12" y1="19" x2="12" y2="23" />
                              <line x1="8" y1="23" x2="16" y2="23" />
                            </svg>
                            Voice message
                          </>
                        ) : c.last_attachment_kind === 'image' ? (
                          <>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                              <circle cx="12" cy="13" r="4" />
                            </svg>
                            Photo
                          </>
                        ) : (
                          c.last_body ?? 'No messages yet'
                        )}
                      </span>
                      {c.unread > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sparrow-green px-1.5 text-[11px] font-semibold text-white">
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Thread */}
      <div className={`flex-1 flex-col bg-white ${active ? 'flex' : (embedded ? 'hidden' : 'hidden md:flex')}`}>
        {active ? (
          <>
            <div className="flex items-center gap-3 border-b border-sparrow-rule px-4 py-3">
              <button
                onClick={() => setActiveId(null)}
                className={`rounded-lg p-1 text-sparrow-gray hover:bg-sparrow-mist ${embedded ? '' : 'md:hidden'}`}
                aria-label="Back to conversations"
              >
                ←
              </button>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sparrow-green text-xs font-semibold text-white">
                {active.kind === 'group' ? '#' : initials(active.other_name)}
              </span>
              <div className="min-w-0 flex-1">
                {active.kind === 'group' && renaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => void saveRename()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveRename();
                      if (e.key === 'Escape') setRenaming(false);
                    }}
                    className="w-full bg-transparent text-sm font-semibold text-sparrow-ink outline-none border-b border-sparrow-green"
                    placeholder="Group name…"
                  />
                ) : (
                  <p className="truncate text-sm font-semibold text-sparrow-ink">{conversationLabel(active)}</p>
                )}
                <p className="text-xs text-sparrow-gray">
                  {active.kind === 'group' ? 'Group' : 'Direct message'}
                </p>
              </div>
              {active.kind === 'group' && (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen((o) => !o)}
                    className="rounded-lg p-1.5 text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
                    aria-label="Group options"
                  >
                    •••
                  </button>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
                      <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-sparrow-rule bg-white shadow-card">
                        <button
                          onClick={() => { setMenuOpen(false); startRename(); }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-sparrow-mist"
                        >
                          Rename group
                        </button>
                        <button
                          onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                          className="block w-full px-3 py-2 text-left text-sm text-priority-p1 hover:bg-red-50"
                        >
                          Delete group
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {embedded && onClose && (
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
                  aria-label="Close messages"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            {confirmDelete && (
              <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm">
                <span className="flex-1 font-medium text-priority-p1">Delete this group and all its messages? This can't be undone.</span>
                <button
                  onClick={() => void handleDelete()}
                  className="shrink-0 rounded-lg bg-priority-p1 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  Delete
                </button>
                <button onClick={() => setConfirmDelete(false)} className="btn-ghost shrink-0 text-xs">
                  Cancel
                </button>
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <ChatThread
                messages={messages}
                meId={meId}
                isGroup={active.kind === 'group'}
                channelId={active.channel_id}
                onSend={handleSend}
                onSendVoice={handleSendVoice}
                onSendImage={handleSendImage}
                staff={staff}
                onMessageDeleted={(id) => setMessages((prev) => prev.filter((m) => m.id !== id))}
                onMessageEdited={(id, body) =>
                  setMessages((prev) =>
                    prev.map((m) => m.id === id ? { ...m, body, edited_at: new Date().toISOString() } : m)
                  )
                }
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-sparrow-gray">
            Select a conversation, or start a new one.
          </div>
        )}
      </div>

      <NewConversationPanel
        open={newOpen}
        meId={meId}
        onClose={() => setNewOpen(false)}
        onCreated={(channelId) => {
          setNewOpen(false);
          refresh();
          setActiveId(channelId);
        }}
      />
    </div>
  );
}

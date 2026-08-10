import { createRoot } from 'react-dom/client';
import './index.css';
import { ChatThread } from './components/chat/ChatThread';
import type { ChatMessageWithAuthor, ChatPerson } from './lib/chat';

const staff: ChatPerson[] = [
  { id: 'u1', full_name: 'Susanna Basden', department: 'ops' },
  { id: 'u2', full_name: 'Bethany Rivera', department: 'partnerships' },
];

const messages: ChatMessageWithAuthor[] = [
  {
    id: 'm1',
    channel_id: 'c1',
    author_id: 'u2',
    body: "Oh woops I forgot about that, yes I am gone. Tuesday works for me, any time. Wednesday, I have an external partnerships meeting in addition to the staff meeting.",
    voice_url: null,
    voice_duration: null,
    image_url: null,
    reply_to_id: null,
    edited_at: null,
    created_at: new Date().toISOString(),
    author: { full_name: 'Bethany Rivera' },
  },
  {
    id: 'm2',
    channel_id: 'c1',
    author_id: 'u1',
    body: 'Yep, on it — will have notes back by end of day.',
    voice_url: null,
    voice_duration: null,
    image_url: null,
    reply_to_id: null,
    edited_at: null,
    created_at: new Date().toISOString(),
    author: { full_name: 'Susanna Basden' },
  },
];

// Reconstructing the REAL nesting from ChatPanel.tsx -> MessagesView.tsx exactly,
// instead of a simplified mock, to catch structural (not just component-internal) bugs.
function App() {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/25" />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-white dark:bg-sparrow-dark-surface shadow-2xl translate-x-0" id="chatpanel">
        {/* MessagesView embedded, active conversation, conversation list hidden */}
        <div className="flex h-full" id="messagesview-root">
          <div className="flex-1 flex-col bg-white dark:bg-sparrow-dark-surface flex min-w-0" id="thread-col">
            <div className="flex items-center gap-3 border-b border-sparrow-rule dark:border-sparrow-dark-border px-4 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sparrow-green text-xs font-semibold text-white">B</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">Bethany Rivera</p>
                <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Direct message</p>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatThread
                messages={messages}
                meId="u1"
                isGroup={false}
                channelId="c1"
                onSend={async () => {}}
                onSendVoice={async () => {}}
                onSendImage={async () => {}}
                staff={staff}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

import { SignOutButton } from './SignOutButton';
import { NotificationBell } from './NotificationBell';
import { useChat } from '@/chat/ChatContext';
import type { View } from './Sidebar';
import type { Profile } from '@/lib/types';

function MessagesButton({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { unreadTotal } = useChat();
  return (
    <button
      onClick={() => onNavigate('messages')}
      className="relative rounded-lg p-2 text-sparrow-gray transition hover:bg-sparrow-mist hover:text-sparrow-ink"
      aria-label="Messages"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {unreadTotal > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sparrow-green px-1 text-[10px] font-semibold text-white">
          {unreadTotal}
        </span>
      )}
    </button>
  );
}

export function Header({ profile, onMenu, onNavigate }: { profile: Profile; onMenu: () => void; onNavigate: (v: View) => void }) {
  return (
    <header className="flex items-center justify-between border-b border-sparrow-rule bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-2">
        <button
          onClick={onMenu}
          className="rounded-lg p-2 text-sparrow-gray transition hover:bg-sparrow-mist hover:text-sparrow-ink md:hidden"
          aria-label="Open menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="font-serif text-lg font-semibold text-sparrow-green">Sparrow</span>
      </div>
      <div className="flex items-center gap-3">
        <MessagesButton onNavigate={onNavigate} />
        <NotificationBell onNavigate={onNavigate} currentUserId={profile.id} />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-sparrow-ink">{profile.full_name}</p>
          <p className="text-xs capitalize text-sparrow-gray">{profile.role}</p>
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}

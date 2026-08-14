import { useState } from 'react';
import { useChat } from '@/chat/ChatContext';

const COLLAPSED_STORAGE_KEY = 'sparrow-sidebar-collapsed';

export type View = 'home' | 'twin-oaks' | 'lcp' | 'partnerships' | 'operations' | 'stories' | 'tasks' | 'calendar' | 'notes' | 'contacts' | 'messages' | 'settings' | 'staff' | 'onboarding' | 'documents' | 'team' | 'inventory';

interface Props {
  view: View;
  isAdmin: boolean;
  tocAccess: boolean;
  lcpAccess: boolean;
  partnershipsAccess: boolean;
  opsAccess: boolean;
  storiesAccess: boolean;
  hasOnboarding: boolean;
  onNavigate: (v: View) => void;
  open: boolean; // mobile drawer
  onClose: () => void;
}

function Soon() {
  return (
    <span className="ml-auto rounded-full bg-sparrow-rule/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-sparrow-gray dark:text-sparrow-dark-gray">
      Soon
    </span>
  );
}

function LockIcon() {
  return (
    <svg className="ml-auto h-3.5 w-3.5 shrink-0 opacity-40" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M11 7V5a3 3 0 1 0-6 0v2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1zm-5-2a2 2 0 1 1 4 0v2H6V5z" />
    </svg>
  );
}

const SOON_ROOMS: string[] = [];

function NavContent({
  view,
  isAdmin,
  tocAccess,
  lcpAccess,
  partnershipsAccess,
  opsAccess,
  storiesAccess,
  hasOnboarding,
  onNavigate,
}: {
  view: View;
  isAdmin: boolean;
  tocAccess: boolean;
  lcpAccess: boolean;
  partnershipsAccess: boolean;
  opsAccess: boolean;
  storiesAccess: boolean;
  hasOnboarding: boolean;
  onNavigate: (v: View) => void;
}) {
  const { unreadTotal } = useChat();
  const itemBase = 'flex items-center gap-2 rounded-lg px-3 py-2 text-left transition';
  const active = 'bg-sparrow-sage dark:bg-sparrow-green/15 font-medium text-sparrow-green dark:text-sparrow-dark-green';
  const idle = 'text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink';

  const section = 'flex flex-col gap-1 rounded-xl bg-sparrow-mist/50 dark:bg-sparrow-dark-surface2/60 p-2';
  const sectionLabel = 'px-2 pb-1 text-xs font-bold uppercase tracking-wider text-sparrow-green dark:text-sparrow-dark-green';

  return (
    <>
      <nav className="flex flex-1 flex-col gap-3 text-sm">
        {hasOnboarding && (
          <button
            onClick={() => onNavigate('onboarding')}
            className={`${itemBase} ${view === 'onboarding' ? active : 'bg-sparrow-green/10 font-medium text-sparrow-green dark:text-sparrow-dark-green hover:bg-sparrow-green/20'}`}
          >
            My onboarding
            {view !== 'onboarding' && (
              <span className="ml-auto h-2 w-2 rounded-full bg-sparrow-green" />
            )}
          </button>
        )}

        <div className={section}>
          <button onClick={() => onNavigate('home')} className={`${itemBase} ${view === 'home' ? active : idle}`}>
            Home
          </button>
          <button onClick={() => onNavigate('tasks')} className={`${itemBase} ${view === 'tasks' ? active : idle}`}>
            My tasks
          </button>
          <button onClick={() => onNavigate('calendar')} className={`${itemBase} ${view === 'calendar' ? active : idle}`}>
            Calendar
          </button>
          <button onClick={() => onNavigate('notes')} className={`${itemBase} ${view === 'notes' ? active : idle}`}>
            Notes
          </button>
          <button onClick={() => onNavigate('contacts')} className={`${itemBase} ${view === 'contacts' ? active : idle}`}>
            My Contacts
          </button>
          <button onClick={() => onNavigate('messages')} className={`${itemBase} ${view === 'messages' ? active : idle}`}>
            Messages
            {unreadTotal > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-sparrow-green px-1.5 text-[11px] font-semibold text-white">
                {unreadTotal}
              </span>
            )}
          </button>
          <button onClick={() => onNavigate('documents')} className={`${itemBase} ${view === 'documents' ? active : idle}`}>
            Resource Library
          </button>
          <button onClick={() => onNavigate('inventory')} className={`${itemBase} ${view === 'inventory' ? active : idle}`}>
            My Inventory
          </button>
          <button onClick={() => onNavigate('team')} className={`${itemBase} ${view === 'team' ? active : idle}`}>
            Team
          </button>
        </div>

        <div className={section}>
          <p className={sectionLabel}>Rooms</p>
          {tocAccess ? (
            <button
              onClick={() => onNavigate('twin-oaks')}
              className={`${itemBase} ${view === 'twin-oaks' ? active : idle}`}
            >
              Twin Oaks
            </button>
          ) : (
            <span className={`${itemBase} cursor-default text-sparrow-gray/50`}>
              Twin Oaks <LockIcon />
            </span>
          )}
          {lcpAccess ? (
            <button onClick={() => onNavigate('lcp')} className={`${itemBase} ${view === 'lcp' ? active : idle}`}>
              LifeChange
            </button>
          ) : (
            <span className={`${itemBase} cursor-default text-sparrow-gray/50`}>
              LifeChange <LockIcon />
            </span>
          )}
          {partnershipsAccess ? (
            <button
              onClick={() => onNavigate('partnerships')}
              className={`${itemBase} ${view === 'partnerships' ? active : idle}`}
            >
              Partnerships
            </button>
          ) : (
            <span className={`${itemBase} cursor-default text-sparrow-gray/50`}>
              Partnerships <LockIcon />
            </span>
          )}
          {opsAccess ? (
            <button
              onClick={() => onNavigate('operations')}
              className={`${itemBase} ${view === 'operations' ? active : idle}`}
            >
              Operations
            </button>
          ) : (
            <span className={`${itemBase} cursor-default text-sparrow-gray/50`}>
              Operations <LockIcon />
            </span>
          )}
          {storiesAccess ? (
            <button
              onClick={() => onNavigate('stories')}
              className={`${itemBase} ${view === 'stories' ? active : idle}`}
            >
              Stories &amp; Media
            </button>
          ) : (
            <span className={`${itemBase} cursor-default text-sparrow-gray/50`}>
              Stories &amp; Media <LockIcon />
            </span>
          )}
          {SOON_ROOMS.map((r) => (
            <span key={r} className={`${itemBase} text-sparrow-gray/70`}>
              {r} <Soon />
            </span>
          ))}
        </div>

        {isAdmin && (
          <div className={section}>
            <p className={sectionLabel}>Admin</p>
            <button onClick={() => onNavigate('staff')} className={`${itemBase} ${view === 'staff' ? active : idle}`}>
              Staff
            </button>
          </div>
        )}
      </nav>

      <button onClick={() => onNavigate('settings')} className={`${itemBase} ${view === 'settings' ? active : idle}`}>
        Settings
      </button>
    </>
  );
}

export function Sidebar({ view, isAdmin, tocAccess, lcpAccess, partnershipsAccess, opsAccess, storiesAccess, hasOnboarding, onNavigate, open, onClose }: Props) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true');

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <>
      {/* Desktop: static sidebar — collapses to a slim rail to give width back
          to whatever's open (handy split-screen with another window). The
          little bird flips direction as a small nod to "flying off"/"flying
          back" rather than a plain chevron. */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface py-5 transition-[width] duration-300 ease-out md:flex ${
          collapsed ? 'w-14 px-2' : 'w-56 px-3'
        }`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`mb-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg transition-transform duration-200 hover:scale-110 hover:bg-sparrow-mist active:scale-90 dark:hover:bg-sparrow-dark-surface2 ${
            collapsed ? 'mx-auto' : 'ml-auto'
          }`}
        >
          <span
            className="inline-block transition-transform duration-500"
            style={{ transform: collapsed ? 'scaleX(-1)' : 'scaleX(1)', transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            🐦
          </span>
        </button>

        <div className={`flex flex-1 flex-col gap-3 overflow-hidden transition-opacity duration-150 ${collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
          <NavContent
            view={view}
            isAdmin={isAdmin}
            tocAccess={tocAccess}
            lcpAccess={lcpAccess}
            partnershipsAccess={partnershipsAccess}
            opsAccess={opsAccess}
            storiesAccess={storiesAccess}
            hasOnboarding={hasOnboarding}
            onNavigate={onNavigate}
          />
        </div>
      </aside>

      {/* Mobile: slide-in drawer */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-sparrow-ink/30 transition-opacity md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-3 py-5 transition-transform md:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <NavContent
          view={view}
          isAdmin={isAdmin}
          tocAccess={tocAccess}
          lcpAccess={lcpAccess}
          partnershipsAccess={partnershipsAccess}
          opsAccess={opsAccess}
          storiesAccess={storiesAccess}
          hasOnboarding={hasOnboarding}
          onNavigate={(v) => {
            onNavigate(v);
            onClose();
          }}
        />
      </aside>
    </>
  );
}

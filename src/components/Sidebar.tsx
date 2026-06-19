import { useChat } from '@/chat/ChatContext';

export type View = 'home' | 'twin-oaks' | 'lcp' | 'partnerships' | 'operations' | 'tasks' | 'calendar' | 'messages' | 'settings' | 'staff' | 'onboarding' | 'documents';

interface Props {
  view: View;
  isAdmin: boolean;
  lcpAccess: boolean;
  partnershipsAccess: boolean;
  opsAccess: boolean;
  hasOnboarding: boolean;
  onNavigate: (v: View) => void;
  open: boolean; // mobile drawer
  onClose: () => void;
}

function Soon() {
  return (
    <span className="ml-auto rounded-full bg-sparrow-rule/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-sparrow-gray">
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
  lcpAccess,
  partnershipsAccess,
  opsAccess,
  hasOnboarding,
  onNavigate,
}: {
  view: View;
  isAdmin: boolean;
  lcpAccess: boolean;
  partnershipsAccess: boolean;
  opsAccess: boolean;
  hasOnboarding: boolean;
  onNavigate: (v: View) => void;
}) {
  const { unreadTotal } = useChat();
  const itemBase = 'flex items-center gap-2 rounded-lg px-3 py-2 text-left transition';
  const active = 'bg-sparrow-sage font-medium text-sparrow-green';
  const idle = 'text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink';

  return (
    <>
      <nav className="flex flex-1 flex-col gap-1 text-sm">
        {hasOnboarding && (
          <button
            onClick={() => onNavigate('onboarding')}
            className={`${itemBase} ${view === 'onboarding' ? active : 'bg-sparrow-green/10 font-medium text-sparrow-green hover:bg-sparrow-green/20'}`}
          >
            My onboarding
            {view !== 'onboarding' && (
              <span className="ml-auto h-2 w-2 rounded-full bg-sparrow-green" />
            )}
          </button>
        )}
        <button onClick={() => onNavigate('home')} className={`${itemBase} ${view === 'home' ? active : idle}`}>
          Home
        </button>
        <button onClick={() => onNavigate('tasks')} className={`${itemBase} ${view === 'tasks' ? active : idle}`}>
          My tasks
        </button>
        <button onClick={() => onNavigate('calendar')} className={`${itemBase} ${view === 'calendar' ? active : idle}`}>
          Calendar
        </button>
        <button onClick={() => onNavigate('messages')} className={`${itemBase} ${view === 'messages' ? active : idle}`}>
          Messages
          {unreadTotal > 0 && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-sparrow-green px-1.5 text-[11px] font-semibold text-white">
              {unreadTotal}
            </span>
          )}
        </button>

        <div className="my-3 border-t border-sparrow-rule" />
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Rooms</p>
        <button
          onClick={() => onNavigate('twin-oaks')}
          className={`${itemBase} ${view === 'twin-oaks' ? active : idle}`}
        >
          Twin Oaks
        </button>
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
        <button
          onClick={() => onNavigate('documents')}
          className={`${itemBase} ${view === 'documents' ? active : idle}`}
        >
          Documents
        </button>
        {SOON_ROOMS.map((r) => (
          <span key={r} className={`${itemBase} text-sparrow-gray/70`}>
            {r} <Soon />
          </span>
        ))}

        {isAdmin && (
          <>
            <div className="my-3 border-t border-sparrow-rule" />
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Admin</p>
            <button onClick={() => onNavigate('staff')} className={`${itemBase} ${view === 'staff' ? active : idle}`}>
              Staff
            </button>
          </>
        )}
      </nav>

      <button onClick={() => onNavigate('settings')} className={`${itemBase} ${view === 'settings' ? active : idle}`}>
        Settings
      </button>
    </>
  );
}

export function Sidebar({ view, isAdmin, lcpAccess, partnershipsAccess, opsAccess, hasOnboarding, onNavigate, open, onClose }: Props) {
  return (
    <>
      {/* Desktop: static sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sparrow-rule bg-white px-3 py-5 md:flex">
        <NavContent
          view={view}
          isAdmin={isAdmin}
          lcpAccess={lcpAccess}
          partnershipsAccess={partnershipsAccess}
          opsAccess={opsAccess}
          hasOnboarding={hasOnboarding}
          onNavigate={onNavigate}
        />
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
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sparrow-rule bg-white px-3 py-5 transition-transform md:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <NavContent
          view={view}
          isAdmin={isAdmin}
          lcpAccess={lcpAccess}
          partnershipsAccess={partnershipsAccess}
          opsAccess={opsAccess}
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

export type View = 'home' | 'twin-oaks' | 'staff';

interface Props {
  view: View;
  isAdmin: boolean;
  onNavigate: (v: View) => void;
}

function Soon() {
  return (
    <span className="ml-auto rounded-full bg-sparrow-rule/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-sparrow-gray">
      Soon
    </span>
  );
}

const SOON_ROOMS = ['LifeChange', 'Partnerships', 'Operations'];

export function Sidebar({ view, isAdmin, onNavigate }: Props) {
  const itemBase = 'flex items-center gap-2 rounded-lg px-3 py-2 text-left transition';
  const active = 'bg-sparrow-sage font-medium text-sparrow-green';
  const idle = 'text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink';

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-sparrow-rule bg-white px-3 py-5 md:flex">
      <nav className="flex flex-1 flex-col gap-1 text-sm">
        <button onClick={() => onNavigate('home')} className={`${itemBase} ${view === 'home' ? active : idle}`}>
          Home
        </button>
        <button onClick={() => onNavigate('home')} className={`${itemBase} ${idle}`}>
          My tasks
        </button>
        <span className={`${itemBase} text-sparrow-gray`}>
          Calendar <Soon />
        </span>

        <div className="my-3 border-t border-sparrow-rule" />
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Rooms</p>
        <button
          onClick={() => onNavigate('twin-oaks')}
          className={`${itemBase} ${view === 'twin-oaks' ? active : idle}`}
        >
          Twin Oaks
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

      <span className={`${itemBase} text-sparrow-gray`}>
        Settings <Soon />
      </span>
    </aside>
  );
}

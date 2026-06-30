const ROOMS = [
  { icon: '🏡', name: 'Twin Oaks', desc: 'Resident records, lot management, work orders, pets, and notices — all organized by lot.' },
  { icon: '🌱', name: 'LCP', desc: 'Participant families, session tracking, goals, finance milestones, homework, messaging, and curriculum admin.' },
  { icon: '🤝', name: 'Partnerships', desc: 'Donor and partner relationships, stewardship cadences, collateral tracker, and communications.' },
  { icon: '⚙️', name: 'Operations', desc: 'Inventory tracking, Benton County filing, onboarding checklists, and shared documents.' },
];

const WIDGETS = [
  { name: 'My Week', desc: 'All your tasks and meetings for the week in a single view.' },
  { name: 'Incoming Tasks', desc: 'Tasks assigned to you — accept, defer, or push back.' },
  { name: 'Org Calendar', desc: 'All-staff meetings, program sessions, and org events.' },
  { name: 'Notifications', desc: '@mentions, task updates, and system alerts.' },
  { name: 'Team Pulse', desc: "Your team's task load at a glance. Managers only." },
  { name: 'Quick Wins', desc: "Log small completions that don't have a formal task." },
  { name: 'Mini Calendar', desc: 'Month-at-a-glance calendar for quick date reference.' },
];

export function DashboardHelpModal({
  open,
  onClose,
  onReplayTour,
}: {
  open: boolean;
  onClose: () => void;
  onReplayTour: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-sparrow-ink/40 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sparrow-rule px-6 py-4">
          <h2 className="font-serif text-lg font-semibold text-sparrow-ink">Dashboard overview</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="divide-y divide-sparrow-rule">
          {/* Rooms section */}
          <div className="px-6 py-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Rooms
            </p>
            <p className="mb-4 text-sm text-sparrow-gray">
              Rooms are in the sidebar below your personal tabs. Access is role-specific — not every staff member sees every room. The first time you open a room, a short walkthrough explains what's inside.
            </p>
            <div className="space-y-3">
              {ROOMS.map((r) => (
                <div key={r.name} className="flex gap-3">
                  <span className="mt-0.5 text-base leading-none">{r.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-sparrow-ink">{r.name}</p>
                    <p className="text-xs leading-relaxed text-sparrow-gray">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Widgets section */}
          <div className="px-6 py-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Dashboard widgets
            </p>
            <p className="mb-4 text-sm text-sparrow-gray">
              Use <strong className="text-sparrow-ink">Edit home</strong> to show, hide, and rearrange widgets.
            </p>
            <div className="space-y-3">
              {WIDGETS.map((w) => (
                <div key={w.name}>
                  <p className="text-sm font-medium text-sparrow-ink">{w.name}</p>
                  <p className="text-xs text-sparrow-gray">{w.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex flex-col gap-1">
              <button
                onClick={() => { onClose(); onReplayTour(); }}
                className="text-left text-sm font-medium text-sparrow-green hover:underline"
              >
                Replay welcome tour
              </button>
              <button
                onClick={() => {
                  [
                    'sparrow_staff_welcomed_v1',
                    'sparrow_toc_toured_v1',
                    'sparrow_lcp_toured_v1',
                    'sparrow_partnerships_toured_v1',
                    'sparrow_ops_toured_v1',
                  ].forEach((k) => localStorage.removeItem(k));
                  onClose();
                  onReplayTour();
                }}
                className="text-left text-xs text-sparrow-gray hover:text-sparrow-ink hover:underline"
              >
                Reset all tours (show again from scratch)
              </button>
            </div>
            <button onClick={onClose} className="btn-secondary text-sm">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

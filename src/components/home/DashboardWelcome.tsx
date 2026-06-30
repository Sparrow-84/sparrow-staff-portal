import { useState } from 'react';

const STORAGE_KEY = 'sparrow_staff_welcomed_v1';

export function useDashboardWelcome() {
  const [open, setOpen] = useState(() => !localStorage.getItem(STORAGE_KEY));

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setOpen(false);
  }

  function reopen() {
    setOpen(true);
  }

  return { welcomeOpen: open, dismissWelcome: dismiss, reopenWelcome: reopen };
}

const SLIDES = [
  {
    label: '1 of 3',
    heading: 'Welcome to Sparrow.',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-sparrow-gray">
        <p>
          This is your staff system — the place where Twin Oaks operations, LifeChange Program
          coordination, partnerships, and team work all live together.
        </p>
        <p>
          Everything is organized into <strong className="text-sparrow-ink">rooms</strong>, accessible
          from the left sidebar. Your dashboard is the home base where your work surfaces automatically.
        </p>
        <p>
          This quick tour covers what's here and how it fits together.
        </p>
      </div>
    ),
  },
  {
    label: '2 of 3',
    heading: 'The rooms.',
    body: (
      <div className="space-y-4">
        {[
          {
            icon: '🏡',
            name: 'Twin Oaks',
            desc: 'Resident records, lot management, work orders, pets, notices, and the filing system for Benton County.',
          },
          {
            icon: '🌱',
            name: 'LifeChange Program',
            desc: 'Participant families, session tracking, goals, finance milestones, homework, messaging, and curriculum.',
          },
          {
            icon: '🤝',
            name: 'Partnerships',
            desc: 'Donor and partner relationships, stewardship cadences, collateral, and communications.',
          },
          {
            icon: '⚙️',
            name: 'Operations',
            desc: 'Inventory, staff onboarding checklists, and shared documents.',
          },
        ].map((r) => (
          <div key={r.name} className="flex gap-3">
            <span className="mt-0.5 text-xl leading-none">{r.icon}</span>
            <div>
              <p className="text-sm font-semibold text-sparrow-ink">{r.name}</p>
              <p className="text-xs leading-relaxed text-sparrow-gray">{r.desc}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    label: '3 of 3',
    heading: 'Your dashboard.',
    body: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-sparrow-gray">
          Your home page shows widgets — cards that surface your most important work automatically.
          You can rearrange and customize them using <strong className="text-sparrow-ink">Edit home</strong>.
        </p>
        <div className="space-y-3">
          {[
            { name: 'My Week', desc: 'Tasks and meetings due this week, in one view.' },
            { name: 'Incoming Tasks', desc: 'Tasks assigned to you that need a response — accept, defer, or push back.' },
            { name: 'Org Calendar', desc: 'All staff meetings and program sessions in one place.' },
            { name: 'Notifications', desc: '@mentions and updates from across the system.' },
            { name: 'Team Pulse', desc: 'Your direct reports' task load at a glance (managers only).' },
          ].map((w) => (
            <div key={w.name}>
              <p className="text-sm font-medium text-sparrow-ink">{w.name}</p>
              <p className="text-xs text-sparrow-gray">{w.desc}</p>
            </div>
          ))}
        </div>
        <p className="rounded-lg bg-sparrow-mist px-3 py-2 text-xs text-sparrow-gray">
          Click <strong className="text-sparrow-ink">?</strong> next to Edit home any time to come back to this overview.
        </p>
      </div>
    ),
  },
];

export function DashboardWelcome({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const [slide, setSlide] = useState(0);
  const current = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-sparrow-ink/40 px-4"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sparrow-rule px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🕊</span>
            <span className="text-xs font-medium uppercase tracking-wide text-sparrow-gray">
              {current.label}
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <h2 className="mb-4 font-serif text-xl font-semibold text-sparrow-ink">
            {current.heading}
          </h2>
          {current.body}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-sparrow-rule px-6 py-4">
          <button
            onClick={() => setSlide((s) => Math.max(0, s - 1))}
            disabled={slide === 0}
            className="text-sm font-medium text-sparrow-gray disabled:opacity-0"
          >
            ← Back
          </button>

          {/* Dot indicators */}
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === slide ? 'bg-sparrow-green' : 'bg-sparrow-rule'
                }`}
              />
            ))}
          </div>

          {isLast ? (
            <button onClick={onDismiss} className="btn-primary text-sm">
              Let's go →
            </button>
          ) : (
            <button
              onClick={() => setSlide((s) => s + 1)}
              className="text-sm font-medium text-sparrow-green hover:underline"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

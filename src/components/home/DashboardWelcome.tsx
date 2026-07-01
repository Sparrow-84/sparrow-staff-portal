import { useState } from 'react';

const STORAGE_KEY = 'sparrow_staff_welcomed_v1';

export function useDashboardWelcome() {
  const seen = typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'done';
  const [open, setOpen] = useState(!seen);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, 'done');
    setOpen(false);
  }

  function reopen() {
    setOpen(true);
  }

  return { welcomeOpen: open, dismissWelcome: dismiss, reopenWelcome: reopen };
}

const STEPS = [
  {
    icon: '🕊',
    image: '/brand/logo-primary-circle-green.png',
    title: 'Welcome to Sparrow',
    body: "This is your staff system — the place where Twin Oaks operations, LifeChange Program coordination, partnerships, and team work all live together. Let's take a quick look at what's here.",
    tag: null,
  },
  {
    icon: '🏠',
    title: 'Your home screen',
    body: "This dashboard shows widgets that surface your most important work automatically — tasks due today, upcoming meetings, team updates, and more. Use \"Edit home\" to show, hide, and rearrange them. The ? button beside it brings back this overview anytime.",
    tag: { icon: '🏠', label: 'Home' },
  },
  {
    icon: '✅',
    title: 'My Tasks',
    body: "Your personal task workspace. Create tasks for yourself or drop something on a teammate's to-do list. Switch between List, Board, and Calendar views — the system remembers which you used last. Managers and admins also see a \"My team\" toggle to check in on direct reports.",
    tag: { icon: '✅', label: 'My Tasks' },
  },
  {
    icon: '📅',
    title: 'Calendar',
    body: "A month-view calendar with filter layers you can toggle: All Staff events, your department calendars, and your task deadlines plotted as colored dots. Click any day to add an event.",
    tag: { icon: '📅', label: 'Calendar' },
  },
  {
    icon: '💬',
    title: 'Messages',
    body: "Click Messages in the sidebar and a chat panel slides in from the right. This is where team-wide and one-on-one staff conversations happen. LCP staff will also see messages from program participants here. The badge in the sidebar shows unread messages.",
    tag: { icon: '💬', label: 'Messages' },
  },
  {
    icon: '📄',
    title: 'Resource Library',
    body: "Staff documents in one place — staff handbook, policy & procedure manual, role descriptions, emergency procedures, and more. Read-only reference so everyone is always working from the same version.",
    tag: { icon: '📄', label: 'Resource Library' },
  },
  {
    icon: '🚪',
    title: 'Your rooms',
    body: "The bottom of your sidebar has Rooms — areas of Sparrow's work you're assigned to. Not everyone sees every room; access is set by role. The first time you open a room, you'll get a short walkthrough of what's inside.",
    tag: null,
  },
  {
    icon: '✨',
    title: "You're all set",
    body: "Your system is ready. Start on the home screen, check your tasks, or open a room. Every tab has a ? button at the top if you need a quick reference. Welcome to the team.",
    tag: null,
  },
];

export function DashboardWelcome({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  function finish() {
    localStorage.setItem(STORAGE_KEY, 'done');
    onDismiss();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-sparrow-ink/60 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) finish(); }}
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-white px-6 pb-6 pt-5 shadow-xl">
        <button
          onClick={finish}
          className="absolute right-4 top-4 text-xs text-sparrow-gray hover:text-sparrow-ink"
        >
          Skip tour
        </button>

        {'image' in current && current.image ? (
          <img src={current.image} alt="Sparrow" className="mb-3 h-12 w-12" />
        ) : (
          <div className="mb-3 text-4xl">{current.icon}</div>
        )}

        <h2 className="font-serif text-xl font-semibold text-sparrow-green">{current.title}</h2>

        <p className="mt-2 text-sm leading-relaxed text-sparrow-gray">{current.body}</p>

        {current.tag && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-sparrow-sage px-3 py-1 text-xs font-medium text-sparrow-green">
            <span>{current.tag.icon}</span>
            <span>{current.tag.label}</span>
          </div>
        )}

        <div className="mt-5 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-5 bg-sparrow-green' : 'w-1.5 bg-sparrow-rule hover:bg-sparrow-gray'
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          {!isFirst && (
            <button onClick={() => setStep((s) => s - 1)} className="btn-ghost flex-1">
              Back
            </button>
          )}
          {isLast ? (
            <button onClick={finish} className="btn-primary flex-1">
              Let's go
            </button>
          ) : (
            <button onClick={() => setStep((s) => s + 1)} className="btn-primary flex-1">
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

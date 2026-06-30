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
    title: 'Welcome to Sparrow',
    body: "This is your staff system — the place where Twin Oaks operations, LifeChange Program coordination, partnerships, and team work all live together. Everything is organized into rooms, accessible from the sidebar. Let's take a quick look.",
    tag: null,
  },
  {
    icon: '🏡',
    title: 'Twin Oaks',
    body: "Manage the property here. Resident records, lot details, work orders, pets, notices — it's all organized by lot. The Benton County filing system lives here too.",
    tag: { icon: '🏡', label: 'Twin Oaks' },
  },
  {
    icon: '🌱',
    title: 'LifeChange Program',
    body: "Your LCP families are here. Track sessions, add goals, log finance milestones, send messages, and assign homework — all from each family's detail panel. Curriculum is managed here too.",
    tag: { icon: '🌱', label: 'LCP' },
  },
  {
    icon: '🤝',
    title: 'Partnerships',
    body: "Donors and partners live in this room. You can track relationships, log stewardship touchpoints, and manage collateral. Think of it as Sparrow's relational contact list.",
    tag: { icon: '🤝', label: 'Partnerships' },
  },
  {
    icon: '⚙️',
    title: 'Operations',
    body: "Inventory tracking, onboarding checklists, and shared documents are all here. If something needs to be counted, filed, or handed to a new team member — this is where it lives.",
    tag: { icon: '⚙️', label: 'Operations' },
  },
  {
    icon: '🏠',
    title: 'Your dashboard',
    body: "This home screen shows widgets — cards that surface your most important work automatically. Use \"Edit home\" to show, hide, and rearrange them. The ? button brings back this tour anytime.",
    tag: { icon: '🏠', label: 'Dashboard' },
  },
  {
    icon: '✨',
    title: "You're all set",
    body: "Your rooms are ready and your team is here. If you ever get turned around, hit ? on the dashboard for a quick overview. Welcome to the team.",
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
        {/* Skip */}
        <button
          onClick={finish}
          className="absolute right-4 top-4 text-xs text-sparrow-gray hover:text-sparrow-ink"
        >
          Skip tour
        </button>

        {/* Icon */}
        <div className="mb-3 text-4xl">{current.icon}</div>

        {/* Title */}
        <h2 className="font-serif text-xl font-semibold text-sparrow-green">
          {current.title}
        </h2>

        {/* Body */}
        <p className="mt-2 text-sm leading-relaxed text-sparrow-gray">{current.body}</p>

        {/* Section tag */}
        {current.tag && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-sparrow-sage px-3 py-1 text-xs font-medium text-sparrow-green">
            <span>{current.tag.icon}</span>
            <span>{current.tag.label}</span>
          </div>
        )}

        {/* Dot indicators */}
        <div className="mt-5 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? 'w-5 bg-sparrow-green'
                  : 'w-1.5 bg-sparrow-rule hover:bg-sparrow-gray'
              }`}
            />
          ))}
        </div>

        {/* Navigation */}
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

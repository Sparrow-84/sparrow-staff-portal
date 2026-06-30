import { useState } from 'react';

export interface TourStep {
  icon: string;
  title: string;
  body: string;
  tag?: { icon: string; label: string } | null;
}

export function useRoomTour(storageKey: string) {
  const seen = typeof window !== 'undefined' && localStorage.getItem(storageKey) === 'done';
  const [open, setOpen] = useState(!seen);

  function dismiss() {
    localStorage.setItem(storageKey, 'done');
    setOpen(false);
  }

  return { tourOpen: open, dismissTour: dismiss };
}

export function RoomTour({
  steps,
  open,
  onDismiss,
}: {
  steps: TourStep[];
  open: boolean;
  onDismiss: () => void;
}) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-sparrow-ink/60 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-white px-6 pb-6 pt-5 shadow-xl">
        <button
          onClick={onDismiss}
          className="absolute right-4 top-4 text-xs text-sparrow-gray hover:text-sparrow-ink"
        >
          Skip tour
        </button>

        <div className="mb-3 text-4xl">{current.icon}</div>

        <h2 className="font-serif text-xl font-semibold text-sparrow-green">{current.title}</h2>

        <p className="mt-2 text-sm leading-relaxed text-sparrow-gray">{current.body}</p>

        {current.tag && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-sparrow-sage px-3 py-1 text-xs font-medium text-sparrow-green">
            <span>{current.tag.icon}</span>
            <span>{current.tag.label}</span>
          </div>
        )}

        <div className="mt-5 flex justify-center gap-1.5">
          {steps.map((_, i) => (
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
            <button onClick={onDismiss} className="btn-primary flex-1">
              Get started
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

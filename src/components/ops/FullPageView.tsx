import { useEffect, useRef, type ReactNode } from 'react';

/** Full-screen record view for the Grants room — same idea as the calendar's meeting-notes
 * screen: the whole window, a narrow details column on the left and lots of room on the
 * right for Notes and history.
 *
 * Stays mounted while closed (just hidden), like the Drawer it replaced, so an autosave
 * that's still counting down when you click Close still goes through. */
export function FullPageView({
  open,
  onClose,
  title,
  subtitle,
  headerExtra,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Sits in the header next to the title — status chips, tab switchers. */
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Start at the top whenever it opens or switches to a different record.
  useEffect(() => {
    if (open) bodyRef.current?.scrollTo(0, 0);
  }, [open, title]);

  // Don't let the page underneath scroll while this covers it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      className={`fixed inset-0 z-50 flex-col bg-white dark:bg-sparrow-dark-surface ${open ? 'flex' : 'hidden'}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-sparrow-rule dark:border-sparrow-dark-border px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-xl font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{title}</h2>
          {subtitle && <p className="truncate text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{subtitle}</p>}
        </div>
        {headerExtra}
        <button onClick={onClose} className="btn-ghost shrink-0" aria-label="Close">
          ✕ Close
        </button>
      </div>
      <div ref={bodyRef} className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  );
}

/** The two-column body: details on the left, the writing space on the right. Stacks into
 * one column on narrow screens (details first). */
export function FullPageColumns({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">{left}</div>
      <div className="min-w-0 space-y-4">{right}</div>
    </div>
  );
}

// "Mark reviewed" for a Collateral item: asks when the next review is (six months out by
// default), the same habit as Done on a Directory check-in. Used on the Collateral tab and on
// Partnerships Home so the button and its question are identical in both places.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { defaultNextCollateralReview, markCollateralReviewed } from '@/lib/partnerships-tabs';

export function CollateralReviewedButton({
  itemId,
  itemName,
  onDone,
  variant = 'link',
  disabled = false,
}: {
  itemId: string;
  itemName: string;
  onDone: () => void;
  /** 'link' = small text link (table cell); 'button' = green pill (Home, next to Done). */
  variant?: 'link' | 'button';
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScroll(e: Event) {
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 296)) });
    setNext(defaultNextCollateralReview());
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      await markCollateralReviewed(itemId, next);
      setOpen(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={
          variant === 'button'
            ? 'mt-1 shrink-0 rounded-lg bg-sparrow-green dark:bg-sparrow-dark-green px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50'
            : 'text-left text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline disabled:opacity-50'
        }
      >
        Mark reviewed
      </button>
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 288 }}
          className="z-50 space-y-2 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3 shadow-lg"
        >
          <p className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
            {itemName} reviewed today. When's the next review?
          </p>
          <input
            type="date"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="field-input mt-0 w-full"
            disabled={busy}
          />
          <p className="text-[11px] leading-snug text-sparrow-gray dark:text-sparrow-dark-gray">
            It will come up on Home two weeks before this date.
          </p>
          {error && <p className="text-xs text-priority-p1">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={busy || !next} className="btn-primary px-3 py-1.5 text-xs">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

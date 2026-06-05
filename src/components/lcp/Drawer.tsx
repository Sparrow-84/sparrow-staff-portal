import type { ReactNode } from 'react';

/** Right-side slide-in panel (matches the Twin Oaks detail panels). */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-sparrow-ink/30 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-sparrow-rule bg-white shadow-xl transition-transform ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between border-b border-sparrow-rule px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-serif text-lg font-semibold">{title}</h2>
            {subtitle && <p className="truncate text-sm text-sparrow-gray">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn-ghost -mr-2 shrink-0" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-sparrow-rule px-5 py-3">{footer}</div>}
      </aside>
    </>
  );
}

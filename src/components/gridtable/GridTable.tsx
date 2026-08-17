import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

// Shared "wide, spreadsheet-like table" engine — resizable/reorderable/hideable
// columns with sticky header + first column, persisted to localStorage, plus a
// matching set of hover-reveals-editable inline cell controls. Extracted from
// the Inventory Register table (first built there) so Partnerships' Directory
// table can have the same wide layout without copy-pasting ~500 lines of
// resize/reorder/sticky-positioning logic that would then need fixing twice.

export interface GridColumn<K extends string> {
  key: K;
  label: string;
  align?: 'right';
  defaultWidth: number;
}

export const MIN_COL_WIDTH = 44;

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Column widths/order/visibility state, persisted per-table via storageKeyPrefix. */
export function useColumnLayout<K extends string>(columns: GridColumn<K>[], storageKeyPrefix: string, defaultHidden: K[] = []) {
  const widthsKey = `${storageKeyPrefix}-col-widths`;
  const hiddenKey = `${storageKeyPrefix}-hidden-cols`;
  const orderKey = `${storageKeyPrefix}-col-order`;
  const defaultOrder = useMemo(() => columns.map((c) => c.key), [columns]);

  const [colWidths, setColWidths] = useState<Record<K, number>>(() => {
    const stored = loadJSON<Record<string, number>>(widthsKey, {});
    const widths = {} as Record<K, number>;
    for (const col of columns) widths[col.key] = stored[col.key] ?? col.defaultWidth;
    return widths;
  });
  const [hiddenCols, setHiddenCols] = useState<Set<K>>(() => new Set(loadJSON<K[]>(hiddenKey, defaultHidden)));
  const [columnOrder, setColumnOrder] = useState<K[]>(() => {
    const stored = loadJSON<K[] | null>(orderKey, null);
    if (!stored) return defaultOrder;
    // Guard against a stored order from before a column was added/removed —
    // keep only known keys, then append any new ones that aren't in it yet.
    const known = stored.filter((k) => defaultOrder.includes(k));
    const missing = defaultOrder.filter((k) => !known.includes(k));
    return [...known, ...missing];
  });
  const [draggingKey, setDraggingKey] = useState<K | null>(null);
  const [dragOverKey, setDragOverKey] = useState<K | null>(null);

  useEffect(() => { localStorage.setItem(widthsKey, JSON.stringify(colWidths)); }, [colWidths, widthsKey]);
  useEffect(() => { localStorage.setItem(hiddenKey, JSON.stringify([...hiddenCols])); }, [hiddenCols, hiddenKey]);
  useEffect(() => { localStorage.setItem(orderKey, JSON.stringify(columnOrder)); }, [columnOrder, orderKey]);

  function toggleColumn(key: K) {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Pick up a column header and drop it on another to move it there — native
  // HTML5 drag-and-drop, not the same mechanism as the resize handle, so the
  // two never compete for the same gesture.
  function handleColumnDrop(targetKey: K) {
    const draggedKey = draggingKey;
    setDraggingKey(null);
    setDragOverKey(null);
    if (!draggedKey || draggedKey === targetKey) return;
    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== draggedKey);
      const targetIdx = next.indexOf(targetKey);
      next.splice(targetIdx, 0, draggedKey);
      return next;
    });
  }

  const orderedColumns = useMemo(
    () => columnOrder.map((key) => columns.find((c) => c.key === key)).filter((c): c is GridColumn<K> => !!c),
    [columnOrder, columns],
  );
  const visibleColumns = useMemo(() => orderedColumns.filter((c) => !hiddenCols.has(c.key)), [orderedColumns, hiddenCols]);
  const gridTemplate = visibleColumns.map((c) => `${colWidths[c.key]}px`).join(' ');

  return {
    colWidths, setColWidths, hiddenCols, toggleColumn, columnOrder,
    orderedColumns, visibleColumns, gridTemplate,
    draggingKey, setDraggingKey, dragOverKey, setDragOverKey, handleColumnDrop,
  };
}

/**
 * Drag-to-resize via the Pointer Events API with explicit pointer capture, plus
 * the header-click-to-sort handler that suppresses the phantom click a resize
 * drag's pointerup leaves behind (which would otherwise also toggle sort).
 */
export function useHeaderInteractions<K extends string>(
  colWidths: Record<K, number>,
  setColWidths: React.Dispatch<React.SetStateAction<Record<K, number>>>,
  sortKey: K,
  setSortKey: (k: K) => void,
  sortDir: 'asc' | 'desc',
  setSortDir: (d: 'asc' | 'desc') => void,
) {
  const suppressSortRef = useRef(false);

  function startResize(key: K, e: ReactPointerEvent<HTMLSpanElement>) {
    e.preventDefault();
    e.stopPropagation();
    suppressSortRef.current = true;
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startWidth = colWidths[key];
    handle.setPointerCapture(e.pointerId);

    function handleMove(ev: PointerEvent) {
      const next = Math.max(MIN_COL_WIDTH, startWidth + (ev.clientX - startX));
      setColWidths((w) => ({ ...w, [key]: next }));
    }
    function handleUp(ev: PointerEvent) {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener('pointermove', handleMove);
      handle.removeEventListener('pointerup', handleUp);
      setTimeout(() => { suppressSortRef.current = false; }, 300);
    }
    handle.addEventListener('pointermove', handleMove);
    handle.addEventListener('pointerup', handleUp);
  }

  function handleHeaderClick(key: K) {
    if (suppressSortRef.current) {
      suppressSortRef.current = false;
      return;
    }
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return { startResize, handleHeaderClick };
}

// ── Shared cell styling — plain text at rest, only reveals as an editable
// control on hover/focus. ──────────────────────────────────────────────────
export const editableBase =
  'w-full bg-transparent border border-transparent rounded px-1 -mx-1 py-0.5 outline-none transition-colors ' +
  'hover:bg-sparrow-mist/50 dark:hover:bg-sparrow-dark-surface2/60 ' +
  'focus:bg-white dark:focus:bg-sparrow-dark-surface focus:border-sparrow-green dark:focus:border-sparrow-dark-green';

export function InlineText({
  value,
  onSave,
  align,
  placeholder,
  type = 'text',
}: {
  value: string;
  onSave: (v: string) => void;
  align?: 'right';
  placeholder?: string;
  type?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur(); }
      }}
      className={`${editableBase} text-sm text-sparrow-ink dark:text-sparrow-dark-ink ${align === 'right' ? 'text-right' : ''}`}
    />
  );
}

export function InlineNumber({
  value,
  onSave,
  min = 0,
}: {
  value: number;
  onSave: (v: number) => void;
  min?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      type="number"
      min={min}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onWheel={(e) => e.currentTarget.blur()}
      onBlur={() => {
        const n = Math.max(min, Number(draft) || 0);
        if (n !== value) onSave(n);
        setDraft(String(n));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setDraft(String(value)); e.currentTarget.blur(); }
      }}
      className={`${editableBase} text-right text-sm text-sparrow-ink dark:text-sparrow-dark-ink`}
    />
  );
}

export function InlineSelect<T extends string>({
  value,
  options,
  onSave,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onSave: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onSave(e.target.value as T)}
      onClick={(e) => e.stopPropagation()}
      className={`${editableBase} cursor-pointer text-sm text-sparrow-ink dark:text-sparrow-dark-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent appearance-none`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// Same editable dropdown as InlineSelect, but each option carries its own
// badge styling so the closed control reads as a color-coded pill — a
// glance-able signal instead of having to read every row's label.
export function InlineBadgeSelect<T extends string>({
  value,
  options,
  onSave,
}: {
  value: T;
  options: { value: T; label: string; badgeClass: string }[];
  onSave: (v: T) => void;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <select
      value={value}
      onChange={(e) => onSave(e.target.value as T)}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center justify-center text-center border border-transparent outline-none appearance-none cursor-pointer text-xs font-medium transition hover:opacity-80 focus:border-sparrow-green dark:focus:border-sparrow-dark-green ${current?.badgeClass ?? ''}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function InlineCheckbox({ checked, onSave }: { checked: boolean; onSave: (v: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onSave(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 accent-sparrow-green cursor-pointer"
    />
  );
}

// Long-text fields expand into a portal-rendered popover anchored to the cell
// rather than a detail panel elsewhere. Rendered via portal (not just
// position:absolute) so it never gets clipped by the table's own scroll
// container, and closes on scroll rather than trying to follow the cell around.
export function ExpandableText({
  value,
  onSave,
  placeholder,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  function openPopover() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 260) });
    setDraft(value ?? '');
    setOpen(true);
  }

  function save() {
    setOpen(false);
    const trimmed = draft.trim();
    if (trimmed !== (value ?? '')) onSave(trimmed || null);
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) save();
    }
    function onScroll(e: Event) {
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      save();
    }
    function onResize() { save(); }
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); openPopover(); }}
        className={`${editableBase} block truncate text-left text-sm ${value ? 'text-sparrow-ink dark:text-sparrow-dark-ink' : 'italic text-sparrow-gray dark:text-sparrow-dark-gray'}`}
      >
        {value || placeholder}
      </button>
      {open && rect && createPortal(
        <div
          ref={popoverRef}
          // React portals still bubble clicks up the *React* tree (not just the
          // DOM tree), so without this a Save/Cancel click here would also
          // trigger the row's own onClick (e.g. opening a detail drawer).
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="z-50 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-2 shadow-lg"
        >
          <textarea
            autoFocus
            rows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value ?? ''); setOpen(false); } }}
            className="w-full resize-none rounded border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-2 text-sm text-sparrow-ink dark:text-sparrow-dark-ink focus:outline-none focus:border-sparrow-green dark:focus:border-sparrow-dark-green"
          />
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={() => { setDraft(value ?? ''); setOpen(false); }} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
              Cancel
            </button>
            <button type="button" onClick={save} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
              Save
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Columns visibility dropdown ─────────────────────────────────────────────

export function ColumnsMenu<K extends string>({
  columns,
  hidden,
  onToggle,
}: {
  columns: { key: K; label: string }[];
  hidden: Set<K>;
  onToggle: (key: K) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          hidden.size > 0
            ? 'border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green/10 text-sparrow-green dark:text-sparrow-dark-green'
            : 'border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2'
        }`}
      >
        Columns{hidden.size > 0 ? ` (${hidden.size} hidden)` : ''} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface shadow-card py-1 max-h-80 overflow-y-auto">
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={!hidden.has(col.key)}
                onChange={() => onToggle(col.key)}
                className="h-4 w-4 accent-sparrow-green"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── The wide-table shell: sticky header + first column, resize/reorder wired
// up, row/cell rendering left to the caller. ────────────────────────────────

export function GridTableShell<K extends string, T>({
  layout,
  sortKey,
  sortDir,
  onHeaderClick,
  startResize,
  items,
  rowKey,
  renderCell,
  rowClassName,
  firstColClassName,
  onRowClick,
  toolbar,
  emptyMessage = 'Nothing to show.',
}: {
  layout: ReturnType<typeof useColumnLayout<K>>;
  sortKey: K;
  sortDir: 'asc' | 'desc';
  onHeaderClick: (key: K) => void;
  startResize: (key: K, e: ReactPointerEvent<HTMLSpanElement>) => void;
  items: T[];
  rowKey: (item: T) => string;
  renderCell: (item: T, key: K) => ReactNode;
  rowClassName?: (item: T) => string;
  firstColClassName?: (item: T) => string;
  onRowClick?: (item: T) => void;
  toolbar?: ReactNode;
  emptyMessage?: string;
}) {
  const {
    visibleColumns, gridTemplate, orderedColumns, hiddenCols, toggleColumn,
    draggingKey, setDraggingKey, dragOverKey, setDragOverKey, handleColumnDrop,
  } = layout;

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        {toolbar}
        <ColumnsMenu columns={orderedColumns} hidden={hiddenCols} onToggle={toggleColumn} />
      </div>

      {/* Sized to fit exactly the visible columns — not stretched to fill the
          surrounding page — so there's no leftover blank strip that reads as
          a phantom extra column when there's more room than the table needs. */}
      <div className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface overflow-hidden" style={{ width: 'fit-content', maxWidth: '100%' }}>
        <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
          <div role="table" style={{ minWidth: 'max-content' }}>
            <div
              role="row"
              className="grid bg-sparrow-green dark:bg-sparrow-dark-green sticky top-0 z-20"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {visibleColumns.map((col, colIdx) => (
                <div
                  key={col.key}
                  role="columnheader"
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDraggingKey(col.key); }}
                  onDragEnd={() => { setDraggingKey(null); setDragOverKey(null); }}
                  onDragOver={(e) => { e.preventDefault(); if (draggingKey && draggingKey !== col.key) setDragOverKey(col.key); }}
                  onDragLeave={() => setDragOverKey((k) => (k === col.key ? null : k))}
                  onDrop={(e) => { e.preventDefault(); handleColumnDrop(col.key); }}
                  onClick={() => onHeaderClick(col.key)}
                  title={col.label}
                  className={`relative border-r border-white/20 px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-white/90 cursor-grab active:cursor-grabbing select-none hover:text-white transition ${col.align === 'right' ? 'text-right' : 'text-left'} ${
                    draggingKey === col.key ? 'opacity-40' : ''
                  } ${dragOverKey === col.key ? 'bg-white/15' : ''} ${
                    colIdx === 0 ? 'sticky left-0 z-10 bg-sparrow-green dark:bg-sparrow-dark-green shadow-[2px_0_4px_-2px_rgba(0,0,0,0.25)]' : ''
                  }`}
                >
                  <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                    {col.label}{' '}
                    {sortKey === col.key && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </span>
                  {/* Resize handle — explicitly non-draggable so it's never picked up
                      as the column-move drag source, only ever the resize gesture. */}
                  <span
                    draggable={false}
                    onPointerDown={(e) => startResize(col.key, e)}
                    style={{ touchAction: 'none' }}
                    className="absolute top-0 right-0 h-full w-3 cursor-col-resize hover:bg-white/20 active:bg-white/30"
                  />
                </div>
              ))}
            </div>

            {items.map((item) => {
              const rCls = rowClassName?.(item) ?? '';
              const firstCls = firstColClassName?.(item) ?? 'bg-white dark:bg-sparrow-dark-surface group-hover:bg-sparrow-mist/30 dark:group-hover:bg-sparrow-dark-surface2/60';
              return (
                <div
                  key={rowKey(item)}
                  role="row"
                  onClick={() => onRowClick?.(item)}
                  className={`group grid border-t border-sparrow-rule dark:border-sparrow-dark-border transition ${rCls}`}
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  {visibleColumns.map((col, colIdx) => {
                    const stickyClass = colIdx === 0 ? `sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] ${firstCls}` : '';
                    const alignClass = col.align === 'right' ? 'text-right' : '';
                    return (
                      <div
                        key={col.key}
                        role="cell"
                        className={`border-r border-sparrow-rule dark:border-sparrow-dark-border px-3 py-2 overflow-hidden ${alignClass} ${stickyClass} flex items-center`}
                      >
                        {renderCell(item, col.key)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        {items.length === 0 && (
          <p className="p-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{emptyMessage}</p>
        )}
      </div>
    </div>
  );
}

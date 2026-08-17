import { useEffect, useRef, useState } from 'react';
import { LABEL_COLORS, LabelPill } from '@/components/LabelPill';

export interface MultiSelectOption {
  value: string;
  label: string;
  icon?: string;
  color?: string; // LABEL_COLORS id — used when icon isn't set
}

// Generic "pick as many as you want" control: a single closed field that opens into a
// checkbox list, instead of a row of individual toggle pills eating up layout space.
// Used for both partner type tags and Interests — optionally lets the user create a brand
// new option inline (name + color) when onCreateNew is provided, matching the calendar
// label picker's create-a-new-label pattern.
export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder = 'None selected',
  disabled = false,
  onCreateNew,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  onCreateNew?: (label: string, color: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('blue');
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  async function handleCreate() {
    if (!newLabel.trim() || !onCreateNew) return;
    setSaving(true);
    try {
      await onCreateNew(newLabel.trim(), newColor);
      setNewLabel('');
      setNewColor('blue');
      setCreating(false);
    } finally {
      setSaving(false);
    }
  }

  const selectedOptions = options.filter((o) => selected.includes(o.value));

  return (
    <div ref={wrapRef} className="relative">
      {/* A plain div, not a button, so each pill below can carry its own remove
          button without illegally nesting <button> inside <button>. */}
      <div
        className={`field-input mt-0 flex min-h-[38px] w-full flex-wrap items-center gap-1 text-left ${
          disabled ? 'opacity-50' : 'cursor-pointer'
        }`}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
      >
        {selectedOptions.length === 0 ? (
          <span className="text-sparrow-gray dark:text-sparrow-dark-gray">{placeholder}</span>
        ) : (
          selectedOptions.map((o) => (
            <span key={o.value} className="inline-flex items-center gap-1">
              {o.color ? (
                <LabelPill label={o.label} color={o.color} />
              ) : (
                <span className="text-sm text-sparrow-ink dark:text-sparrow-dark-ink">
                  {o.icon} {o.label}
                </span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggle(o.value); }}
                  className="leading-none text-sparrow-gray/70 hover:text-priority-p1"
                  aria-label={`Remove ${o.label}`}
                >
                  ×
                </button>
              )}
            </span>
          ))
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-2 shadow-lg">
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {options.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sparrow-mist/60 dark:hover:bg-sparrow-dark-surface2/60"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                  className="h-4 w-4 rounded accent-sparrow-green"
                />
                {o.color ? (
                  <LabelPill label={o.label} color={o.color} />
                ) : (
                  <span className="text-sparrow-ink dark:text-sparrow-dark-ink">{o.icon} {o.label}</span>
                )}
              </label>
            ))}
            {options.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Nothing to pick yet.</p>
            )}
          </div>

          {onCreateNew && (
            <div className="mt-2 border-t border-sparrow-rule dark:border-sparrow-dark-border pt-2">
              {!creating ? (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:bg-sparrow-mist/60 dark:hover:bg-sparrow-dark-surface2/60"
                >
                  + New…
                </button>
              ) : (
                <div className="space-y-2 px-1">
                  <input
                    autoFocus
                    className="field-input mt-0 py-1 text-sm"
                    placeholder="New label name"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
                  />
                  <div className="flex flex-wrap gap-1">
                    {LABEL_COLORS.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setNewColor(c.id)}
                        className={`h-5 w-5 rounded-full ${c.swatch} ${newColor === c.id ? 'ring-2 ring-offset-1 ring-sparrow-ink dark:ring-sparrow-dark-ink dark:ring-offset-sparrow-dark-surface' : ''}`}
                        aria-label={c.id}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCreate()}
                      disabled={!newLabel.trim() || saving}
                      className="btn-primary py-1 text-xs"
                    >
                      {saving ? 'Adding…' : 'Add'}
                    </button>
                    <button type="button" onClick={() => setCreating(false)} className="btn-secondary py-1 text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

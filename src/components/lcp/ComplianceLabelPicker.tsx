import { useEffect, useRef, useState } from 'react';
import { createComplianceLabel, fetchComplianceLabels } from '@/lib/lcp';
import type { ComplianceLabelRow } from '@/lib/lcp-types';
import { LABEL_COLORS, LabelPill } from '@/components/LabelPill';

interface Props {
  value: string | null;
  currentUserId: string;
  onChange: (labelId: string) => void;
}

type View = 'list' | 'create';

function swatchClass(color: string): string {
  return LABEL_COLORS.find((c) => c.id === color)?.swatch ?? 'bg-slate-300';
}

// Shared, permanent label library (mirrors the Calendar/Tasks picker) --
// every full LCP staff member sees the same list and any custom label
// created here is saved for everyone from that point on. No delete/manage
// here on purpose: these are a compliance record, not a personal list --
// a label already used on a note shouldn't be able to disappear out from
// under it.
export function ComplianceLabelPicker({ value, currentUserId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [labels, setLabels] = useState<ComplianceLabelRow[]>([]);

  const [createName, setCreateName] = useState('');
  const [createColor, setCreateColor] = useState('blue');
  const [creating, setCreating] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);

  function loadLabels() {
    void fetchComplianceLabels().then(setLabels);
  }

  useEffect(() => { loadLabels(); }, []);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setView('list');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function openDropdown() {
    setOpen(true);
    setView('list');
    setCreateName('');
    setCreateColor('blue');
  }

  function select(label: ComplianceLabelRow) {
    onChange(label.id);
    setOpen(false);
    setView('list');
  }

  async function handleCreate() {
    if (!createName.trim() || creating) return;
    setCreating(true);
    try {
      const label = await createComplianceLabel(createName.trim(), createColor, currentUserId);
      loadLabels();
      onChange(label.id);
      setOpen(false);
      setView('list');
    } finally {
      setCreating(false);
    }
  }

  const selected = labels.find((l) => l.id === value) ?? null;

  return (
    <div ref={wrapRef} className="relative">
      <label className="field-label">Label</label>
      <button type="button" onClick={openDropdown} className="field-input flex items-center justify-between text-left">
        {selected ? (
          <LabelPill label={selected.name} color={selected.color} />
        ) : (
          <span className="text-sparrow-gray">Pick a label…</span>
        )}
        <svg className="ml-2 h-4 w-4 shrink-0 text-sparrow-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-sparrow-rule bg-white shadow-xl">
          {view === 'list' && (
            <>
              <ul className="py-1">
                {labels.map((label) => {
                  const isSelected = value === label.id;
                  return (
                    <li key={label.id}>
                      <button
                        type="button"
                        onClick={() => select(label)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-sparrow-mist"
                      >
                        <span className={`h-3 w-3 shrink-0 rounded-full ${swatchClass(label.color)}`} />
                        <span className="flex-1 truncate text-sparrow-ink">{label.name}</span>
                        {isSelected && <span className="text-sparrow-green">✓</span>}
                      </button>
                    </li>
                  );
                })}
                {labels.length === 0 && (
                  <li className="px-3 py-2 text-xs text-sparrow-gray">No labels yet — create one below.</li>
                )}
              </ul>
              <div className="border-t border-sparrow-rule">
                <button
                  type="button"
                  onClick={() => setView('create')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-sparrow-green hover:bg-sparrow-mist"
                >
                  <span>+</span> Create label
                </button>
              </div>
            </>
          )}

          {view === 'create' && (
            <div className="space-y-3 p-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setView('list')} className="text-xs text-sparrow-gray hover:text-sparrow-ink">
                  ← Back
                </button>
                <span className="text-xs font-semibold text-sparrow-ink">New label</span>
              </div>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
                placeholder="Label name…"
                className="field-input"
                autoFocus
              />
              <div>
                <p className="mb-1.5 text-xs text-sparrow-gray">Color</p>
                <div className="flex flex-wrap gap-2">
                  {LABEL_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCreateColor(c.id)}
                      className={`h-5 w-5 rounded-full ${c.swatch} transition ${createColor === c.id ? 'ring-2 ring-offset-1 ring-sparrow-ink' : 'opacity-70 hover:opacity-100'}`}
                      aria-label={c.id}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!createName.trim() || creating}
                className="btn-primary w-full text-sm"
              >
                {creating ? 'Saving…' : 'Save label'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

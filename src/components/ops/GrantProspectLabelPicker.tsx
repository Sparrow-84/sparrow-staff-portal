import { useEffect, useRef, useState } from 'react';
import { LABEL_COLORS, LabelPill } from '@/components/LabelPill';
import {
  createProspectLabel,
  deleteProspectLabel,
  fetchProspectLabels,
  updateProspectLabel,
} from '@/lib/grant-prospects';
import type { GrantProspectLabel, GrantProspectLabelKind } from '@/lib/grant-prospects-types';

interface Props {
  kind: GrantProspectLabelKind;
  kindDisplayName: string; // "Tier" or "Source"
  value: string | null; // selected label id
  currentUserId: string;
  onChange: (labelId: string | null) => void;
}

type View = 'list' | 'create' | 'manage';

function swatchClass(color: string): string {
  return LABEL_COLORS.find((c) => c.id === color)?.swatch ?? 'bg-slate-300';
}

// Shared across everyone with Grants access — unlike task labels (personal per-user),
// Tier/Source need to mean the same thing to Andrew, Susanna, and Shelly alike.
export function GrantProspectLabelPicker({ kind, kindDisplayName, value, currentUserId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [labels, setLabels] = useState<GrantProspectLabel[]>([]);

  const [createName, setCreateName] = useState('');
  const [createColor, setCreateColor] = useState('blue');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('blue');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);

  function loadLabels() {
    void fetchProspectLabels(kind).then(setLabels);
  }

  useEffect(() => { loadLabels(); }, [kind]);

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

  const selected = labels.find((l) => l.id === value) ?? null;

  function openDropdown() {
    setOpen(true);
    setView('list');
    setCreateName('');
    setCreateColor('blue');
    setEditingId(null);
  }

  function select(label: GrantProspectLabel) {
    onChange(label.id);
    setOpen(false);
    setView('list');
  }

  function clearSelection() {
    onChange(null);
    setOpen(false);
    setView('list');
  }

  async function handleCreate() {
    if (!createName.trim() || creating) return;
    setCreating(true);
    try {
      const label = await createProspectLabel(kind, createName.trim(), createColor, currentUserId);
      loadLabels();
      onChange(label.id);
      setOpen(false);
      setView('list');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(label: GrantProspectLabel) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await updateProspectLabel(id, editName.trim(), editColor);
      loadLabels();
      setEditingId(null);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await deleteProspectLabel(id);
      loadLabels();
      setEditingId(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <span className="mb-1 block text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray">{kindDisplayName}</span>
      <button
        type="button"
        onClick={openDropdown}
        className="field-input mt-0 flex items-center justify-between text-left"
      >
        {selected ? <LabelPill label={selected.name} color={selected.color} /> : <span className="text-sparrow-gray dark:text-sparrow-dark-gray">Pick or create…</span>}
        <svg className="ml-2 h-4 w-4 shrink-0 text-sparrow-gray dark:text-sparrow-dark-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface shadow-xl">
          {view === 'list' && (
            <>
              <ul className="py-1">
                {labels.map((label) => (
                  <li key={label.id}>
                    <button
                      type="button"
                      onClick={() => select(label)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                    >
                      <span className={`h-3 w-3 shrink-0 rounded-full ${swatchClass(label.color)}`} />
                      <span className="flex-1 truncate text-sparrow-ink dark:text-sparrow-dark-ink">{label.name}</span>
                      {value === label.id && <span className="text-sparrow-green dark:text-sparrow-dark-green">✓</span>}
                    </button>
                  </li>
                ))}
                {labels.length === 0 && (
                  <li className="px-3 py-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No {kindDisplayName.toLowerCase()} labels yet — create one below.</li>
                )}
              </ul>
              <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border">
                {value && (
                  <button type="button" onClick={clearSelection} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2">
                    <span>✕</span> Clear
                  </button>
                )}
                <button type="button" onClick={() => setView('create')} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2">
                  <span>+</span> Create {kindDisplayName.toLowerCase()} label
                </button>
                {labels.length > 0 && (
                  <button type="button" onClick={() => { setView('manage'); setEditingId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2">
                    <span>✎</span> Manage labels
                  </button>
                )}
              </div>
            </>
          )}

          {view === 'create' && (
            <div className="space-y-3 p-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setView('list')} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">← Back</button>
                <span className="text-xs font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">New {kindDisplayName.toLowerCase()} label</span>
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
                <p className="mb-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Color</p>
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
              <button type="button" onClick={() => void handleCreate()} disabled={!createName.trim() || creating} className="btn-primary w-full text-sm">
                {creating ? 'Saving…' : 'Save label'}
              </button>
            </div>
          )}

          {view === 'manage' && (
            <div className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setView('list'); setEditingId(null); }} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">← Back</button>
                <span className="text-xs font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">Manage {kindDisplayName.toLowerCase()} labels</span>
              </div>
              {labels.map((label) => (
                <div key={label.id} className="rounded-lg bg-sparrow-mist/50 p-2">
                  {editingId === label.id ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {LABEL_COLORS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setEditColor(c.id)}
                            className={`h-4 w-4 rounded-full ${c.swatch} transition ${editColor === c.id ? 'ring-2 ring-offset-1 ring-sparrow-ink' : 'opacity-70 hover:opacity-100'}`}
                            aria-label={c.id}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveEdit(label.id); if (e.key === 'Escape') setEditingId(null); }}
                          className="field-input flex-1 py-1 text-xs"
                          autoFocus
                        />
                        <button type="button" onClick={() => void handleSaveEdit(label.id)} disabled={!editName.trim() || savingEdit} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:opacity-70">Save</button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">✕</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`h-3 w-3 shrink-0 rounded-full ${swatchClass(label.color)}`} />
                      <span className="flex-1 truncate text-xs text-sparrow-ink dark:text-sparrow-dark-ink">{label.name}</span>
                      <button type="button" onClick={() => startEdit(label)} className="text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink" aria-label="Edit">✎</button>
                      <button type="button" onClick={() => void handleDelete(label.id)} disabled={deletingId === label.id} className="text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1" aria-label="Delete">🗑</button>
                    </div>
                  )}
                </div>
              ))}
              {labels.length === 0 && <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">No labels to manage yet.</p>}
              <button type="button" onClick={() => setView('create')} className="flex w-full items-center gap-2 pt-1 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:opacity-70">
                <span>+</span> Create new label
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

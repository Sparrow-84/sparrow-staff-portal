import { useEffect, useRef, useState } from 'react';
import {
  createNotepadLabel,
  deleteNotepadLabel,
  updateNotepadLabel,
  type NotepadLabel,
} from '@/lib/notepad';
import { LABEL_COLORS } from '@/components/LabelPill';
import { useRequiredFields } from '@/hooks/useRequiredFields';

interface Props {
  value: string | null; // selected label_id
  labels: NotepadLabel[];
  currentUserId: string;
  onChange: (labelId: string | null) => void;
  onLabelsChanged: () => void;
}

type View = 'list' | 'create' | 'manage';

function labelPillClass(color: string): string {
  return LABEL_COLORS.find((c) => c.id === color)?.pill ?? 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-300';
}

function labelSwatchClass(color: string): string {
  return LABEL_COLORS.find((c) => c.id === color)?.swatch ?? 'bg-slate-300';
}

// Personal-only, unlike CalendarLabelPicker — no scope/org-wide visibility to reconcile,
// so no exact/fuzzy reuse nudging needed: nobody else ever sees or picks from your set.
export function NotepadLabelPicker({ value, labels, currentUserId, onChange, onLabelsChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [createName, setCreateName] = useState('');
  const [createColor, setCreateColor] = useState('blue');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('blue');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { validate: validateCreate, fieldClass: createFieldClass, fieldError: createFieldError, clear: clearCreate, reset: resetCreateValidation } =
    useRequiredFields([{ key: 'np-label-create-name', label: 'Label name', valid: createName.trim().length > 0 }]);
  const { validate: validateEdit, fieldClass: editFieldClass, fieldError: editFieldError, clear: clearEdit, reset: resetEditValidation } =
    useRequiredFields([{ key: 'np-label-edit-name', label: 'Label name', valid: editName.trim().length > 0 }]);

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

  const selectedLabel = labels.find((l) => l.id === value) ?? null;

  function openDropdown() {
    setOpen(true);
    setView('list');
    setCreateName('');
    setCreateColor('blue');
    setEditingId(null);
    resetCreateValidation();
    resetEditValidation();
  }

  function select(labelId: string | null) {
    onChange(labelId);
    setOpen(false);
    setView('list');
  }

  async function handleCreate() {
    if (!validateCreate() || creating) return;
    setCreating(true);
    try {
      const label = await createNotepadLabel(currentUserId, createName.trim(), createColor);
      onLabelsChanged();
      onChange(label.id);
      setOpen(false);
      setView('list');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(label: NotepadLabel) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
    resetEditValidation();
  }

  async function handleSaveEdit(id: string) {
    if (!validateEdit() || savingEdit) return;
    setSavingEdit(true);
    try {
      await updateNotepadLabel(id, { name: editName.trim(), color: editColor });
      onLabelsChanged();
      setEditingId(null);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await deleteNotepadLabel(id);
      if (id === value) onChange(null);
      onLabelsChanged();
      setEditingId(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={openDropdown}
        className="field-input flex items-center justify-between text-left"
      >
        {selectedLabel ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${labelPillClass(selectedLabel.color)}`}>{selectedLabel.name}</span>
        ) : (
          <span className="text-sparrow-gray dark:text-sparrow-dark-gray">No label</span>
        )}
        <svg className="ml-2 h-4 w-4 shrink-0 text-sparrow-gray dark:text-sparrow-dark-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface shadow-xl">
          {view === 'list' && (
            <>
              <ul className="py-1">
                <li>
                  <button
                    type="button"
                    onClick={() => select(null)}
                    className="flex w-full items-center px-3 py-2 text-left text-sm text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                  >
                    No label
                  </button>
                </li>
                {labels.map((label) => (
                  <li key={label.id}>
                    <button
                      type="button"
                      onClick={() => select(label.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                    >
                      <span className={`h-3 w-3 shrink-0 rounded-full ${labelSwatchClass(label.color)}`} />
                      <span className="flex-1 truncate text-sparrow-ink dark:text-sparrow-dark-ink">{label.name}</span>
                      {label.id === value && <span className="text-sparrow-green dark:text-sparrow-dark-green">✓</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border">
                <button
                  type="button"
                  onClick={() => setView('create')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                >
                  <span>+</span> Create label
                </button>
                {labels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setView('manage'); setEditingId(null); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                  >
                    <span>✎</span> Manage labels
                  </button>
                )}
              </div>
            </>
          )}

          {view === 'create' && (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setView('list')} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
                  ← Back
                </button>
                <span className="text-xs font-semibold text-sparrow-ink dark:text-sparrow-dark-ink field-label-required">New label</span>
              </div>
              <input
                id="np-label-create-name"
                type="text"
                value={createName}
                onChange={(e) => { setCreateName(e.target.value); clearCreate('np-label-create-name'); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
                placeholder="Label name…"
                className={createFieldClass('np-label-create-name')}
                autoFocus
              />
              {createFieldError('np-label-create-name') && <p className="mt-1 text-xs text-priority-p1">{createFieldError('np-label-create-name')}</p>}
              <div>
                <p className="mb-1.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Color</p>
                <div className="flex flex-wrap gap-2">
                  {LABEL_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCreateColor(c.id)}
                      className={`h-5 w-5 rounded-full ${c.swatch} transition ${createColor === c.id ? 'ring-2 ring-offset-1 ring-sparrow-ink dark:ring-sparrow-dark-ink dark:ring-offset-sparrow-dark-surface' : 'opacity-70 hover:opacity-100'}`}
                      aria-label={c.id}
                    />
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => void handleCreate()} disabled={creating} className="btn-primary w-full text-sm">
                {creating ? 'Saving…' : 'Save label'}
              </button>
            </div>
          )}

          {view === 'manage' && (
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setView('list'); setEditingId(null); resetEditValidation(); }} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
                  ← Back
                </button>
                <span className="text-xs font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">Manage labels</span>
              </div>
              {labels.map((label) => (
                <div key={label.id} className="rounded-lg bg-sparrow-mist/50 dark:bg-sparrow-dark-surface2/50 p-2">
                  {editingId === label.id ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {LABEL_COLORS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setEditColor(c.id)}
                            className={`h-4 w-4 rounded-full ${c.swatch} transition ${editColor === c.id ? 'ring-2 ring-offset-1 ring-sparrow-ink dark:ring-sparrow-dark-ink dark:ring-offset-sparrow-dark-surface' : 'opacity-70 hover:opacity-100'}`}
                            aria-label={c.id}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="np-label-edit-name"
                          type="text"
                          value={editName}
                          onChange={(e) => { setEditName(e.target.value); clearEdit('np-label-edit-name'); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveEdit(label.id); if (e.key === 'Escape') { setEditingId(null); resetEditValidation(); } }}
                          className={editFieldClass('np-label-edit-name', 'field-input flex-1 py-1 text-xs')}
                          autoFocus
                        />
                        <button type="button" onClick={() => void handleSaveEdit(label.id)} disabled={savingEdit} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:opacity-70">
                          Save
                        </button>
                        <button type="button" onClick={() => { setEditingId(null); resetEditValidation(); }} className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
                          ✕
                        </button>
                      </div>
                      {editFieldError('np-label-edit-name') && <p className="mt-1 text-xs text-priority-p1">{editFieldError('np-label-edit-name')}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`h-3 w-3 shrink-0 rounded-full ${labelSwatchClass(label.color)}`} />
                      <span className="flex-1 truncate text-xs text-sparrow-ink dark:text-sparrow-dark-ink">{label.name}</span>
                      <button type="button" onClick={() => startEdit(label)} className="text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink" aria-label="Edit">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button type="button" onClick={() => void handleDelete(label.id)} disabled={deletingId === label.id} className="text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1" aria-label="Delete">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
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

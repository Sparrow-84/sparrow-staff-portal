import { useEffect, useRef, useState } from 'react';
import { createTaskLabel, deleteTaskLabel, fetchTaskLabels, updateTaskLabel, type TaskLabel } from '@/lib/data';
import { LABEL_COLORS, LabelPill } from '@/components/LabelPill';

interface Props {
  value: { name: string; color: string } | null;
  currentUserId: string;
  onChange: (label: { name: string; color: string } | null) => void;
}

type View = 'list' | 'create' | 'manage';

function swatchClass(color: string): string {
  return LABEL_COLORS.find((c) => c.id === color)?.swatch ?? 'bg-slate-300';
}

// Personal label picker for tasks — every label here belongs to the signed-in
// user alone (RLS-enforced); there's no sharing tier like calendar labels have.
export function TaskLabelPicker({ value, currentUserId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [labels, setLabels] = useState<TaskLabel[]>([]);

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
    void fetchTaskLabels().then(setLabels);
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
    setEditingId(null);
  }

  function select(label: TaskLabel) {
    onChange({ name: label.name, color: label.color });
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
      const label = await createTaskLabel({ name: createName.trim(), color: createColor, createdBy: currentUserId });
      loadLabels();
      onChange({ name: label.name, color: label.color });
      setOpen(false);
      setView('list');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(label: TaskLabel) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
  }

  async function handleSaveEdit(id: string) {
    if (!editName.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await updateTaskLabel(id, { name: editName.trim(), color: editColor });
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
      await deleteTaskLabel(id);
      loadLabels();
      setEditingId(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className="field-label">
        Label <span className="font-normal text-sparrow-gray">(optional)</span>
      </label>
      <button
        type="button"
        onClick={openDropdown}
        className="field-input flex items-center justify-between text-left"
      >
        {value ? (
          <LabelPill label={value.name} color={value.color} />
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
                  const isSelected = value?.name === label.name && value?.color === label.color;
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
                  <li className="px-3 py-2 text-xs text-sparrow-gray">No saved labels yet — create one below.</li>
                )}
              </ul>

              <div className="border-t border-sparrow-rule">
                {value && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-sparrow-gray hover:bg-sparrow-mist"
                  >
                    <span>✕</span> Clear label
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setView('create')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-sparrow-green hover:bg-sparrow-mist"
                >
                  <span>+</span> Create label
                </button>
                {labels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setView('manage'); setEditingId(null); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-sparrow-gray hover:bg-sparrow-mist"
                  >
                    <span>✎</span> Manage labels
                  </button>
                )}
              </div>
            </>
          )}

          {view === 'create' && (
            <div className="space-y-3 p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="text-xs text-sparrow-gray hover:text-sparrow-ink"
                >
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

          {view === 'manage' && (
            <div className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setView('list'); setEditingId(null); }}
                  className="text-xs text-sparrow-gray hover:text-sparrow-ink"
                >
                  ← Back
                </button>
                <span className="text-xs font-semibold text-sparrow-ink">Manage labels</span>
              </div>
              {labels.length === 0 && <p className="text-xs text-sparrow-gray">No labels to manage yet.</p>}
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
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleSaveEdit(label.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="field-input flex-1 py-1 text-xs"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit(label.id)}
                          disabled={!editName.trim() || savingEdit}
                          className="text-xs font-medium text-sparrow-green hover:opacity-70"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-xs text-sparrow-gray hover:text-sparrow-ink"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`h-3 w-3 shrink-0 rounded-full ${swatchClass(label.color)}`} />
                      <span className="flex-1 truncate text-xs text-sparrow-ink">{label.name}</span>
                      <button
                        type="button"
                        onClick={() => startEdit(label)}
                        className="text-sparrow-gray hover:text-sparrow-ink"
                        aria-label="Edit"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(label.id)}
                        disabled={deletingId === label.id}
                        className="text-sparrow-gray hover:text-priority-p1"
                        aria-label="Delete"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={() => setView('create')}
                className="flex w-full items-center gap-2 pt-1 text-xs font-medium text-sparrow-green hover:opacity-70"
              >
                <span>+</span> Create new label
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

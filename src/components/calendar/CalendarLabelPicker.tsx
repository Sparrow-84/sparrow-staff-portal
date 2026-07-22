import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createCalendarLabel,
  deleteCalendarLabel,
  fetchCalendarLabels,
  updateCalendarLabel,
  type CalendarLabel,
  type LabelScope,
} from '@/lib/calendar';
import { LABEL_COLORS } from '@/components/LabelPill';
import type { Department } from '@/lib/types';
import { useRequiredFields } from '@/hooks/useRequiredFields';

interface Props {
  value: string | null;              // selected label_id
  isPersonal: boolean;
  department: Department | null;     // null = posting to All Staff
  currentUserId: string;
  isAdmin: boolean;
  onChange: (labelId: string | null, label: CalendarLabel | null) => void;
}

type View = 'list' | 'create' | 'manage';

function labelPillClass(color: string): string {
  return LABEL_COLORS.find((c) => c.id === color)?.pill ?? 'bg-slate-100 text-slate-600';
}

function labelSwatchClass(color: string): string {
  return LABEL_COLORS.find((c) => c.id === color)?.swatch ?? 'bg-slate-300';
}

export function CalendarLabelPicker({ value, isPersonal, department, currentUserId, isAdmin, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [allLabels, setAllLabels] = useState<CalendarLabel[]>([]);

  // Create state
  const [createName, setCreateName] = useState('');
  const [createColor, setCreateColor] = useState('blue');
  const [creating, setCreating] = useState(false);

  // Manage / edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('blue');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);

  const {
    missingMessage: createMissingMessage,
    validate: validateCreate,
    fieldClass: createFieldClass,
    clear: clearCreate,
    reset: resetCreateValidation,
  } = useRequiredFields([
    { key: 'label-create-name', label: 'Label name', valid: createName.trim().length > 0 },
  ]);

  const {
    missingMessage: editMissingMessage,
    validate: validateEdit,
    fieldClass: editFieldClass,
    clear: clearEdit,
    reset: resetEditValidation,
  } = useRequiredFields([
    { key: 'label-edit-name', label: 'Label name', valid: editName.trim().length > 0 },
  ]);

  function loadLabels() {
    void fetchCalendarLabels().then(setAllLabels);
  }

  useEffect(() => { loadLabels(); }, []);

  // Close dropdown on outside click
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

  // Labels available for the current posting context
  const labels = useMemo(() => {
    return allLabels.filter((l) => {
      if (l.scope === 'preset') return true;
      if (isPersonal) return l.scope === 'personal' && l.created_by === currentUserId;
      if (department === null) return l.scope === 'all_staff';
      return l.scope === 'dept' && l.department === department;
    });
  }, [allLabels, isPersonal, department, currentUserId]);

  // Labels the current user can manage (edit/delete) in this context
  const manageableLabels = useMemo(() => {
    return labels.filter((l) => {
      if (l.is_preset) return false;
      if (l.scope === 'all_staff') return isAdmin;
      return l.created_by === currentUserId || l.scope === 'dept';
    });
  }, [labels, isAdmin, currentUserId]);

  const selectedLabel = allLabels.find((l) => l.id === value) ?? null;

  // Scope for newly created labels
  const newLabelScope = (): LabelScope => {
    if (isPersonal) return 'personal';
    if (department === null) return 'all_staff';
    return 'dept';
  };

  function open_dropdown() {
    setOpen(true);
    setView('list');
    setCreateName('');
    setCreateColor('blue');
    setEditingId(null);
    resetCreateValidation();
    resetEditValidation();
  }

  function select(label: CalendarLabel) {
    onChange(label.id, label);
    setOpen(false);
    setView('list');
  }

  function clearSelection() {
    onChange(null, null);
    setOpen(false);
    setView('list');
  }

  async function handleCreate() {
    if (!validateCreate() || creating) return;
    setCreating(true);
    try {
      const label = await createCalendarLabel({
        name: createName.trim(),
        color: createColor,
        scope: newLabelScope(),
        department: isPersonal || department === null ? null : department,
        created_by: currentUserId,
      });
      loadLabels();
      onChange(label.id, label);
      setOpen(false);
      setView('list');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(label: CalendarLabel) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
    resetEditValidation();
  }

  async function handleSaveEdit(id: string) {
    if (!validateEdit() || savingEdit) return;
    setSavingEdit(true);
    try {
      await updateCalendarLabel(id, { name: editName.trim(), color: editColor });
      loadLabels();
      // If this was the selected label, update the parent with the new name/color
      if (id === value) {
        const updated = { ...allLabels.find((l) => l.id === id)!, name: editName.trim(), color: editColor };
        onChange(id, updated);
      }
      setEditingId(null);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await deleteCalendarLabel(id);
      if (id === value) onChange(null, null);
      loadLabels();
      setEditingId(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className="field-label">Label</label>
      <button
        type="button"
        onClick={open_dropdown}
        className="field-input flex items-center justify-between text-left"
      >
        {selectedLabel ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${labelPillClass(selectedLabel.color)}`}>
            {selectedLabel.name}
          </span>
        ) : (
          <span className="text-sparrow-gray">Pick a label…</span>
        )}
        <svg className="ml-2 h-4 w-4 shrink-0 text-sparrow-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-sparrow-rule bg-white shadow-xl">

          {/* ── List view ─────────────────────────────────── */}
          {view === 'list' && (
            <>
              <ul className="py-1">
                {labels.map((label) => (
                  <li key={label.id}>
                    <button
                      type="button"
                      onClick={() => select(label)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-sparrow-mist"
                    >
                      <span className={`h-3 w-3 shrink-0 rounded-full ${labelSwatchClass(label.color)}`} />
                      <span className="flex-1 truncate text-sparrow-ink">{label.name}</span>
                      {label.id === value && (
                        <span className="text-sparrow-green">✓</span>
                      )}
                    </button>
                  </li>
                ))}
                {labels.length === 0 && (
                  <li className="px-3 py-2 text-xs text-sparrow-gray">No labels yet — create one below.</li>
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
                {manageableLabels.length > 0 && (
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

          {/* ── Create view ───────────────────────────────── */}
          {view === 'create' && (
            <div className="p-3 space-y-3">
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
                id="label-create-name"
                type="text"
                value={createName}
                onChange={(e) => { setCreateName(e.target.value); clearCreate('label-create-name'); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
                placeholder="Label name…"
                className={createFieldClass('label-create-name')}
                autoFocus
              />
              {createMissingMessage && <p className="text-xs text-priority-p1">{createMissingMessage}</p>}
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
                disabled={creating}
                className="btn-primary w-full text-sm"
              >
                {creating ? 'Saving…' : 'Save label'}
              </button>
            </div>
          )}

          {/* ── Manage view ───────────────────────────────── */}
          {view === 'manage' && (
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setView('list'); setEditingId(null); resetEditValidation(); }}
                  className="text-xs text-sparrow-gray hover:text-sparrow-ink"
                >
                  ← Back
                </button>
                <span className="text-xs font-semibold text-sparrow-ink">Manage labels</span>
              </div>
              {manageableLabels.length === 0 && (
                <p className="text-xs text-sparrow-gray">No labels to manage yet.</p>
              )}
              {manageableLabels.map((label) => (
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
                          id="label-edit-name"
                          type="text"
                          value={editName}
                          onChange={(e) => { setEditName(e.target.value); clearEdit('label-edit-name'); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveEdit(label.id); if (e.key === 'Escape') { setEditingId(null); resetEditValidation(); } }}
                          className={editFieldClass('label-edit-name', 'field-input flex-1 py-1 text-xs')}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit(label.id)}
                          disabled={savingEdit}
                          className="text-xs font-medium text-sparrow-green hover:opacity-70"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingId(null); resetEditValidation(); }}
                          className="text-xs text-sparrow-gray hover:text-sparrow-ink"
                        >
                          ✕
                        </button>
                      </div>
                      {editMissingMessage && <p className="text-xs text-priority-p1">{editMissingMessage}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`h-3 w-3 shrink-0 rounded-full ${labelSwatchClass(label.color)}`} />
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

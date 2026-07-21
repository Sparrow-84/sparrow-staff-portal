import { useEffect, useRef, useState } from 'react';
import {
  createStoryTag,
  deleteStoryTag,
  updateStoryTag,
  type StoryTag,
} from '@/lib/stories';
import { LABEL_COLORS } from '@/components/LabelPill';

interface Props {
  value: string[]; // selected tag names
  allTags: StoryTag[];
  currentUserId: string;
  onChange: (names: string[]) => void;
  onTagsChanged: () => void; // parent refetches allTags after create/edit/delete
}

type View = 'list' | 'create' | 'manage';

function pillClass(color: string): string {
  return LABEL_COLORS.find((c) => c.id === color)?.pill ?? 'bg-slate-100 text-slate-600';
}

function swatchClass(color: string): string {
  return LABEL_COLORS.find((c) => c.id === color)?.swatch ?? 'bg-slate-300';
}

export function StoryTagPicker({ value, allTags, currentUserId, onChange, onTagsChanged }: Props) {
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

  const tagByName = new Map(allTags.map((t) => [t.name, t]));
  const selectedTags = value.map((name) => tagByName.get(name) ?? { id: name, name, color: '', created_by: null, created_at: '' });

  function toggle(name: string) {
    if (value.includes(name)) onChange(value.filter((n) => n !== name));
    else onChange([...value, name]);
  }

  function remove(name: string) {
    onChange(value.filter((n) => n !== name));
  }

  async function handleCreate() {
    if (!createName.trim() || creating) return;
    setCreating(true);
    try {
      const tag = await createStoryTag({ name: createName.trim(), color: createColor, created_by: currentUserId });
      onTagsChanged();
      onChange([...value, tag.name]);
      setCreateName('');
      setCreateColor('blue');
      setView('list');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(tag: StoryTag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  }

  async function handleSaveEdit(tag: StoryTag) {
    if (!editName.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await updateStoryTag(tag.id, { name: editName.trim(), color: editColor });
      // If the name changed, the selected-value array (which stores names) needs updating.
      if (editName.trim() !== tag.name && value.includes(tag.name)) {
        onChange(value.map((n) => (n === tag.name ? editName.trim() : n)));
      }
      onTagsChanged();
      setEditingId(null);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(tag: StoryTag) {
    if (deletingId) return;
    setDeletingId(tag.id);
    try {
      await deleteStoryTag(tag.id);
      if (value.includes(tag.name)) onChange(value.filter((n) => n !== tag.name));
      onTagsChanged();
      setEditingId(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className="field-label">Tags</label>

      {selectedTags.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <span
              key={tag.name}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${pillClass(tag.color)}`}
            >
              {tag.name}
              <button
                type="button"
                onClick={() => remove(tag.name)}
                className="opacity-60 hover:opacity-100"
                aria-label={`Remove ${tag.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => { setOpen(true); setView('list'); }}
        className="field-input text-left text-sparrow-gray"
      >
        + Add tag
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-sparrow-rule bg-white shadow-xl">

          {view === 'list' && (
            <>
              <ul className="py-1">
                {allTags.map((tag) => (
                  <li key={tag.id}>
                    <button
                      type="button"
                      onClick={() => toggle(tag.name)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-sparrow-mist"
                    >
                      <span className={`h-3 w-3 shrink-0 rounded-full ${swatchClass(tag.color)}`} />
                      <span className="flex-1 truncate text-sparrow-ink">{tag.name}</span>
                      {value.includes(tag.name) && <span className="text-sparrow-green">✓</span>}
                    </button>
                  </li>
                ))}
                {allTags.length === 0 && (
                  <li className="px-3 py-2 text-xs text-sparrow-gray">No tags yet — create one below.</li>
                )}
              </ul>
              <div className="border-t border-sparrow-rule">
                <button
                  type="button"
                  onClick={() => setView('create')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-sparrow-green hover:bg-sparrow-mist"
                >
                  <span>+</span> Create tag
                </button>
                {allTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setView('manage'); setEditingId(null); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-sparrow-gray hover:bg-sparrow-mist"
                  >
                    <span>✎</span> Manage tags
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setOpen(false); setView('list'); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-sparrow-gray hover:bg-sparrow-mist"
                >
                  Done
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
                <span className="text-xs font-semibold text-sparrow-ink">New tag</span>
              </div>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
                placeholder="Tag name…"
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
                {creating ? 'Saving…' : 'Save tag'}
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
                <span className="text-xs font-semibold text-sparrow-ink">Manage tags</span>
              </div>
              {allTags.map((tag) => (
                <div key={tag.id} className="rounded-lg bg-sparrow-mist/50 p-2">
                  {editingId === tag.id ? (
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
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveEdit(tag); if (e.key === 'Escape') setEditingId(null); }}
                          className="field-input flex-1 py-1 text-xs"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit(tag)}
                          disabled={!editName.trim() || savingEdit}
                          className="text-xs font-medium text-sparrow-green hover:opacity-70"
                        >
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-xs text-sparrow-gray hover:text-sparrow-ink">
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`h-3 w-3 shrink-0 rounded-full ${swatchClass(tag.color)}`} />
                      <span className="flex-1 truncate text-xs text-sparrow-ink">{tag.name}</span>
                      <button type="button" onClick={() => startEdit(tag)} className="text-sparrow-gray hover:text-sparrow-ink" aria-label="Edit">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(tag)}
                        disabled={deletingId === tag.id}
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
                <span>+</span> Create new tag
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

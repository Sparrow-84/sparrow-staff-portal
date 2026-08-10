import { useCallback, useEffect, useState } from 'react';
import {
  addTemplateItem,
  deleteTemplateItem,
  fetchTemplates,
  swapTemplateItems,
  updateTemplateItem,
} from '@/lib/ops';
import type { ChecklistTemplate } from '@/lib/ops-types';

type EditingState = {
  id: number;
  title: string;
  url: string;
  estimated_minutes: string;
  description: string;
};

export function OnboardingEditor() {
  const [items, setItems] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-item form state for top-level and per-parent
  const [addingParentId, setAddingParentId] = useState<number | null | 'top'>(undefined as unknown as 'top');
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addMinutes, setAddMinutes] = useState('');
  const [addDesc, setAddDesc] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await fetchTemplates('onboarding'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load template.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const topLevel = items.filter((i) => i.parent_id === null).sort((a, b) => a.step_no - b.step_no);
  const subtasksOf = (parentId: number) =>
    items.filter((i) => i.parent_id === parentId).sort((a, b) => a.step_no - b.step_no);

  function openAdd(parentId: number | null) {
    setAddingParentId(parentId === null ? 'top' : parentId);
    setAddTitle('');
    setAddUrl('');
    setAddMinutes('');
    setAddDesc('');
    setEditing(null);
  }
  function closeAdd() {
    setAddingParentId(undefined as unknown as 'top');
  }

  async function submitAdd() {
    if (!addTitle.trim()) return;
    setBusy(true);
    try {
      await addTemplateItem({
        kind: 'onboarding',
        title: addTitle.trim(),
        url: addUrl.trim() || null,
        estimated_minutes: addMinutes ? parseInt(addMinutes, 10) : null,
        description: addDesc.trim() || null,
        parent_id: addingParentId === 'top' ? null : (addingParentId as number),
      });
      closeAdd();
      await load();
    } finally {
      setBusy(false);
    }
  }

  function openEdit(item: ChecklistTemplate) {
    setEditing({
      id: item.id,
      title: item.title,
      url: item.url ?? '',
      estimated_minutes: item.estimated_minutes?.toString() ?? '',
      description: item.description ?? '',
    });
    closeAdd();
  }

  async function submitEdit() {
    if (!editing || !editing.title.trim()) return;
    setBusy(true);
    try {
      await updateTemplateItem(editing.id, {
        title: editing.title.trim(),
        url: editing.url.trim() || null,
        estimated_minutes: editing.estimated_minutes ? parseInt(editing.estimated_minutes, 10) : null,
        description: editing.description.trim() || null,
      });
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ChecklistTemplate) {
    const hasChildren = items.some((i) => i.parent_id === item.id);
    const msg = hasChildren
      ? `Delete "${item.title}" and all its subtasks? This can't be undone.`
      : `Delete "${item.title}"?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await deleteTemplateItem(item.id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function moveUp(item: ChecklistTemplate, siblings: ChecklistTemplate[]) {
    const idx = siblings.findIndex((s) => s.id === item.id);
    if (idx <= 0) return;
    const prev = siblings[idx - 1];
    setBusy(true);
    try {
      await swapTemplateItems(item.id, item.step_no, prev.id, prev.step_no);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function moveDown(item: ChecklistTemplate, siblings: ChecklistTemplate[]) {
    const idx = siblings.findIndex((s) => s.id === item.id);
    if (idx >= siblings.length - 1) return;
    const next = siblings[idx + 1];
    setBusy(true);
    try {
      await swapTemplateItems(item.id, item.step_no, next.id, next.step_no);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="py-6 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading template…</p>;
  if (error) return <p className="py-6 text-sm text-priority-p1">{error}</p>;

  const isAddingTop = addingParentId === 'top';

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            This is the master onboarding checklist. Every new staff member gets a copy when you start their onboarding.
            Changes here don't affect in-progress checklists — only new ones started after you save.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {topLevel.map((item, idx) => {
          const subs = subtasksOf(item.id);
          const isEditingThis = editing?.id === item.id;
          const isAddingSubtaskHere = addingParentId === item.id;

          return (
            <li key={item.id} className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
              {/* Top-level item row */}
              <div className="flex items-start gap-2 p-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sparrow-sage text-xs font-semibold text-sparrow-green dark:text-sparrow-dark-green">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {isEditingThis ? (
                    <EditForm
                      state={editing!}
                      onChange={setEditing}
                      onSave={submitEdit}
                      onCancel={() => setEditing(null)}
                      busy={busy}
                    />
                  ) : (
                    <ItemDisplay item={item} />
                  )}
                </div>
                {!isEditingThis && (
                  <div className="flex shrink-0 gap-1">
                    <ReorderButtons
                      onUp={() => moveUp(item, topLevel)}
                      onDown={() => moveDown(item, topLevel)}
                      isFirst={idx === 0}
                      isLast={idx === topLevel.length - 1}
                      disabled={busy}
                    />
                    <button onClick={() => openEdit(item)} disabled={busy} className="rounded px-2 py-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
                      Edit
                    </button>
                    <button onClick={() => remove(item)} disabled={busy} className="rounded px-2 py-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Subtasks */}
              {subs.length > 0 && (
                <ul className="border-t border-sparrow-rule/60 px-3 pb-2 pt-1 space-y-1.5">
                  {subs.map((sub, subIdx) => {
                    const isEditingSub = editing?.id === sub.id;
                    return (
                      <li key={sub.id} className="flex items-start gap-2 rounded-lg bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-2.5 py-2">
                        <span className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">↳</span>
                        <div className="min-w-0 flex-1">
                          {isEditingSub ? (
                            <EditForm
                              state={editing!}
                              onChange={setEditing}
                              onSave={submitEdit}
                              onCancel={() => setEditing(null)}
                              busy={busy}
                            />
                          ) : (
                            <ItemDisplay item={sub} />
                          )}
                        </div>
                        {!isEditingSub && (
                          <div className="flex shrink-0 gap-1">
                            <ReorderButtons
                              onUp={() => moveUp(sub, subs)}
                              onDown={() => moveDown(sub, subs)}
                              isFirst={subIdx === 0}
                              isLast={subIdx === subs.length - 1}
                              disabled={busy}
                            />
                            <button onClick={() => openEdit(sub)} disabled={busy} className="rounded px-2 py-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink">
                              Edit
                            </button>
                            <button onClick={() => remove(sub)} disabled={busy} className="rounded px-2 py-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-priority-p1">
                              Delete
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Add subtask form or button */}
              <div className="border-t border-sparrow-rule/60 px-3 py-2">
                {isAddingSubtaskHere ? (
                  <AddForm
                    title={addTitle}
                    url={addUrl}
                    minutes={addMinutes}
                    desc={addDesc}
                    onTitle={setAddTitle}
                    onUrl={setAddUrl}
                    onMinutes={setAddMinutes}
                    onDesc={setAddDesc}
                    onSave={submitAdd}
                    onCancel={closeAdd}
                    busy={busy}
                    placeholder="Subtask title (e.g. Section 1: Values & Mission)"
                  />
                ) : (
                  <button
                    onClick={() => openAdd(item.id)}
                    disabled={busy}
                    className="text-xs text-sparrow-green dark:text-sparrow-dark-green hover:underline"
                  >
                    + Add subtask
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Add top-level item */}
      <div className="mt-3 rounded-xl border border-dashed border-sparrow-rule dark:border-sparrow-dark-border p-3">
        {isAddingTop ? (
          <AddForm
            title={addTitle}
            url={addUrl}
            minutes={addMinutes}
            desc={addDesc}
            onTitle={setAddTitle}
            onUrl={setAddUrl}
            onMinutes={setAddMinutes}
            onDesc={setAddDesc}
            onSave={submitAdd}
            onCancel={closeAdd}
            busy={busy}
            placeholder="Item title (e.g. Staff Handbook)"
          />
        ) : (
          <button
            onClick={() => openAdd(null)}
            disabled={busy}
            className="w-full text-sm text-sparrow-green dark:text-sparrow-dark-green hover:underline"
          >
            + Add onboarding item
          </button>
        )}
      </div>
    </div>
  );
}

function ItemDisplay({ item }: { item: ChecklistTemplate }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{item.title}</span>
        {item.estimated_minutes && (
          <span className="rounded-full bg-sparrow-rule/60 px-2 py-0.5 text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
            ~{item.estimated_minutes} min
          </span>
        )}
      </div>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 block truncate text-xs text-sparrow-green dark:text-sparrow-dark-green hover:underline"
        >
          {item.url}
        </a>
      )}
      {item.description && (
        <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{item.description}</p>
      )}
    </div>
  );
}

function EditForm({
  state,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  state: EditingState;
  onChange: (s: EditingState) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-2">
      <input
        value={state.title}
        onChange={(e) => onChange({ ...state, title: e.target.value })}
        placeholder="Title"
        className="field-input"
      />
      <div className="flex gap-2">
        <input
          value={state.url}
          onChange={(e) => onChange({ ...state, url: e.target.value })}
          placeholder="Link (Google Doc, Loom, form…)"
          className="field-input mt-0 flex-1"
        />
        <input
          value={state.estimated_minutes}
          onChange={(e) => onChange({ ...state, estimated_minutes: e.target.value })}
          placeholder="Min"
          type="number"
          min={1}
          className="field-input mt-0 w-20 shrink-0"
        />
      </div>
      <input
        value={state.description}
        onChange={(e) => onChange({ ...state, description: e.target.value })}
        placeholder="Short note (optional)"
        className="field-input"
      />
      <div className="flex gap-2">
        <button onClick={onSave} disabled={busy || !state.title.trim()} className="btn-primary">
          Save
        </button>
        <button onClick={onCancel} disabled={busy} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddForm({
  title, url, minutes, desc,
  onTitle, onUrl, onMinutes, onDesc,
  onSave, onCancel, busy, placeholder,
}: {
  title: string; url: string; minutes: string; desc: string;
  onTitle: (v: string) => void; onUrl: (v: string) => void;
  onMinutes: (v: string) => void; onDesc: (v: string) => void;
  onSave: () => void; onCancel: () => void;
  busy: boolean; placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <input value={title} onChange={(e) => onTitle(e.target.value)} placeholder={placeholder} className="field-input" />
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="Link (Google Doc, Loom, form…)"
          className="field-input mt-0 flex-1"
        />
        <input
          value={minutes}
          onChange={(e) => onMinutes(e.target.value)}
          placeholder="Min"
          type="number"
          min={1}
          className="field-input mt-0 w-20 shrink-0"
        />
      </div>
      <input
        value={desc}
        onChange={(e) => onDesc(e.target.value)}
        placeholder="Short note (optional)"
        className="field-input"
      />
      <div className="flex gap-2">
        <button onClick={onSave} disabled={busy || !title.trim()} className="btn-primary">
          Add
        </button>
        <button onClick={onCancel} disabled={busy} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReorderButtons({
  onUp, onDown, isFirst, isLast, disabled,
}: {
  onUp: () => void; onDown: () => void;
  isFirst: boolean; isLast: boolean; disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <button
        onClick={onUp}
        disabled={disabled || isFirst}
        className="flex h-4 w-5 items-center justify-center rounded text-[10px] text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink disabled:opacity-30"
        aria-label="Move up"
      >
        ▲
      </button>
      <button
        onClick={onDown}
        disabled={disabled || isLast}
        className="flex h-4 w-5 items-center justify-center rounded text-[10px] text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink disabled:opacity-30"
        aria-label="Move down"
      >
        ▼
      </button>
    </div>
  );
}

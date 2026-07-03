import { useCallback, useEffect, useState } from 'react';
import { addOrgDocument, deleteOrgDocument, fetchOrgDocuments, updateOrgDocument } from '@/lib/documents';
import { DOCUMENT_CATEGORIES, type OrgDocument } from '@/lib/documents-types';

type EditState = { id: string; title: string; category: string; description: string; url: string };

export function DocumentsEditor() {
  const [docs, setDocs] = useState<OrgDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [adding, setAdding] = useState(false);
  const [addState, setAddState] = useState({ title: '', category: DOCUMENT_CATEGORIES[0], description: '', url: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDocs(await fetchOrgDocuments());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submitAdd() {
    if (!addState.title.trim()) return;
    setBusy(true);
    try {
      await addOrgDocument({
        title: addState.title.trim(),
        category: addState.category,
        description: addState.description.trim() || null,
        url: addState.url.trim() || null,
        sort_order: 0,
      });
      setAdding(false);
      setAddState({ title: '', category: DOCUMENT_CATEGORIES[0], description: '', url: '' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit() {
    if (!editing || !editing.title.trim()) return;
    setBusy(true);
    try {
      await updateOrgDocument(editing.id, {
        title: editing.title.trim(),
        category: editing.category,
        description: editing.description.trim() || null,
        url: editing.url.trim() || null,
      });
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(doc: OrgDocument) {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    setBusy(true);
    try {
      await deleteOrgDocument(doc.id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="py-6 text-sm text-sparrow-gray">Loading documents…</p>;
  if (error) return <p className="py-6 text-sm text-priority-p1">{error}</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-sparrow-gray">
        Add and manage the documents that appear in the staff Documents library. Staff can view but not edit these.
      </p>

      <div className="rounded-xl border border-dashed border-sparrow-rule p-3">
        {adding ? (
          <DocForm
            state={addState}
            onChange={setAddState}
            onSave={submitAdd}
            onCancel={() => setAdding(false)}
            busy={busy}
            saveLabel="Add"
          />
        ) : (
          <button
            onClick={() => { setAdding(true); setEditing(null); }}
            disabled={busy}
            className="w-full text-sm text-sparrow-green hover:underline"
          >
            + Add document
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {docs.map((doc) => (
          <li key={doc.id} className="rounded-xl border border-sparrow-rule bg-white p-3">
            {editing?.id === doc.id ? (
              <DocForm
                state={editing}
                onChange={(s) => setEditing(s as EditState)}
                onSave={submitEdit}
                onCancel={() => setEditing(null)}
                busy={busy}
                saveLabel="Save"
              />
            ) : (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sparrow-ink">{doc.title}</span>
                    <span className="rounded-full bg-sparrow-mist px-2 py-0.5 text-[11px] text-sparrow-gray">
                      {doc.category}
                    </span>
                    {!doc.url && (
                      <span className="rounded-full bg-sparrow-rule/60 px-2 py-0.5 text-[11px] text-sparrow-gray">
                        No link yet
                      </span>
                    )}
                  </div>
                  {doc.description && <p className="mt-0.5 text-xs text-sparrow-gray">{doc.description}</p>}
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 block truncate text-xs text-sparrow-green hover:underline"
                    >
                      {doc.url}
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setEditing({ id: doc.id, title: doc.title, category: doc.category, description: doc.description ?? '', url: doc.url ?? '' })}
                    disabled={busy}
                    className="rounded px-2 py-1 text-xs text-sparrow-gray hover:text-sparrow-ink"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void remove(doc)}
                    disabled={busy}
                    className="rounded px-2 py-1 text-xs text-sparrow-gray hover:text-priority-p1"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

    </div>
  );
}

function DocForm({
  state,
  onChange,
  onSave,
  onCancel,
  busy,
  saveLabel,
}: {
  state: { title: string; category: string; description: string; url: string };
  onChange: (s: { title: string; category: string; description: string; url: string }) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  saveLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={state.title}
          onChange={(e) => onChange({ ...state, title: e.target.value })}
          placeholder="Document title"
          className="field-input mt-0 flex-1"
        />
        <select
          value={state.category}
          onChange={(e) => onChange({ ...state, category: e.target.value })}
          className="field-input mt-0 w-36 shrink-0"
        >
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <input
        value={state.url}
        onChange={(e) => onChange({ ...state, url: e.target.value })}
        placeholder="Link (leave blank if not ready yet)"
        className="field-input"
      />
      <input
        value={state.description}
        onChange={(e) => onChange({ ...state, description: e.target.value })}
        placeholder="Short description (optional)"
        className="field-input"
      />
      <div className="flex gap-2">
        <button onClick={onSave} disabled={busy || !state.title.trim()} className="btn-primary">
          {saveLabel}
        </button>
        <button onClick={onCancel} disabled={busy} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}

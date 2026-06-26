import { useEffect, useState } from 'react';
import {
  RESOURCE_AUDIENCE_LABEL,
  RESOURCE_KIND_LABEL,
  RESOURCE_KINDS,
  type CurriculumSessionDetail,
  type Resource,
  type ResourceAudience,
  type ResourceKind,
} from '@/lib/lcp-types';
import {
  addResource,
  deleteResource,
  fetchSessionResources,
  updateCurriculumSession,
  updateResource,
} from '@/lib/lcp';
import { Drawer } from './Drawer';

interface Props {
  open: boolean;
  session: CurriculumSessionDetail | null;
  unitName: string;
  phaseName: string;
  currentUserId: string;
  onClose: () => void;
  onSaved: (updated: CurriculumSessionDetail) => void;
}

type EditMode = { kind: 'none' } | { kind: 'add' } | { kind: 'edit'; resource: Resource };

export function SessionEditPanel({
  open,
  session,
  unitName,
  phaseName,
  currentUserId,
  onClose,
  onSaved,
}: Props) {
  const [title, setTitle] = useState('');
  const [focus, setFocus] = useState('');
  const [scripture, setScripture] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [resources, setResources] = useState<Resource[]>([]);
  const [resLoading, setResLoading] = useState(false);

  const [editMode, setEditMode] = useState<EditMode>({ kind: 'none' });

  // Unified resource form state (shared between add and edit)
  const [resTitle, setResTitle] = useState('');
  const [resKind, setResKind] = useState<ResourceKind>('handout');
  const [resAudience, setResAudience] = useState<ResourceAudience>('participant');
  const [resUrl, setResUrl] = useState('');
  const [resContent, setResContent] = useState('');
  const [resPrompt, setResPrompt] = useState('');
  const [resLocked, setResLocked] = useState(false);
  const [resSortOrder, setResSortOrder] = useState(0);
  const [resDueDate, setResDueDate] = useState('');
  const [resSaving, setResSaving] = useState(false);
  const [resError, setResError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!session) return;
    setTitle(session.title);
    setFocus(session.focus ?? '');
    setScripture(session.scripture ?? '');
    setSaveError(null);
    setEditMode({ kind: 'none' });
    setResError(null);
    loadResources(session.id);
  }, [session?.id]);

  async function loadResources(sessionId: number) {
    setResLoading(true);
    try {
      setResources(await fetchSessionResources(sessionId));
    } finally {
      setResLoading(false);
    }
  }

  async function saveSession() {
    if (!session || !title.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const patch = {
        title: title.trim(),
        focus: focus.trim() || null,
        scripture: scripture.trim() || null,
      };
      await updateCurriculumSession(session.id, patch);
      onSaved({ ...session, ...patch });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save session.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteResource(id: string) {
    await deleteResource(id);
    setResources((prev) => prev.filter((r) => r.id !== id));
  }

  function openAdd() {
    setResTitle('');
    setResKind('handout');
    setResAudience('participant');
    setResUrl('');
    setResContent('');
    setResPrompt('');
    setResLocked(false);
    setResSortOrder(resources.length);
    setResDueDate('');
    setResError(null);
    setEditMode({ kind: 'add' });
  }

  function openEdit(r: Resource) {
    setResTitle(r.title);
    setResKind(r.kind);
    setResAudience(r.audience);
    setResUrl(r.drive_url ?? '');
    setResContent(r.content ?? '');
    setResPrompt(r.response_prompt ?? '');
    setResLocked(r.locked);
    setResSortOrder(r.sort_order);
    setResDueDate(r.due_date ?? '');
    setResError(null);
    setEditMode({ kind: 'edit', resource: r });
  }

  async function handleSaveResource() {
    if (!session || !resTitle.trim()) return;
    setResSaving(true);
    setResError(null);
    try {
      const patch = {
        title: resTitle.trim(),
        kind: resKind,
        audience: resAudience,
        drive_url: resUrl.trim() || null,
        content: resContent.trim() || null,
        response_prompt: resPrompt.trim() || null,
        locked: resLocked,
        sort_order: resSortOrder,
        due_date: resDueDate || null,
      };
      if (editMode.kind === 'add') {
        await addResource({ ...patch, session_id: session.id, created_by: currentUserId });
      } else if (editMode.kind === 'edit') {
        await updateResource(editMode.resource.id, patch);
      }
      setEditMode({ kind: 'none' });
      await loadResources(session.id);
    } catch (e) {
      setResError(e instanceof Error ? e.message : 'Could not save material.');
    } finally {
      setResSaving(false);
    }
  }

  const dirty =
    session !== null &&
    (title !== session.title ||
      focus !== (session.focus ?? '') ||
      scripture !== (session.scripture ?? ''));

  const isEditing = editMode.kind !== 'none';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={session ? `Session ${session.session_number}` : ''}
      subtitle={session ? `${unitName} · ${phaseName}` : undefined}
      footer={
        <div className="space-y-2">
          {saveError && <p className="text-sm text-priority-p1">{saveError}</p>}
          <button
            onClick={saveSession}
            disabled={!dirty || saving || !title.trim()}
            className="btn-primary w-full"
          >
            {saving ? 'Saving…' : 'Save session'}
          </button>
        </div>
      }
    >
      {session && (
        <div className="space-y-5">
          {/* Session fields */}
          <div>
            <label className="field-label">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label">
              Focus{' '}
              <span className="font-normal text-sparrow-gray">(optional)</span>
            </label>
            <textarea
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              rows={2}
              className="field-input resize-none"
              placeholder="e.g. Honest self-assessment · house drawing created"
            />
          </div>

          <div>
            <label className="field-label">
              Scripture{' '}
              <span className="font-normal text-sparrow-gray">(optional)</span>
            </label>
            <input
              type="text"
              value={scripture}
              onChange={(e) => setScripture(e.target.value)}
              placeholder="e.g. Prov 4:23"
              className="field-input"
            />
          </div>

          {/* Materials */}
          <div className="border-t border-sparrow-rule pt-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-sparrow-ink">Materials</h3>
              {!isEditing && (
                <button
                  onClick={openAdd}
                  className="text-sm text-sparrow-green hover:underline"
                >
                  + Add material
                </button>
              )}
            </div>

            {/* Resource form — shown for both add and edit */}
            {isEditing && (
              <div className="mb-4 space-y-3 rounded-xl border border-sparrow-green/30 bg-sparrow-sage/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
                  {editMode.kind === 'add' ? 'New material' : 'Edit material'}
                </p>

                <div>
                  <label className="field-label">Title</label>
                  <input
                    type="text"
                    value={resTitle}
                    onChange={(e) => setResTitle(e.target.value)}
                    placeholder="e.g. Week 1 Devotional"
                    className="field-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="field-label">Type</label>
                    <select
                      value={resKind}
                      onChange={(e) => setResKind(e.target.value as ResourceKind)}
                      className="field-input"
                    >
                      {RESOURCE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {RESOURCE_KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Audience</label>
                    <select
                      value={resAudience}
                      onChange={(e) => setResAudience(e.target.value as ResourceAudience)}
                      className="field-input"
                    >
                      <option value="participant">{RESOURCE_AUDIENCE_LABEL.participant}</option>
                      <option value="staff">{RESOURCE_AUDIENCE_LABEL.staff}</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="field-label">
                    Content{' '}
                    <span className="font-normal text-sparrow-gray">(paste or write the devotional / reading here)</span>
                  </label>
                  <textarea
                    value={resContent}
                    onChange={(e) => setResContent(e.target.value)}
                    rows={6}
                    className="field-input resize-y"
                    placeholder="Participants will read this directly in the app. Use line breaks to separate paragraphs."
                  />
                </div>

                <div>
                  <label className="field-label">
                    Reflection question{' '}
                    <span className="font-normal text-sparrow-gray">(optional)</span>
                  </label>
                  <textarea
                    value={resPrompt}
                    onChange={(e) => setResPrompt(e.target.value)}
                    rows={2}
                    className="field-input resize-none"
                    placeholder="e.g. What is one thing you want to change this week?"
                  />
                </div>

                <div>
                  <label className="field-label">
                    Google Drive URL{' '}
                    <span className="font-normal text-sparrow-gray">(optional — use if you prefer a Drive link instead)</span>
                  </label>
                  <input
                    type="url"
                    value={resUrl}
                    onChange={(e) => setResUrl(e.target.value)}
                    placeholder="https://drive.google.com/…"
                    className="field-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="field-label">
                      Due date{' '}
                      <span className="font-normal text-sparrow-gray">(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={resDueDate}
                      onChange={(e) => setResDueDate(e.target.value)}
                      className="field-input"
                    />
                    <p className="mt-1 text-xs text-sparrow-gray">Defaults to Sunday midnight if blank.</p>
                  </div>
                  <div>
                    <label className="field-label">Order</label>
                    <input
                      type="number"
                      min={0}
                      value={resSortOrder}
                      onChange={(e) => setResSortOrder(Number(e.target.value))}
                      className="field-input"
                    />
                    <p className="mt-1 text-xs text-sparrow-gray">Lower number = shows first.</p>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={resLocked}
                    onChange={(e) => setResLocked(e.target.checked)}
                    className="h-4 w-4 rounded accent-sparrow-green"
                  />
                  <span className="text-sm text-sparrow-ink">
                    Locked — participants see the title but not the content yet
                  </span>
                </label>

                {resError && <p className="text-sm text-priority-p1">{resError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveResource}
                    disabled={resSaving || !resTitle.trim()}
                    className="btn-primary flex-1"
                  >
                    {resSaving ? 'Saving…' : editMode.kind === 'add' ? 'Add' : 'Save changes'}
                  </button>
                  <button
                    onClick={() => { setEditMode({ kind: 'none' }); setResError(null); }}
                    className="btn-ghost"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Resource list */}
            {!isEditing && (
              resLoading ? (
                <p className="text-sm text-sparrow-gray">Loading…</p>
              ) : resources.length === 0 ? (
                <p className="text-sm text-sparrow-gray">No materials attached yet.</p>
              ) : (
                <ul className="space-y-2">
                  {resources.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-start gap-2 rounded-lg border border-sparrow-rule p-2.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sparrow-ink">{r.title}</p>
                        <p className="mt-0.5 text-xs text-sparrow-gray">
                          {RESOURCE_KIND_LABEL[r.kind]} · {RESOURCE_AUDIENCE_LABEL[r.audience]}
                          {r.locked ? ' · 🔒 Locked' : ''}
                          {r.content
                            ? ' · Has content'
                            : r.drive_url
                              ? ' · Drive link'
                              : ' · No content yet'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <button
                          onClick={() => openEdit(r)}
                          className="text-xs text-sparrow-green hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteResource(r.id)}
                          className="text-xs text-sparrow-gray hover:text-priority-p1"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

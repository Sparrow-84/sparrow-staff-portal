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

  const [addingResource, setAddingResource] = useState(false);
  const [resTitle, setResTitle] = useState('');
  const [resKind, setResKind] = useState<ResourceKind>('handout');
  const [resAudience, setResAudience] = useState<ResourceAudience>('participant');
  const [resUrl, setResUrl] = useState('');
  const [resSaving, setResSaving] = useState(false);
  const [resError, setResError] = useState<string | null>(null);

  // Reset form when a different session is selected
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!session) return;
    setTitle(session.title);
    setFocus(session.focus ?? '');
    setScripture(session.scripture ?? '');
    setSaveError(null);
    setAddingResource(false);
    setResError(null);
    loadResources(session.id);
  }, [session?.id]); // intentional: sync only when selected session changes

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

  async function handleAddResource() {
    if (!session || !resTitle.trim() || !resUrl.trim()) return;
    setResSaving(true);
    setResError(null);
    try {
      await addResource({
        session_id: session.id,
        kind: resKind,
        audience: resAudience,
        title: resTitle.trim(),
        drive_url: resUrl.trim(),
        created_by: currentUserId,
      });
      setResTitle('');
      setResKind('handout');
      setResAudience('participant');
      setResUrl('');
      setAddingResource(false);
      await loadResources(session.id);
    } catch (e) {
      setResError(e instanceof Error ? e.message : 'Could not add material.');
    } finally {
      setResSaving(false);
    }
  }

  const dirty =
    session !== null &&
    (title !== session.title ||
      focus !== (session.focus ?? '') ||
      scripture !== (session.scripture ?? ''));

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
          {/* Session content fields */}
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
              {!addingResource && (
                <button
                  onClick={() => setAddingResource(true)}
                  className="text-sm text-sparrow-green hover:underline"
                >
                  + Add material
                </button>
              )}
            </div>

            {/* Add resource form */}
            {addingResource && (
              <div className="mb-4 space-y-3 rounded-xl border border-sparrow-green/30 bg-sparrow-sage/20 p-3">
                <div>
                  <label className="field-label">Title</label>
                  <input
                    type="text"
                    value={resTitle}
                    onChange={(e) => setResTitle(e.target.value)}
                    placeholder="e.g. Week 1 Handout"
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
                  <label className="field-label">Google Drive URL</label>
                  <input
                    type="url"
                    value={resUrl}
                    onChange={(e) => setResUrl(e.target.value)}
                    placeholder="https://drive.google.com/…"
                    className="field-input"
                  />
                </div>
                {resError && <p className="text-sm text-priority-p1">{resError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleAddResource}
                    disabled={resSaving || !resTitle.trim() || !resUrl.trim()}
                    className="btn-primary flex-1"
                  >
                    {resSaving ? 'Adding…' : 'Add'}
                  </button>
                  <button
                    onClick={() => {
                      setAddingResource(false);
                      setResError(null);
                    }}
                    className="btn-ghost"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Resources list */}
            {resLoading ? (
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
                      <a
                        href={r.drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sparrow-green hover:underline"
                      >
                        {r.title}
                      </a>
                      <p className="mt-0.5 text-xs text-sparrow-gray">
                        {RESOURCE_KIND_LABEL[r.kind]} ·{' '}
                        {RESOURCE_AUDIENCE_LABEL[r.audience]}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteResource(r.id)}
                      className="shrink-0 text-xs text-sparrow-gray hover:text-priority-p1"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

import { useEffect, useState } from 'react';
import {
  RESOURCE_AUDIENCE_LABEL,
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
import { RichTextField } from './RichText';

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
type AddDefaults = { kind: ResourceKind; audience: ResourceAudience; title: string; sortOrder?: number };

const DEVOTIONAL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

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
  const [mentorBrief, setMentorBrief] = useState('');
  const [mentorHandoutEcho, setMentorHandoutEcho] = useState('');
  const [mentorGoingDeeper, setMentorGoingDeeper] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [resources, setResources] = useState<Resource[]>([]);
  const [resLoading, setResLoading] = useState(false);

  const [editMode, setEditMode] = useState<EditMode>({ kind: 'none' });

  // Unified resource form state (shared between add and edit, for every kind)
  const [resTitle, setResTitle] = useState('');
  const [resKind, setResKind] = useState<ResourceKind>('teacher_guide');
  const [resAudience, setResAudience] = useState<ResourceAudience>('staff');
  const [resUrl, setResUrl] = useState('');
  const [resContent, setResContent] = useState('');
  const [resSortOverride, setResSortOverride] = useState<number | null>(null);
  const [resSaving, setResSaving] = useState(false);
  const [resError, setResError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!session) return;
    setTitle(session.title);
    setFocus(session.focus ?? '');
    setScripture(session.scripture ?? '');
    setMentorBrief(session.mentor_brief ?? '');
    setMentorHandoutEcho(session.mentor_handout_echo ?? '');
    setMentorGoingDeeper(session.mentor_going_deeper ?? '');
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
        mentor_brief: mentorBrief.trim() || null,
        mentor_handout_echo: mentorHandoutEcho.trim() || null,
        mentor_going_deeper: mentorGoingDeeper.trim() || null,
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

  function openAdd(defaults: AddDefaults) {
    setResTitle(defaults.title);
    setResKind(defaults.kind);
    setResAudience(defaults.audience);
    setResUrl('');
    setResContent('');
    setResSortOverride(defaults.sortOrder ?? null);
    setResError(null);
    setEditMode({ kind: 'add' });
  }

  function openEdit(r: Resource) {
    setResTitle(r.title);
    setResKind(r.kind);
    setResAudience(r.audience);
    setResUrl(r.drive_url ?? '');
    setResContent(r.content ?? '');
    setResSortOverride(null);
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
        response_prompt: null,
        locked: false,
        sort_order: editMode.kind === 'edit' ? editMode.resource.sort_order : (resSortOverride ?? resources.length),
        due_date: null,
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
      scripture !== (session.scripture ?? '') ||
      mentorBrief !== (session.mentor_brief ?? '') ||
      mentorHandoutEcho !== (session.mentor_handout_echo ?? '') ||
      mentorGoingDeeper !== (session.mentor_going_deeper ?? ''));

  const isEditing = editMode.kind !== 'none';

  const teacherGuide = resources.find((r) => r.kind === 'teacher_guide') ?? null;
  const slideshow = resources.find((r) => r.kind === 'ppt') ?? null;
  const studentHandout = resources.find((r) => r.kind === 'handout') ?? null;
  const devotionals = resources.filter((r) => r.kind === 'devotional' && r.audience === 'participant');
  const devotionalByDay = DEVOTIONAL_DAYS.map((_, i) => devotionals.find((r) => r.sort_order === i) ?? null);
  const extraDevotionals = devotionals.filter((r) => !DEVOTIONAL_DAYS.some((_, i) => r.sort_order === i));

  const mondayReady = mentorBrief.trim() !== '' && mentorHandoutEcho.trim() !== '' && mentorGoingDeeper.trim() !== '';
  const teacherGuideReady = !!teacherGuide && (!!teacherGuide.content || !!teacherGuide.drive_url);
  const slideshowReady = !!slideshow && !!slideshow.drive_url;
  const studentHandoutReady = !!studentHandout && !!studentHandout.drive_url;
  const devotionalsReady = devotionalByDay.every(Boolean);

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
        <div className="space-y-6">
          {/* Completion at a glance */}
          <div className="flex flex-wrap gap-2">
            <StatusChip label="Monday Mentoring" ready={mondayReady} />
            <StatusChip label="Teacher Guide" ready={teacherGuideReady} />
            <StatusChip label="Slideshow" ready={slideshowReady} />
            <StatusChip label="Student Handout" ready={studentHandoutReady} />
            <StatusChip label={`Devotionals (${devotionals.length}/5)`} ready={devotionalsReady} />
          </div>

          {/* Session identity */}
          <div className="space-y-4">
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
          </div>

          {/* Monday Mentoring */}
          <div className="border-t border-sparrow-rule pt-5">
            <h3 className="mb-1 text-sm font-semibold text-sparrow-ink">Monday Mentoring</h3>
            <p className="mb-3 text-xs text-sparrow-gray">
              Read one-on-one with the participant who recently attended this session. Shelly's
              fixed how-to-use instructions show automatically above this every Monday — only the
              three fields below change week to week. Format it wherever you like (Claude, a
              Google Doc) and paste it in — the formatting comes with it.
            </p>
            <div className="space-y-3">
              <div>
                <label className="field-label">Mentor Brief</label>
                <RichTextField
                  key={`brief-${session.id}`}
                  initialValue={mentorBrief}
                  onChange={setMentorBrief}
                  placeholder="Context for the mentor — what this session covered and what to watch for."
                  minHeightRem={5}
                />
              </div>
              <div>
                <label className="field-label">From Her Handout</label>
                <RichTextField
                  key={`handout-${session.id}`}
                  initialValue={mentorHandoutEcho}
                  onChange={setMentorHandoutEcho}
                  placeholder="The questions she already worked through in group — echoed here so the mentor can follow up naturally."
                  minHeightRem={5}
                />
              </div>
              <div>
                <label className="field-label">Going Deeper</label>
                <RichTextField
                  key={`deeper-${session.id}`}
                  initialValue={mentorGoingDeeper}
                  onChange={setMentorGoingDeeper}
                  placeholder="Questions for when she's ready to go further than the group context allowed."
                  minHeightRem={5}
                />
              </div>
            </div>
          </div>

          {/* Thursday Group Materials */}
          <div className="border-t border-sparrow-rule pt-5">
            <h3 className="mb-3 text-sm font-semibold text-sparrow-ink">Thursday Group Materials</h3>
            {resLoading && <p className="mb-2 text-xs text-sparrow-gray">Loading materials…</p>}
            <div className="space-y-2.5">
              <MaterialSlot
                label="Teacher Guide"
                hint="The full script staff read live — devotional included, no separate file"
                resource={teacherGuide}
                onAdd={() => openAdd({ kind: 'teacher_guide', audience: 'staff', title: 'Teacher Guide' })}
                onEdit={() => teacherGuide && openEdit(teacherGuide)}
                onRemove={() => teacherGuide && handleDeleteResource(teacherGuide.id)}
              />
              <MaterialSlot
                label="Slideshow"
                hint="Drive link — projected during the session"
                resource={slideshow}
                onAdd={() => openAdd({ kind: 'ppt', audience: 'staff', title: 'Slideshow' })}
                onEdit={() => slideshow && openEdit(slideshow)}
                onRemove={() => slideshow && handleDeleteResource(slideshow.id)}
              />
              <MaterialSlot
                label="Student Handout"
                hint="Drive link — print before the meeting"
                resource={studentHandout}
                onAdd={() => openAdd({ kind: 'handout', audience: 'participant', title: 'Student Handout' })}
                onEdit={() => studentHandout && openEdit(studentHandout)}
                onRemove={() => studentHandout && handleDeleteResource(studentHandout.id)}
              />
            </div>
          </div>

          {/* Participant Devotionals */}
          <div className="border-t border-sparrow-rule pt-5">
            <h3 className="text-sm font-semibold text-sparrow-ink">Participant Devotionals</h3>
            <p className="mt-0.5 mb-3 text-xs text-sparrow-gray">This week's 5 daily readings, sent directly to participants</p>

            <div className="space-y-2.5">
              {DEVOTIONAL_DAYS.map((day, i) => {
                const r = devotionalByDay[i];
                return (
                  <MaterialSlot
                    key={day}
                    label={day}
                    hint="Not added yet"
                    resource={r}
                    onAdd={() => openAdd({ kind: 'devotional', audience: 'participant', title: `${day} Reading`, sortOrder: i })}
                    onEdit={() => r && openEdit(r)}
                    onRemove={() => r && handleDeleteResource(r.id)}
                  />
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-sparrow-gray">
                Extra devotionals {extraDevotionals.length > 0 ? `(${extraDevotionals.length})` : ''}
              </p>
              {!isEditing && (
                <button
                  onClick={() => openAdd({ kind: 'devotional', audience: 'participant', title: '', sortOrder: resources.length })}
                  className="text-sm text-sparrow-green hover:underline"
                >
                  + Add extra
                </button>
              )}
            </div>
            {extraDevotionals.length > 0 && (
              <ul className="mt-2 space-y-2">
                {extraDevotionals.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 rounded-lg border border-sparrow-rule p-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sparrow-ink">{r.title}</p>
                      <p className="mt-0.5 text-xs text-sparrow-gray">
                        {r.content ? 'Has content' : r.drive_url ? 'Drive link' : 'No content yet'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <button onClick={() => openEdit(r)} className="text-xs text-sparrow-green hover:underline">Edit</button>
                      <button onClick={() => handleDeleteResource(r.id)} className="text-xs text-sparrow-gray hover:text-priority-p1">Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Shared add/edit form for any material — appears wherever a slot or +Add was clicked */}
          {isEditing && (
            <div className="space-y-3 rounded-xl border border-sparrow-green/30 bg-sparrow-sage/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
                {editMode.kind === 'add' ? `New ${RESOURCE_LABEL[resKind]}` : `Edit ${RESOURCE_LABEL[resKind]}`}
              </p>

              <div>
                <label className="field-label">Title</label>
                <input
                  type="text"
                  value={resTitle}
                  onChange={(e) => setResTitle(e.target.value)}
                  className="field-input"
                />
              </div>

              {resKind === 'devotional' && (
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
              )}

              {resKind === 'teacher_guide' && (
                <div>
                  <label className="field-label">
                    Content{' '}
                    <span className="font-normal text-sparrow-gray">
                      (format it in Claude or a Google Doc, then paste — the formatting comes with it)
                    </span>
                  </label>
                  <RichTextField
                    key={editMode.kind === 'edit' ? editMode.resource.id : `new-${resKind}`}
                    initialValue={resContent}
                    onChange={setResContent}
                    placeholder="Read directly in the app — no file to open."
                    minHeightRem={16}
                  />
                </div>
              )}

              {resKind === 'devotional' && (
                <div>
                  <label className="field-label">
                    HTML source{' '}
                    <span className="font-normal text-sparrow-gray">
                      (paste Shelly's raw HTML file source — exactly as she designed it, fonts and colors included; participants see it rendered as-is)
                    </span>
                  </label>
                  <textarea
                    value={resContent}
                    onChange={(e) => setResContent(e.target.value)}
                    rows={10}
                    className="field-input resize-y font-mono text-xs"
                    placeholder="&lt;!DOCTYPE html&gt;…"
                  />
                </div>
              )}

              <div>
                <label className="field-label">
                  Google Drive URL{' '}
                  <span className="font-normal text-sparrow-gray">
                    {resKind === 'ppt' || resKind === 'handout' ? '' : '(optional — use instead of, or alongside, content)'}
                  </span>
                </label>
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
        </div>
      )}
    </Drawer>
  );
}

const RESOURCE_LABEL: Record<ResourceKind, string> = {
  handout: 'Handout',
  teacher_guide: 'Teacher Guide',
  devotional: 'Devotional',
  ppt: 'Slideshow',
  art: 'Art / activity',
  other: 'Material',
};

function StatusChip({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        ready ? 'bg-sparrow-sage text-sparrow-green' : 'border border-sparrow-rule text-sparrow-gray'
      }`}
    >
      <span>{ready ? '✓' : '○'}</span>
      {label}
    </span>
  );
}

function MaterialSlot({
  label,
  hint,
  resource,
  onAdd,
  onEdit,
  onRemove,
}: {
  label: string;
  hint: string;
  resource: Resource | null;
  onAdd: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-sparrow-rule p-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sparrow-ink">{label}</p>
        <p className="mt-0.5 text-xs text-sparrow-gray">
          {resource
            ? resource.content
              ? 'Has content'
              : resource.drive_url
                ? 'Drive link added'
                : 'Added, but empty'
            : hint}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {resource?.drive_url && (
          <a
            href={resource.drive_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-sparrow-green hover:underline"
          >
            Open ↗
          </a>
        )}
        {resource ? (
          <>
            <button onClick={onEdit} className="text-xs text-sparrow-green hover:underline">Edit</button>
            <button onClick={onRemove} className="text-xs text-sparrow-gray hover:text-priority-p1">Remove</button>
          </>
        ) : (
          <button onClick={onAdd} className="text-xs text-sparrow-green hover:underline">+ Add</button>
        )}
      </div>
    </div>
  );
}

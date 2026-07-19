import { useEffect, useState, useTransition } from 'react';
import { Drawer } from '@/components/lcp/Drawer';
import { RichTextEditor } from './RichTextEditor';
import {
  createStory,
  deleteStory,
  updateStory,
  type GatheringMethod,
  type Story,
  type StoryStatus,
  type VerbalConsent,
} from '@/lib/stories';
import type { Profile } from '@/lib/types';

interface Props {
  open: boolean;
  story: Story | null; // null = add mode
  profiles: Profile[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}

const GATHERING_METHODS: { value: GatheringMethod; label: string }[] = [
  { value: 'interview', label: 'Structured Interview' },
  { value: 'google_form', label: 'Google Form' },
  { value: 'freewrite', label: 'Participant Freewrite' },
  { value: 'staff_written', label: 'Staff-Written' },
];

const STATUSES: { value: StoryStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'used', label: 'Used' },
];

const VERBAL_CONSENT_OPTIONS: { value: VerbalConsent; label: string }[] = [
  { value: 'not_asked', label: 'Not yet asked' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const LAYER2_OPTIONS = [
  { value: '', label: 'Unknown' },
  { value: 'true', label: 'Yes — form on file' },
  { value: 'false', label: 'No — form not on file' },
];

export function StoryPanel({ open, story, profiles, currentUserId, onClose, onChanged }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [title, setTitle] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [dateGathered, setDateGathered] = useState('');
  const [gatheringMethod, setGatheringMethod] = useState<GatheringMethod>('interview');
  const [writtenBy, setWrittenBy] = useState('');
  const [status, setStatus] = useState<StoryStatus>('draft');
  const [tagsRaw, setTagsRaw] = useState('');
  const [usedIn, setUsedIn] = useState('');
  const [body, setBody] = useState('');
  const [layer2, setLayer2] = useState(''); // '', 'true', 'false'
  const [layer3Verbal, setLayer3Verbal] = useState<VerbalConsent>('not_asked');
  const [layer3Preview, setLayer3Preview] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    if (story) {
      setTitle(story.title);
      setSubjectName(story.subject_name);
      setDateGathered(story.date_gathered);
      setGatheringMethod(story.gathering_method);
      setWrittenBy(story.written_by ?? '');
      setStatus(story.status);
      setTagsRaw(story.tags.join(', '));
      setUsedIn(story.used_in ?? '');
      setBody(story.body);
      setLayer2(story.layer2_photo_form === null ? '' : String(story.layer2_photo_form));
      setLayer3Verbal(story.layer3_verbal_consent);
      setLayer3Preview(story.layer3_preview_requested);
    } else {
      setTitle('');
      setSubjectName('');
      setDateGathered('');
      setGatheringMethod('interview');
      setWrittenBy(currentUserId);
      setStatus('draft');
      setTagsRaw('');
      setUsedIn('');
      setBody('');
      setLayer2('');
      setLayer3Verbal('not_asked');
      setLayer3Preview(false);
    }
  }, [open, story, currentUserId]);

  function buildPayload() {
    return {
      title: title.trim(),
      subject_name: subjectName.trim(),
      date_gathered: dateGathered,
      gathering_method: gatheringMethod,
      written_by: writtenBy || null,
      status,
      tags: tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      used_in: usedIn.trim() || null,
      body,
      layer2_photo_form: layer2 === '' ? null : layer2 === 'true',
      layer3_verbal_consent: layer3Verbal,
      layer3_preview_requested: layer3Preview,
    };
  }

  function save() {
    if (!title.trim() || !subjectName.trim() || !dateGathered) {
      setError('Title, subject name, and date gathered are required.');
      return;
    }
    startTransition(async () => {
      try {
        if (story) {
          await updateStory(story.id, buildPayload());
        } else {
          await createStory({ ...buildPayload(), created_by: currentUserId });
        }
        onChanged();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });
  }

  function handleDelete() {
    if (!story) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      try {
        await deleteStory(story.id);
        onChanged();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete.');
      }
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={story ? 'Edit story' : 'Add story'}
      subtitle={story ? story.subject_name : undefined}
      footer={
        <div className="flex items-center justify-between gap-2">
          {story ? (
            <button
              onClick={handleDelete}
              disabled={pending}
              className={`text-sm font-medium transition ${
                confirmDelete
                  ? 'text-priority-p1 underline'
                  : 'text-sparrow-gray hover:text-priority-p1'
              }`}
            >
              {confirmDelete ? 'Confirm delete' : 'Delete'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button onClick={save} disabled={pending} className="btn-primary">
              {pending ? 'Saving…' : story ? 'Save' : 'Add story'}
            </button>
          </div>
        </div>
      }
    >
      {/* Title */}
      <label className="field-label" htmlFor="sp-title">
        Title
      </label>
      <input
        id="sp-title"
        className="field-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. From Survival to Stability"
      />

      {/* Subject name */}
      <div className="mt-4">
        <label className="field-label" htmlFor="sp-subject">
          Subject name <span className="font-normal text-sparrow-gray">(participant, with consent)</span>
        </label>
        <input
          id="sp-subject"
          className="field-input"
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value)}
          placeholder="e.g. Maria (first name only)"
        />
      </div>

      {/* Date gathered */}
      <div className="mt-4">
        <label className="field-label" htmlFor="sp-date">
          Date gathered
        </label>
        <input
          id="sp-date"
          type="date"
          className="field-input"
          value={dateGathered}
          onChange={(e) => setDateGathered(e.target.value)}
        />
      </div>

      {/* Gathering method + Written by */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="sp-method">
            Gathering method
          </label>
          <select
            id="sp-method"
            className="field-input"
            value={gatheringMethod}
            onChange={(e) => setGatheringMethod(e.target.value as GatheringMethod)}
          >
            {GATHERING_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="sp-written-by">
            Written by
          </label>
          <select
            id="sp-written-by"
            className="field-input"
            value={writtenBy}
            onChange={(e) => setWrittenBy(e.target.value)}
          >
            <option value="">— unassigned —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Status + Tags */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="sp-status">
            Status
          </label>
          <select
            id="sp-status"
            className="field-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as StoryStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="sp-tags">
            Tags <span className="font-normal text-sparrow-gray">(comma-separated)</span>
          </label>
          <input
            id="sp-tags"
            className="field-input"
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="lcp, impact, 2026"
          />
        </div>
      </div>

      {/* Used in */}
      <div className="mt-4">
        <label className="field-label" htmlFor="sp-used-in">
          Used in <span className="font-normal text-sparrow-gray">(optional — publication or date)</span>
        </label>
        <input
          id="sp-used-in"
          className="field-input"
          value={usedIn}
          onChange={(e) => setUsedIn(e.target.value)}
          placeholder="e.g. Aug 2026 newsletter"
        />
      </div>

      {/* Story body */}
      <div className="mt-4">
        <label className="field-label">Story body</label>
        <RichTextEditor
          key={story?.id ?? 'new'}
          value={body}
          onChange={setBody}
          placeholder="Write the story here…"
          className="mt-1"
        />
      </div>

      {/* Photo consent section */}
      <div className="mt-5 rounded-lg border border-sparrow-rule bg-sparrow-mist/30 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
          Photo consent
        </p>

        {/* Layer 2 */}
        <div className="mt-3">
          <label className="field-label" htmlFor="sp-layer2">
            Layer 2 — Optional photo form on file?
          </label>
          <select
            id="sp-layer2"
            className="field-input"
            value={layer2}
            onChange={(e) => setLayer2(e.target.value)}
          >
            {LAYER2_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Layer 3 verbal */}
        <div className="mt-3">
          <label className="field-label" htmlFor="sp-layer3">
            Layer 3 — Verbal consent to use photo with this story?
          </label>
          <select
            id="sp-layer3"
            className="field-input"
            value={layer3Verbal}
            onChange={(e) => setLayer3Verbal(e.target.value as VerbalConsent)}
          >
            {VERBAL_CONSENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Preview requested — only relevant when Layer 3 = yes */}
        {layer3Verbal === 'yes' && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={layer3Preview}
              onChange={(e) => setLayer3Preview(e.target.checked)}
              className="h-4 w-4 accent-sparrow-green"
            />
            Participant requested to preview before publish
          </label>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-priority-p1">{error}</p>}
    </Drawer>
  );
}

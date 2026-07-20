import { useEffect, useState, useTransition } from 'react';
import { Drawer } from '@/components/lcp/Drawer';
import { RichTextEditor } from './RichTextEditor';
import {
  createStory,
  deleteStory,
  updateStory,
  type GatheringMethod,
  type Story,
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
  { value: 'staff_written', label: 'Staff Testimonial' },
];

const METHOD_LABEL: Record<string, string> = Object.fromEntries(
  GATHERING_METHODS.map((m) => [m.value, m.label]),
);

const VERBAL_CONSENT_OPTIONS: { value: VerbalConsent; label: string }[] = [
  { value: 'not_asked', label: 'Not yet asked' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const VERBAL_CONSENT_LABEL: Record<VerbalConsent, string> = {
  not_asked: 'Not yet asked',
  yes: 'Yes',
  no: 'No',
};

// CONTENT_CLASSES from RichTextEditor, for consistent read-mode rendering of the body.
const BODY_DISPLAY_CLASSES =
  'text-sm leading-relaxed text-sparrow-ink ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 ' +
  '[&_li]:mb-0.5 [&_b]:font-semibold [&_strong]:font-semibold [&_p]:mb-2';

export function StoryPanel({ open, story, profiles, currentUserId, onClose, onChanged }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [copied, setCopied] = useState(false);

  const [title, setTitle] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [subjectAlias, setSubjectAlias] = useState('');
  const [dateGathered, setDateGathered] = useState('');
  const [gatheringMethod, setGatheringMethod] = useState<GatheringMethod>('interview');
  const [loggedBy, setLoggedBy] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [usedIn, setUsedIn] = useState('');
  const [body, setBody] = useState('');
  const [layer3Verbal, setLayer3Verbal] = useState<VerbalConsent>('not_asked');
  const [layer3Preview, setLayer3Preview] = useState(false);

  // Anyone who can actually get into this room — same rule the room itself uses
  // (admins, plus whoever's been individually granted access) — so this list
  // never needs separate maintenance as staff access changes.
  const loggers = profiles.filter((p) => p.role === 'admin' || p.stories_access);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    setCopied(false);
    setMode(story ? 'view' : 'edit');
    if (story) {
      setTitle(story.title);
      setSubjectName(story.subject_name);
      setSubjectAlias(story.subject_alias ?? '');
      setDateGathered(story.date_gathered);
      setGatheringMethod(story.gathering_method);
      setLoggedBy(story.logged_by ?? '');
      setTagsRaw(story.tags.join(', '));
      setUsedIn(story.used_in ?? '');
      setBody(story.body);
      setLayer3Verbal(story.layer3_verbal_consent);
      setLayer3Preview(story.layer3_preview_requested);
    } else {
      setTitle('');
      setSubjectName('');
      setSubjectAlias('');
      setDateGathered('');
      setGatheringMethod('interview');
      setLoggedBy(currentUserId);
      setTagsRaw('');
      setUsedIn('');
      setBody('');
      setLayer3Verbal('not_asked');
      setLayer3Preview(false);
    }
  }, [open, story, currentUserId]);

  function buildPayload() {
    return {
      title: title.trim(),
      subject_name: subjectName.trim(),
      subject_alias: subjectAlias.trim() || null,
      date_gathered: dateGathered,
      gathering_method: gatheringMethod,
      logged_by: loggedBy || null,
      tags: tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      used_in: usedIn.trim() || null,
      body,
      layer3_verbal_consent: layer3Verbal,
      layer3_preview_requested: layer3Preview,
    };
  }

  function save() {
    if (!title.trim() || !subjectName.trim() || !subjectAlias.trim() || !dateGathered) {
      setError('Title, real name, alias, and date gathered are required.');
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
        if (story) setMode('view');
        else onClose();
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

  async function copyBody() {
    const text = story?.body.replace(/<[^>]+>/g, '') ?? '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const loggerName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? '—';

  if (story && mode === 'view') {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        title={story.title}
        subtitle={`${story.subject_name} (as "${story.subject_alias ?? '—'}")`}
        wide
        footer={
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleDelete}
              disabled={pending}
              className={`text-sm font-medium transition ${
                confirmDelete ? 'text-priority-p1 underline' : 'text-sparrow-gray hover:text-priority-p1'
              }`}
            >
              {confirmDelete ? 'Confirm delete' : 'Delete'}
            </button>
            <div className="flex items-center gap-2">
              <button onClick={copyBody} className="btn-ghost">
                {copied ? 'Copied!' : 'Copy story text'}
              </button>
              <button onClick={() => setMode('edit')} className="btn-primary">
                Edit
              </button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="field-label">Gathering method</span>
            <p className="text-sparrow-ink">{METHOD_LABEL[story.gathering_method] ?? story.gathering_method}</p>
          </div>
          <div>
            <span className="field-label">Logged by</span>
            <p className="text-sparrow-ink">{story.logged_by_name ?? loggerName(story.logged_by)}</p>
          </div>
          <div>
            <span className="field-label">Date gathered</span>
            <p className="text-sparrow-ink">{story.date_gathered}</p>
          </div>
          <div>
            <span className="field-label">Used in</span>
            <p className="text-sparrow-ink">{story.used_in || '—'}</p>
          </div>
        </div>

        {story.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1">
            {story.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-sparrow-sage px-2 py-0.5 text-[10px] font-medium text-sparrow-green">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 border-t border-sparrow-rule pt-4">
          <div className={BODY_DISPLAY_CLASSES} dangerouslySetInnerHTML={{ __html: story.body }} />
        </div>

        <div className="mt-5 rounded-lg border border-sparrow-rule bg-sparrow-mist/30 px-4 py-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Photo consent</p>
          <p className="mt-2 text-sparrow-ink">
            Verbal consent to use a photo with this story: <span className="font-medium">{VERBAL_CONSENT_LABEL[story.layer3_verbal_consent]}</span>
          </p>
          {story.layer3_verbal_consent === 'yes' && story.layer3_preview_requested && (
            <p className="mt-1 text-sparrow-gray">Participant requested to preview before publish.</p>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-priority-p1">{error}</p>}
      </Drawer>
    );
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={story ? 'Edit story' : 'Add story'}
      subtitle={story ? story.subject_name : undefined}
      wide
      footer={
        <div className="flex items-center justify-between gap-2">
          {story ? (
            <button
              onClick={handleDelete}
              disabled={pending}
              className={`text-sm font-medium transition ${
                confirmDelete ? 'text-priority-p1 underline' : 'text-sparrow-gray hover:text-priority-p1'
              }`}
            >
              {confirmDelete ? 'Confirm delete' : 'Delete'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => (story ? setMode('view') : onClose())} className="btn-ghost">
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

      {/* Real name + Alias */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="sp-subject">
            Real name <span className="font-normal text-sparrow-gray">(internal only)</span>
          </label>
          <input
            id="sp-subject"
            className="field-input"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            placeholder="e.g. Maria R."
          />
        </div>
        <div>
          <label className="field-label" htmlFor="sp-alias">
            Alias <span className="font-normal text-sparrow-gray">(used publicly)</span>
          </label>
          <input
            id="sp-alias"
            className="field-input"
            value={subjectAlias}
            onChange={(e) => setSubjectAlias(e.target.value)}
            placeholder="e.g. Grace"
          />
        </div>
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

      {/* Gathering method + Logged by */}
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
          <label className="field-label" htmlFor="sp-logged-by">
            Logged by
          </label>
          <select
            id="sp-logged-by"
            className="field-input"
            value={loggedBy}
            onChange={(e) => setLoggedBy(e.target.value)}
          >
            <option value="">— unassigned —</option>
            {loggers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tags + Used in */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="sp-tags">
            Tags <span className="font-normal text-sparrow-gray">(comma-separated)</span>
          </label>
          <input
            id="sp-tags"
            className="field-input"
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="lcp, housing, newsletter"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="sp-used-in">
            Used in <span className="font-normal text-sparrow-gray">(optional)</span>
          </label>
          <input
            id="sp-used-in"
            className="field-input"
            value={usedIn}
            onChange={(e) => setUsedIn(e.target.value)}
            placeholder="e.g. Aug 2026 newsletter"
          />
        </div>
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

        <div className="mt-3">
          <label className="field-label" htmlFor="sp-layer3">
            Verbal consent to use a photo with this story?
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

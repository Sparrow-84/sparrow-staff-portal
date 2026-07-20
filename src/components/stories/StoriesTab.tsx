import type { Profile } from '@/lib/types';
import type { Story } from '@/lib/stories';

interface Props {
  stories: Story[];
  profiles: Profile[];
  currentUserId: string;
  onAdd: () => void;
  onEdit: (story: Story) => void;
}

const METHOD_LABEL: Record<string, string> = {
  interview: 'Interview',
  google_form: 'Google Form',
  freewrite: 'Freewrite',
  staff_written: 'Staff Testimonial',
};

export function StoriesTab({ stories, onAdd, onEdit }: Props) {
  return (
    <div>
      {/* Rules box */}
      <div className="rounded-xl border border-sparrow-gold/30 bg-sparrow-cream px-4 py-3 text-sm">
        <p className="font-semibold text-sparrow-ink">Consent required by gathering method</p>
        <ul className="mt-2 space-y-1 text-sparrow-gray">
          <li>
            <span className="font-medium text-sparrow-ink">Structured interview</span> — Written consent
            before the interview.
          </li>
          <li>
            <span className="font-medium text-sparrow-ink">Google Form</span> — Consent is built into
            the form.
          </li>
          <li>
            <span className="font-medium text-sparrow-ink">Participant freewrite</span> — Participant
            wrote their own story.
          </li>
          <li>
            <span className="font-medium text-sparrow-ink">Staff Testimonial</span> — The subject is a
            staff member; get their consent for the written piece itself before publishing.
          </li>
        </ul>
        <p className="mt-2 border-t border-sparrow-gold/30 pt-2 text-xs text-sparrow-gray">
          Photo consent is tracked separately, per story — see the "Photo consent" section when you
          open a story, and the Photo &amp; Media Release tab for the underlying signed forms.
        </p>
      </div>

      {/* Header row */}
      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm text-sparrow-gray">
          {stories.length} {stories.length === 1 ? 'story' : 'stories'}
        </p>
        <button onClick={onAdd} className="btn-primary">
          + Add story
        </button>
      </div>

      {/* Story list */}
      {stories.length === 0 ? (
        <p className="mt-6 text-center text-sm text-sparrow-gray">
          No stories yet. Add the first one to get started.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-sparrow-rule rounded-xl border border-sparrow-rule bg-white">
          {stories.map((s) => (
            <button
              key={s.id}
              onClick={() => onEdit(s)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-sparrow-mist/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sparrow-ink">{s.title}</p>
                <p className="mt-0.5 truncate text-xs text-sparrow-gray">
                  {s.subject_name}
                  {s.subject_alias ? ` (as "${s.subject_alias}")` : ''} · {METHOD_LABEL[s.gathering_method] ?? s.gathering_method}
                  {s.logged_by_name ? ` · logged by ${s.logged_by_name}` : ''}
                </p>
                {s.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-sparrow-sage px-2 py-0.5 text-[10px] font-medium text-sparrow-green"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="shrink-0 text-sparrow-gray">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

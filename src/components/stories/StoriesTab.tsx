import type { Profile } from '@/lib/types';
import type { Story, StoryStatus } from '@/lib/stories';

interface Props {
  stories: Story[];
  profiles: Profile[];
  currentUserId: string;
  onAdd: () => void;
  onEdit: (story: Story) => void;
}

const STATUS_CHIP: Record<StoryStatus, string> = {
  draft: 'bg-amber-100 text-amber-800',
  ready: 'bg-sparrow-green/10 text-sparrow-green',
  used: 'bg-slate-100 text-slate-600',
};

const STATUS_LABEL: Record<StoryStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  used: 'Used',
};

const METHOD_LABEL: Record<string, string> = {
  interview: 'Interview',
  google_form: 'Google Form',
  freewrite: 'Freewrite',
  staff_written: 'Staff-written',
};

function ConsentIcon({ value }: { value: boolean | null | string }) {
  if (value === null || value === 'not_asked' || value === undefined) {
    return <span className="text-sparrow-gray/40" title="Unknown / not asked">—</span>;
  }
  if (value === true || value === 'yes') {
    return <span className="text-sparrow-green" title="Yes">✓</span>;
  }
  return <span className="text-priority-p1" title="No">✗</span>;
}

export function StoriesTab({ stories, onAdd, onEdit }: Props) {
  return (
    <div>
      {/* Rules box */}
      <div className="rounded-xl border border-sparrow-gold/30 bg-sparrow-cream px-4 py-3 text-sm">
        <p className="font-semibold text-sparrow-ink">Consent required by gathering method</p>
        <ul className="mt-2 space-y-1 text-sparrow-gray">
          <li>
            <span className="font-medium text-sparrow-ink">Structured interview</span> — Written consent
            before the interview. Layer 3 verbal consent required before publishing with a photo.
          </li>
          <li>
            <span className="font-medium text-sparrow-ink">Google Form</span> — Consent is built into
            the form. Confirm Layer 2 photo form is on file before using a photo.
          </li>
          <li>
            <span className="font-medium text-sparrow-ink">Participant freewrite</span> — Participant
            wrote their own story. Still needs Layer 3 verbal consent before a photo appears beside it.
          </li>
          <li>
            <span className="font-medium text-sparrow-ink">Staff-written</span> — Must obtain consent
            for the written piece itself before publishing. Layer 2 + 3 required for any photo.
          </li>
        </ul>
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
              {/* Title + subject */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sparrow-ink">{s.title}</p>
                <p className="mt-0.5 truncate text-xs text-sparrow-gray">
                  {s.subject_name} · {METHOD_LABEL[s.gathering_method] ?? s.gathering_method}
                  {s.written_by_name ? ` · ${s.written_by_name}` : ''}
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

              {/* Status + consent icons */}
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[s.status]}`}
                >
                  {STATUS_LABEL[s.status]}
                </span>
                <div className="flex items-center gap-2 text-xs text-sparrow-gray">
                  <span title="Layer 2 photo form">
                    📷 <ConsentIcon value={s.layer2_photo_form} />
                  </span>
                  <span title="Layer 3 verbal consent">
                    🎙 <ConsentIcon value={s.layer3_verbal_consent} />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

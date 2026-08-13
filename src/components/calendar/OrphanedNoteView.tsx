import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  noteId: string;
  scope: 'private' | 'shared';
  title: string;
  startsAt: string;
  onClose: () => void;
}

const CONTENT_CLASSES =
  'text-sm leading-relaxed text-sparrow-ink dark:text-sparrow-dark-ink ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 ' +
  '[&_li]:mb-0.5 [&_b]:font-semibold [&_strong]:font-semibold [&_p]:mb-2';

/** Read-only view of notes whose meeting has since been deleted from the calendar. */
export function OrphanedNoteView({ noteId, scope, title, startsAt, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<{ prep: string; live: string; shared: string }>({ prep: '', live: '', shared: '' });

  useEffect(() => {
    async function load() {
      if (scope === 'private') {
        const { data } = await supabase.from('meeting_notes').select('prep_notes, live_notes').eq('id', noteId).maybeSingle();
        setContent({ prep: data?.prep_notes ?? '', live: data?.live_notes ?? '', shared: '' });
      } else {
        const { data } = await supabase.from('event_shared_notes').select('notes').eq('id', noteId).maybeSingle();
        setContent({ prep: '', live: '', shared: data?.notes ?? '' });
      }
      setLoading(false);
    }
    void load();
  }, [noteId, scope]);

  const dateLabel = new Date(startsAt).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-sparrow-dark-surface">
      <div className="flex items-center justify-between border-b border-sparrow-rule dark:border-sparrow-dark-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{title}</h1>
          <p className="mt-0.5 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{dateLabel}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border px-4 py-2 text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
        >
          Close
        </button>
      </div>

      <div className="border-b border-priority-p1/30 bg-priority-p1/5 px-6 py-3">
        <p className="text-sm text-priority-p1">
          This meeting was deleted from the calendar. Your notes were kept and are shown here read-only.
        </p>
      </div>

      {loading ? (
        <p className="p-6 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {scope === 'private' ? (
            <div className="mx-auto max-w-3xl divide-y divide-sparrow-rule dark:divide-sparrow-dark-border px-6 py-6">
              <div className="pb-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Prep Notes</p>
                {content.prep ? (
                  <div className={CONTENT_CLASSES} dangerouslySetInnerHTML={{ __html: content.prep }} />
                ) : (
                  <p className="text-sm text-sparrow-gray/60">Empty</p>
                )}
              </div>
              <div className="pt-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-green dark:text-sparrow-dark-green">Live Notes</p>
                {content.live ? (
                  <div className={CONTENT_CLASSES} dangerouslySetInnerHTML={{ __html: content.live }} />
                ) : (
                  <p className="text-sm text-sparrow-gray/60">Empty</p>
                )}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-6 py-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Shared Notes</p>
              {content.shared ? (
                <div className={CONTENT_CLASSES} dangerouslySetInnerHTML={{ __html: content.shared }} />
              ) : (
                <p className="text-sm text-sparrow-gray/60">Empty</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

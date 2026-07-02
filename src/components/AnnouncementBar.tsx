import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  createAnnouncement,
  dismissAnnouncement,
  fetchAnnouncements,
  type Announcement,
} from '@/lib/social';

// A single slim bar of team-wide notices on the home screen (admins post/dismiss).
export function AnnouncementBar() {
  const { profile } = useAuth();
  const isAdmin = !!profile;
  const [items, setItems] = useState<Announcement[]>([]);
  const [posting, setPosting] = useState(false);
  const [draft, setDraft] = useState('');

  async function load() {
    try {
      setItems(await fetchAnnouncements());
    } catch {
      /* non-critical; bar just stays empty */
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function post() {
    if (!draft.trim() || !profile) return;
    await createAnnouncement(draft.trim(), profile.id);
    setDraft('');
    setPosting(false);
    void load();
  }
  async function dismiss(id: string) {
    await dismissAnnouncement(id);
    void load();
  }

  if (items.length === 0 && !isAdmin) return null;

  return (
    <div className="mb-6 rounded-xl border border-sparrow-cream bg-sparrow-cream/60 px-4 py-2 text-sm">
      <div className="flex flex-col gap-1">
        {items.map((a) => (
          <div key={a.id} className="flex items-center gap-2">
            <span aria-hidden>📣</span>
            <span className="flex-1 text-sparrow-ink">{a.body}</span>
            {isAdmin && (
              <button
                onClick={() => dismiss(a.id)}
                className="text-xs text-sparrow-gray hover:text-red-600 whitespace-nowrap"
                aria-label="Clear announcement for everyone"
                title="Removes this announcement for all staff"
              >
                Clear for all
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && isAdmin && (
          <span className="text-sparrow-gray">No announcements.</span>
        )}
      </div>

      {isAdmin &&
        (posting ? (
          <div className="mt-2 flex gap-2">
            <input
              className="field-input !mt-0 flex-1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Team-wide notice…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void post();
                if (e.key === 'Escape') setPosting(false);
              }}
              autoFocus
            />
            <button onClick={() => void post()} className="btn-primary">
              Post
            </button>
            <button onClick={() => setPosting(false)} className="btn-ghost">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setPosting(true)}
            className="mt-1 text-xs font-medium text-sparrow-green hover:underline"
          >
            + Post announcement
          </button>
        ))}
    </div>
  );
}

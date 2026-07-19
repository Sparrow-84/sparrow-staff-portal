import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchProfiles } from '@/lib/data';
import {
  getLayer2Consents,
  getMediaEvents,
  getStories,
  type Story,
  type StoryLayer2Consent,
  type StoryMediaEvent,
} from '@/lib/stories';
import type { Profile } from '@/lib/types';
import { StoriesTab } from './StoriesTab';
import { MediaReleaseTab } from './MediaReleaseTab';
import { StoryPanel } from './StoryPanel';

type Tab = 'stories' | 'media';

const TABS: { key: Tab; label: string }[] = [
  { key: 'stories', label: 'Stories' },
  { key: 'media', label: 'Photo & Media Release' },
];

export function StoriesRoom() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('stories');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stories, setStories] = useState<Story[]>([]);
  const [events, setEvents] = useState<StoryMediaEvent[]>([]);
  const [consents, setConsents] = useState<StoryLayer2Consent[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);

  const load = useCallback(async () => {
    try {
      const [ss, ev, co, pp] = await Promise.all([
        getStories(),
        getMediaEvents(),
        getLayer2Consents(),
        fetchProfiles(),
      ]);
      setStories(ss);
      setEvents(ev);
      setConsents(co);
      setProfiles(pp);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Stories & Media room.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openAdd() {
    setSelectedStory(null);
    setPanelOpen(true);
  }

  function openEdit(story: Story) {
    setSelectedStory(story);
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
  }

  if (loading) return <p className="p-8 text-sm text-sparrow-gray">Loading Stories &amp; Media…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Room header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Stories &amp; Media</h1>
          <p className="mt-1 text-sm text-sparrow-gray">
            {stories.length} {stories.length === 1 ? 'story' : 'stories'} ·{' '}
            {events.length} {events.length === 1 ? 'event' : 'events'} logged ·{' '}
            {consents.length} photo {consents.length === 1 ? 'form' : 'forms'} on file
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="mt-6 flex border-b border-sparrow-rule">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === t.key
                ? '-mb-px border-b-2 border-sparrow-green text-sparrow-green'
                : 'text-sparrow-gray hover:text-sparrow-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === 'stories' && (
          <StoriesTab
            stories={stories}
            profiles={profiles}
            currentUserId={profile?.id ?? ''}
            onAdd={openAdd}
            onEdit={openEdit}
          />
        )}
        {activeTab === 'media' && (
          <MediaReleaseTab
            events={events}
            consents={consents}
            currentUserId={profile?.id ?? ''}
            onChanged={load}
          />
        )}
      </div>

      {/* Story slide-over panel */}
      <StoryPanel
        open={panelOpen}
        story={selectedStory}
        profiles={profiles}
        currentUserId={profile?.id ?? ''}
        onClose={closePanel}
        onChanged={load}
      />
    </div>
  );
}

import { supabase } from './supabase';

// ── Domain types ──────────────────────────────────────────────────────

export type GatheringMethod = 'interview' | 'google_form' | 'freewrite' | 'staff_written';
export type VerbalConsent = 'yes' | 'no' | 'not_asked';

export interface Story {
  id: string;
  title: string;
  subject_name: string;
  subject_alias: string | null;
  gathering_method: GatheringMethod;
  logged_by: string | null;
  logged_by_name: string | null; // joined from profiles
  date_gathered: string;
  body: string;
  layer3_verbal_consent: VerbalConsent;
  layer3_preview_requested: boolean;
  tags: string[];
  used_in: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoryInput {
  title: string;
  subject_name: string;
  subject_alias: string | null;
  gathering_method: GatheringMethod;
  logged_by: string | null;
  date_gathered: string;
  body: string;
  layer3_verbal_consent: VerbalConsent;
  layer3_preview_requested: boolean;
  tags: string[];
  used_in: string | null;
  created_by?: string | null;
}

export interface StoryMediaEvent {
  id: string;
  event_name: string;
  event_date: string;
  sandwich_board_posted: boolean;
  notes: string | null;
  logged_by: string | null;
  created_at: string;
}

export interface StoryMediaEventInput {
  event_name: string;
  event_date: string;
  sandwich_board_posted: boolean;
  notes: string | null;
  logged_by: string | null;
}

export interface StoryLayer2Consent {
  id: string;
  participant_name: string;
  form_signed: boolean;
  date_signed: string | null;
  covers_children: boolean;
  notes: string | null;
  logged_by: string | null;
  created_at: string;
}

export interface StoryLayer2ConsentInput {
  participant_name: string;
  form_signed: boolean;
  date_signed: string | null;
  covers_children: boolean;
  notes: string | null;
  logged_by: string | null;
}

// ── Stories ───────────────────────────────────────────────────────────

const STORY_SELECT =
  '*, logged_by_profile:profiles!stories_logged_by_fkey(full_name)';

/** Fetch all stories, with the writer's name joined in. */
export async function getStories(): Promise<Story[]> {
  const { data, error } = await supabase
    .from('stories')
    .select(STORY_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).map(normalizeStory);
}

export async function createStory(input: StoryInput): Promise<void> {
  const { error } = await supabase.from('stories').insert(input);
  if (error) throw new Error(error.message);
}

export async function updateStory(id: string, patch: Partial<StoryInput>): Promise<void> {
  const { error } = await supabase
    .from('stories')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteStory(id: string): Promise<void> {
  const { error } = await supabase.from('stories').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Media Events (Layer 1) ────────────────────────────────────────────

export async function getMediaEvents(): Promise<StoryMediaEvent[]> {
  const { data, error } = await supabase
    .from('story_media_events')
    .select('*')
    .order('event_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as StoryMediaEvent[];
}

export async function createMediaEvent(input: StoryMediaEventInput): Promise<void> {
  const { error } = await supabase.from('story_media_events').insert(input);
  if (error) throw new Error(error.message);
}

// ── Layer 2 Consents ─────────────────────────────────────────────────

export async function getLayer2Consents(): Promise<StoryLayer2Consent[]> {
  const { data, error } = await supabase
    .from('story_layer2_consents')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as StoryLayer2Consent[];
}

export async function createLayer2Consent(input: StoryLayer2ConsentInput): Promise<void> {
  const { error } = await supabase.from('story_layer2_consents').insert(input);
  if (error) throw new Error(error.message);
}

// ── Internal helpers ──────────────────────────────────────────────────

function normalizeStory(raw: unknown): Story {
  const r = raw as Record<string, unknown>;
  const loggerProfile = r['logged_by_profile'] as { full_name?: string } | null;
  return {
    id: r['id'] as string,
    title: r['title'] as string,
    subject_name: r['subject_name'] as string,
    subject_alias: (r['subject_alias'] as string | null) ?? null,
    gathering_method: r['gathering_method'] as GatheringMethod,
    logged_by: (r['logged_by'] as string | null) ?? null,
    logged_by_name: loggerProfile?.full_name ?? null,
    date_gathered: r['date_gathered'] as string,
    body: (r['body'] as string) ?? '',
    layer3_verbal_consent: (r['layer3_verbal_consent'] as VerbalConsent) ?? 'not_asked',
    layer3_preview_requested: (r['layer3_preview_requested'] as boolean) ?? false,
    tags: (r['tags'] as string[]) ?? [],
    used_in: (r['used_in'] as string | null) ?? null,
    created_by: (r['created_by'] as string | null) ?? null,
    created_at: r['created_at'] as string,
    updated_at: r['updated_at'] as string,
  };
}

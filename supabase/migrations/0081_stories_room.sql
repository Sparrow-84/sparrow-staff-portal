-- Stories & Media room — idempotent migration
-- Access column on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stories_access boolean NOT NULL DEFAULT false;

-- Stories table
CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject_name text NOT NULL,
  gathering_method text NOT NULL CHECK (gathering_method IN ('interview', 'google_form', 'freewrite', 'staff_written')),
  written_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  date_gathered date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'used')),
  body text NOT NULL DEFAULT '',
  layer2_photo_form boolean,
  layer3_verbal_consent text NOT NULL DEFAULT 'not_asked' CHECK (layer3_verbal_consent IN ('yes', 'no', 'not_asked')),
  layer3_preview_requested boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  used_in text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Layer 1 event log
CREATE TABLE IF NOT EXISTS story_media_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_date date NOT NULL,
  sandwich_board_posted boolean NOT NULL DEFAULT true,
  notes text,
  logged_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Layer 2 participant photo consent log
CREATE TABLE IF NOT EXISTS story_layer2_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_name text NOT NULL,
  form_signed boolean NOT NULL,
  date_signed date,
  covers_children boolean NOT NULL DEFAULT false,
  notes text,
  logged_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_media_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_layer2_consents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stories' AND policyname = 'stories_room_access') THEN
    CREATE POLICY "stories_room_access" ON stories FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND stories_access = true));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'story_media_events' AND policyname = 'story_media_events_access') THEN
    CREATE POLICY "story_media_events_access" ON story_media_events FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND stories_access = true));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'story_layer2_consents' AND policyname = 'story_layer2_consents_access') THEN
    CREATE POLICY "story_layer2_consents_access" ON story_layer2_consents FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND stories_access = true));
  END IF;
END $$;

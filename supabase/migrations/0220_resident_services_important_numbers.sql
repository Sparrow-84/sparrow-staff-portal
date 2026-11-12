-- 0220: Resident Services → "Important numbers" tab.
--
-- Phone numbers residents ask for that aren't a program you sign up for: 911 and crisis
-- lines, police and fire non-emergency, city and county offices, utilities. They come from
-- the Community Resources sheet Resident Services hands out (Nov 2026), with every number
-- checked against the organization's own website or 211info on 2026-11-11.
--
-- Deliberately its own table, NOT linked to the Partnerships Directory: these are never
-- partners, so they never show up in Partnerships.
--
-- on_services_list = printed in the "Other numbers to keep, any time" box at the bottom of
-- every printed services list (911, the CARDV crisis line, 988, 211).
--
-- Corrections from the paper sheet:
--   - Corvallis Police: the sheet had 541-776-6924 (typo); the city lists 541-766-6924.
--   - "General Information", "Records" and "Fax" are the Sheriff's office (541-766-6858 is
--     the Sheriff's main line, 541-766-6011 its office fax), so they're one Sheriff row.
--   - Fire's "or 541-766-6900" is City Hall's number, which has its own row.
--   - Courthouse: the sheet's 541-766-6828 appears only in old directories; the Benton
--     County Circuit Court lists 541-243-7850.
--   - Public Works: the sheet's 541-766-6731 is a capital-projects staff line; the main line
--     is 541-766-6916.
--
-- Safe to run more than once: seed rows are only added when a row with the same name isn't
-- already there.

CREATE TABLE IF NOT EXISTS resident_numbers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_key        text        NOT NULL CHECK (group_key IN ('emergency', 'safety', 'offices', 'utilities', 'other')),
  name             text        NOT NULL CHECK (nullif(trim(name), '') IS NOT NULL),
  phone            text        NOT NULL CHECK (nullif(trim(phone), '') IS NOT NULL),
  note             text,
  on_services_list boolean     NOT NULL DEFAULT false,
  -- New numbers go to the end of their group.
  sort_order       int         NOT NULL DEFAULT 1000,
  created_by       uuid        REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TRIGGER resident_numbers_set_updated_at
    BEFORE UPDATE ON resident_numbers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Same people as the rest of the room.
ALTER TABLE resident_numbers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY resident_numbers_all ON resident_numbers
    FOR ALL TO authenticated
    USING (resident_services_has_access())
    WITH CHECK (resident_services_has_access());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON resident_numbers TO authenticated;

INSERT INTO resident_numbers (group_key, name, phone, note, on_services_list, sort_order)
SELECT v.group_key, v.name, v.phone, v.note, v.on_services_list, v.sort_order
FROM (VALUES
  -- Emergency and crisis (the first four print at the bottom of every services list, in this order)
  ('emergency', 'Emergency',                              '911',            'Police, fire, medical',                              true,  10),
  ('emergency', 'Domestic violence crisis line (CARDV)',  '541-754-0110',   '24 hours',                                           true,  20),
  ('emergency', 'Suicide & crisis line',                  '988',            'Call or text',                                       true,  30),
  ('emergency', 'Local help line',                        '211',            'Housing, food, utilities and more',                  true,  40),
  ('emergency', 'National Domestic Violence Hotline',     '1-800-799-7233', 'Or text START to 88788',                             false, 50),
  -- Police, fire and safety (not emergencies)
  ('safety',    'Benton County Sheriff',                  '541-766-6858',   'Non-emergency, general information and records · Fax 541-766-6011', false, 10),
  ('safety',    'Corvallis Police',                       '541-766-6924',   'Non-emergency',                                      false, 20),
  ('safety',    'Corvallis Fire Department',              '541-766-6961',   'Non-emergency',                                      false, 30),
  ('safety',    'Benton County Jail',                     '541-766-6866',   '24 hours',                                           false, 40),
  ('safety',    'Animal Control (Benton County Sheriff)', '541-766-6789',   NULL,                                                 false, 50),
  -- City and county offices
  ('offices',   'Corvallis City Hall',                    '541-766-6900',   NULL,                                                 false, 10),
  ('offices',   'Benton County Circuit Court (courthouse)', '541-243-7850', NULL,                                                 false, 20),
  ('offices',   'Corvallis-Benton County Public Library', '541-766-6793',   NULL,                                                 false, 30),
  ('offices',   'U.S. Post Office',                       '541-752-4358',   '311 SW Second St, Corvallis',                        false, 40),
  ('offices',   'Corvallis Chamber of Commerce',          '541-757-1505',   NULL,                                                 false, 50),
  -- Utilities
  ('utilities', 'City of Corvallis Public Works',         '541-766-6916',   'Water and sewer · After hours 1-855-899-3140',       false, 10),
  ('utilities', 'Pacific Power',                          '1-888-221-7070', 'Electric · 24 hours',                                false, 20),
  ('utilities', 'NW Natural',                             '1-800-422-4012', 'Gas · Smell gas? Call 1-800-882-3377',               false, 30),
  ('utilities', 'Republic Services',                      '541-754-0444',   'Garbage and recycling',                              false, 40),
  ('utilities', 'CenturyLink',                            '1-800-244-1111', 'Phone and internet · Weekdays 8am-6pm',              false, 50),
  ('utilities', 'Xfinity / Comcast',                      '1-800-934-6489', 'Internet and TV',                                    false, 60)
) AS v(group_key, name, phone, note, on_services_list, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM resident_numbers n WHERE n.name = v.name);

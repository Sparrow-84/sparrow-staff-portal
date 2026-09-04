-- Links Photo & Media Release entries and Stories to real LCP participant
-- records (lcp_household_adults) instead of a typed name, so a misspelling
-- can't create a silent duplicate/wrong-person record. Also updates
-- story_layer2_consents to match the newly-approved Sparrow Form 9.3-B:
-- Section 1 (story/photo/video) is now mandatory, so the old "did she
-- consent to photos at all" yes/no question no longer exists -- the real
-- optional choices are Named-vs-Anonymous and face-obscuring (self and
-- children, tracked separately). Old entries keep their original
-- photo_consent/children_photo_consent answers exactly as recorded -- they
-- reflect a real form that was actually signed at the time -- rather than
-- being reinterpreted under the new form's different questions. Going
-- forward, new entries leave those two legacy columns null (the question
-- was never asked) and fill in the new columns instead.

alter table story_layer2_consents
  add column if not exists household_adult_id uuid references lcp_household_adults(id);

alter table story_layer2_consents
  add column if not exists naming_choice text check (naming_choice in ('anonymous', 'named'));

alter table story_layer2_consents
  add column if not exists face_obscured boolean;

alter table story_layer2_consents
  add column if not exists children_face_obscured boolean;

-- Drop NOT NULL/default on the legacy columns so a new-form entry can leave
-- them genuinely null (never asked) instead of misleadingly false/'n/a'.
alter table story_layer2_consents alter column photo_consent drop not null;
alter table story_layer2_consents alter column photo_consent drop default;
alter table story_layer2_consents alter column children_photo_consent drop not null;
alter table story_layer2_consents alter column children_photo_consent drop default;

alter table stories
  add column if not exists household_adult_id uuid references lcp_household_adults(id);

-- Minimal, safe participant list for the Stories & Media room's "who is
-- this about" picker. stories_access staff (e.g. Bethany) don't necessarily
-- have general LCP access, so this can't just be a wider RLS grant on
-- lcp_household_adults -- that table also carries phone/DOB, which this
-- room has no reason to see. SECURITY DEFINER + an explicit access check
-- inside the query keeps this to exactly what the picker needs.
create or replace function public.list_participants_for_stories()
returns table (
  adult_id uuid,
  full_name text,
  family_id uuid,
  family_display_name text,
  active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.full_name, f.id, f.display_name, f.active
  from lcp_household_adults a
  join families f on f.id = a.family_id
  where stories_has_access()
  order by f.active desc, a.full_name;
$$;

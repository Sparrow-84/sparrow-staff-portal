-- 0097_stories_layer2_photo_consent.sql
-- Layer 2 was tracking form_signed + covers_children, which conflates "signed the
-- release" with "consented to photos." Per the real form (Sparrow_Form-9.3-B):
-- Section 1 (story sharing) is mandatory and separate from Section 2 (photos/video of
-- the participant, optional checkbox) and Section 3 (photos/video of children, optional
-- checkbox, only relevant if children are in the program). A signed form can still have
-- Section 2/3 left unchecked. No rows exist yet in story_layer2_consents, so this is a
-- clean column swap, not a data migration.

alter table story_layer2_consents drop column if exists form_signed;
alter table story_layer2_consents drop column if exists covers_children;

alter table story_layer2_consents add column if not exists photo_consent boolean not null default false;
alter table story_layer2_consents add column if not exists children_photo_consent text not null default 'n/a';

do $$ begin
  alter table story_layer2_consents add constraint story_layer2_consents_children_photo_consent_check
    check (children_photo_consent in ('n/a', 'yes', 'no'));
exception when duplicate_object then null; end $$;

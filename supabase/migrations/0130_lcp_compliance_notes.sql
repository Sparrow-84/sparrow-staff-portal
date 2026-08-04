-- Sparrow — LCP: Compliance tab on the Family Detail Panel. Internal-only log
-- of program-rule issues (men on the property, substance use, childcare
-- requirements), scaffolded into 3 fields (what happened / how it was
-- handled / follow-up) instead of one free note field -- a vague entry today
-- is an unanswerable "how did I handle it?" months later.
create table if not exists lcp_compliance_notes (
  id                uuid        primary key default gen_random_uuid(),
  family_id         uuid        not null references families(id) on delete cascade,
  label             text        not null check (label in ('men', 'substances', 'childcare', 'custom')),
  custom_label      text,
  what_happened     text        not null,
  how_handled       text        not null,
  follow_up_needed  boolean     not null default false,
  follow_up_note    text,
  created_by        uuid        references profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

alter table lcp_compliance_notes enable row level security;

-- Matches the existing lcp_staff_notes convention: extended LCP staff can
-- read, full LCP staff can write. Follow-up gets resolved by flipping
-- follow_up_needed back to false (update), never by deleting the entry --
-- this is meant to stay a permanent record.
do $$ begin
  create policy "lcp_compliance_notes_select" on lcp_compliance_notes
    for select using (
      exists (select 1 from profiles where id = auth.uid() and lcp_role is not null)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "lcp_compliance_notes_insert" on lcp_compliance_notes
    for insert with check (lcp_is_full());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "lcp_compliance_notes_update" on lcp_compliance_notes
    for update using (lcp_is_full());
exception when duplicate_object then null; end $$;

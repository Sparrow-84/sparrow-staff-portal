-- Sparrow — LCP Home: materials-prep checklist. One row per curriculum
-- session marks "materials gathered for this Thursday" done -- no due date
-- or owner tracked (deliberately decoupled from who's responsible, per
-- Susanna's call — it just needs to show up on Home and disappear once
-- someone's handled it). Delete allowed so an accidental check can be undone;
-- this is a low-stakes checklist, not a permanent record like compliance
-- notes or housing savings.
create table if not exists lcp_materials_prep_status (
  session_id   int         primary key references lcp_sessions(id) on delete cascade,
  completed_by uuid        references profiles(id) on delete set null,
  completed_at timestamptz not null default now()
);

alter table lcp_materials_prep_status enable row level security;

do $$ begin
  create policy "lcp_materials_prep_status_select" on lcp_materials_prep_status
    for select using (
      exists (select 1 from profiles where id = auth.uid() and lcp_role is not null)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "lcp_materials_prep_status_insert" on lcp_materials_prep_status
    for insert with check (lcp_is_full());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "lcp_materials_prep_status_delete" on lcp_materials_prep_status
    for delete using (lcp_is_full());
exception when duplicate_object then null; end $$;

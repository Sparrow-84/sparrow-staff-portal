-- Sparrow — LCP Compliance: real reusable labels (mirrors the Calendar/Tasks
-- label picker pattern — a shared, persisted, colored label list, not a
-- hardcoded 3-option-plus-typed-text field). Also adds proper resolution
-- tracking so a closed-out follow-up stays visible with who/when, instead of
-- the note simply disappearing once resolved.

create table if not exists lcp_compliance_labels (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  color      text        not null,
  created_by uuid        references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table lcp_compliance_labels enable row level security;

do $$ begin
  create policy "lcp_compliance_labels_select" on lcp_compliance_labels
    for select using (
      exists (select 1 from profiles where id = auth.uid() and lcp_role is not null)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "lcp_compliance_labels_insert" on lcp_compliance_labels
    for insert with check (lcp_is_full());
exception when duplicate_object then null; end $$;

insert into lcp_compliance_labels (name, color) values
  ('Men', 'violet'),
  ('Substances', 'orange'),
  ('Childcare', 'sky')
on conflict (name) do nothing;

alter table lcp_compliance_notes add column if not exists label_id uuid references lcp_compliance_labels(id);
alter table lcp_compliance_notes add column if not exists follow_up_resolved_at timestamptz;
alter table lcp_compliance_notes add column if not exists follow_up_resolved_by uuid references profiles(id) on delete set null;

-- Backfill existing rows (test data, small volume) from the old fixed
-- label/custom_label columns onto the new label_id, creating a real label
-- for any custom text that was typed in before this existed.
do $$
declare r record;
begin
  for r in select distinct custom_label from lcp_compliance_notes where label = 'custom' and custom_label is not null loop
    insert into lcp_compliance_labels (name, color) values (r.custom_label, 'blue')
    on conflict (name) do nothing;
  end loop;

  update lcp_compliance_notes n
  set label_id = (
    select id from lcp_compliance_labels l
    where l.name = case n.label
      when 'men' then 'Men'
      when 'substances' then 'Substances'
      when 'childcare' then 'Childcare'
      when 'custom' then n.custom_label
    end
  )
  where n.label_id is null and n.label is not null;
end $$;

alter table lcp_compliance_notes drop column if exists label;
alter table lcp_compliance_notes drop column if exists custom_label;

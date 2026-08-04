-- Sparrow — LCP: replaces the freeform +/-$100 housing-savings buttons with a
-- real monthly record. One row per full calendar month a family's been in
-- the program, answering "did they have a perfect month" -- awarded=true adds
-- $100, false doesn't. Open-ended (no cap) -- keeps going until the family
-- leaves/graduates. A month is only ever answered once under normal use (the
-- UI locks it), but corrections are allowed (confirm-gated in the UI, not
-- enforced here) since a mis-click needs a real fix path, not a DB request.
create table if not exists lcp_housing_savings_months (
  id           uuid        primary key default gen_random_uuid(),
  family_id    uuid        not null references families(id) on delete cascade,
  month        date        not null,
  awarded      boolean     not null,
  answered_by  uuid        references profiles(id) on delete set null,
  answered_at  timestamptz not null default now(),
  unique (family_id, month)
);

alter table lcp_housing_savings_months enable row level security;

-- Matches the existing lcp_session_logs/lcp_staff_notes convention: extended
-- LCP staff can read, full LCP staff can write.
do $$ begin
  create policy "lcp_housing_savings_months_select" on lcp_housing_savings_months
    for select using (
      exists (select 1 from profiles where id = auth.uid() and lcp_role is not null)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "lcp_housing_savings_months_insert" on lcp_housing_savings_months
    for insert with check (lcp_is_full());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "lcp_housing_savings_months_update" on lcp_housing_savings_months
    for update using (lcp_is_full());
exception when duplicate_object then null; end $$;

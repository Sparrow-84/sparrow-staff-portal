-- Sparrow — LCP: lets any staff member mark their own Monday Mentoring bucket
-- (Finance / Life Skills / Mentoring) "done for tonight" on a shared, live log
-- that multiple staff edit independently (Andrew, Audrey, Shelly typically own
-- one bucket each, but nothing enforces that). Purely a visibility signal, not
-- a lock -- the bucket stays fully editable after being marked done, and
-- nothing here gates or blocks the shared log in any way.
create table if not exists lcp_monday_bucket_status (
  session_log_id uuid not null references lcp_session_logs(id) on delete cascade,
  bucket         text not null check (bucket in ('finance', 'life_skills', 'mentoring')),
  completed_by   uuid references profiles(id) on delete set null,
  completed_at   timestamptz,
  primary key (session_log_id, bucket)
);

alter table lcp_monday_bucket_status enable row level security;

-- Matches the existing lcp_session_logs/lcp_staff_notes convention: extended
-- LCP staff can read, full LCP staff can write.
do $$ begin
  create policy "lcp_monday_bucket_status_select" on lcp_monday_bucket_status
    for select using (
      exists (select 1 from profiles where id = auth.uid() and lcp_role is not null)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "lcp_monday_bucket_status_upsert" on lcp_monday_bucket_status
    for insert with check (lcp_is_full());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "lcp_monday_bucket_status_update" on lcp_monday_bucket_status
    for update using (lcp_is_full());
exception when duplicate_object then null; end $$;

-- 0217: let the read-only QA login (readonly_user) see Shared Notes rows.
--
-- readonly_user has SELECT-only grants (it cannot insert/update/delete), but it
-- does not bypass RLS, and event_shared_notes' policies only apply to app
-- sign-ins, so direct reads return zero rows. This adds a SELECT-only policy
-- scoped to that one role on that one table. No other role or table changes.
--
-- Safe to re-run.

drop policy if exists "readonly_user can read" on event_shared_notes;

create policy "readonly_user can read" on event_shared_notes
  for select to readonly_user
  using (true);

-- Sparrow — LifeChange curriculum admin: allow full LCP staff to edit units.
--
-- lcp_units had RLS enabled (0005_lcp.sql) with a read-only policy but no write
-- policy, so UPDATE on unit metadata (artifact, supplement, month_label) was blocked.
-- lcp_sessions already has curric_sess_write (0005_lcp.sql); this is the matching
-- rule for units so Shelly can edit both from the Curriculum Admin tab.

create policy curric_units_write on lcp_units for all to authenticated
  using (lcp_is_full()) with check (lcp_is_full());

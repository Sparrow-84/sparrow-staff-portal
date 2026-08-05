-- Sparrow — Migration 0134 shipped without its 3 default compliance labels
-- ending up in the live database (lcp_compliance_labels came back empty on
-- direct verification 2026-08-05, even though 0134's own INSERT should have
-- seeded them). Re-running the same idempotent seed here guarantees the
-- defaults exist regardless of what happened the first time.

insert into lcp_compliance_labels (name, color) values
  ('Men', 'violet'),
  ('Substances', 'orange'),
  ('Childcare', 'sky')
on conflict (name) do nothing;

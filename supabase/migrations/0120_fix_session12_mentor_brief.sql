-- Sparrow — LCP: Session 12's mentor_brief was live-patched to the placeholder text
-- "Test" during Byron's manual diagnostic run of 0086 on 2026-08-01 (used to isolate
-- which session was throwing a syntax error). Restores the real content from
-- Shelly's Mentor Conversation Guide. Dollar-quoted (per 0117's pattern) to avoid
-- any apostrophe-escaping risk. Only fires if the placeholder is still in place, so
-- it's safe to re-run and won't overwrite real content if this has already landed.
UPDATE lcp_sessions SET
  mentor_brief = $mb$<p>This session went deeper into relational patterns — specifically control and isolation were named alongside the session 1 patterns. Women were asked: where did I learn this? The ‘who were you before’ question was introduced — who were you before this pattern took hold? This session often surfaces significant pain around primary relationships — often a parent or a significant partner.</p>$mb$
WHERE session_number = 12 AND mentor_brief = 'Test';

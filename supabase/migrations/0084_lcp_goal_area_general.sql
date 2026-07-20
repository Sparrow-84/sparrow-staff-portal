-- Sparrow — LCP: add "general" as a 5th goal area, matching lcp_homework's HomeworkArea
-- Depends on: 0045_lcp_goals_milestones_encouragement.sql (goal_area enum)
-- Safe to re-run: ADD VALUE ... IF NOT EXISTS is idempotent.

ALTER TYPE goal_area ADD VALUE IF NOT EXISTS 'general';

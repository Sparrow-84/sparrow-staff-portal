-- 0052_personal_calendar_events.sql
-- Personal calendar layer: staff can create events only they can see.

-- Add is_personal flag to distinguish private events from org/dept events
alter table calendar_events
  add column if not exists is_personal boolean not null default false;

-- Update SELECT policy so personal events are only visible to their creator.
-- Non-personal events remain visible to all authenticated staff (unchanged behaviour).
alter policy calendar_select on calendar_events
  using (
    not is_personal
    or created_by = auth.uid()
  );

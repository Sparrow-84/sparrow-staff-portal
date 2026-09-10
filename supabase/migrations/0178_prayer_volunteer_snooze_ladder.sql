-- ============================================================
-- 0178_prayer_volunteer_snooze_ladder.sql
-- Prayer volunteer missed-month ladder: adds a staff-set "snooze until"
-- date per volunteer, and lets emit_system_task carry a suggested
-- message (notes) so a check-in task shows up with ready-to-send text
-- instead of just a bare title.
-- ============================================================

alter table prayer_volunteers add column if not exists snoozed_until date;

-- emit_system_task previously took no way to attach a message body — every
-- caller only ever set the task's title. Adding p_notes as a new trailing
-- parameter (default null) so the prayer-volunteer ladder can hand Bethany a
-- ready-to-send script on the task itself. Explicitly dropping the old
-- 7-argument signature first: CREATE OR REPLACE does not replace a function
-- whose parameter list changed (Postgres treats it as a distinct overload),
-- which caused a real ambiguous-overload bug the last time this pattern came
-- up (see attach_gift_to_partner / migration 0127) — dropping first avoids
-- repeating it.
drop function if exists emit_system_task(text, text, uuid, text, department, priority, date);

create or replace function emit_system_task(
  p_system     text,
  p_ref        text,
  p_assignee   uuid,
  p_title      text,
  p_department department default 'ops',
  p_priority   priority    default 'p3',
  p_due        date        default null,
  p_notes      text        default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare existing uuid;
begin
  update tasks
     set title = p_title, due_date = p_due, priority = p_priority,
         department = p_department, notes = coalesce(p_notes, notes), updated_at = now()
   where source_system = p_system and source_ref = p_ref
   returning id into existing;
  if existing is not null then
    return existing;                            -- already emitted → updated in place
  end if;

  insert into tasks (title, notes, due_date, department, priority, assignee_id,
                     created_by, source_system, source_ref)
  values (p_title, p_notes, p_due, p_department, p_priority, p_assignee,
          null, p_system, p_ref)
  returning id into existing;
  return existing;
end $$;

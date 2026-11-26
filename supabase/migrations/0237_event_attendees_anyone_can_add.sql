-- 0237_event_attendees_anyone_can_add.sql
-- Lets any staff member add any other staff member as an attendee on a
-- (non-personal) calendar event, including after the event has been created.
-- Before this, only the event's creator could add other people.
--
-- Removing someone else stays narrower: the event's creator, an admin, or
-- whoever added that person. Anyone can still remove themselves.
--
-- Safe to re-run.

-- Insert: your own row (RSVP), or anyone onto a non-personal event.
-- added_by must be you, so nobody can attribute an add to someone else.
drop policy if exists attendees_insert on event_attendees;
create policy attendees_insert on event_attendees
  for insert to authenticated with check (
    staff_id = auth.uid()
    or (
      added_by = auth.uid()
      and exists (
        select 1 from calendar_events ce
        where ce.id = event_id and not ce.is_personal
      )
    )
  );

-- Delete: your own row, someone you added, any row as admin, or any row on an
-- event you created.
drop policy if exists attendees_delete on event_attendees;
create policy attendees_delete on event_attendees
  for delete to authenticated using (
    staff_id = auth.uid()
    or added_by = auth.uid()
    or is_admin()
    or exists (
      select 1 from calendar_events ce
      where ce.id = event_id and ce.created_by = auth.uid()
    )
  );

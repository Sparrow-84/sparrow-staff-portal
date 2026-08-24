-- 0165_touchpoint_edit_delete_resync.sql
-- Touchpoints could only ever be logged, never corrected — Bethany asked for the ability
-- to edit/delete one after submitting (e.g. a typo, or a wrong date). The RLS policy
-- (touchpoints_write, FOR ALL) already allows partnerships staff/admins/the partner's
-- owner to update or delete a row; only the UI and lib functions were missing (see the
-- matching app change). But partners.last_touchpoint_at is only ever advanced on INSERT
-- (on_touchpoint_logged, 0008) — editing a touchpoint's date, or deleting the most recent
-- one, would leave last_touchpoint_at stale since nothing recomputes it. This adds that
-- recompute on UPDATE and DELETE, so "is this partner due for a touchpoint" stays correct
-- no matter how the touchpoint history changes.

create or replace function resync_last_touchpoint_at(p_partner_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update partners
     set last_touchpoint_at = (
           select max(occurred_on) from partner_touchpoints where partner_id = p_partner_id
         ),
         updated_at = now()
   where id = p_partner_id;
end $$;

create or replace function on_touchpoint_changed() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'DELETE' then
    perform resync_last_touchpoint_at(OLD.partner_id);
    return OLD;
  end if;

  perform resync_last_touchpoint_at(NEW.partner_id);
  if OLD.partner_id is distinct from NEW.partner_id then
    perform resync_last_touchpoint_at(OLD.partner_id);
  end if;
  return NEW;
end $$;

drop trigger if exists partner_touchpoint_changed on partner_touchpoints;
create trigger partner_touchpoint_changed after update or delete on partner_touchpoints
  for each row execute function on_touchpoint_changed();

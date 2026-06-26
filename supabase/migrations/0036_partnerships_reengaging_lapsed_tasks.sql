-- Partnerships Room: two additions.
--
-- 1. Re-engaging stage: formerly lapsed partner who has re-initiated contact.
--    Follows cadence like 'active'; stewardship clock treats it identically.
--    The 3-month check-in prompt (when to move them to Community / donor / Lapsed again)
--    is a future UI addition — the stage is the data foundation for it.
--
-- 2. Lapsed partner tasks: emit a "Re-engage" task for every lapsed partner with an owner
--    (parallels emit_due_touchpoint_tasks for overdue cadences). Dedup-safe via
--    source_ref = 'lapsed:<partner_id>'. Resolves automatically via trigger when the
--    partner's stage is moved off 'lapsed'.

-- ─── 1. Re-engaging stage ─────────────────────────────────────────────
ALTER TYPE partner_stage ADD VALUE IF NOT EXISTS 'reengaging' AFTER 'lapsed';

-- ─── 2. Lapsed partner tasks ──────────────────────────────────────────
-- Push a "Re-engage" task to each lapsed partner's owner on room load.
-- Called from the client alongside emit_due_touchpoint_tasks().
create or replace function emit_lapsed_partner_tasks() returns int
  language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not partnerships_has_access() then
    return 0;
  end if;
  for r in
    select id, name, owner_id
    from partners
    where active
      and stage = 'lapsed'
      and owner_id is not null
  loop
    perform emit_system_task(
      'crm', 'lapsed:' || r.id, r.owner_id,
      'Re-engage — ' || r.name || ' (lapsed)',
      'partnerships'::department, 'p2'::priority, current_date
    );
    n := n + 1;
  end loop;
  return n;
end $$;

-- Resolve the lapsed task automatically when the partner is moved off 'lapsed'
-- (to re-engaging, active, prospect, or inactive).
create or replace function on_partner_stage_changed() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if OLD.stage = 'lapsed' and NEW.stage <> 'lapsed' then
    perform resolve_system_task('crm', 'lapsed:' || NEW.id);
  end if;
  return NEW;
end $$;

create trigger partner_stage_changed after update on partners
  for each row when (OLD.stage is distinct from NEW.stage)
  execute function on_partner_stage_changed();

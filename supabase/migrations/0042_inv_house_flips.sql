-- ============================================================
-- 0042_inv_house_flips.sql
-- House Flip workflow: resident-transition inventory audit.
--
-- Workflow statuses:
--   walkthrough    → staff walk the house checking items off a list
--   leave_behinds  → staff log anything the outgoing resident left
--   pending_shelly → Shelly reviews current state + shopping list and approves
--   purchasing     → approved; purchases happening offline
--   new_items      → staff log what was bought / brought in
--   submitted      → complete; register updated
-- ============================================================


-- ── Status enum ──────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE inv_flip_status AS ENUM (
    'walkthrough',
    'leave_behinds',
    'pending_shelly',
    'purchasing',
    'new_items',
    'submitted'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ── Main flip record ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inv_house_flips (
  id                 uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id        uuid            NOT NULL REFERENCES inv_locations(id),
  initiated_by       uuid            NOT NULL REFERENCES profiles(id),
  status             inv_flip_status NOT NULL DEFAULT 'walkthrough',
  shelly_approved_by uuid            REFERENCES profiles(id),
  shelly_approved_at timestamptz,
  shelly_notes       text,
  submitted_by       uuid            REFERENCES profiles(id),
  submitted_at       timestamptz,
  created_at         timestamptz     NOT NULL DEFAULT now(),
  updated_at         timestamptz     NOT NULL DEFAULT now()
);

CREATE TRIGGER set_inv_house_flips_updated_at
  BEFORE UPDATE ON inv_house_flips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── Walkthrough checklist ────────────────────────────────────────────────
-- One row per active inv_item at the time the flip was started.
-- Staff check items present as they walk the house; anything unchecked
-- at the end is presented as "possibly missing" for confirmation.

CREATE TABLE IF NOT EXISTS inv_flip_item_checks (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  flip_id           uuid    NOT NULL REFERENCES inv_house_flips(id) ON DELETE CASCADE,
  item_id           uuid    NOT NULL REFERENCES inv_items(id),
  checked_present   boolean NOT NULL DEFAULT false,
  confirmed_missing boolean NOT NULL DEFAULT false,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flip_id, item_id)
);


-- ── Leave-behinds ─────────────────────────────────────────────────────────
-- Items left by the outgoing resident. Kept leave-behinds become new
-- inv_items entries (donated) when the flip is submitted.

CREATE TABLE IF NOT EXISTS inv_flip_leave_behinds (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  flip_id         uuid          NOT NULL REFERENCES inv_house_flips(id) ON DELETE CASCADE,
  description     text          NOT NULL,
  condition       text          NOT NULL DEFAULT 'used',
  estimated_value numeric(10,2),
  sub_location_id uuid          REFERENCES inv_sub_locations(id),
  keeping         boolean       NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz   NOT NULL DEFAULT now()
);


-- ── New items ─────────────────────────────────────────────────────────────
-- Items brought in after Shelly's approval. Committed to inv_items
-- on flip submission (same field set as inv_additions).

CREATE TABLE IF NOT EXISTS inv_flip_new_items (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  flip_id         uuid          NOT NULL REFERENCES inv_house_flips(id) ON DELETE CASCADE,
  description     text          NOT NULL,
  serial_number   text,
  is_batch        boolean       NOT NULL DEFAULT false,
  batch_category  text,
  condition       text          NOT NULL DEFAULT 'new',
  is_donated      boolean       NOT NULL DEFAULT false,
  quantity        int           NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  cost            numeric(10,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  cost_basis      text          NOT NULL DEFAULT 'per_item',
  cost_source     text          NOT NULL DEFAULT 'known',
  sub_location_id uuid          REFERENCES inv_sub_locations(id),
  notes           text,
  inv_item_id     uuid          REFERENCES inv_items(id), -- set on submission
  created_at      timestamptz   NOT NULL DEFAULT now()
);


-- ── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE inv_house_flips      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_flip_item_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_flip_leave_behinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_flip_new_items   ENABLE ROW LEVEL SECURITY;

-- Ops can do everything
CREATE POLICY "inv_flip: ops all"
  ON inv_house_flips FOR ALL USING (inv_has_ops_access());

CREATE POLICY "inv_flip_checks: ops all"
  ON inv_flip_item_checks FOR ALL USING (inv_has_ops_access());

CREATE POLICY "inv_flip_lbs: ops all"
  ON inv_flip_leave_behinds FOR ALL USING (inv_has_ops_access());

CREATE POLICY "inv_flip_new: ops all"
  ON inv_flip_new_items FOR ALL USING (inv_has_ops_access());

-- Staff assigned to an LCP house can manage its flips
CREATE POLICY "inv_flip: staff assigned to house"
  ON inv_house_flips FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM inv_location_assignments
      WHERE location_id = inv_house_flips.location_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "inv_flip_checks: staff via flip"
  ON inv_flip_item_checks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM inv_house_flips f
      JOIN inv_location_assignments la ON la.location_id = f.location_id
      WHERE f.id = inv_flip_item_checks.flip_id
        AND la.user_id = auth.uid()
    )
  );

CREATE POLICY "inv_flip_lbs: staff via flip"
  ON inv_flip_leave_behinds FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM inv_house_flips f
      JOIN inv_location_assignments la ON la.location_id = f.location_id
      WHERE f.id = inv_flip_leave_behinds.flip_id
        AND la.user_id = auth.uid()
    )
  );

CREATE POLICY "inv_flip_new: staff via flip"
  ON inv_flip_new_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM inv_house_flips f
      JOIN inv_location_assignments la ON la.location_id = f.location_id
      WHERE f.id = inv_flip_new_items.flip_id
        AND la.user_id = auth.uid()
    )
  );


-- ── inv_submit_house_flip ─────────────────────────────────────────────────
-- Called when the flip reaches the end of new_items step.
-- 1. Marks confirmed-missing items as removed in the register.
-- 2. Creates inv_items for kept leave-behinds (donated).
-- 3. Creates inv_items for new items and links them back.
-- 4. Marks the flip as submitted.

CREATE OR REPLACE FUNCTION inv_submit_house_flip(p_flip_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_flip   inv_house_flips%ROWTYPE;
  v_lb     inv_flip_leave_behinds%ROWTYPE;
  v_ni     inv_flip_new_items%ROWTYPE;
  v_sched  inv_benton_schedule;
  v_item_id uuid;
BEGIN
  SELECT * INTO v_flip FROM inv_house_flips WHERE id = p_flip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'House flip % not found', p_flip_id;
  END IF;
  IF v_flip.status != 'new_items' THEN
    RAISE EXCEPTION 'House flip must be in new_items status to submit (currently: %)', v_flip.status;
  END IF;

  -- 1. Mark confirmed-missing register items as removed
  UPDATE inv_items SET
    status           = 'removed',
    removed_date     = CURRENT_DATE,
    updated_at       = now(),
    last_modified_by = auth.uid()
  WHERE id IN (
    SELECT item_id FROM inv_flip_item_checks
    WHERE flip_id = p_flip_id AND confirmed_missing = true
  );

  -- 2. Create register entries for kept leave-behinds
  FOR v_lb IN
    SELECT * FROM inv_flip_leave_behinds WHERE flip_id = p_flip_id AND keeping = true
  LOOP
    INSERT INTO inv_items (
      location_id, sub_location_id, description,
      condition, is_donated, quantity,
      unit_cost, cost_source, status,
      benton_schedule, filing_status,
      created_by, last_modified_by
    ) VALUES (
      v_flip.location_id, v_lb.sub_location_id, v_lb.description,
      v_lb.condition::inv_item_condition, true, 1,
      COALESCE(v_lb.estimated_value, 0), 'estimated', 'active',
      'schedule_5a', 'added',
      auth.uid(), auth.uid()
    );
  END LOOP;

  -- 3. Create register entries for new items
  FOR v_ni IN
    SELECT * FROM inv_flip_new_items WHERE flip_id = p_flip_id
  LOOP
    v_sched := CASE v_ni.batch_category
      WHEN 'Misc small hand tools' THEN 'schedule_5b'::inv_benton_schedule
      ELSE                              'schedule_5a'::inv_benton_schedule
    END;

    INSERT INTO inv_items (
      location_id, sub_location_id, description, serial_number,
      is_batch, batch_category, condition, is_donated, quantity,
      unit_cost, cost_source, status,
      benton_schedule, filing_status,
      created_by, last_modified_by
    ) VALUES (
      v_flip.location_id, v_ni.sub_location_id, v_ni.description, v_ni.serial_number,
      v_ni.is_batch, v_ni.batch_category, v_ni.condition::inv_item_condition,
      v_ni.is_donated, v_ni.quantity,
      CASE v_ni.cost_basis
        WHEN 'per_item' THEN v_ni.cost
        ELSE ROUND(v_ni.cost / GREATEST(v_ni.quantity, 1), 2)
      END,
      v_ni.cost_source::inv_cost_source, 'active',
      v_sched, 'added',
      auth.uid(), auth.uid()
    ) RETURNING id INTO v_item_id;

    UPDATE inv_flip_new_items SET inv_item_id = v_item_id WHERE id = v_ni.id;
  END LOOP;

  -- 4. Mark flip submitted
  UPDATE inv_house_flips SET
    status       = 'submitted',
    submitted_by = auth.uid(),
    submitted_at = now(),
    updated_at   = now()
  WHERE id = p_flip_id;
END;
$$;

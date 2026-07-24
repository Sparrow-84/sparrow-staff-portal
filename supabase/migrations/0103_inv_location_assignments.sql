-- ============================================================
-- 0102_inv_location_assignments.sql
-- Seeds all inventory location assignments using real profile IDs.
-- Re-seeds remote locations (0041 silently skipped all — emails
-- in that migration didn't match actual profile emails in the DB).
-- Adds physical location assignments for the first time.
-- Idempotent: ON CONFLICT DO NOTHING.
-- ============================================================

INSERT INTO inv_location_assignments (location_id, user_id)
VALUES
  -- ── Physical locations ──────────────────────────────────────────────────

  -- Office Building: Shelly + Audrey
  ('f015041a-1f7c-48e0-bf39-cbd492974e1b', '2f74dc0f-1877-4d13-8598-9c9aec324642'),  -- Shelly
  ('f015041a-1f7c-48e0-bf39-cbd492974e1b', '6aadf8ee-ed23-4ba8-a73a-c3ab33703db2'),  -- Audrey

  -- Outdoor Areas: Raymond
  ('783abd49-2db8-4a38-b6d0-cc7ed8122ac8', '00000000-0000-0000-0000-000000000007'),  -- Raymond

  -- Laundry Room: Lindy + Raymond
  ('2330346d-d1a0-4f40-ada9-458e6c79cc28', 'f4057f98-8306-40a3-8517-1422c23ecea6'),  -- Lindy
  ('2330346d-d1a0-4f40-ada9-458e6c79cc28', '00000000-0000-0000-0000-000000000007'),  -- Raymond

  -- Shiloh House: Shelly
  ('00c71ae0-08b1-411f-93f0-a3c587aa026d', '2f74dc0f-1877-4d13-8598-9c9aec324642'),  -- Shelly

  -- Goshen House: Shelly
  ('e7f6147e-8235-40b3-b268-508c5226aa0d', '2f74dc0f-1877-4d13-8598-9c9aec324642'),  -- Shelly

  -- LCP Home (RV): Shelly
  ('b5583c60-c66b-4e5f-8942-0081f7eab405', '2f74dc0f-1877-4d13-8598-9c9aec324642'),  -- Shelly

  -- Service Volunteer Trailer: Shelly
  ('c4e13aa0-a743-4296-9981-dd6c4aa0f779', '2f74dc0f-1877-4d13-8598-9c9aec324642'),  -- Shelly

  -- ── Remote locations (re-seed; 0041 had incorrect emails) ───────────────

  -- Andrew — Remote: Andrew
  ('d5ba032d-babb-42df-a4ae-3c9fa7780624', 'fc80c56f-5d3e-4b39-81f0-0657f3493d11'),

  -- Shelly — Remote: Shelly
  ('f0e44937-8aa1-49a6-9dfd-e3799a096899', '2f74dc0f-1877-4d13-8598-9c9aec324642'),

  -- Teresa — Remote: Teresa
  ('f4b4831c-9c67-4965-879c-4ba6845c3cb9', '00000000-0000-0000-0000-000000000008'),

  -- Susanna — Remote: Susanna
  ('268017c4-536d-4401-9ced-9de930e00136', '546a6ce4-7792-41ec-b2e6-12dd70f8c6d7'),

  -- Bethany — Remote: Bethany
  ('7cd860a1-b2f1-4f7c-bfde-c7dc1f809001', '30714f9b-fd1d-46be-8dcc-02bc0ee2d3c2'),

  -- Audrey — Remote: Audrey
  ('cfed6d64-1c83-425a-add0-e1565af235e3', '6aadf8ee-ed23-4ba8-a73a-c3ab33703db2'),

  -- Lindy — Remote: Lindy
  ('ef8ed1bc-e660-46ad-82fe-df7b593aae4c', 'f4057f98-8306-40a3-8517-1422c23ecea6')

ON CONFLICT DO NOTHING;

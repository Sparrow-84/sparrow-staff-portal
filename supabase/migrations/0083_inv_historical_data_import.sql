-- ============================================================
-- 0083_inv_historical_data_import.sql
-- One-time bulk import of Susanna's real asset register
-- (Sparrow_Master_Asset_Log_2026, "Master Asset Log" tab) into
-- inv_items, replacing the Google Sheets spreadsheet as the
-- source of truth per the original inventory SOP.
--
-- Scope decisions (see conversation / review_flag values below
-- for the full trail):
--   - Schedule 2 (consumables) rows are NOT re-imported here —
--     already correctly seeded via inv_consumables_snapshots in
--     migration 0016 with the sheet's current corrected values.
--   - The one Schedule 4 row ("Books Inspirational") is skipped —
--     the sheet itself flags it as not qualifying for Sched 4,
--     and the books are already covered by the Misc Books batch
--     line under 5A.
--   - Rows flagged REMOVE for a genuine disposal/sale event are
--     imported with status = 'removed' so the history isn't
--     lost. Rows flagged REMOVE only because they were a stale
--     rollup/duplicate superseded by other rows on the same
--     sheet (the generic 5-mower carryover line) are skipped
--     entirely — they were never a distinct real-world item.
--   - Every open question in the sheet's own "Review Flag"
--     column is carried into inv_items.review_flag verbatim (or
--     close to it) so it stays visible to Susanna in the app
--     instead of living only in a spreadsheet cell. Anywhere a
--     placement/condition had to be guessed to fit the current
--     location/sub-location model, an additional review_flag
--     note was added explaining the guess.
--   - Cost basis: none of these rows have receipts attached in
--     this migration, so cost_source is set to 'estimated'
--     across the board (the schema default of 'known' would
--     overstate confidence).
-- ============================================================

INSERT INTO inv_items (
  location_id, sub_location_id, description, serial_number, is_batch, batch_category,
  condition, is_donated, quantity, unit_cost, cost_source, status, acquired_date,
  notes, benton_schedule, filing_status, filed_as, who_has_it, review_flag
)
SELECT
  l.id, sl.id, v.description, v.serial_number, v.is_batch::boolean, v.batch_category,
  v.condition::inv_item_condition, v.is_donated::boolean, v.quantity::int, v.unit_cost::numeric,
  'estimated'::inv_cost_source, v.status::inv_item_status,
  CASE WHEN v.acquired_year IS NULL THEN NULL ELSE make_date(v.acquired_year::int, 1, 1) END,
  v.notes, v.benton_schedule::inv_benton_schedule, v.filing_status::inv_filing_status,
  v.filed_as, v.who_has_it, v.review_flag
FROM (VALUES

  -- ── Remote staff (Off Site) ──────────────────────────────────────────────
  ('Audrey — Remote', NULL, 'HP Laptop (Audrey)', 'CND30220Y3', 'false', NULL, 'used', 'false', '1', '200', 'active', '2023', NULL, 'schedule_5a', 'added', 'HP LAPTOP COMPUTER 15-DW3XXX', 'Audrey', NULL),
  ('Audrey — Remote', NULL, 'Cell Phones', NULL, 'false', NULL, 'used', 'false', '2', '50', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'CELL PHONE USED (2)', 'Audrey & Andrew', 'Shared between Audrey and Andrew — filed under Audrey''s remote location only; split out if that matters for your records.'),
  ('Bethany — Remote', NULL, 'Lenovo ThinkPad (Bethany)', 'PF4JFH2Q', 'false', NULL, 'used', 'false', '1', '923', 'active', '2022', NULL, 'schedule_5a', 'added', 'LENOVO THINKPAD USED', 'Bethany', NULL),
  ('Bethany — Remote', NULL, 'Backpack (Bethany)', NULL, 'false', NULL, 'used', 'false', '1', '40', 'active', '2023', NULL, 'schedule_5a', 'added', 'BACKPACK USED', 'Bethany', NULL),
  ('Office Building', 'Various', 'Dell Laptop (Loan - LCP participant)', '5MMN0X2', 'false', NULL, 'used', 'false', '1', '200', 'active', '2024', NULL, 'schedule_5a', 'added', 'DELL LAPTOP USED', 'LCP participant', 'Loaned to an LCP participant, not a staff member — no remote location exists for participant loans, so this is filed under Office Building/Various as a placeholder. Consider whether a participant-loan location makes sense.'),
  ('Lindy — Remote', NULL, 'Dell Laptop (Lindy)', NULL, 'false', NULL, 'used', 'false', '1', '100', 'active', '2025', NULL, 'schedule_5a', 'added', 'DELL LAPTOP USED', 'Lindy', 'Get serial #'),
  ('Susanna — Remote', NULL, 'Lenovo ThinkPad (Susanna)', 'PF-4YN6P0', 'false', NULL, 'used', 'false', '1', '650', 'active', '2024', NULL, 'schedule_5a', 'added', 'LENOVO THINKPAD USED PF-4YN6P0', 'Susanna', NULL),
  ('Susanna — Remote', NULL, 'Acer Aspire Laptop (Susanna)', 'NXJK5AA0015310833D3400', 'false', NULL, 'new', 'false', '1', '340', 'active', '2026', NULL, 'schedule_5a', 'not_filed', 'ACER ASPIRE LAPTOP NEW NXJK5AA0015310833D3400', 'Susanna', NULL),
  ('Susanna — Remote', NULL, 'ASUS Monitor (Susanna)', NULL, 'false', NULL, 'used', 'false', '1', '30', 'active', NULL, 'Was in Office Misc lump-sum. Now listed individually. Lump-sum value unchanged.', 'schedule_5a', 'not_filed', 'ASUS MONITOR USED', 'Susanna', NULL),
  ('Susanna — Remote', NULL, 'Logitech Mouse & Keyboard (Susanna)', NULL, 'false', NULL, 'used', 'false', '1', '15', 'active', NULL, 'Was in Office Misc lump-sum. Now listed individually. Lump-sum value unchanged.', 'schedule_5a', 'not_filed', 'LOGITECH MOUSE AND KEYBOARD USED', 'Susanna', NULL),

  -- ── Office Building — Entry ──────────────────────────────────────────────
  ('Office Building', 'Entry', 'Wooden Desk', NULL, 'false', NULL, 'used', 'false', '1', '25', 'active', '2021', 'Audrey sits in -- entry', 'schedule_5a', 'carried_over', 'WOODEN DESK USED (1)', NULL, NULL),
  ('Office Building', 'Entry', 'Office Desk Chair (Audrey''s)', NULL, 'false', NULL, 'new', 'false', '1', '75', 'active', '2021', 'Audrey sits in -- entry', 'schedule_5a', 'carried_over', 'OFFICE DESK CHAIR (1)', NULL, NULL),
  ('Office Building', 'Entry', 'Desk Lamp', NULL, 'false', NULL, 'used', 'false', '1', '10', 'active', '2021', 'On Audrey''s desk', 'schedule_5a', 'carried_over', 'DESK LAMP USED (1)', NULL, NULL),
  ('Office Building', 'Entry', 'File Cabinets (1×4-drawer locking, 1×3-drawer non-locking)', NULL, 'false', NULL, 'used', 'false', '2', '15', 'active', '2021', 'Both in entry', 'schedule_5a', 'carried_over', 'FILE CABINET USED (1)', NULL, 'Filed As count with the county still shows qty 1 — update to 2 once corrected in January.'),
  ('Office Building', 'Entry', 'Space Heater', NULL, 'false', NULL, 'used', 'false', '1', '10', 'active', '2021', 'Under Audrey''s desk', 'schedule_5a', 'carried_over', 'SPACE HEATER USED (1)', NULL, NULL),
  ('Office Building', 'Entry', 'Coat Rack', NULL, 'false', NULL, 'used', 'false', '1', '10', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'COAT RACK U (1)', NULL, NULL),
  ('Office Building', 'Entry', 'Brochure Holders', NULL, 'false', NULL, 'used', 'false', '3', '15', 'active', '2024', NULL, 'schedule_5a', 'carried_over', 'BROCHURE HOLDER U (3)', NULL, NULL),

  -- ── Office Building — Main Room ──────────────────────────────────────────
  ('Office Building', 'Main Room', 'TCL TV Mounted', '55S423', 'false', NULL, 'used', 'false', '1', '75', 'active', '2022', 'Duplicates flagged for removal from county filing: TV USED (1) 2022 $35, TV TLC 55S423 U (1) 2023 $0, TV USED U (1) 2022 $35 — see Disposed tab. Only 2 TVs actually exist (this one + the kids'' room TV).', 'schedule_5a', 'added', 'TCL TV MOUNTED USED (1)', NULL, NULL),
  ('Office Building', 'Main Room', 'Sitting Chairs', NULL, 'false', NULL, 'used', 'false', '4', '65', 'active', '2024', NULL, 'schedule_5a', 'added', 'SITTING CHAIRS LIVING ROOM USED', NULL, NULL),
  ('Office Building', 'Main Room', 'Curtains (11 pairs)', NULL, 'false', NULL, 'used', 'false', '11', '5', 'active', '2023', NULL, 'schedule_5a', 'added', 'CURTAINS USED', NULL, NULL),
  ('Office Building', 'Main Room', 'Dry Erase Easel & Supplies', NULL, 'false', NULL, 'used', 'false', '1', '50', 'active', '2023', NULL, 'schedule_5a', 'added', 'DRY ERASE EASEL & SUPPLIES USED', NULL, NULL),
  ('Office Building', 'Main Room', 'HP Printer OfficeJet 8600 Plus', 'CN2CHC4H35', 'false', NULL, 'new', 'false', '1', '50', 'removed', '2025', 'One of these for disposal is still in Blue Office Shed — ask Andrew for a plan.', 'schedule_5a', 'added', 'HP PRINTER OFFICE JET 8600 PLUS CN2CHC4H35', NULL, 'Disposed 2026 per source log — exact date not recorded. A unit may still physically be sitting in the Blue Office Shed; confirm it''s actually gone before treating this as fully removed.'),
  ('Office Building', 'Main Room', 'HP Printer OfficeJet 8600', 'CN28TBVH98', 'false', NULL, 'used', 'false', '1', '20', 'removed', '2024', NULL, 'schedule_5a', 'added', 'HP PRINTER OFFICE JET 8600', NULL, 'Disposed 2026 per source log — exact removal date not recorded.'),
  ('Office Building', 'Main Room', 'HP Printer OfficeJet 4840', NULL, 'false', NULL, 'used', 'false', '1', '20', 'removed', '2023', NULL, 'schedule_5a', 'added', 'HP PRINTER OFFICE JET 4840', NULL, 'Disposed 2026 per source log — exact removal date not recorded.'),
  ('Office Building', 'Main Room', 'Epson EcoTank ET-3958 Printer', 'XDPV045542', 'false', NULL, 'new', 'false', '1', '380', 'active', '2026', NULL, 'schedule_5a', 'added', NULL, NULL, NULL),
  ('Office Building', 'Main Room', 'Small Bubble Glass Lamp', NULL, 'false', NULL, 'used', 'false', '1', '5', 'active', '2026', 'Logged in April — this lamp is new and correct, not part of the lamp mix-up under Various Locations.', 'schedule_5a', 'added', 'SMALL BUBBLE GLASS LAMP USED', NULL, NULL),
  ('Office Building', 'Main Room', 'Bookshelf', NULL, 'false', NULL, 'used', 'false', '1', '15', 'active', '2023', NULL, 'schedule_5a', 'added', 'BOOK SHELF USED', NULL, NULL),
  ('Office Building', 'Main Room', 'Misc Books', NULL, 'true', 'Misc books', 'used', 'false', '1', '100', 'active', '2024', 'All books in office lumped together (kids'' books tracked separately — see Kids Room).', 'schedule_5a', 'added', 'MISC BOOKS USED', NULL, NULL),
  ('Office Building', 'Main Room', 'Blue Office Desk Chair', NULL, 'false', NULL, 'used', 'false', '1', '10', 'active', '2021', 'Freebie, est. $10.', 'schedule_5a', 'added', 'BLUE OFFICE DESK CHAIR (1)', NULL, NULL),
  ('Office Building', 'Main Room', 'End Table', NULL, 'false', NULL, 'used', 'false', '1', '5', 'active', '2021', NULL, 'schedule_5a', 'carried_over', 'END TABLE USED (1)', NULL, 'Which one?'),
  ('Office Building', 'Main Room', 'Couch', NULL, 'false', NULL, 'used', 'false', '1', '10', 'active', '2021', 'Main office couch.', 'schedule_5a', 'carried_over', 'COUCH USED (1)', NULL, NULL),
  ('Office Building', 'Main Room', 'Recliner', NULL, 'false', NULL, 'used', 'false', '1', '50', 'active', '2024', NULL, 'schedule_5a', 'carried_over', 'RECLINER U (1)', NULL, 'Do we still have this? (LCP house?)'),
  ('Office Building', 'Main Room', 'Chairs (used, set 1)', NULL, 'false', NULL, 'used', 'false', '4', '10', 'active', '2021', NULL, 'schedule_5a', 'carried_over', 'CHAIRS USED (4)', NULL, 'What chairs are these? (Office, LCP??)'),
  ('Office Building', 'Main Room', 'Chairs (used, set 2)', NULL, 'false', NULL, 'used', 'false', '2', '135', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'CHAIRS U (2)', NULL, 'What chairs are these? (Office, LCP??)'),
  ('Office Building', 'Main Room', 'Office Chairs', NULL, 'false', NULL, 'used', 'false', '2', '75', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'OFFICE CHAIR U 2022 (2)', NULL, 'What chairs are these? (Office, LCP??)'),
  ('Office Building', 'Main Room', 'Folding Table (big)', NULL, 'false', NULL, 'used', 'false', '2', '70', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'FOLDING TABLE BIG U (2)', NULL, 'Where?'),
  ('Office Building', 'Main Room', 'Small Folding Table', NULL, 'false', NULL, 'used', 'false', '3', '40', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'SMALL FOLDING TABLE U (3)', NULL, 'Where?'),
  ('Office Building', 'Main Room', 'End Tables', NULL, 'false', NULL, 'used', 'false', '2', '3', 'active', '2021', NULL, 'schedule_5a', 'carried_over', 'END TABLE USED (2)', NULL, 'Which ones?'),
  ('Office Building', 'Main Room', 'Mattress', NULL, 'false', NULL, 'used', 'false', '1', '50', 'removed', '2022', NULL, 'schedule_5a', 'carried_over', 'MATTRESS U (1)', NULL, 'Disposed 2026 per source log — exact date not recorded.'),
  ('Office Building', 'Main Room', 'C Shaped End Tables (from RV)', NULL, 'false', NULL, 'used', 'true', '2', '20', 'active', '2025', 'Moved from LCP RV to Office Living Room.', 'schedule_5a', 'not_filed', 'C SHAPED END TABLES (2)', NULL, NULL),

  -- ── Office Building — Kitchen ─────────────────────────────────────────────
  ('Office Building', 'Kitchen', 'Refrigerator', NULL, 'false', NULL, 'used', 'false', '1', '50', 'active', '2021', NULL, 'schedule_5a', 'carried_over', 'REFRIGERATOR USED (1)', NULL, NULL),
  ('Office Building', 'Kitchen', 'Microwave', NULL, 'false', NULL, 'used', 'false', '1', '50', 'active', '2021', NULL, 'schedule_5a', 'carried_over', 'OFFICE MICROWAVE', NULL, 'Qty corrected from 2 to 1 (the other microwave is now its own line) — Filed As also renamed to OFFICE MICROWAVE for clarity.'),
  ('Office Building', 'Kitchen', 'Coffee Bar Table', NULL, 'false', NULL, 'used', 'false', '1', '20', 'active', '2023', NULL, 'schedule_5a', 'carried_over', 'COFFE BAR TABLE U (1)', NULL, NULL),
  ('Office Building', 'Kitchen', 'Misc Kitchen Supplies', NULL, 'true', 'Misc kitchen supplies', 'used', 'false', '1', '100', 'active', '2022', 'Lump-sum est. $100 per Andrew. Keep flat unless major restock. May 2026 additions under $50 threshold — no line change.', 'schedule_5a', 'carried_over', 'MISC KITCHEN STUFF U (1)', NULL, NULL),
  ('Office Building', 'Kitchen', 'Green GE Double Oven', 'T645317G', 'false', NULL, 'used', 'false', '1', '100', 'active', '2021', 'Was omitted from filing in error.', 'schedule_5a', 'not_filed', 'GREEN GE DOUBLE OVEN (1)', NULL, NULL),

  -- ── Office Building — Prayer Room ────────────────────────────────────────
  ('Office Building', 'Prayer Room', 'Sitting Chairs', NULL, 'false', NULL, 'used', 'false', '2', '25', 'active', '2022', NULL, 'schedule_5a', 'added', 'SITTING CHAIRS PRAYER ROOM USED', NULL, NULL),
  ('Office Building', 'Prayer Room', 'Space Heater', NULL, 'false', NULL, 'used', 'false', '1', '10', 'active', '2021', 'Prayer room.', 'schedule_5a', 'carried_over', 'P. ROOM SPACE HEATER USED (1)', NULL, NULL),
  ('Office Building', 'Prayer Room', 'Footstool', NULL, 'false', NULL, 'used', 'false', '1', '25', 'active', '2022', 'Prayer room.', 'schedule_5a', 'carried_over', 'FOOTSTOOL U (1)', NULL, NULL),
  ('Office Building', 'Prayer Room', 'Folding Chairs (used, 4)', NULL, 'false', NULL, 'used', 'false', '4', '10', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'FOLDING CHAIRS (4)', NULL, NULL),
  ('Office Building', 'Prayer Room', 'Folding Chairs (new, 4)', NULL, 'false', NULL, 'new', 'false', '4', '25', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'FOLDING CHAIR (4)', NULL, NULL),
  ('Office Building', 'Prayer Room', 'Vacuum — Eureka (small, prayer room closet)', NULL, 'false', NULL, 'used', 'false', '1', '25', 'active', '2021', NULL, 'schedule_5a', 'carried_over', 'VACUUM USED (1)', NULL, 'Source log noted this as being in the "Prayer Room Closet" — no closet-level sub-location exists, so noted in the description instead.'),

  -- ── Office Building — Kids Play Room ─────────────────────────────────────
  ('Office Building', 'Kids Play Room', 'Child''s Craft Table', NULL, 'false', NULL, 'used', 'false', '1', '20', 'active', '2022', NULL, 'schedule_5a', 'added', 'CHILD CRAFT TABLE USED', NULL, NULL),
  ('Office Building', 'Kids Play Room', 'Child''s Plastic Chairs', NULL, 'false', NULL, 'used', 'false', '4', '4', 'active', '2023', NULL, 'schedule_5a', 'added', 'CHILD PLASTIC CHAIRS USED', NULL, NULL),
  ('Office Building', 'Kids Play Room', 'Sansui TV', NULL, 'false', NULL, 'used', 'false', '1', '20', 'active', '2023', NULL, 'schedule_5a', 'added', 'SANSUI TV PLAY ROOM USED', NULL, NULL),
  ('Office Building', 'Kids Play Room', 'Bookshelf (children''s)', NULL, 'false', NULL, 'used', 'false', '1', '25', 'active', '2023', NULL, 'schedule_5a', 'added', 'BOOK SHELF USED', NULL, NULL),
  ('Office Building', 'Kids Play Room', 'Shelf with Toy Bins', NULL, 'false', NULL, 'used', 'false', '1', '25', 'active', '2023', NULL, 'schedule_5a', 'added', 'SHELF WITH TOY BINS USED', NULL, NULL),
  ('Office Building', 'Kids Play Room', 'Misc Children''s Books', NULL, 'true', 'Misc children''s books', 'used', 'false', '1', '25', 'active', '2023', NULL, 'schedule_5a', 'added', 'MISC CHILDREN BOOKS USED', NULL, NULL),
  ('Office Building', 'Kids Play Room', 'Misc Children''s Toys', NULL, 'true', 'Misc children''s toys', 'used', 'false', '1', '50', 'active', '2023', NULL, 'schedule_5a', 'added', 'MISC CHILDREN TOYS USED', NULL, NULL),
  ('Office Building', 'Kids Play Room', 'Beanbag Chair', NULL, 'false', NULL, 'used', 'false', '2', '15', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'BEANBAG CHAIR U (2)', NULL, 'Check qty'),
  ('Office Building', 'Kids Play Room', 'Toy Box', NULL, 'false', NULL, 'used', 'false', '2', '1', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'TOY BOX U (2)', NULL, NULL),

  -- ── Office Building — Blue Office Shed & Various ─────────────────────────
  ('Office Building', 'Blue Office Shed', 'Plastic Sandwich Boards', NULL, 'false', NULL, 'used', 'false', '2', '13', 'active', '2023', NULL, 'schedule_5a', 'not_filed', 'PLASTIC SANDWICH BOARDS (2)', NULL, NULL),
  ('Office Building', 'Blue Office Shed', 'Popcorn Maker', NULL, 'false', NULL, 'used', 'false', '1', '35', 'active', '2023', NULL, 'schedule_5a', 'carried_over', 'POPCORN MAKER (1)', NULL, NULL),
  ('Office Building', 'Blue Office Shed', 'Popcorn Popper West Bend (used)', NULL, 'false', NULL, 'new', 'false', '1', '60', 'active', '2023', 'Location verified.', 'schedule_5a', 'carried_over', 'POPCORN POPPER WEST BEND U (1)', NULL, NULL),
  ('Office Building', 'Blue Office Shed', 'Steel Pet Gate', NULL, 'false', NULL, 'new', 'false', '1', '30', 'active', '2026', NULL, 'schedule_5a', 'added', 'STEEL PET GATE', NULL, NULL),
  ('Office Building', 'Blue Office Shed', 'Portable AC Honeywell', '1603/004974', 'false', NULL, 'used', 'false', '1', '150', 'active', '2023', 'Nice, big office LR portable AC.', 'schedule_5a', 'carried_over', 'PORTABLE AC HONEYWELL 1603/004974 U (1)', NULL, 'Notes describe this as the "office LR portable AC" but the Location column says Blue Shed — verify actual location.'),
  ('Office Building', 'Various', 'Portable AC Perfect Aire', '100001', 'false', NULL, 'used', 'false', '1', '20', 'active', '2022', NULL, 'schedule_5a', 'added', 'PORTABLE AC PERFECT AIRE USED 100001', NULL, NULL),
  ('Office Building', 'Various', 'Portable AC Haire', NULL, 'false', NULL, 'used', 'false', '1', '20', 'removed', '2022', NULL, 'schedule_5a', 'added', 'PORTABLE AC HAIRE USED', NULL, 'Disposed 2026 per source log — exact date not recorded.'),
  ('Office Building', 'Various', 'Honeywell Stand Fan', NULL, 'false', NULL, 'used', 'false', '1', '10', 'active', '2023', NULL, 'schedule_5a', 'added', 'HONEYWELL STAND FAN USED', NULL, NULL),
  ('Office Building', 'Various', 'SoundCore Bluetooth Speaker', 'ACCR7L3E4100038', 'false', NULL, 'new', 'false', '1', '100', 'active', '2025', NULL, 'schedule_5a', 'added', 'SOUNDCORE BLUETOOTH SPEAKER ACCR7L3E4100038', NULL, NULL),
  ('Office Building', 'Various', 'Igloo Ice Chest', NULL, 'false', NULL, 'used', 'false', '1', '20', 'active', '2023', NULL, 'schedule_5a', 'added', 'IGLOO ICE CHEST USED', NULL, NULL),
  ('Office Building', 'Various', 'Wyze Security Camera', NULL, 'false', NULL, 'new', 'false', '1', '30', 'active', '2024', NULL, 'schedule_5a', 'added', 'WYZE SECURITY CAMERA NEW', NULL, NULL),
  ('Office Building', 'Various', 'Key Lockbox', NULL, 'false', NULL, 'new', 'false', '1', '15', 'active', '2026', 'New acquisition 2026.', 'schedule_5a', 'added', 'KEY LOCKBOX NEW', NULL, NULL),
  ('Office Building', 'Entry', 'Air Conditioner', NULL, 'false', NULL, 'used', 'false', '1', '5', 'active', '2022', 'In Entry window.', 'schedule_5a', 'carried_over', 'AIR CONDITIONER USED (1)', NULL, 'Location column said "Office" (Various) but notes specify "In Entry window" — filed under Entry based on the notes.'),
  ('Office Building', 'Various', 'Software — Affinity (one-time purchase)', NULL, 'false', NULL, 'used', 'false', '1', '55', 'active', '2022', 'One-time purchase, not a subscription — logged here. Not currently in use.', 'schedule_5a', 'carried_over', 'SOFTWARE (1)', NULL, NULL),
  ('Office Building', 'Various', 'Play Pen / Baby Play Pen', NULL, 'false', NULL, 'used', 'false', '1', '20', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'PLAY PEN (1)', NULL, NULL),
  ('Office Building', 'Various', 'Security Camera Ring', NULL, 'false', NULL, 'new', 'false', '1', '40', 'active', '2023', NULL, 'schedule_5a', 'carried_over', 'SECURITY CAMERAS U (1)', NULL, NULL),
  ('Office Building', 'Various', 'Security System Lorex', 'NV012308009422', 'false', NULL, 'new', 'false', '1', '628', 'active', '2023', NULL, 'schedule_5a', 'carried_over', 'SECURITY SYSTEM LOREX NV012308009422N 2023 (1)', NULL, NULL),
  ('Office Building', 'Various', 'Lamps (main & prayer room)', NULL, 'false', NULL, 'used', 'false', '2', '4', 'active', '2021', 'Office main room and prayer room.', 'schedule_5a', 'carried_over', 'LAMPS USED (2)', NULL, NULL),
  ('Office Building', 'Various', 'Lamps', NULL, 'false', NULL, 'used', 'false', '3', '8', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'LAMPS USED U (3)', NULL, 'Possible duplicate of the lamps listed above (Audrey''s desk, main room, prayer room) plus a newly purchased 2026 lamp — should be 4 total, not 7. Which lamps are these?'),
  ('Office Building', 'Various', 'Misc Household Decor (wall clocks, pictures, plants, etc.)', NULL, 'true', 'Misc household decor', 'used', 'false', '1', '50', 'active', '2022', NULL, 'schedule_5a', 'added', 'HOUSEHOLD DECOR USED', NULL, NULL),
  ('Office Building', 'Various', 'Misc Office Supplies (nonconsumables)', NULL, 'true', 'Misc office supplies (non-consumable)', 'used', 'false', '1', '600', 'active', NULL, 'This is the nonconsumable lump of general supplies (staplers, computer mice, pen holders, etc.), moved out of Schedule 2.', 'schedule_5a', 'added', NULL, NULL, 'Condition recorded as "New/Used" (mixed) in source — defaulted to Used.'),
  ('Office Building', 'Blue Office Shed', 'Small End Table', NULL, 'false', NULL, 'used', 'false', '1', '5', 'active', '2026', 'Logged May 2026 (Office Building additions).', 'schedule_5a', 'not_filed', NULL, NULL, 'Source flags: "Which one is this. There is not one in blue shed." — placement uncertain, needs physical verification.'),
  ('Office Building', 'Various', 'Mobile Hot Spot', NULL, 'false', NULL, 'new', 'false', '2', '60', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'MOBILE HOT SPOT (1)', NULL, 'Logged as "Various" location in source — spans multiple staff/remote use; confirm exact placement.'),
  ('Office Building', 'Various', 'Rugs (LR, Prayer Rm, Play Rm, Kitchen, Bathroom)', NULL, 'false', NULL, 'used', 'false', '5', '50', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'RUG (1)', NULL, 'Qty updated to 5 (from a single-rug filing) per your update note; the 3 old superseded rugs are recorded in the Disposed tab.'),
  ('Office Building', 'Various', 'Air Purifiers (off-site)', 'AIR400', 'false', NULL, 'used', 'false', '2', '75', 'active', '2023', NULL, 'schedule_5a', 'carried_over', 'AIR PURIFIER AIR400 U (3)', NULL, 'Qty adjusted to 2 per your update note ("QNTY from 3 to 2"), though the sheet''s Qty/Total columns still showed 3/$225 at time of import — please confirm 2 is correct, and confirm which staff member(s) currently have these off-site.'),
  ('Office Building', 'Various', 'Master Padlocks', NULL, 'false', NULL, 'new', 'false', '2', '10', 'active', '2026', 'New acquisition 2026.', 'schedule_5a', 'added', 'MASTER PADLOCKS (2)', NULL, 'Location marked "Office (unsure)" in source log — confirm exact placement.'),

  -- ── Office Building — Yard / Outside ─────────────────────────────────────
  ('Office Building', 'Yard / Outside', 'Patio Table & 4 Chairs', NULL, 'false', NULL, 'used', 'false', '1', '50', 'active', '2023', NULL, 'schedule_5a', 'added', 'PATIO TABLE AND 4 CHAIRS USED', NULL, NULL),
  ('Office Building', 'Yard / Outside', 'Outside Play Structure', NULL, 'false', NULL, 'used', 'false', '1', '15', 'active', '2022', 'A duplicate of this is listed for removal in the Disposed tab.', 'schedule_5a', 'added', 'OUTSIDE PLAY STRUCTURE USED', NULL, NULL),
  ('Office Building', 'Yard / Outside', 'Steel Outdoor Chairs (blue)', NULL, 'false', NULL, 'used', 'false', '4', '4', 'active', '2025', NULL, 'schedule_5a', 'added', 'STEEL OUTDOOR CHAIRS USED', NULL, NULL),
  ('Office Building', 'Yard / Outside', 'Totes — Christmas / Holiday Decorations', NULL, 'true', 'Misc holiday / seasonal decor', 'used', 'false', '3', '25', 'active', '2022', NULL, 'schedule_5a', 'added', 'TOTES CHRISTMAS HOLIDAY DECORATIONS USED', NULL, NULL),
  ('Office Building', 'Yard / Outside', 'Kids Outdoor Toys', NULL, 'true', 'Children''s outdoor toys', 'used', 'false', '4', '25', 'active', '2023', NULL, 'schedule_5a', 'carried_over', 'KIDS OUTDOOR TOYS U (4)', NULL, NULL),
  ('Office Building', 'Yard / Outside', 'Fence / Solar Lights (11 units, lumped)', NULL, 'false', NULL, 'used', 'false', '1', '75', 'active', '2024', '11 units lumped as 1 entry, total $75.', 'schedule_5a', 'carried_over', 'FENCE SOLAR LIGHTS U (1)', NULL, NULL),

  -- ── Outdoor Areas — Raymond''s sheds & laundry room storage ──────────────
  ('Outdoor Areas', 'Steel Shed (office)', 'Red Push Mower & Bag', '1E294K21091', 'false', NULL, 'used', 'false', '1', '50', 'active', '2021', NULL, 'schedule_5a', 'added', 'RED PUSH MOWER AND BAG USED', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (office)', 'Echo LM-2119SP Self-Propelled Lawn Mower', '701LM2060991', 'false', NULL, 'new', 'false', '1', '580', 'active', '2026', NULL, 'schedule_5a', 'added', NULL, NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (office)', 'Green Electric Weed Trimmer', '130375R', 'false', NULL, 'used', 'false', '1', '10', 'active', '2021', NULL, 'schedule_5a', 'added', 'GREEN ELECTRIC WEED TRIMMER USED', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (office)', 'Pressure Washer (Honda)', '542149', 'false', NULL, 'used', 'false', '1', '400', 'active', '2021', 'Other unit disposed.', 'schedule_5a', 'carried_over', 'PRESSURE WASHER USED (2)', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (office)', 'Weed Eaters (1 electric, 1 battery)', NULL, 'false', NULL, 'used', 'false', '2', '38', 'active', '2021', NULL, 'schedule_5a', 'carried_over', 'WEED EATER USED (2)', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (office)', '24" Libman Push Broom', NULL, 'false', NULL, 'new', 'false', '1', '25', 'active', '2026', NULL, 'schedule_5a', 'not_filed', '24 IN LIBMAN PUSH BROOM NEW', NULL, NULL),
  ('Outdoor Areas', 'Timber Shed', 'Orange Ridgid Step Ladder', NULL, 'false', NULL, 'new', 'false', '1', '60', 'active', '2024', NULL, 'schedule_5a', 'added', 'ORANGE RIDGIT STEP LADDER NEW', NULL, NULL),
  ('Outdoor Areas', 'Behind the Sheds', 'Wheelbarrows', NULL, 'false', NULL, 'used', 'false', '3', '25', 'active', '2021', 'There should be qty 4 wheelbarrows total on the sheet (these 3 plus the more expensive one below).', 'schedule_5a', 'added', 'WHEELBARROWS USED', NULL, 'Your notes conflict: one says "remove 1x $25 wheelbarrow" (implying qty 2 here), another says the total should be 4 combined with the $100 wheelbarrow below (implying qty 3 here). Imported as qty 3 (current Qty column) — please confirm the actual count.'),
  ('Outdoor Areas', 'Behind the Sheds', 'Wheelbarrow (new, 2021)', NULL, 'false', NULL, 'new', 'false', '1', '100', 'active', '2021', NULL, 'schedule_5a', 'added', 'WHEELBARROW NEW', NULL, NULL),
  ('Outdoor Areas', 'Behind the Sheds', 'Extension Ladder', NULL, 'false', NULL, 'used', 'false', '1', '40', 'active', '2021', NULL, 'schedule_5a', 'added', 'EXTENSION LADDER USED', NULL, NULL),
  ('Outdoor Areas', 'Behind the Sheds', 'Silver Step Ladder', NULL, 'false', NULL, 'used', 'false', '1', '25', 'active', '2021', NULL, 'schedule_5a', 'added', 'SILVER STEP LADDER USED', NULL, NULL),
  ('Outdoor Areas', 'Behind the Sheds', 'Blue Step Ladder', NULL, 'false', NULL, 'used', 'true', '1', '40', 'active', '2026', 'Left behind by a resident.', 'schedule_5a', 'added', 'BLUE STEP LADDER USED', NULL, NULL),
  ('Outdoor Areas', 'Behind the Sheds', 'Electric Chainsaws (×2, 2021)', NULL, 'false', NULL, 'used', 'false', '2', '50', 'active', '2021', NULL, 'schedule_5a', 'carried_over', 'ELECTRIC CHAINSAW USED (2)', NULL, NULL),
  ('Outdoor Areas', 'Behind the Sheds', 'Wood Chipper DR Equipment', '02637X', 'false', NULL, 'used', 'false', '1', '0', 'removed', '2023', 'Was sold.', 'schedule_5a', 'carried_over', 'WOOD CHIPPER DR EQUIPMENT 02637X U (1) 2023 2023 1 $0', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (laundry room)', '56V EGO Battery Lawn Trimmer', 'NST18220578069X | Battery: NBA15220578069X | Charger: NCH01220578069X', 'false', NULL, 'new', 'false', '1', '259', 'active', '2025', NULL, 'schedule_5a', 'added', '56V EGO BATTERY OPERATED LAWN TRIMMER NEW NST 18220578069X', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (laundry room)', 'EGO Battery Hedge Trimmer', 'NHT09243332895X | Battery: NBA08243332895X | Charger: NCH01243332895X', 'false', NULL, 'new', 'false', '1', '259', 'active', '2025', NULL, 'schedule_5a', 'added', 'EGO BATTERY OPERATED HEDGE TRIMMER NEW NHT 0924 33328 95X', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (laundry room)', 'Electric Shop Vac (dry)', '52725-44', 'false', NULL, 'used', 'false', '1', '30', 'active', '2021', NULL, 'schedule_5a', 'added', 'ELECTRIC SHOP VAC USED', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (laundry room)', 'Homelite Gas Chainsaw (in box)', 'LIT10947D / AG0061110', 'false', NULL, 'used', 'false', '1', '25', 'active', '2025', NULL, 'schedule_5a', 'added', 'HOMELITE GAS CHAINSAW USED UT10947D SN AG0061110', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (laundry room)', 'Submersible Pump', NULL, 'false', NULL, 'new', 'false', '1', '100', 'active', '2024', NULL, 'schedule_5a', 'added', 'SUBMERSIBLE PUMP NEW', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (laundry room)', 'Ridgid Sander', 'TM24302D540093', 'false', NULL, 'used', 'false', '1', '50', 'active', '2024', 'A duplicate at $25 (same serial) was removed per the Disposed tab; this $50 entry is retained.', 'schedule_5a', 'added', 'RIDGIT SANDER CORDLESS USED', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (laundry room)', 'Ridgid Storage Totes Set', NULL, 'false', NULL, 'used', 'false', '1', '125', 'active', '2024', NULL, 'schedule_5a', 'added', 'RIDGIT STORAGE TOTES SET USED', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (laundry room)', 'Ridgid HandVac Cordless', 'TM24294NB70229', 'false', NULL, 'used', 'false', '1', '50', 'active', '2024', NULL, 'schedule_5a', 'added', 'RIDGIT HANDVAC CORDLESS USED TM 24294NB70229', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (laundry room)', 'Ridgid Hand Blower Cordless', 'TM24296D870023', 'false', NULL, 'used', 'false', '1', '50', 'active', '2024', NULL, 'schedule_5a', 'added', 'RIDGIT HAND BLOWER CORDLESS USED TM 24296D870023', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (laundry room)', 'Ridgid Kit (drill, sawzall, skillsaw, impact, flashlight, battery charger)', 'Drill: TM24296N551023 | Sawzall: TM24303N720005 | Skillsaw: TM24303N670707 | Impact: TM24311N750088 | Flashlight: DS24178D000283 | Charger: NB25181D021218', 'false', NULL, 'new', 'false', '1', '250', 'active', '2024', 'Moved from Schedule 5B to 5A.', 'schedule_5a', 'added', 'RIDGIT KIT NEW', NULL, NULL),
  ('Outdoor Areas', 'Steel Shed (laundry room)', 'Stihl Backpack Blower', '529815873', 'false', NULL, 'used', 'false', '1', '600', 'active', '2022', NULL, 'schedule_5a', 'carried_over', 'LEAF BLOWER (1)', NULL, NULL),

  -- ── Laundry Room (the room itself, not shed storage) ─────────────────────
  ('Laundry Room', NULL, 'Washer', NULL, 'false', NULL, 'used', 'false', '2', '595', 'active', '2016', NULL, 'schedule_5a', 'carried_over', 'WASHER USED (2)', NULL, NULL),
  ('Laundry Room', NULL, 'Dryer', NULL, 'false', NULL, 'used', 'false', '3', '500', 'active', '2021', NULL, 'schedule_5a', 'carried_over', 'DRYER USED (3)', NULL, NULL),
  ('Laundry Room', NULL, 'Maytag Washer', NULL, 'false', NULL, 'used', 'false', '1', '50', 'active', '2021', NULL, 'schedule_5a', 'updated', 'MAYTAGE WASHER USED (2)', NULL, NULL),

  -- ── Service Volunteer Trailer ─────────────────────────────────────────────
  ('Service Volunteer Trailer', 'Bathroom', 'Shower Curtain', NULL, 'false', NULL, 'new', 'false', '1', '20', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'SHOWER CURTAIN NEW', NULL, NULL),
  ('Service Volunteer Trailer', 'Childcare Room', 'Misc Toys (childcare)', NULL, 'false', NULL, 'new', 'false', '1', '115', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'MISC TOYS CHILDCARE NEW', NULL, NULL),
  ('Service Volunteer Trailer', 'Kitchen', 'Baby Gate', NULL, 'false', NULL, 'new', 'false', '1', '100', 'active', '2026', 'Logged April 2026. Childcare use.', 'schedule_5a', 'not_filed', 'BABY GATE NEW', NULL, NULL),
  ('Service Volunteer Trailer', 'Kitchen', 'Travel Booster Seat', NULL, 'false', NULL, 'new', 'false', '1', '40', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'TRAVEL BOOSTER SEAT NEW', NULL, NULL),
  ('Service Volunteer Trailer', 'Kitchen', 'Bar Stools', NULL, 'false', NULL, 'used', 'false', '2', '25', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'BAR STOOLS USED', NULL, NULL),
  ('Service Volunteer Trailer', 'Living Room', 'Couch', NULL, 'false', NULL, 'used', 'false', '1', '50', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'COUCH USED', NULL, NULL),
  ('Service Volunteer Trailer', 'Various', 'Curtains (8 sets, throughout)', NULL, 'false', NULL, 'new', 'false', '8', '30', 'active', '2026', 'Logged April 2026. 8 sets × $30.', 'schedule_5a', 'not_filed', 'CURTAINS NEW', NULL, NULL),

  -- ── Goshen House (LCP) ────────────────────────────────────────────────────
  ('Goshen House', 'Bathroom', 'Above Toilet Shelving Rack', NULL, 'false', NULL, 'used', 'false', '1', '20', 'active', '2026', 'Purchased used. Logged May 2026.', 'schedule_5a', 'not_filed', 'ABOVE TOILET SHELVING RACK USED', NULL, NULL),
  ('Goshen House', 'Kids'' Room', 'Bunk Beds (donated, custom woodworking — non-standard mattress size)', NULL, 'false', NULL, 'used', 'true', '1', '250', 'active', '2026', 'Donated. Custom dimensions (non-standard mattress). Logged May 2026.', 'schedule_5a', 'not_filed', 'BUNK BEDS USED', NULL, NULL),
  ('Goshen House', 'Kids'' Room', 'Side Table', NULL, 'false', NULL, 'used', 'false', '1', '5', 'active', '2026', 'Purchased used. Logged May 2026.', 'schedule_5a', 'not_filed', 'SIDE TABLE USED', NULL, NULL),
  ('Goshen House', 'Kids'' Room', 'Beanbag Chair', NULL, 'false', NULL, 'used', 'false', '1', '40', 'active', '2026', 'Purchased used. Logged May 2026.', 'schedule_5a', 'not_filed', 'BEANBAG CHAIR USED', NULL, NULL),
  ('Goshen House', 'Kitchen', 'Microwave', NULL, 'false', NULL, 'used', 'true', '1', '50', 'active', '2026', 'Donated. Logged May 2026.', 'schedule_5a', 'not_filed', 'MICROWAVE USED', NULL, NULL),
  ('Goshen House', 'Kitchen', 'Kitchen Table', NULL, 'false', NULL, 'used', 'true', '1', '50', 'active', '2026', 'Donated. Logged May 2026.', 'schedule_5a', 'not_filed', 'KITCHEN TABLE USED', NULL, NULL),
  ('Goshen House', 'Kitchen', 'Kitchen Chairs', NULL, 'false', NULL, 'used', 'true', '5', '10', 'active', '2026', 'Donated. Logged May 2026. 5 × $10. One of these chairs is noted as physically in the Blue Office Shed.', 'schedule_5a', 'not_filed', 'KITCHEN CHAIRS USED', NULL, 'One of these 5 chairs is noted as physically in the Blue Office Shed, not at Goshen — verify current location.'),
  ('Goshen House', 'Kitchen', 'Misc Kitchen Supplies', NULL, 'true', 'Misc kitchen supplies', 'used', 'false', '1', '200', 'active', '2026', 'Estimated $200. Mix of used/new. Logged May 2026. Per the under-$50 bundling rule, track annually.', 'schedule_5a', 'not_filed', 'MISC KITCHEN SUPPLIES', NULL, 'Condition recorded as mixed used/new in source — defaulted to Used.'),
  ('Goshen House', 'LR', 'Couch', NULL, 'false', NULL, 'used', 'false', '1', '75', 'active', '2026', 'Logged May 2026.', 'schedule_5a', 'not_filed', 'COUCH USED', NULL, NULL),
  ('Goshen House', 'LR', 'Couch Pillows', NULL, 'false', NULL, 'new', 'false', '2', '13', 'active', '2026', 'Logged May 2026. Cost given as $25 total because it was a pack of 2 purchased.', 'schedule_5a', 'not_filed', 'COUCH PILLOWS NEW', NULL, NULL),
  ('Goshen House', 'LR', 'Standing Floor Lamp', NULL, 'false', NULL, 'used', 'false', '1', '10', 'active', '2026', 'Logged May 2026.', 'schedule_5a', 'not_filed', 'STANDING FLOOR LAMP USED', NULL, NULL),
  ('Goshen House', 'LR', 'Rocking Chair & Footstool', NULL, 'false', NULL, 'used', 'false', '1', '25', 'active', '2026', 'Logged May 2026.', 'schedule_5a', 'not_filed', 'ROCKING CHAIR AND FOOTSTOOL USED', NULL, NULL),
  ('Goshen House', 'LR', 'Goshen LR Curtains', NULL, 'false', NULL, 'new', 'false', '2', '26', 'active', '2026', 'Logged May 2026.', 'schedule_5a', 'not_filed', 'GOSHEN LR CURTAINS NEW', NULL, NULL),
  ('Goshen House', 'Master Bedroom', 'Bed Frame', NULL, 'false', NULL, 'used', 'true', '1', '200', 'active', '2026', 'Donated. Logged May 2026.', 'schedule_5a', 'not_filed', 'BED FRAME USED', NULL, NULL),
  ('Goshen House', 'Master Bedroom', 'Queen Mattress', NULL, 'false', NULL, 'used', 'true', '1', '100', 'active', '2026', 'Donated. Logged May 2026.', 'schedule_5a', 'not_filed', 'QUEEN MATTRESS USED', NULL, NULL),
  ('Goshen House', 'Master Bedroom', 'Bookshelf', NULL, 'false', NULL, 'used', 'false', '1', '30', 'active', '2026', 'Purchased used. Logged May 2026.', 'schedule_5a', 'not_filed', 'BOOKSHELF USED', NULL, NULL),
  ('Goshen House', 'Master Bedroom', 'Side Table', NULL, 'false', NULL, 'used', 'false', '1', '20', 'active', '2026', 'Purchased used. Logged May 2026.', 'schedule_5a', 'not_filed', 'SIDE TABLE USED', NULL, NULL),
  ('Goshen House', 'Master Bedroom', 'Dresser', NULL, 'false', NULL, 'used', 'false', '1', '40', 'active', '2026', 'Purchased used. Logged May 2026.', 'schedule_5a', 'not_filed', 'DRESSER USED', NULL, NULL),
  ('Goshen House', 'Master Bedroom', 'Small Tabletop Fan', NULL, 'false', NULL, 'used', 'true', '1', '5', 'active', '2026', 'Donated. Logged May 2026.', 'schedule_5a', 'not_filed', 'SMALL TABLETOP FAN USED', NULL, NULL),
  ('Goshen House', 'Master Bedroom', 'Alarm Clock', NULL, 'false', NULL, 'used', 'false', '1', '5', 'active', '2026', 'Purchased used (Goodwill). Logged May 2026.', 'schedule_5a', 'not_filed', 'ALARM CLOCK USED', NULL, NULL),
  ('Goshen House', 'Master Bedroom', 'Bedside Lamp', NULL, 'false', NULL, 'used', 'false', '1', '10', 'active', '2026', 'Purchased used. Logged May 2026.', 'schedule_5a', 'not_filed', 'BEDSIDE LAMP USED', NULL, NULL),
  ('Goshen House', 'Various', 'Rugs (8, throughout — LR, Kitchen, Hall, Entry, Bathrooms)', NULL, 'false', NULL, 'used', 'false', '8', '50', 'active', '2026', '8 rugs total, mix used/new. $400 = combined estimate. Logged May 2026.', 'schedule_5a', 'not_filed', 'RUGS MIXED', NULL, 'Condition recorded as mixed used/new in source — defaulted to Used.'),
  ('Goshen House', 'Various', 'Misc Household Decor (whole house)', NULL, 'true', 'Misc household decor', 'used', 'false', '1', '200', 'active', '2026', 'Used/donated décor, $200 combined estimate. Logged May 2026.', 'schedule_5a', 'not_filed', 'MISC HOUSEHOLD DECOR USED', NULL, 'Condition recorded as mixed in source — defaulted to Used.'),

  -- ── Shiloh House (LCP) ────────────────────────────────────────────────────
  ('Shiloh House', 'Kids'' Room', 'Bunk Beds', NULL, 'false', NULL, 'used', 'false', '1', '250', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'BUNK BEDS USED', NULL, NULL),
  ('Shiloh House', 'Kids'' Room', 'Kids Dresser', NULL, 'false', NULL, 'used', 'false', '1', '40', 'active', '2026', 'Logged April 2026 — small, child-sized.', 'schedule_5a', 'not_filed', 'KIDS DRESSER USED', NULL, NULL),
  ('Shiloh House', 'Kids'' Room', 'Bookshelf', NULL, 'false', NULL, 'used', 'false', '1', '40', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'BOOKSHELF USED', NULL, NULL),
  ('Shiloh House', 'Kitchen', 'Microwave (Shiloh House)', NULL, 'false', NULL, 'used', 'false', '1', '50', 'active', '2021', NULL, 'schedule_5a', 'carried_over', 'SHILOH MICROWAVE (1)', NULL, NULL),
  ('Shiloh House', 'Kitchen', 'Misc Kitchen Supplies', NULL, 'true', 'Misc kitchen supplies', 'used', 'false', '1', '250', 'active', '2026', '$250 est. Mix used/new. Logged April 2026.', 'schedule_5a', 'not_filed', 'MISC KITCHEN SUPPLIES', NULL, 'Condition recorded as mixed used/new in source — defaulted to Used.'),
  ('Shiloh House', 'Kitchen', 'Kitchen Table', NULL, 'false', NULL, 'used', 'false', '1', '100', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'KITCHEN TABLE USED', NULL, NULL),
  ('Shiloh House', 'Kitchen', 'Kitchen Chairs', NULL, 'false', NULL, 'used', 'false', '4', '25', 'active', '2026', 'Logged April 2026. $100 total for 4.', 'schedule_5a', 'not_filed', 'KITCHEN CHAIRS USED', NULL, NULL),
  ('Shiloh House', 'Kitchen', 'Pantry Unit', NULL, 'false', NULL, 'used', 'false', '1', '10', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'PANTRY UNIT USED', NULL, NULL),
  ('Shiloh House', 'LR', 'Couch', NULL, 'false', NULL, 'used', 'false', '1', '100', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'COUCH USED', NULL, NULL),
  ('Shiloh House', 'LR', 'Chair (LR)', NULL, 'false', NULL, 'used', 'false', '1', '100', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'CHAIR USED', NULL, NULL),
  ('Shiloh House', 'LR', 'Footstool', NULL, 'false', NULL, 'used', 'false', '1', '50', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'FOOTSTOOL USED', NULL, NULL),
  ('Shiloh House', 'LR', 'Coffee Table', NULL, 'false', NULL, 'used', 'false', '1', '50', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'COFFEE TABLE USED', NULL, NULL),
  ('Shiloh House', 'Master Bedroom', 'Queen Bed (master, new)', NULL, 'false', NULL, 'new', 'false', '1', '200', 'active', '2026', 'Purchased new. $200 for bed frame/mattress. A separate $40 in Shelly''s log was bedding — not filed per LCP bedding policy.', 'schedule_5a', 'not_filed', 'BED NEW', NULL, NULL),
  ('Shiloh House', 'Master Bedroom', 'Black Dresser', NULL, 'false', NULL, 'used', 'false', '1', '60', 'active', '2026', 'Logged April 2026.', 'schedule_5a', 'not_filed', 'BLACK DRESSER USED', NULL, NULL),
  ('Shiloh House', 'Various', 'Curtains (7 sets, throughout)', NULL, 'false', NULL, 'new', 'false', '7', '30', 'active', '2026', 'Purchased new. Logged April 2026. 7 × $30.', 'schedule_5a', 'not_filed', 'CURTAINS NEW', NULL, NULL),

  -- ── LCP Home (RV) ─────────────────────────────────────────────────────────
  ('LCP Home (RV)', NULL, 'Baby Bath', NULL, 'false', NULL, 'new', 'false', '1', '36', 'active', '2026', NULL, 'schedule_5a', 'not_filed', 'BABY BATH NEW', NULL, 'Partial inventory only — full RV log needed before end of year.'),
  ('LCP Home (RV)', NULL, 'Step Stool', NULL, 'false', NULL, 'new', 'false', '1', '25', 'active', '2026', 'Logged April 2026. Partial log only.', 'schedule_5a', 'not_filed', 'STEP STOOL NEW', NULL, 'Partial inventory only — full RV log needed before end of year.'),
  ('LCP Home (RV)', 'Kitchen', 'Misc Kitchen Supplies', NULL, 'true', 'Misc kitchen supplies', 'new', 'false', '1', '15', 'active', '2026', 'Logged April 2026. Currently includes baby dishes.', 'schedule_5a', 'not_filed', 'MISC KITCHEN SUPPLIES NEW', NULL, 'Partial inventory only — full RV log needed before end of year.'),
  ('LCP Home (RV)', 'Porch', 'Camping Chair', NULL, 'false', NULL, 'new', 'false', '1', '10', 'active', '2026', 'Logged April 2026 (source location: Storage / Porch).', 'schedule_5a', 'not_filed', 'CAMPING CHAIR NEW', NULL, 'Partial inventory only — full RV log needed before end of year.'),

  -- ── Schedule 5B — Small Hand Tools (org-wide estimate) ───────────────────
  ('Outdoor Areas', 'Steel Shed (office)', 'Small Hand Tools — lump sum (hammers, wrenches, screwdrivers, etc.)', NULL, 'true', 'Misc small hand tools', 'used', 'false', '1', '787', 'active', '2025', 'Combined from two source lines: $750 (Andrew''s 2025 estimate, moved from Maintenance Supplies) + $37 (2026 addition).', 'schedule_5b', 'not_filed', 'MISC SMALL HAND TOOLS', NULL, 'Org-wide hand-tool estimate from Andrew, not physically scoped to a single location — filed under Outdoor Areas/Steel Shed (office) as a best guess. Verify placement.')

) AS v(loc_name, sub_loc_name, description, serial_number, is_batch, batch_category,
       condition, is_donated, quantity, unit_cost, status, acquired_year, notes,
       benton_schedule, filing_status, filed_as, who_has_it, review_flag)
JOIN inv_locations l ON l.name = v.loc_name
LEFT JOIN inv_sub_locations sl ON sl.location_id = l.id AND sl.name = v.sub_loc_name
WHERE NOT EXISTS (
  SELECT 1 FROM inv_items existing
  WHERE existing.location_id = l.id
    AND existing.description = v.description
    AND (existing.sub_location_id = sl.id OR (existing.sub_location_id IS NULL AND sl.id IS NULL))
);

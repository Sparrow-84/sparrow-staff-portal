-- Partnerships room: lets a partner be tagged as more than one type (e.g. a donor who's also
-- a prayer volunteer) without giving up the single "main type" that still drives cadence
-- defaults and which extra fields show (donor fields, MOU fields, etc.) — that part is
-- unchanged. secondary_types is purely additive: extra tags shown next to the partner's name
-- and extra Directory filter tabs they show up under, on top of their primary type.
alter table partners
  add column if not exists secondary_types partner_type[] not null default '{}'::partner_type[];

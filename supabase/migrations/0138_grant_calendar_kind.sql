-- New calendar_kind for grant-related dates (own pill color, same as 'toc'/'birthday').
-- ALTER TYPE ... ADD VALUE can't be used in the same transaction as a later statement
-- that references the new value, so this stays its own migration (same pattern as
-- 0090_calendar_kind_birthday.sql).
ALTER TYPE calendar_kind ADD VALUE IF NOT EXISTS 'grant';

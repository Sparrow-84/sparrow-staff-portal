-- Staff birthdays auto-populate the all-staff calendar (wasp nest #9).
-- ALTER TYPE ... ADD VALUE can't be used in the same transaction as a later statement
-- that references the new value, so this stays its own migration (same pattern as
-- 0070/0074/0076/0084).
ALTER TYPE calendar_kind ADD VALUE IF NOT EXISTS 'birthday';

-- The Sparrow Spotlight comm type was added at the application layer (CommType in
-- partnerships-tabs.ts) but the database's comm_type enum was never updated to match --
-- every attempt to seed a sparrow_spotlight row has been silently failing with an
-- "invalid input value for enum comm_type" error ever since, which is why no Spotlight
-- entries exist in the Comms/Calendar tabs for any year.
--
-- Kept in its own migration file, separate from 0204 (which inserts rows using this value):
-- Postgres does not allow a brand-new enum value to be used in the same transaction that
-- adds it.
ALTER TYPE comm_type ADD VALUE IF NOT EXISTS 'sparrow_spotlight';

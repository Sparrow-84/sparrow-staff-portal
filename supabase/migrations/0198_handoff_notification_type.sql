-- New notification type for "a Directory record or Resident Services service was handed
-- off to you" (owner changed by someone else). Its own migration: ALTER TYPE ... ADD VALUE
-- can't be used in the same transaction as a later statement that references the new value
-- (same pattern as 0070/0074/0076/0140). Must run before 0199.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'handoff';

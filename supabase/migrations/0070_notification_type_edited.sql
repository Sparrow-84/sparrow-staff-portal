-- New notification type for "the assigner edited a task assigned to you".
-- Split into its own migration: ALTER TYPE ... ADD VALUE can't be used in the
-- same transaction as a later statement that references the new value.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'edited';

-- New notification type for "assignee pushed a task back to you". Its own migration:
-- ALTER TYPE ... ADD VALUE can't be used in the same transaction as a later statement
-- that references the new value (see 0070/0074 for the same pattern).
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pushed_back';

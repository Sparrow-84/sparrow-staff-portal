-- New notification type for "a staff member logged a new personal contact for
-- Partnerships to see" (My Contacts feature, 0141). Its own migration: ALTER TYPE
-- ... ADD VALUE can't be used in the same transaction as a later statement that
-- references the new value (see 0070/0074/0076 for the same pattern).
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_contact';

-- 0125_lcp_message_delete.sql
-- Allows staff and family members to delete their own lcp_messages rows.
-- 0005_lcp.sql defined select/insert/update policies for lcp_messages but never a
-- delete policy. Same failure mode already hit and fixed for chat_messages
-- (0063_chat_message_delete.sql, 0118_chat_message_update.sql): without a DELETE
-- policy, the client's delete matches 0 rows silently (no error surfaced), and the
-- message reappears the next time the thread is refetched from the server. This
-- means "delete message" has been silently broken for the LCP family <-> staff
-- thread (both the family portal and, as of the staff-side StaffThread.tsx build
-- on 2026-08-03, the staff side too) until this migration runs.

DO $$ BEGIN
  CREATE POLICY messages_family_delete ON lcp_messages
    FOR DELETE TO authenticated
    USING (family_id = current_family() AND sender_kind = 'family');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY messages_staff_delete ON lcp_messages
    FOR DELETE TO authenticated
    USING (lcp_is_full() AND sender_kind = 'staff' AND sender_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

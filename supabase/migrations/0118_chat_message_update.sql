-- 0118_chat_message_update.sql
-- Allows staff to edit their own chat messages.
-- 0013_chat.sql intentionally omitted update in v1 ("No update/delete in v1"), and
-- 0054_messaging_enhancements.sql later added the edit feature/UI without adding this
-- policy. Same failure mode already fixed for delete in 0063_chat_message_delete.sql:
-- without an UPDATE policy, the client's edit matches 0 rows silently (no error), the
-- edited text only ever lives in local optimistic UI state, and the original body
-- reappears the next time the thread is refetched from the server.

DO $$ BEGIN
  CREATE POLICY chat_messages_update_own ON chat_messages
    FOR UPDATE TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

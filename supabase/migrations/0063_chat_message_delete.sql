-- 0063_chat_message_delete.sql
-- Allows staff to delete their own chat messages.
-- Original 0013_chat.sql intentionally omitted delete in v1 ("No update/delete in v1").
-- Without this policy, client deletes match 0 rows silently and the message reappears
-- on the next fetchMessages call.

CREATE POLICY chat_messages_delete_own ON chat_messages
  FOR DELETE TO authenticated
  USING (author_id = auth.uid());

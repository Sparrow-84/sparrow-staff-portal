-- 0060_chat_management.sql
-- Group chat rename and delete via SECURITY DEFINER RPCs — any member can do either.

-- Rename: any member of a group chat can update its title.
create or replace function chat_rename_channel(p_channel uuid, p_title text)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from chat_members where channel_id = p_channel and user_id = auth.uid()
  ) then
    raise exception 'Not a member of this channel';
  end if;
  if not exists (
    select 1 from chat_channels where id = p_channel and kind = 'group'
  ) then
    raise exception 'Only group chats can be renamed';
  end if;
  update chat_channels set title = trim(p_title) where id = p_channel;
end;
$$;

-- Delete: any member can permanently delete a group and all its messages.
create or replace function chat_delete_channel(p_channel uuid)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from chat_members where channel_id = p_channel and user_id = auth.uid()
  ) then
    raise exception 'Not a member of this channel';
  end if;

  -- Dependency order: reactions -> messages -> members -> channel
  delete from chat_reactions where channel_id = p_channel;
  delete from chat_messages  where channel_id = p_channel;
  delete from chat_members   where channel_id = p_channel;
  delete from chat_channels  where id = p_channel;
end;
$$;

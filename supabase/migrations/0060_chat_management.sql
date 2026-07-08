-- 0060_chat_management.sql
-- Group chat rename (any member) and delete (admin or creator) via SECURITY DEFINER RPCs.

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

-- Delete: admin or channel creator only. Removes messages, reactions, members, then channel.
create or replace function chat_delete_channel(p_channel uuid)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from chat_channels
    where id = p_channel
    and (
      created_by = auth.uid()
      or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    )
  ) then
    raise exception 'Not authorized to delete this channel';
  end if;

  -- Dependency order: reactions → messages → members → channel
  delete from chat_reactions where channel_id = p_channel;
  delete from chat_messages  where channel_id = p_channel;
  delete from chat_members   where channel_id = p_channel;
  delete from chat_channels  where id = p_channel;
end;
$$;

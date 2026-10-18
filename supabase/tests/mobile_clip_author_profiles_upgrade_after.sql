do $$ declare value jsonb; clip uuid;
begin
  select id into clip from public.fan_clips where app_user_id='77000000-0000-4000-8000-000000000001' and idempotency_key='77000000-0000-4000-8000-000000000021';
  value:=public.read_mobile_content_fan_clip('77000000-0000-4000-8000-000000000002',clip);
  if value is null or jsonb_set(value,'{author}',(value->'author')-'profileId'-'fanTier')<>(select payload from public._mobile_clip_author_upgrade_snapshot) then raise exception 'clip upgrade changed existing content'; end if;
  if value#>>'{author,profileId}' is not null then raise exception 'upgrade exposed private author'; end if;
end $$;

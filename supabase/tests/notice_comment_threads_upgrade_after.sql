do $$
declare result jsonb;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='celebrity_notice_comments' and column_name='parent_id'
  ) or to_regclass('public.celebrity_notice_comment_reactions') is null then
    raise exception 'notice comment thread schema missing after upgrade';
  end if;
  if not exists (
    select 1 from public.celebrity_notice_comments
    where id='71400000-0000-4000-8000-000000000004'
      and body='업그레이드 전에 작성한 댓글' and parent_id is null
  ) then raise exception 'existing flat notice comment was not preserved'; end if;
  result:=public.read_celebrity_notice_comments(
    'notice-thread-upgrade','upgrade-notice','71400000-0000-4000-8000-000000000001',null,null,20,'ko'
  );
  if result#>>'{comments,0,id}'<>'71400000-0000-4000-8000-000000000004'
    or result#>>'{comments,0,parentId}' is not null
    or result#>'{comments,0,reactions}'<>'[]'::jsonb then
    raise exception 'legacy comment projection changed after upgrade: %',result;
  end if;
  if to_regprocedure('public.post_celebrity_notice_reply(uuid,text,text,text,uuid,uuid)') is null
    or to_regprocedure('public.set_notice_comment_reaction(uuid,uuid,text,boolean)') is null
    or to_regprocedure('public.read_celebrity_fanpage_for_viewer(text,uuid,public.content_locale)') is null then
    raise exception 'notice comment thread RPC missing after upgrade';
  end if;
  if has_table_privilege('service_role','public.celebrity_notice_comment_reactions','SELECT')
    or has_function_privilege('authenticated','public.set_notice_comment_reaction(uuid,uuid,text,boolean)','EXECUTE')
    or not has_function_privilege('service_role','public.set_notice_comment_reaction(uuid,uuid,text,boolean)','EXECUTE') then
    raise exception 'notice comment thread ACL mismatch after upgrade';
  end if;
end $$;

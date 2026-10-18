do $$
declare result jsonb;
begin
 if (select to_jsonb(comment) from public.celebrity_notice_comments comment where id='81400000-0000-4000-8000-000000000004') is distinct from
    (select payload from public.notice_source_upgrade_snapshot where kind='comment')
 or (select jsonb_agg(to_jsonb(reaction) order by emoji) from public.celebrity_notice_comment_reactions reaction where comment_id='81400000-0000-4000-8000-000000000004') is distinct from
    (select payload from public.notice_source_upgrade_snapshot where kind='reactions') then
   raise exception 'Existing comment or historical reaction rows changed during upgrade'; end if;
 result:=public.read_celebrity_notice_comments('notice-source-upgrade','upgrade-notice','81400000-0000-4000-8000-000000000001',null,null,20,'ko');
 if result#>'{comments,0,reactions}'<>'[{"emoji":"clap","count":1,"selected":true}]'::jsonb
   or result#>>'{comments,0,isFriend}'<>'false' then
   raise exception 'Single-choice legacy projection failed: %',result; end if;
 if has_function_privilege('authenticated','public.set_notice_comment_reaction(uuid,uuid,text,boolean)','EXECUTE')
   or has_function_privilege('anon','public.read_celebrity_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale)','EXECUTE') then
   raise exception 'Notice source RPC is exposed'; end if;
 raise notice 'PASS notice source upgrade preserves rows and projects one reaction';
end $$;

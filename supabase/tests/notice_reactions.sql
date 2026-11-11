-- Run against the disposable fixture in work/notice-reactions-1328 after applying the migration.
\set ON_ERROR_STOP on
begin;
do $$declare r jsonb; u uuid:='11111111-1111-4111-8111-111111111111';begin
 r:=public.set_celebrity_notice_reaction(u,'elina','notice','ko','like');
 assert r->>'reaction'='like' and (r->>'likeCount')::int=1;
 r:=public.set_celebrity_notice_reaction(u,'elina','notice','ko','dislike');
 assert r->>'reaction'='dislike' and (r->>'likeCount')::int=0 and r->'dislikeCount'='null'::jsonb;
 r:=public.set_celebrity_notice_reaction(u,'elina','notice','ko','dislike');
 assert (select count(*) from public.celebrity_notice_dislikes)=1;
 perform public.set_celebrity_notice_liked(u,'elina','notice',true);
 assert not exists(select 1 from public.celebrity_notice_dislikes);
 r:=public.set_celebrity_notice_reaction(u,'elina','notice','ko','none');
 assert r->'reaction'='null'::jsonb and (r->>'likeCount')::int=0;
 assert not has_table_privilege('service_role','public.celebrity_notice_dislikes','select');
 assert not has_function_privilege('anon','public.set_celebrity_notice_reaction(uuid,text,text,public.content_locale,text)','execute');
 assert public.read_celebrity_notice_reaction(null,'elina','missing','ko') is null;
end$$;
rollback;

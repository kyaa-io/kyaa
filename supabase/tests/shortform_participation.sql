-- Local transaction-only fixtures; every write rolls back.
begin;
do $$
declare a uuid := 'a1000000-0000-4000-8000-000000000001'; b uuid := 'a1000000-0000-4000-8000-000000000002'; k uuid := 'a2000000-0000-4000-8000-000000000001'; v text; r jsonb; comment_id uuid;
begin
 select video_id into v from public.home_shortform where public.home_gallery_creator_public(celebrity_id) limit 1;
 if v is null then raise exception 'test requires a public shortform fixture'; end if;
 insert into public.app_users(id,privy_user_id,verified_email) values (a,'did:fixture:shortform-a','shortform-a@example.invalid'),(b,'did:fixture:shortform-b','shortform-b@example.invalid');
 r:=public.set_shortform_reaction(v,a,'like');
 if r->>'reaction'<>'like' or (r->>'likeCount')::int<1 then raise exception 'like failed'; end if;
 r:=public.set_shortform_reaction(v,a,'dislike');
 if r->>'reaction'<>'dislike' or (select count(*) from public.shortform_reactions where video_id=v and app_user_id=a)<>1 then raise exception 'mutual exclusion failed'; end if;
 r:=public.set_shortform_reaction(v,a,'none');
 if r->'reaction'<>'null'::jsonb or exists(select 1 from public.shortform_reactions where video_id=v and app_user_id=a) then raise exception 'reaction removal failed'; end if;
 r:=public.post_shortform_comment(v,a,'fixture comment',k); comment_id:=(r->>'id')::uuid;
 r:=public.post_shortform_comment(v,a,'fixture comment',k);
 if (r->>'replayed')::boolean is not true or (r->>'id')::uuid<>comment_id then raise exception 'retry was not idempotent'; end if;
 begin perform public.post_shortform_comment(v,a,'different content',k); raise exception 'expected conflict'; exception when raise_exception then if sqlerrm<>'FAN_WEB_CONFLICT' then raise; end if; end;
 r:=public.read_shortform_comments(v,null,'ko',null,null);
 if not exists(select 1 from jsonb_array_elements(r->'items') item where item->>'id'=comment_id::text and (item->>'isOwner')::boolean=false) then raise exception 'public comment read failed'; end if;
 begin perform public.remove_shortform_comment(comment_id,b); raise exception 'expected not found'; exception when raise_exception then if sqlerrm<>'FAN_WEB_NOT_FOUND' then raise; end if; end;
 perform public.remove_shortform_comment(comment_id,a);
 if exists(select 1 from public.shortform_comments where id=comment_id and deleted_at is null) then raise exception 'owner deletion failed'; end if;
 if public.read_shortform_participation('___________',null) is not null then raise exception 'non-public video visible'; end if;
 if has_function_privilege('anon','public.set_shortform_reaction(text,uuid,text)','execute') or not has_function_privilege('service_role','public.set_shortform_reaction(text,uuid,text)','execute') then raise exception 'function grants incorrect'; end if;
end $$;
rollback;

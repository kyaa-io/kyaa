-- Synthetic-only assertions for 20261219030000: the cross-page public lists (home fan board, /api/public/home-feed) leave out posts and
-- cheers of an unlisted creator fan page and posts of an unlisted group page; listed pages and creators without a page still show.
-- list_unlisted_creator_slugs names exactly the unlisted creators, for service_role only.
-- Every page of each list is read, so other rows in the database do not hide a leak. All changes roll back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.board_ids(viewer uuid,groups boolean) returns text[] language plpgsql as $f$
declare r jsonb;ids text[]:='{}';p integer:=1;
begin
 loop
  r:=public.read_public_popular_posts_page(viewer,'ko',p,groups);
  ids:=ids||array(select x->>'id' from jsonb_array_elements(r->'items') x);
  exit when not (r->>'hasMore')::boolean or p>=1000;p:=p+1;
 end loop;
 return ids;
end $f$;
do $$
declare
 u1 uuid:=extensions.gen_random_uuid();u2 uuid:=extensions.gen_random_uuid();
 c_listed uuid:=extensions.gen_random_uuid();c_unlisted uuid:=extensions.gen_random_uuid();c_nopage uuid:=extensions.gen_random_uuid();
 g_listed uuid;g_unlisted uuid;
 fp_listed uuid:=extensions.gen_random_uuid();fp_unlisted uuid:=extensions.gen_random_uuid();fp_nopage uuid:=extensions.gen_random_uuid();
 ch_listed uuid:=extensions.gen_random_uuid();ch_unlisted uuid:=extensions.gen_random_uuid();
 gp_listed uuid:=extensions.gen_random_uuid();gp_unlisted uuid:=extensions.gen_random_uuid();gp_unlisted_fan uuid:=extensions.gen_random_uuid();
 fanpage_unlisted uuid;
 r jsonb;ids text[];p integer;
begin
 insert into public.app_users(id,privy_user_id,verified_email)values(u1,'did:privy:listed-'||u1,u1||'@example.test'),(u2,'did:privy:listed-'||u2,u2||'@example.test');
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values
  (c_listed,'listed-fixture-shown','published','/fixture.webp',now(),'{creator}','creator'),
  (c_unlisted,'listed-fixture-unlisted','published','/fixture.webp',now(),'{creator}','creator'),
  (c_nopage,'listed-fixture-nopage','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values
  (c_listed,'ko','노출 검증','요약','대체'),(c_unlisted,'ko','미노출 검증','요약','대체'),(c_nopage,'ko','페이지 없음 검증','요약','대체');
 insert into public.group_pages(kind,celebrity_id,name)values('fan',c_listed,'노출 팬 페이지');
 insert into public.group_pages(kind,celebrity_id,name,listed)values('fan',c_unlisted,'[시험] 미노출 팬 페이지',false)returning id into fanpage_unlisted;
 insert into public.group_pages(kind,celebrity_id,name)values('hobby',null,'노출 모임')returning id into g_listed;
 insert into public.group_pages(kind,celebrity_id,name,listed)values('hobby',null,'[시험] 미노출 모임',false)returning id into g_unlisted;

 -- Newest rows in the database, so the three-item home feed would pick the unlisted creator first without the filter.
 insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at,updated_at)values
  (fp_unlisted,c_unlisted,u1,'[시험] 미노출 페이지 글','public',extensions.gen_random_uuid(),'h',now()+interval '30 days',now()),
  (fp_listed,c_listed,u1,'노출 페이지 글','public',extensions.gen_random_uuid(),'h',now()+interval '29 days',now()),
  (fp_nopage,c_nopage,u1,'페이지 없는 크리에이터 글','public',extensions.gen_random_uuid(),'h',now()+interval '27 days',now());
 insert into public.fan_lounge_messages(id,celebrity_id,app_user_id,body,idempotency_key,created_at)values
  (ch_unlisted,c_unlisted,u1,'[시험] 미노출 응원',extensions.gen_random_uuid(),now()+interval '30 days'),
  (ch_listed,c_listed,u1,'노출 응원',extensions.gen_random_uuid(),now()+interval '28 days');
 insert into public.group_posts(id,page_id,author_id,title,body,visibility,anonymous,category,created_at)values
  (gp_listed,g_listed,u1,'노출 모임 글','본문','public',false,'free',now()+interval '29 days'),
  (gp_unlisted,g_unlisted,u1,'[시험] 미노출 모임 글','본문','public',false,'free',now()+interval '30 days'),
  (gp_unlisted_fan,fanpage_unlisted,u1,'[시험] 미노출 팬 페이지 모임 글','본문','public',false,'free',now()+interval '30 days');
 -- Likes put the unlisted posts at the top of the board ranking if they leak.
 insert into public.fan_post_likes(post_id,app_user_id)values(fp_unlisted,u1),(fp_unlisted,u2),(fp_listed,u1);
 insert into public.group_post_reactions(post_id,app_user_id)values(gp_unlisted,u1),(gp_unlisted,u2),(gp_unlisted_fan,u1),(gp_listed,u1);

 -- Home fan board, groups on: every page.
 ids:=pg_temp.board_ids(null,true);
 if not (array[fp_listed::text,fp_nopage::text,gp_listed::text] <@ ids) then raise exception 'board lost a listed post';end if;
 if ids && array[fp_unlisted::text,gp_unlisted::text,gp_unlisted_fan::text] then raise exception 'board shows an unlisted page post: %',array(select unnest(ids) intersect select unnest(array[fp_unlisted::text,gp_unlisted::text,gp_unlisted_fan::text]));end if;
 -- Groups off: only fan posts, same filter.
 ids:=pg_temp.board_ids(u2,false);
 if not (array[fp_listed::text,fp_nopage::text] <@ ids) or ids && array[fp_unlisted::text,gp_listed::text] then raise exception 'board without groups wrong';end if;

 -- Home feed: the newest three.
 r:=public.read_public_home_feed(null,'ko');
 ids:=array(select x#>>'{item,id}' from jsonb_array_elements(r->'items') with ordinality t(x,o) order by o);
 if ids<>array[fp_listed::text,ch_listed::text,fp_nopage::text] then raise exception 'home feed wrong: %',r;end if;
 if r::text like '%listed-fixture-unlisted%' then raise exception 'home feed shows the unlisted creator: %',r;end if;
 r:=public.read_public_home_feed(u2,'en');
 if r::text like '%listed-fixture-unlisted%' or jsonb_array_length(r->'items')<>3 then raise exception 'home feed (member) wrong: %',r;end if;

 -- Paged home feed: every page.
 ids:='{}';p:=1;
 loop
  r:=public.read_public_home_feed_page(null,'ko',p);
  ids:=ids||array(select x#>>'{item,id}' from jsonb_array_elements(r->'items') x);
  exit when not (r->>'hasMore')::boolean or p>=1000;p:=p+1;
 end loop;
 if not (array[fp_listed::text,ch_listed::text,fp_nopage::text] <@ ids) then raise exception 'paged home feed lost a listed item';end if;
 if ids && array[fp_unlisted::text,ch_unlisted::text] then raise exception 'paged home feed shows the unlisted creator: %',array(select unnest(ids) intersect select unnest(array[fp_unlisted::text,ch_unlisted::text]));end if;

 -- Directory paths (/community, /api/public/celebrities, sitemap) read the unlisted creators from list_unlisted_creator_slugs.
 if not ('listed-fixture-unlisted' = any(public.list_unlisted_creator_slugs()))
    or 'listed-fixture-shown' = any(public.list_unlisted_creator_slugs())
    or 'listed-fixture-nopage' = any(public.list_unlisted_creator_slugs()) then raise exception 'unlisted creator slugs wrong: %',public.list_unlisted_creator_slugs();end if;
 if not has_function_privilege('service_role','public.list_unlisted_creator_slugs()','execute')
    or has_function_privilege('anon','public.list_unlisted_creator_slugs()','execute')
    or has_function_privilege('authenticated','public.list_unlisted_creator_slugs()','execute') then raise exception 'unlisted creator slugs grant wrong';end if;

 -- Listing the page again brings its posts back (the flag, not the data, decides).
 update public.group_pages set listed=true where id in (fanpage_unlisted,g_unlisted);
 if not (array[fp_unlisted::text,gp_unlisted::text,gp_unlisted_fan::text] <@ pg_temp.board_ids(null,true)) then raise exception 'relisted page posts missing';end if;
 r:=public.read_public_home_feed(null,'ko');
 if r#>>'{items,0,creatorSlug}'<>'listed-fixture-unlisted' then raise exception 'relisted creator missing from home feed: %',r;end if;
 if 'listed-fixture-unlisted' = any(public.list_unlisted_creator_slugs()) then raise exception 'relisted creator still in unlisted slugs';end if;
end $$;
rollback;

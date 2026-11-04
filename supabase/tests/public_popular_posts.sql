-- Synthetic-only assertions for read_public_popular_posts_page; run against a new isolated cluster after the full migration chain.
begin;
do $$
declare
 u1 uuid:=extensions.gen_random_uuid();u2 uuid:=extensions.gen_random_uuid();u3 uuid:=extensions.gen_random_uuid();ud uuid:=extensions.gen_random_uuid();ub uuid:=extensions.gen_random_uuid();adm uuid:=extensions.gen_random_uuid();
 c1 uuid:=extensions.gen_random_uuid();c2 uuid:=extensions.gen_random_uuid();c3 uuid:=extensions.gen_random_uuid();c4 uuid:=extensions.gen_random_uuid();wave uuid;
 hobby uuid;hidden uuid;fanpage uuid;wavepage uuid;
 fp_pop uuid:=extensions.gen_random_uuid();fp_members uuid:=extensions.gen_random_uuid();fp_zero uuid:=extensions.gen_random_uuid();fp_hidden uuid:=extensions.gen_random_uuid();fp_disabled uuid:=extensions.gen_random_uuid();fp_archived uuid:=extensions.gen_random_uuid();fp_blocked uuid:=extensions.gen_random_uuid();fp_nopage uuid:=extensions.gen_random_uuid();fp_hiddenpage uuid:=extensions.gen_random_uuid();asset_wait uuid:=extensions.gen_random_uuid();asset_gone uuid:=extensions.gen_random_uuid();asset_ok uuid:=extensions.gen_random_uuid();
 gp_pop uuid:=extensions.gen_random_uuid();gp_members uuid:=extensions.gen_random_uuid();gp_notice uuid:=extensions.gen_random_uuid();gp_removed uuid:=extensions.gen_random_uuid();gp_hidden_page uuid:=extensions.gen_random_uuid();gp_wave uuid:=extensions.gen_random_uuid();gp_recent uuid:=extensions.gen_random_uuid();gp_blocked uuid:=extensions.gen_random_uuid();gp_inactive uuid:=extensions.gen_random_uuid();
 r jsonb;ids text;i integer;
begin
 insert into public.app_users(id,privy_user_id,verified_email)values(u1,'did:privy:pop-'||u1,u1||'@example.test'),(u2,'did:privy:pop-'||u2,u2||'@example.test'),(u3,'did:privy:pop-'||u3,u3||'@example.test'),(ud,'did:privy:pop-'||ud,ud||'@example.test'),(ub,'did:privy:pop-'||ub,ub||'@example.test');
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(c1,'pop-fixture-a','published','/fixture.webp',now(),'{creator}','creator'),(c3,'pop-fixture-nopage','published','/fixture.webp',now(),'{creator}','creator'),(c4,'pop-fixture-hiddenpage','published','/fixture.webp',now(),'{creator}','creator');
 -- Archived creator: archived_at is set at insert because the lifecycle trigger blocks later updates outside the lifecycle command.
 insert into public.admin_allowlist(id,email,role,active)values(adm,'pop-admin-'||adm||'@example.test','viewer',true);
 insert into public.celebrities(id,slug,status,image_url,published_at,archived_at,archived_by_admin_allowlist_id,archive_reason,roles,primary_role)values(c2,'pop-fixture-archived','published','/fixture.webp',now(),now(),adm,'archived popular board fixture','{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(c1,'ko','인기 검증','요약','대체'),(c1,'en','Popular fixture','Summary','Alt'),(c2,'ko','보관 검증','요약','대체'),(c3,'ko','페이지 없음 검증','요약','대체'),(c4,'ko','숨김 페이지 검증','요약','대체');
 select id into wave from public.celebrities where slug='kyaa-wave-fanpage';
 if wave is null then wave:=extensions.gen_random_uuid();insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(wave,'kyaa-wave-fanpage','published','/fixture-wave.webp',now(),'{creator}','creator');insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(wave,'ko','WAVE','요약','대체');end if;
 insert into public.group_pages(kind,celebrity_id,name)values('fan',c1,'fixture fan page')returning id into fanpage;
 insert into public.group_pages(kind,celebrity_id,name)values('hobby',null,'취미 검증')returning id into hobby;
 insert into public.group_pages(kind,celebrity_id,name,status)values('hobby',null,'숨김 검증','hidden')returning id into hidden;
 insert into public.group_pages(kind,celebrity_id,name,status)values('fan',c4,'숨김 팬 페이지','hidden');
 select id into wavepage from public.group_pages where celebrity_id=wave;
 if wavepage is null then insert into public.group_pages(kind,celebrity_id,name)values('fan',wave,'WAVE fixture')returning id into wavepage;end if;

 insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at)values
  (fp_pop,c1,u1,'팬 인기 글','public',extensions.gen_random_uuid(),'h',now()-interval '3 days'),
  (fp_members,c1,u1,'팬 회원 전용 글','members',extensions.gen_random_uuid(),'h',now()-interval '1 day'),
  (fp_zero,c1,u1,'팬 최신 글','public',extensions.gen_random_uuid(),'h',now()-interval '1 hour'),
  (fp_hidden,c1,u1,'팬 숨김 글','public',extensions.gen_random_uuid(),'h',now()),
  (fp_disabled,c1,ud,'탈퇴 작성자 글','public',extensions.gen_random_uuid(),'h',now()),
  (fp_archived,c2,u1,'보관 크리에이터 글','public',extensions.gen_random_uuid(),'h',now()),
  (fp_blocked,c1,ub,'차단 대상 팬 글','public',extensions.gen_random_uuid(),'h',now()-interval '10 days'),
  (fp_nopage,c3,u1,'페이지 없는 크리에이터 글','public',extensions.gen_random_uuid(),'h',now()-interval '11 days'),
  (fp_hiddenpage,c4,u1,'숨김 페이지 팬 글','public',extensions.gen_random_uuid(),'h',now());
 update public.fan_posts set hidden_at=now() where id=fp_hidden;
 update public.app_users set status='disabled' where id=ud;
 insert into public.fan_post_likes(post_id,app_user_id)values(fp_pop,u1),(fp_pop,u2),(fp_members,u1),(fp_members,u2),(fp_members,u3),(fp_hidden,u1),(fp_archived,u1);

 insert into public.group_posts(id,page_id,author_id,title,body,visibility,anonymous,category,created_at)values
  (gp_pop,hobby,u1,'모임 인기 글','본문','public',false,'free',now()-interval '2 days'),
  (gp_members,hobby,u1,'모임 회원 전용 글','본문','members',false,'free',now()),
  (gp_notice,hobby,u1,'모임 공지','본문','public',false,'notice',now()),
  (gp_removed,hobby,u1,'모임 삭제 글','본문','public',false,'free',now()),
  (gp_hidden_page,hidden,u1,'숨김 모임 글','본문','public',false,'free',now()),
  (gp_wave,wavepage,u1,'WAVE 글','본문','public',false,'free',now()),
  (gp_recent,hobby,u2,'모임 익명 최신 글','본문','public',true,'free',now()-interval '2 hours'),
  (gp_blocked,hobby,ub,'차단 대상 모임 글','본문','public',false,'free',now()-interval '9 days'),
  (gp_inactive,hobby,ud,'탈퇴 작성자 모임 글','본문','public',false,'free',now());
 update public.group_posts set removed_at=now() where id=gp_removed;
 -- First asset: only a ready, not-deleted image counts; the earlier unfinished and storage-deleted ones are skipped.
 insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,width,height,request_id,request_hash,attached_type,attached_id,position,storage_deleted_at)values
  (asset_wait,u1,'image','group_image','image/png',100,null,'pop/'||asset_wait||'.png','pop/'||asset_wait||'.webp','processing',null,null,extensions.gen_random_uuid(),'h','group_post',gp_pop,0,null),
  (asset_gone,u1,'image','group_image','image/png',100,100,'pop/'||asset_gone||'.png','pop/'||asset_gone||'.webp','ready',20,20,extensions.gen_random_uuid(),'h','group_post',gp_pop,1,now()),
  (asset_ok,u1,'image','group_image','image/png',100,100,'pop/'||asset_ok||'.png','pop/'||asset_ok||'.webp','ready',30,20,extensions.gen_random_uuid(),'h','group_post',gp_pop,2,null);
 insert into public.group_post_reactions(post_id,app_user_id)values(gp_pop,u1),(gp_pop,u2),(gp_pop,u3),(gp_members,u1),(gp_notice,u1),(gp_notice,u2),(gp_wave,u1),(gp_hidden_page,u1);
 insert into public.group_post_views(post_id,app_user_id)values(gp_pop,u1),(gp_pop,u2);
 insert into public.group_comments(post_id,author_id,body,anonymous)values(gp_pop,u2,'댓글',false),(gp_recent,u1,'댓글',false);

 r:=public.read_public_popular_posts_page(null,'ko',1);
 ids:=(select string_agg(x->>'id',',' order by o) from jsonb_array_elements(r->'items') with ordinality t(x,o));
 -- Exposure: only public, published, non-notice posts; nothing from members-only/removed/hidden/archived/wave/disabled-author.
 if jsonb_array_length(r->'items')<>7 then raise exception 'unexpected item count %',r;end if;
 if exists(select 1 from jsonb_array_elements(r->'items') x where (x->>'id')::uuid in(fp_members,fp_hidden,fp_disabled,fp_archived,fp_hiddenpage,gp_members,gp_notice,gp_removed,gp_hidden_page,gp_wave,gp_inactive)) then raise exception 'non-public or excluded post exposed %',r;end if;
 -- Ordering: likes, comments, newest. gp_pop(3 likes) > fp_pop(2) > gp_recent(0 likes, 1 comment) > then zero-engagement newest first.
 if ids<>gp_pop||','||fp_pop||','||gp_recent||','||fp_zero||','||gp_blocked||','||fp_blocked||','||fp_nopage then raise exception 'unexpected order %',ids;end if;
 if r#>>'{items,0,source}'<>'group' or (r#>>'{items,0,viewCount}')::int<>2 or (r#>>'{items,0,commentCount}')::int<>1 or r#>>'{items,0,pageName}'<>'취미 검증' then raise exception 'unexpected group item %',r#>'{items,0}';end if;
 if r#>>'{items,1,source}'<>'fan' or r#>>'{items,1,pageRef}'<>'pop-fixture-a' or r#>>'{items,1,pageName}'<>'인기 검증' or r#>'{items,1,viewCount}'<>'null'::jsonb then raise exception 'unexpected fan item %',r#>'{items,1}';end if;
 if (r->>'hasMore')::boolean then raise exception 'unexpected hasMore %',r;end if;
 -- Anonymous group posts show the neutral nickname, never the author's profile.
 if (select x->>'nickname' from jsonb_array_elements(r->'items') x where (x->>'id')::uuid=gp_recent)<>'익명' then raise exception 'anonymous nickname leaked %',r;end if;
 -- Members-only post inside a public page, hidden page, inactive authors, archived and hidden fan pages stay out (checked above); a creator without any group page keeps its fan post.
 if not exists(select 1 from jsonb_array_elements(r->'items') x where (x->>'id')::uuid=fp_nopage and x->>'source'='fan') then raise exception 'creator without a group page lost its fan post';end if;
 -- Only the ready, not-deleted image is exposed as the first asset.
 if (r#>>'{items,0,asset,id}')::uuid<>asset_ok or (r#>>'{items,0,asset,width}')::int<>30 or r#>'{items,1,asset}'<>'null'::jsonb then raise exception 'unexpected first asset %',r#>'{items,0}';end if;
 -- Feature flag off: no group post at all, and the fan list is not shortened or padded.
 r:=public.read_public_popular_posts_page(null,'ko',1,false);
 if jsonb_array_length(r->'items')<>4 or exists(select 1 from jsonb_array_elements(r->'items') x where x->>'source'<>'fan') or (r->>'hasMore')::boolean then raise exception 'flag off leaked group posts %',r;end if;
 r:=public.read_public_popular_posts_page(null,'ko',1);
 -- English requests use the English creator name.
 if public.read_public_popular_posts_page(null,'en',1)#>>'{items,1,pageName}'<>'Popular fixture' then raise exception 'locale name';end if;
 -- Members of the page get no extra rows: the viewer id never widens exposure.
 insert into public.group_memberships(page_id,app_user_id)values(hobby,u1);
 if public.read_public_popular_posts_page(u1,'ko',1)<>r then raise exception 'membership changed public result';end if;
 -- Blocked authors are removed for the blocking viewer only (both fan and group posts); guests still see them.
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(u3,ub);
 r:=public.read_public_popular_posts_page(u3,'ko',1);
 if jsonb_array_length(r->'items')<>5 or exists(select 1 from jsonb_array_elements(r->'items') x where (x->>'id')::uuid in(gp_blocked,fp_blocked)) then raise exception 'blocked author visible %',r;end if;
 if public.read_public_popular_posts_page(u2,'ko',1)::text not like '%'||gp_blocked::text||'%' then raise exception 'block leaked to another viewer';end if;
 r:=public.read_public_popular_posts_page(null,'ko',1);
 -- Paging: with 14 more public posts the first page is full, hasMore is true and page 2 holds the remainder without repeats.
 for i in 1..14 loop
  insert into public.group_posts(page_id,author_id,title,body,visibility,anonymous,category,created_at)values(hobby,u1,'추가 글 '||i,'본문','public',false,'free',now()-(i||' minutes')::interval);
 end loop;
 r:=public.read_public_popular_posts_page(null,'ko',1);
 if jsonb_array_length(r->'items')<>10 or not (r->>'hasMore')::boolean then raise exception 'page 1 shape %',r;end if;
 if jsonb_array_length(public.read_public_popular_posts_page(null,'ko',2)->'items')<>10 or not (public.read_public_popular_posts_page(null,'ko',2)->>'hasMore')::boolean then raise exception 'page 2 shape';end if;
 if (select count(distinct x->>'id') from (select jsonb_array_elements(public.read_public_popular_posts_page(null,'ko',1)->'items') x union all select jsonb_array_elements(public.read_public_popular_posts_page(null,'ko',2)->'items') union all select jsonb_array_elements(public.read_public_popular_posts_page(null,'ko',3)->'items')) q)<>21 then raise exception 'pages overlap or miss';end if;
 if jsonb_array_length(public.read_public_popular_posts_page(null,'ko',3)->'items')<>1 or (public.read_public_popular_posts_page(null,'ko',3)->>'hasMore')::boolean or jsonb_array_length(public.read_public_popular_posts_page(null,'ko',4)->'items')<>0 then raise exception 'page 3 shape';end if;
 -- All counters zero keeps the board alive in newest-first order.
 delete from public.group_comments;delete from public.group_post_reactions;delete from public.fan_post_likes;
 r:=public.read_public_popular_posts_page(null,'ko',1);
 if jsonb_array_length(r->'items')<>10 or r#>>'{items,0,title}'<>'추가 글 1' or r#>>'{items,1,title}'<>'추가 글 2' then raise exception 'zero-engagement order %',r#>'{items,0}';end if;
 -- Flag off with many fan posts: page size and hasMore count only fan posts (4 + 8 = 12) even though 14 group posts exist.
 for i in 1..8 loop
  insert into public.fan_posts(celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at)values(c3,u1,'추가 팬 글 '||i,'public',extensions.gen_random_uuid(),'h',now()-((20+i)||' days')::interval);
 end loop;
 r:=public.read_public_popular_posts_page(null,'ko',1,false);
 if jsonb_array_length(r->'items')<>10 or not (r->>'hasMore')::boolean or exists(select 1 from jsonb_array_elements(r->'items') x where x->>'source'<>'fan') then raise exception 'flag off page 1 %',r;end if;
 r:=public.read_public_popular_posts_page(null,'ko',2,false);
 if jsonb_array_length(r->'items')<>2 or (r->>'hasMore')::boolean then raise exception 'flag off page 2 %',r;end if;
 -- ACL: service_role only; the earlier three-argument signature must not exist.
 if to_regprocedure('public.read_public_popular_posts_page(uuid,public.content_locale,integer)') is not null then raise exception 'stale three-argument signature';end if;
 if has_function_privilege('anon','public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)','execute') or has_function_privilege('authenticated','public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)','execute') or not has_function_privilege('service_role','public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)','execute') then raise exception 'unexpected acl';end if;
end $$;
rollback;

\set ON_ERROR_STOP on
-- B6 plan v4 §10.1 S9–S11c: opening a profile from content, signed in and signed out, and the sign-in return ref.
-- Synthetic fixtures only; everything rolls back.
do $$ begin if inet_server_addr() is not null then raise exception 'Disposable local database required'; end if; end $$;
begin;
create function pg_temp.err(p_statement text) returns text language plpgsql as $$
begin execute p_statement; return 'ok'; exception when others then return sqlerrm; end $$;

do $test$
declare creator uuid:=extensions.gen_random_uuid();slug text:='b6-ref-fixture';gpage uuid:=extensions.gen_random_uuid();anon_page uuid:=extensions.gen_random_uuid();
 author uuid:=extensions.gen_random_uuid();viewer uuid:=extensions.gen_random_uuid();blocker uuid:=extensions.gen_random_uuid();gone uuid:=extensions.gen_random_uuid();
 later uuid:=extensions.gen_random_uuid();u uuid;post uuid;comment uuid;hidden_post uuid;proof uuid;gone_post uuid;gpost uuid;anon_gpost uuid;i integer;
 r jsonb;ref jsonb;t1 uuid;t2 uuid;computed timestamptz:=date_trunc('second',now()-interval '1 hour');start date;
 private_keys text[]:=array['id','relationship','dm','capabilities','reach','returnRef','token','profileId','isSelf','activities','commonFavorites'];
 k text;cnt bigint;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,slug,'published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','B6 참조','소개','사진'),(creator,'en','B6 ref','Summary','Photo');
 foreach u in array array[author,viewer,blocker,gone,later] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:b6r-'||u,u||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'b6r'||left(u::text,8),'b6r'||left(u::text,8));
 end loop;
 insert into public.fan_profile_public_fields(app_user_id,favorite_celebrity_id,sns_links,bio)values(author,creator,'{https://example.test/author}','소개 한 줄');
 post:=(public.save_fan_post(author,slug,null,'author post','public','{}',null,extensions.gen_random_uuid())->>'id')::uuid;
 comment:=(public.post_fan_post_comment(author,post,null,'author comment',extensions.gen_random_uuid())->>'id')::uuid;
 hidden_post:=(public.save_fan_post(author,slug,null,'hidden post','public','{}',null,extensions.gen_random_uuid())->>'id')::uuid;
 update public.fan_posts set hidden_at=now() where id=hidden_post;
 set local session_replication_role=replica;
 insert into public.fan_posts(celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,category,source_type,source_id)
  values(creator,author,'proof post','public',extensions.gen_random_uuid(),repeat('a',64),'proof','certification_submission',extensions.gen_random_uuid()) returning id into proof;
 set local session_replication_role=origin;
 gone_post:=(public.save_fan_post(gone,slug,null,'gone post','public','{}',null,extensions.gen_random_uuid())->>'id')::uuid;
 insert into public.account_deletion_requests(app_user_id,provider_subject)values(gone,'did:privy:b6r-gone');
 update public.app_users set status='disabled' where id=gone;
 insert into public.group_pages(id,kind,name)values(gpage,'hobby','B6 ref group'),(anon_page,'hobby','B6 anonymous group');
 update public.group_pages set anonymous=true where id=anon_page;
 insert into public.group_memberships(page_id,app_user_id)values(gpage,author),(anon_page,author);
 insert into public.group_posts(id,page_id,author_id,title,body,visibility,anonymous)values(extensions.gen_random_uuid(),gpage,author,'t','group body','public',false) returning id into gpost;
 insert into public.group_posts(id,page_id,author_id,title,body,visibility,anonymous)values(extensions.gen_random_uuid(),gpage,author,'t','anonymous body','public',true) returning id into anon_gpost;
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(blocker,author);

 -- Signed in and signed out, the post, comment and group post refs open the author.
 foreach ref in array array[jsonb_build_object('kind','fan_post','id',post),jsonb_build_object('kind','fan_post_comment','id',comment),jsonb_build_object('kind','group_post','id',gpost)] loop
  r:=public.read_social_profile_by_ref(viewer,ref,'ko');
  if r#>>'{profile,id}'<>author::text or r->'reach' is null or r->'card' is null or r->'dm' is null then raise exception 'signed in by % gave %',ref,r; end if;
  r:=public.read_social_profile_by_ref(null,ref,'ko');
  if r is null or r#>>'{profile,nickname}' is null or r#>>'{card,bio}'<>'소개 한 줄' or r#>>'{card,stats,creator,slug}' is distinct from slug then raise exception 'S11 signed out by % gave %',ref,r; end if;
  -- S11: no member id, relationship, message state, capabilities, reach or token anywhere in the signed-out reply.
  foreach k in array private_keys loop
   if jsonb_path_exists(r,('strict $.**."'||k||'"')::jsonpath) then raise exception 'S11 signed-out reply has %: %',k,r; end if;
  end loop;
  if r::text like '%'||author::text||'%' then raise exception 'S11 member id leaked: %',r; end if;
 end loop;
 if pg_temp.err(format('select public.read_social_profile_by_ref(null,%L,''ko'')',jsonb_build_object('kind','profile','profileId',author)))<>'SOCIAL_FORBIDDEN' then raise exception 'S11 profile kind signed out'; end if;
 if public.read_social_profile_by_ref(viewer,jsonb_build_object('kind','profile','profileId',author),'ko')#>>'{profile,id}'<>author::text then raise exception 'profile kind signed in'; end if;

 -- S9/S10: closed refs.
 if public.read_social_profile_by_ref(blocker,jsonb_build_object('kind','fan_post','id',post),'ko') is not null then raise exception 'S9 blocked viewer'; end if;
 if public.read_social_profile_by_ref(author,jsonb_build_object('kind','profile','profileId',blocker),'ko') is not null then raise exception 'S9 the blocked side'; end if;
 foreach ref in array array[jsonb_build_object('kind','group_post','id',anon_gpost),jsonb_build_object('kind','fan_post','id',gone_post),
  jsonb_build_object('kind','fan_post','id',hidden_post),jsonb_build_object('kind','fan_post','id',proof),jsonb_build_object('kind','fan_post','id',extensions.gen_random_uuid())] loop
  if public.read_social_profile_by_ref(viewer,ref,'ko') is not null or public.read_social_profile_by_ref(null,ref,'ko') is not null then raise exception 'S10 % should be closed',ref; end if;
 end loop;
 if public.read_social_profile_refs_open(viewer,jsonb_build_array(jsonb_build_object('kind','fan_post','id',post),jsonb_build_object('kind','fan_post','id',proof),
   jsonb_build_object('kind','group_post','id',anon_gpost),jsonb_build_object('kind','fan_post','id',gone_post)))->'open'<>jsonb_build_array(jsonb_build_object('kind','fan_post','id',post::text)) then raise exception 'refs open'; end if;

 -- Ranking rows: the row the viewer saw, or SOCIAL_STALE once the snapshot moved.
 set local session_replication_role=replica;
 for i in 1..100 loop
  insert into public.app_users(id,privy_user_id,verified_email)values(extensions.gen_random_uuid(),'did:privy:b6r-fan-'||i,'b6r-fan-'||i||'@example.test') returning id into u;
  insert into public.fan_reactions(id,app_user_id,celebrity_id,blockchain_job_id,completed_at)values(extensions.gen_random_uuid(),u,creator,extensions.gen_random_uuid(),now());
 end loop;
 set local session_replication_role=origin;
 start:=(select period_start from public.ranking_period_window('week',now()));
 insert into public.ranking_snapshots(kind,scope_id,period,period_start,computed_at,rows)values('fan_contribution',creator,'week',start,computed,
  jsonb_build_array(jsonb_build_object('rank',1,'subjectId',author,'score',10,'achievedAt',now())));
 ref:=jsonb_build_object('kind','page_ranking','slug',slug,'metric','fan_contribution','period','week','periodStart',start,'computedAt',computed,'rank',1);
 if public.read_social_profile_by_ref(null,ref,'ko') is null or public.read_social_profile_by_ref(viewer,ref,'ko')#>>'{profile,id}'<>author::text then raise exception 'ranking ref'; end if;
 update public.ranking_snapshots set computed_at=computed+interval '1 minute' where scope_id=creator;
 if pg_temp.err(format('select public.read_social_profile_by_ref(null,%L,''ko'')',ref))<>'SOCIAL_STALE' then raise exception 'S10 stale ranking'; end if;

 -- S11c: reading never writes; issuing reuses one ref per person.
 ref:=jsonb_build_object('kind','fan_post','id',post);
 select count(*) into cnt from public.social_profile_return_refs;
 for i in 1..100 loop perform public.read_social_profile_by_ref(null,ref,'ko'); end loop;
 if (select count(*) from public.social_profile_return_refs)<>cnt then raise exception 'S11c a read wrote'; end if;
 t1:=(public.issue_social_profile_return_ref(ref)->>'returnRef')::uuid;
 for i in 1..99 loop
  if (public.issue_social_profile_return_ref(ref)->>'returnRef')::uuid<>t1 then raise exception 'S11c a second ref was issued'; end if;
 end loop;
 if (select count(*) from public.social_profile_return_refs where subject_id=author)<>1 then raise exception 'S11c one row per person'; end if;
 update public.social_profile_return_refs set expires_at=now()+interval '9 minutes' where token=t1;
 t2:=(public.issue_social_profile_return_ref(ref)->>'returnRef')::uuid;
 if t2=t1 or (select expires_at from public.social_profile_return_refs where token=t2) not between now()+interval '29 minutes' and now()+interval '31 minutes' then raise exception 'S11c a new ref when 10 minutes or less remain'; end if;
 if pg_temp.err(format('select public.issue_social_profile_return_ref(%L)',jsonb_build_object('kind','profile','profileId',author)))<>'SOCIAL_FORBIDDEN'
  or pg_temp.err(format('select public.issue_social_profile_return_ref(%L)',jsonb_build_object('kind','return','token',t2)))<>'SOCIAL_FORBIDDEN'
  or pg_temp.err(format('select public.issue_social_profile_return_ref(%L)',jsonb_build_object('kind','fan_post','id',hidden_post)))<>'SOCIAL_NOT_FOUND' then raise exception 'S11c refused refs'; end if;
 delete from public.social_profile_return_refs where subject_id<>author;
 insert into public.social_profile_return_refs(subject_id,expires_at) select later,now()-interval '1 minute' from generate_series(1,150);
 perform public.issue_social_profile_return_ref(ref);
 if (select count(*) from public.social_profile_return_refs where expires_at<=now())<>50 then raise exception 'S11c cleanup: % expired left',(select count(*) from public.social_profile_return_refs where expires_at<=now()); end if;

 -- S11b: the return ref opens the same profile after sign-in, until it expires or the person closes.
 r:=public.read_social_profile_by_ref(viewer,jsonb_build_object('kind','return','token',t2),'ko');
 if r#>>'{profile,id}'<>author::text then raise exception 'S11b return ref %',r; end if;
 update public.social_profile_return_refs set expires_at=now()-interval '1 second' where token=t2;
 if public.read_social_profile_by_ref(viewer,jsonb_build_object('kind','return','token',t2),'ko') is not null then raise exception 'S11b expired'; end if;
 if (select count(*) from public.social_profile_return_refs where token=t2)<>1 then raise exception 'S11b the read must not delete'; end if;
 t1:=(public.issue_social_profile_return_ref(ref)->>'returnRef')::uuid;
 if public.read_social_profile_by_ref(blocker,jsonb_build_object('kind','return','token',t1),'ko') is not null then raise exception 'S11b blocked viewer'; end if;
 set local session_replication_role=replica;
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(author,extensions.gen_random_uuid(),'B6 참조 시험용 제재입니다',extensions.gen_random_uuid());
 set local session_replication_role=origin;
 if public.read_social_profile_by_ref(viewer,jsonb_build_object('kind','return','token',t1),'ko') is not null then raise exception 'S11b sanctioned'; end if;
 set local session_replication_role=replica;
 update public.app_user_moderation_restrictions set revoked_at=now() where app_user_id=author;
 set local session_replication_role=origin;

 -- A deleted account leaves no return ref.
 insert into public.account_deletion_requests(app_user_id,provider_subject)values(author,'did:privy:b6r-author');
 update public.app_users set status='disabled' where id=author;
 if exists(select 1 from public.social_profile_return_refs where subject_id=author) then raise exception 'deletion scrub'; end if;

 -- Grants.
 foreach k in array array['public.read_social_profile_by_ref(uuid,jsonb,public.content_locale)','public.issue_social_profile_return_ref(jsonb)','public.read_social_profile_refs_open(uuid,jsonb)'] loop
  if has_function_privilege('anon',k,'execute') or has_function_privilege('authenticated',k,'execute') or not has_function_privilege('service_role',k,'execute') then raise exception 'grant %',k; end if;
 end loop;
 foreach k in array array['public.social_profile_ref_subject(uuid,jsonb)','public.social_profile_public_card(uuid,public.content_locale)','public.scrub_social_account_on_deletion_before_b6()'] loop
  if has_function_privilege('service_role',k,'execute') or has_function_privilege('anon',k,'execute') then raise exception 'helper reachable %',k; end if;
 end loop;
 if has_table_privilege('service_role','public.social_profile_return_refs','select') or not (select relforcerowsecurity from pg_class where oid='public.social_profile_return_refs'::regclass) then raise exception 'return ref table'; end if;
end $test$;
rollback;
\echo PASS b6_profile_refs

-- Disposable latest-chain database only (20261222120000_content_translation_leases). Rolled back.
begin;
create or replace function pg_temp.expect_error(p_sql text,p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error %',p_message;
exception when others then
  if sqlerrm='expected error '||p_message or position(p_message in sqlerrm)=0 then raise; end if;
end $$;
create or replace function pg_temp.mk_post(p_celebrity uuid,p_owner uuid,p_body text,p_visibility text default 'public') returns uuid language plpgsql as $$
declare v_id uuid:=extensions.gen_random_uuid();
begin
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash) values(v_id,p_celebrity,p_owner,p_body,p_visibility,extensions.gen_random_uuid(),'x');
  return v_id;
end $$;
create or replace function pg_temp.src(p_viewer uuid,p_post uuid) returns jsonb language sql as $$ select public.fan_web_content_target(p_viewer,'fan_post',p_post,'ko') $$;
create or replace function pg_temp.claim(p_viewer uuid,p_post uuid,p_scope text default 'whole',p_locale text default 'en',p_seconds integer default 20) returns jsonb language plpgsql as $$
declare s jsonb:=pg_temp.src(p_viewer,p_post);
begin
  return public.claim_content_translation_lease(p_viewer,'fan_post',p_post,p_locale,'ko',p_scope,(s->>'revision')::integer,s->>'sourceHash',p_seconds);
end $$;
create or replace function pg_temp.save_whole(p_token uuid,p_viewer uuid,p_post uuid,p_text text,p_locale text default 'en') returns void language plpgsql as $$
declare s jsonb:=pg_temp.src(p_viewer,p_post);
begin
  perform public.save_content_translation_leased(p_token,p_viewer,'fan_post',p_post,p_locale,'ko',(s->>'revision')::integer,s->>'sourceHash',p_text,'ko');
end $$;
create or replace function pg_temp.save_slots(p_token uuid,p_viewer uuid,p_post uuid,p_slots jsonb,p_locale text default 'en') returns void language plpgsql as $$
declare s jsonb:=pg_temp.src(p_viewer,p_post);
begin
  perform public.save_content_translation_slots_leased(p_token,p_viewer,'fan_post',p_post,p_locale,'ko',(s->>'revision')::integer,s->>'sourceHash',p_slots,'ko');
end $$;
do $$
declare
  owner_id uuid:='ac290000-0000-4000-8000-000000000001';
  viewer_id uuid:='ac290000-0000-4000-8000-000000000002';
  artist uuid:='ac290000-0000-4000-8000-000000000004';
  p uuid; q uuid; m uuid; c1 jsonb; c2 jsonb; c3 jsonb; s jsonb; sig text;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (owner_id,'did:privy:lease-owner','lease-owner@example.test'),(viewer_id,'did:privy:lease-viewer','lease-viewer@example.test');
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(artist,'lease-qa','published','/images/creator.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(artist,'ko','리스 검사','소개','사진');

  -- L1 owner ACL: only service_role runs the four functions; the table itself is closed to every API role.
  foreach sig in array array['claim_content_translation_lease(uuid,text,uuid,text,public.content_locale,text,integer,text,integer)','release_content_translation_lease(uuid)',
    'save_content_translation_leased(uuid,uuid,text,uuid,text,public.content_locale,integer,text,text,text)','save_content_translation_slots_leased(uuid,uuid,text,uuid,text,public.content_locale,integer,text,jsonb,text)'] loop
    if not has_function_privilege('service_role','public.'||sig,'execute') or has_function_privilege('anon','public.'||sig,'execute') or has_function_privilege('authenticated','public.'||sig,'execute')
      or has_function_privilege('public','public.'||sig,'execute') then raise exception 'L1 function grants wrong: %',sig; end if;
  end loop;
  if has_table_privilege('service_role','public.content_translation_leases','select,insert,update,delete') or has_table_privilege('anon','public.content_translation_leases','select')
    or has_table_privilege('authenticated','public.content_translation_leases','select') then raise exception 'L1 table grants wrong'; end if;
  if not (select relrowsecurity from pg_class where oid='public.content_translation_leases'::regclass) then raise exception 'L1 rls off'; end if;

  -- L2 first caller wins, a second caller of the same key is busy, another locale or scope is a separate key.
  p:=pg_temp.mk_post(artist,owner_id,E'제목\n본문');
  c1:=pg_temp.claim(viewer_id,p);
  if c1->>'status'<>'claimed' or (c1->>'token') is null then raise exception 'L2 first claim: %',c1; end if;
  if pg_temp.claim(viewer_id,p)->>'status'<>'busy' then raise exception 'L2 second claim must be busy'; end if;
  if pg_temp.claim(viewer_id,p,'whole','ja')->>'status'<>'claimed' then raise exception 'L2 other locale'; end if;
  if pg_temp.claim(viewer_id,p,'slots')->>'status'<>'claimed' then raise exception 'L2 other scope'; end if;

  -- L3 the holder saves: the row is written, the lease is gone, a second save with the same token is refused, and the next claim is free again.
  perform pg_temp.save_whole((c1->>'token')::uuid,viewer_id,p,'Whole');
  if public.read_content_translation(viewer_id,'fan_post',p,'en')->>'translatedText'<>'Whole' then raise exception 'L3 row missing'; end if;
  if exists(select 1 from public.content_translation_leases where lease_token=(c1->>'token')::uuid) then raise exception 'L3 lease kept'; end if;
  perform pg_temp.expect_error(format('select pg_temp.save_whole(%L,%L,%L,%L)',c1->>'token',viewer_id,p,'Again'),'FAN_WEB_CONFLICT');
  if pg_temp.claim(viewer_id,p)->>'status'<>'claimed' then raise exception 'L3 claim after save'; end if;

  -- L4 an expired lease is taken over; the previous holder can no longer save, the new holder can.
  q:=pg_temp.mk_post(artist,owner_id,E'만료 제목\n만료 본문');
  c1:=pg_temp.claim(viewer_id,q);
  update public.content_translation_leases set expires_at=clock_timestamp()-interval '1 second' where lease_token=(c1->>'token')::uuid;
  perform pg_temp.expect_error(format('select pg_temp.save_whole(%L,%L,%L,%L)',c1->>'token',viewer_id,q,'Late'),'FAN_WEB_CONFLICT');
  c2:=pg_temp.claim(viewer_id,q);
  if c2->>'status'<>'claimed' or c2->>'token'=c1->>'token' then raise exception 'L4 takeover: %',c2; end if;
  if (select count(*) from public.content_translation_leases where target_id=q)<>1 then raise exception 'L4 lease rows'; end if;
  -- The previous holder giving its token back must not remove the new holder's lease.
  perform public.release_content_translation_lease((c1->>'token')::uuid);
  if (select count(*) from public.content_translation_leases where target_id=q and lease_token=(c2->>'token')::uuid)<>1 then raise exception 'L4 stale release removed the new holder'; end if;
  perform pg_temp.expect_error(format('select pg_temp.save_whole(%L,%L,%L,%L)',c1->>'token',viewer_id,q,'Late'),'FAN_WEB_CONFLICT');
  if public.read_content_translation(viewer_id,'fan_post',q,'en') is not null then raise exception 'L4 stale owner wrote'; end if;
  perform pg_temp.save_whole((c2->>'token')::uuid,viewer_id,q,'Fresh');
  if public.read_content_translation(viewer_id,'fan_post',q,'en')->>'translatedText'<>'Fresh' then raise exception 'L4 new holder row'; end if;

  -- L5 a token only saves its own key and scope: the whole-text token cannot write the slots, a token of another post cannot write this one.
  p:=pg_temp.mk_post(artist,owner_id,E'제목\n본문'); q:=pg_temp.mk_post(artist,owner_id,E'다른 제목\n다른 본문');
  c1:=pg_temp.claim(viewer_id,p,'whole'); c2:=pg_temp.claim(viewer_id,q,'whole');
  perform pg_temp.expect_error(format('select pg_temp.save_slots(%L,%L,%L,%L)',c1->>'token',viewer_id,p,'{"title":"T","article":"A"}'),'FAN_WEB_CONFLICT');
  perform pg_temp.expect_error(format('select pg_temp.save_whole(%L,%L,%L,%L)',c2->>'token',viewer_id,p,'Wrong post'),'FAN_WEB_CONFLICT');
  perform pg_temp.expect_error(format('select pg_temp.save_whole(%L,%L,%L,%L)',extensions.gen_random_uuid(),viewer_id,p,'No lease'),'FAN_WEB_CONFLICT');
  if exists(select 1 from public.content_translations where target_id in (p,q)) then raise exception 'L5 rows written'; end if;
  c3:=pg_temp.claim(viewer_id,p,'slots');
  perform pg_temp.save_slots((c3->>'token')::uuid,viewer_id,p,'{"title":"T","article":"A"}');
  if public.read_content_translation_slots(viewer_id,'fan_post',p,'en')->'slots'<>'{"title":"T","article":"A"}'::jsonb then raise exception 'L5 slots row'; end if;
  perform pg_temp.expect_error(format('select pg_temp.claim(%L,%L,%L)',viewer_id,p,'bad'),'FAN_WEB_INVALID_INPUT');
  perform pg_temp.expect_error(format('select public.claim_content_translation_lease(%L,%L,%L,%L,%L,%L,1,%L,0)',viewer_id,'fan_post',p,'en','ko','whole',(pg_temp.src(viewer_id,p))->>'sourceHash'),'FAN_WEB_INVALID_INPUT');

  -- L6 source access is checked first: a hidden post and a members-only post for a non-member never get a lease row, and a held lease stops saving once the post is hidden.
  m:=pg_temp.mk_post(artist,owner_id,E'회원 제목\n회원 본문','members');
  perform pg_temp.expect_error(format('select public.claim_content_translation_lease(%L,%L,%L,%L,%L,%L,1,%L)',viewer_id,'fan_post',m,'en','ko','whole',repeat('a',64)),'FAN_WEB_NOT_FOUND');
  if exists(select 1 from public.content_translation_leases where target_id=m) then raise exception 'L6 lease for private post'; end if;
  q:=pg_temp.mk_post(artist,owner_id,E'숨김 제목\n숨김 본문');
  c1:=pg_temp.claim(viewer_id,q); s:=pg_temp.src(viewer_id,q);
  update public.fan_posts set hidden_at=now() where id=q;
  perform pg_temp.expect_error(format('select public.save_content_translation_leased(%L,%L,%L,%L,%L,%L,%s,%L,%L,%L)',c1->>'token',viewer_id,'fan_post',q,'en','ko',s->>'revision',s->>'sourceHash','Secret','ko'),'FAN_WEB_NOT_FOUND');
  perform pg_temp.expect_error(format('select public.claim_content_translation_lease(%L,%L,%L,%L,%L,%L,%s,%L)',viewer_id,'fan_post',q,'en','ko','whole',s->>'revision',s->>'sourceHash'),'FAN_WEB_NOT_FOUND');
  if exists(select 1 from public.content_translations where target_id in (q,m)) then raise exception 'L6 row for private post'; end if;

  -- L7 the source changes after the claim: the save is refused (revision/hash) and nothing is stored; a claim built on the old revision is refused too.
  q:=pg_temp.mk_post(artist,owner_id,E'바뀔 제목\n바뀔 본문'); s:=pg_temp.src(viewer_id,q);
  c1:=pg_temp.claim(viewer_id,q);
  update public.fan_posts set body=E'바뀐 제목\n바뀐 본문',revision=revision+1 where id=q;
  perform pg_temp.expect_error(format('select public.save_content_translation_leased(%L,%L,%L,%L,%L,%L,%s,%L,%L,%L)',c1->>'token',viewer_id,'fan_post',q,'en','ko',s->>'revision',s->>'sourceHash','Old','ko'),'FAN_WEB_CONFLICT');
  perform pg_temp.expect_error(format('select public.claim_content_translation_lease(%L,%L,%L,%L,%L,%L,%s,%L)',viewer_id,'fan_post',q,'en','ko','whole',s->>'revision',s->>'sourceHash'),'FAN_WEB_CONFLICT');
  if exists(select 1 from public.content_translations where target_id=q) then raise exception 'L7 old revision stored'; end if;
  if pg_temp.claim(viewer_id,q)->>'status'<>'claimed' then raise exception 'L7 new revision is a new key'; end if;

  -- L8 release frees the key at once; releasing an unknown token changes nothing.
  p:=pg_temp.mk_post(artist,owner_id,'Release me');
  c1:=pg_temp.claim(viewer_id,p);
  perform public.release_content_translation_lease(extensions.gen_random_uuid());
  if pg_temp.claim(viewer_id,p)->>'status'<>'busy' then raise exception 'L8 unknown token released the lease'; end if;
  perform public.release_content_translation_lease((c1->>'token')::uuid);
  if pg_temp.claim(viewer_id,p)->>'status'<>'claimed' then raise exception 'L8 release'; end if;
end $$;
rollback;

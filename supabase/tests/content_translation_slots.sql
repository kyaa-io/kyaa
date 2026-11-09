-- Disposable latest-chain database only (20261220000000_content_translation_slots). Rolled back.
-- S1 slot rule table: the same cases are in apps/web/features/fan-posts/domain/post-title-slots.test.ts; keep the two tables identical.
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
create or replace function pg_temp.save(p_viewer uuid,p_post uuid,p_slots jsonb,p_locale text default 'en') returns void language plpgsql as $$
declare s jsonb:=pg_temp.src(p_viewer,p_post);
begin
  perform public.save_content_translation_slots(p_viewer,'fan_post',p_post,p_locale,'ko',(s->>'revision')::integer,s->>'sourceHash',p_slots,'ko');
end $$;
do $$
declare
  owner_id uuid:='ac270000-0000-4000-8000-000000000001';
  viewer_id uuid:='ac270000-0000-4000-8000-000000000002';
  outsider_id uuid:='ac270000-0000-4000-8000-000000000003';
  artist uuid:='ac270000-0000-4000-8000-000000000004';
  wave_id uuid:='ac270000-0000-4000-8000-000000000005';
  p uuid; q uuid; s jsonb; r jsonb; cases jsonb; c jsonb; got text[]; want text[]; n integer; first_value text; rev integer; hash text;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (owner_id,'did:privy:slots-owner','slots-owner@example.test'),(viewer_id,'did:privy:slots-viewer','slots-viewer@example.test'),(outsider_id,'did:privy:slots-outsider','slots-outsider@example.test');
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
    (artist,'slots-qa','published','/images/creator.webp',now(),'{creator}','creator'),(wave_id,'kyaa-wave-fanpage','published','/wave-test.webp',now(),'{brand}','brand');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(artist,'ko','슬롯 검사','소개','사진'),(wave_id,'ko','Wave QA','QA','QA');

  -- S1 slot rule: every case in this table is also in post-title-slots.test.ts.
  cases:=jsonb_build_array(
    jsonb_build_object('body',E'제목\n본문','slots',jsonb_build_array('title','article')),
    jsonb_build_object('body','제목','slots',jsonb_build_array('title')),
    jsonb_build_object('body',E'제목\n  \n','slots',jsonb_build_array('title')),
    jsonb_build_object('body',E'\n본문','slots',jsonb_build_array('article')),
    jsonb_build_object('body','  ','slots','[]'::jsonb),
    jsonb_build_object('body','','slots','[]'::jsonb),
    jsonb_build_object('body',E'\n','slots','[]'::jsonb),
    jsonb_build_object('body',chr(160)||E'\n본문','slots',jsonb_build_array('article')),
    jsonb_build_object('body',chr(12288)||E'\n본문','slots',jsonb_build_array('article')),
    jsonb_build_object('body',chr(65279)||E'\n본문','slots',jsonb_build_array('article')),
    jsonb_build_object('body',chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(5760)||chr(8192)||chr(8202)||E'\n본문','slots',jsonb_build_array('article')),
    jsonb_build_object('body',E'제목\r\n본문','slots',jsonb_build_array('title','article')),
    jsonb_build_object('body',E'제목\r\n','slots',jsonb_build_array('title')),
    jsonb_build_object('body',E'\r\n본문','slots',jsonb_build_array('article')),
    jsonb_build_object('body',E'제목\n \t \u000b\u000c','slots',jsonb_build_array('title')),
    jsonb_build_object('body',chr(8203)||E'\n본문','slots',jsonb_build_array('title','article')),
    jsonb_build_object('body',chr(6158)||E'\n본문','slots',jsonb_build_array('title','article')),
    jsonb_build_object('body',E'제목\n\n본문','slots',jsonb_build_array('title','article'))
  );
  for c in select value from jsonb_array_elements(cases) loop
    got:=public.content_translation_expected_slots(c->>'body');
    select coalesce(array_agg(x order by x),'{}') into want from jsonb_array_elements_text(c->'slots') x;
    if (select coalesce(array_agg(x order by x),'{}') from unnest(got) x) is distinct from want then raise exception 'S1 slot rule: % gave % wanted %',c->>'body',got,want; end if;
  end loop;
  if public.content_translation_expected_slots(null)<>'{}'::text[] then raise exception 'S1 null body'; end if;
  if has_function_privilege('service_role','public.content_translation_expected_slots(text)','execute') or has_function_privilege('anon','public.content_translation_expected_slots(text)','execute')
    or has_function_privilege('authenticated','public.content_translation_expected_slots(text)','execute') then raise exception 'expected_slots must stay internal'; end if;
  foreach s in array array[to_jsonb('read_content_translation_slots(uuid,text,uuid,text,public.content_locale)'::text),to_jsonb('save_content_translation_slots(uuid,text,uuid,text,public.content_locale,integer,text,jsonb,text)'::text)] loop
    if not has_function_privilege('service_role','public.'||(s#>>'{}'),'execute') or has_function_privilege('anon','public.'||(s#>>'{}'),'execute') or has_function_privilege('authenticated','public.'||(s#>>'{}'),'execute') then
      raise exception 'slot function grants wrong: %',s; end if;
  end loop;

  -- S2 an existing whole-text cache row stays whole: the slot read does not see it, and a slot save does not touch it.
  p:=pg_temp.mk_post(artist,owner_id,E'제목\n본문'); s:=pg_temp.src(viewer_id,p);
  perform public.save_content_translation(viewer_id,'fan_post',p,'en','ko',(s->>'revision')::integer,s->>'sourceHash',E'Whole title\nWhole body','ko');
  if public.read_content_translation(viewer_id,'fan_post',p,'en')->>'translatedText'<>E'Whole title\nWhole body' then raise exception 'S2 whole row missing'; end if;
  if public.read_content_translation_slots(viewer_id,'fan_post',p,'en') is not null then raise exception 'S2 slot read used the whole row'; end if;
  perform pg_temp.save(viewer_id,p,'{"title":"Title","article":"Body"}');
  if public.read_content_translation(viewer_id,'fan_post',p,'en')->>'translatedText'<>E'Whole title\nWhole body' then raise exception 'S2 whole row changed'; end if;
  r:=public.read_content_translation_slots(viewer_id,'fan_post',p,'en');
  if r->'slots'<>'{"title":"Title","article":"Body"}'::jsonb or r->>'cached'<>'true' or r->>'targetLocale'<>'en' or (r->>'sourceRevision')::integer<>1 or r->>'targetId'<>p::text or r->>'targetType'<>'fan_post'
    or (select count(*) from jsonb_object_keys(r))<>6 then raise exception 'S2 slot read shape: %',r; end if;
  if (select count(*) from public.content_translations where target_id=p and slot='whole')<>1 or (select count(*) from public.content_translations where target_id=p and slot<>'whole')<>2 then raise exception 'S2 rows'; end if;

  -- S3 save_content_translation still works with the new primary key, and the same key is ignored the second time.
  q:=pg_temp.mk_post(artist,owner_id,'Whole only'); s:=pg_temp.src(viewer_id,q);
  perform public.save_content_translation(viewer_id,'fan_post',q,'ja','ko',(s->>'revision')::integer,s->>'sourceHash','one','ko');
  perform public.save_content_translation(viewer_id,'fan_post',q,'ja','ko',(s->>'revision')::integer,s->>'sourceHash','two','ko');
  if public.read_content_translation(viewer_id,'fan_post',q,'ja')->>'translatedText'<>'one' or (select count(*) from public.content_translations where target_id=q)<>1 then raise exception 'S3 whole save'; end if;
  if (select slot from public.content_translations where target_id=q)<>'whole' then raise exception 'S3 slot default'; end if;
  perform pg_temp.expect_error(format('select public.save_content_translation(%L,%L,%L,%L,%L,1,%L,%L,%L)',viewer_id,'fan_post',q,'ja','ko',s->>'sourceHash','   ','ko'),'FAN_WEB_INVALID_INPUT');

  -- S4 exact set: the save refuses a set that differs from the source's.
  p:=pg_temp.mk_post(artist,owner_id,E'제목\n본문'); s:=pg_temp.src(viewer_id,p);
  perform pg_temp.expect_error(format('select pg_temp.save(%L,%L,%L)',viewer_id,p,'{"title":"T"}'),'FAN_WEB_INVALID_INPUT');
  perform pg_temp.expect_error(format('select pg_temp.save(%L,%L,%L)',viewer_id,p,'{"article":"A"}'),'FAN_WEB_INVALID_INPUT');
  perform pg_temp.expect_error(format('select pg_temp.save(%L,%L,%L)',viewer_id,p,'{"title":"T","article":"A","x":"X"}'),'FAN_WEB_INVALID_INPUT');
  perform pg_temp.expect_error(format('select pg_temp.save(%L,%L,%L)',viewer_id,p,'{"title":"T","whole":"A"}'),'FAN_WEB_INVALID_INPUT');
  perform pg_temp.expect_error(format('select pg_temp.save(%L,%L,%L)',viewer_id,p,'{"title":"T","article":"   "}'),'FAN_WEB_INVALID_INPUT');
  perform pg_temp.expect_error(format('select pg_temp.save(%L,%L,%L)',viewer_id,p,'{"title":"T","article":""}'),'FAN_WEB_INVALID_INPUT');
  perform pg_temp.expect_error(format('select pg_temp.save(%L,%L,%L)',viewer_id,p,'{"title":"T","article":5}'),'FAN_WEB_INVALID_INPUT');
  perform pg_temp.expect_error(format('select pg_temp.save(%L,%L,%L)',viewer_id,p,'[]'),'FAN_WEB_INVALID_INPUT');
  perform pg_temp.expect_error(format('select pg_temp.save(%L,%L,%L)',viewer_id,p,'null'),'FAN_WEB_INVALID_INPUT');
  perform pg_temp.expect_error(format('select public.save_content_translation_slots(%L,%L,%L,%L,%L,1,%L,null,%L)',viewer_id,'fan_post',p,'en','ko',s->>'sourceHash','ko'),'FAN_WEB_INVALID_INPUT');
  perform pg_temp.expect_error(format('select pg_temp.save(%L,%L,%L)',viewer_id,p,jsonb_build_object('title','T','article',repeat('a',100001))::text),'FAN_WEB_INVALID_INPUT');
  q:=pg_temp.mk_post(artist,owner_id,'제목');
  perform pg_temp.expect_error(format('select pg_temp.save(%L,%L,%L)',viewer_id,q,'{"title":"T","article":"A"}'),'FAN_WEB_INVALID_INPUT');
  q:=pg_temp.mk_post(artist,owner_id,'  ');
  perform pg_temp.expect_error(format('select pg_temp.save(%L,%L,%L)',viewer_id,q,'{}'),'FAN_WEB_INVALID_INPUT');
  if public.read_content_translation_slots(viewer_id,'fan_post',q,'en') is not null then raise exception 'S4 empty source must read null'; end if;
  perform pg_temp.expect_error(format('select public.read_content_translation_slots(%L,%L,%L,%L)',viewer_id,'fan_post_comment',p,'en'),'FAN_WEB_INVALID_INPUT');
  perform pg_temp.expect_error(format('select public.read_content_translation_slots(%L,%L,%L,%L)',viewer_id,null,p,'en'),'FAN_WEB_INVALID_INPUT');
  perform pg_temp.expect_error(format('select public.save_content_translation_slots(%L,%L,%L,%L,%L,1,%L,%L,%L)',viewer_id,'notice',p,'en','ko',s->>'sourceHash','{"title":"T"}','ko'),'FAN_WEB_INVALID_INPUT');
  if exists(select 1 from public.content_translations where target_id=p) then raise exception 'S4 rejected saves stored rows'; end if;
  -- Title only / article only sources take exactly their one slot.
  q:=pg_temp.mk_post(artist,owner_id,'제목'); perform pg_temp.save(viewer_id,q,'{"title":"T"}');
  if public.read_content_translation_slots(viewer_id,'fan_post',q,'en')->'slots'<>'{"title":"T"}'::jsonb then raise exception 'S4 title only'; end if;
  q:=pg_temp.mk_post(artist,owner_id,E'\n본문'); perform pg_temp.save(viewer_id,q,'{"article":"A"}');
  if public.read_content_translation_slots(viewer_id,'fan_post',q,'en')->'slots'<>'{"article":"A"}'::jsonb then raise exception 'S4 article only'; end if;

  -- S5 a wrong earlier set is ignored on read and corrected on the next save.
  q:=pg_temp.mk_post(artist,owner_id,'제목'); s:=pg_temp.src(viewer_id,q);
  insert into public.content_translations(target_type,target_id,source_revision,source_hash,source_locale,target_locale,source_app_user_id,celebrity_id,translated_text,slot)
    values('fan_post',q,1,s->>'sourceHash',s->>'sourceLocale','en',owner_id,artist,'T','title'),('fan_post',q,1,s->>'sourceHash',s->>'sourceLocale','en',owner_id,artist,'extra','article');
  if public.read_content_translation_slots(viewer_id,'fan_post',q,'en')->'slots'<>'{"title":"T"}'::jsonb then raise exception 'S5 extra row must be ignored'; end if;
  perform pg_temp.save(viewer_id,q,'{"title":"T2"}');
  if exists(select 1 from public.content_translations where target_id=q and slot='article') then raise exception 'S5 extra row not removed'; end if;
  if public.read_content_translation_slots(viewer_id,'fan_post',q,'en')->'slots'<>'{"title":"T"}'::jsonb then raise exception 'S5 existing value must stay'; end if;
  p:=pg_temp.mk_post(artist,owner_id,E'제목\n본문'); s:=pg_temp.src(viewer_id,p);
  insert into public.content_translations(target_type,target_id,source_revision,source_hash,source_locale,target_locale,source_app_user_id,celebrity_id,translated_text,slot)
    values('fan_post',p,1,s->>'sourceHash',s->>'sourceLocale','en',owner_id,artist,'Kept title','title');
  if public.read_content_translation_slots(viewer_id,'fan_post',p,'en') is not null then raise exception 'S5 missing row must read null'; end if;
  perform pg_temp.save(viewer_id,p,'{"title":"New title","article":"Body"}');
  if public.read_content_translation_slots(viewer_id,'fan_post',p,'en')->'slots'<>'{"title":"Kept title","article":"Body"}'::jsonb then raise exception 'S5 recovery: %',public.read_content_translation_slots(viewer_id,'fan_post',p,'en'); end if;
  -- Another locale's rows are left alone by a save for this locale.
  perform pg_temp.save(viewer_id,p,'{"title":"JA title","article":"JA body"}','ja');
  if (select count(*) from public.content_translations where target_id=p and slot<>'whole')<>4 then raise exception 'S5 locale isolation'; end if;

  -- S6 two saves for the same key: no error, the first value stays, and every read returns it.
  p:=pg_temp.mk_post(artist,owner_id,E'제목\n본문');
  perform pg_temp.save(viewer_id,p,'{"title":"First","article":"First body"}');
  perform pg_temp.save(outsider_id,p,'{"title":"Second","article":"Second body"}');
  if public.read_content_translation_slots(viewer_id,'fan_post',p,'en')->'slots'<>'{"title":"First","article":"First body"}'::jsonb
    or public.read_content_translation_slots(outsider_id,'fan_post',p,'en')->'slots'<>'{"title":"First","article":"First body"}'::jsonb then raise exception 'S6 first writer must win'; end if;
  if (select count(*) from public.content_translations where target_id=p)<>2 then raise exception 'S6 rows'; end if;

  -- S7 the post disappears while the provider works: the save finds nothing, stores nothing.
  p:=pg_temp.mk_post(artist,owner_id,E'제목\n본문'); s:=pg_temp.src(viewer_id,p); rev:=(s->>'revision')::integer; hash:=s->>'sourceHash';
  update public.fan_posts set hidden_at=now() where id=p;
  perform pg_temp.expect_error(format('select public.save_content_translation_slots(%L,%L,%L,%L,%L,%s,%L,%L,%L)',viewer_id,'fan_post',p,'en','ko',rev,hash,'{"title":"T","article":"A"}','ko'),'FAN_WEB_NOT_FOUND');
  if exists(select 1 from public.content_translations where target_id=p) then raise exception 'S7 hidden save stored rows'; end if;
  update public.fan_posts set hidden_at=null,deleted_at=now() where id=p;
  perform pg_temp.expect_error(format('select public.save_content_translation_slots(%L,%L,%L,%L,%L,%s,%L,%L,%L)',viewer_id,'fan_post',p,'en','ko',rev,hash,'{"title":"T","article":"A"}','ko'),'FAN_WEB_NOT_FOUND');
  if exists(select 1 from public.content_translations where target_id=p) then raise exception 'S7 deleted save stored rows'; end if;

  -- S8 a proof post is not on the board: cached rows are not served.
  p:=extensions.gen_random_uuid();
  set local session_replication_role = replica;
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,category,source_type,source_id)
    values(p,artist,owner_id,E'인증 제목\n인증 본문','public',extensions.gen_random_uuid(),'x','proof','certification_submission',extensions.gen_random_uuid());
  set local session_replication_role = origin;
  insert into public.content_translations(target_type,target_id,source_revision,source_hash,source_locale,target_locale,source_app_user_id,celebrity_id,translated_text,slot)
    values('fan_post',p,1,encode(extensions.digest(E'인증 제목\n인증 본문','sha256'),'hex'),'und','en',owner_id,artist,'T','title'),('fan_post',p,1,encode(extensions.digest(E'인증 제목\n인증 본문','sha256'),'hex'),'und','en',owner_id,artist,'A','article');
  perform pg_temp.expect_error(format('select public.read_content_translation_slots(%L,%L,%L,%L)',viewer_id,'fan_post',p,'en'),'FAN_WEB_NOT_FOUND');
  perform pg_temp.expect_error(format('select public.save_content_translation_slots(%L,%L,%L,%L,%L,1,%L,%L,%L)',viewer_id,'fan_post',p,'en','ko',repeat('a',64),'{"title":"T","article":"A"}','ko'),'FAN_WEB_NOT_FOUND');

  -- S9 a Wave post is served only to checked-in accounts, also when its rows are cached.
  p:=pg_temp.mk_post(wave_id,owner_id,E'웨이브 제목\n웨이브 본문');
  insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint)
    values(viewer_id,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.'||repeat('c',24),md5('slots:1')||md5('slots:1'));
  perform pg_temp.save(viewer_id,p,'{"title":"Wave title","article":"Wave body"}');
  if public.read_content_translation_slots(viewer_id,'fan_post',p,'en')->'slots'<>'{"title":"Wave title","article":"Wave body"}'::jsonb then raise exception 'S9 checked-in read'; end if;
  perform pg_temp.expect_error(format('select public.read_content_translation_slots(%L,%L,%L,%L)',outsider_id,'fan_post',p,'en'),'FAN_WEB_NOT_FOUND');
  s:=pg_temp.src(viewer_id,p);
  perform pg_temp.expect_error(format('select public.save_content_translation_slots(%L,%L,%L,%L,%L,1,%L,%L,%L)',outsider_id,'fan_post',p,'en','ko',s->>'sourceHash','{"title":"T","article":"A"}','ko'),'FAN_WEB_NOT_FOUND');

  -- S10 members-only posts and blocked authors: a non-member and a blocking viewer get nothing, even with cached rows.
  p:=pg_temp.mk_post(artist,owner_id,E'회원 제목\n회원 본문','members');
  insert into public.content_translations(target_type,target_id,source_revision,source_hash,source_locale,target_locale,source_app_user_id,celebrity_id,translated_text,slot)
    select 'fan_post',p,1,encode(extensions.digest(E'회원 제목\n회원 본문','sha256'),'hex'),'und','en',owner_id,artist,'T','title';
  perform pg_temp.expect_error(format('select public.read_content_translation_slots(%L,%L,%L,%L)',viewer_id,'fan_post',p,'en'),'FAN_WEB_NOT_FOUND');
  perform pg_temp.expect_error(format('select public.save_content_translation_slots(%L,%L,%L,%L,%L,1,%L,%L,%L)',viewer_id,'fan_post',p,'en','ko',repeat('a',64),'{"title":"T","article":"A"}','ko'),'FAN_WEB_NOT_FOUND');
  p:=pg_temp.mk_post(artist,owner_id,E'차단 제목\n차단 본문');
  perform pg_temp.save(outsider_id,p,'{"title":"T","article":"A"}');
  perform public.block_content_author(outsider_id,'fan_post',p);
  perform pg_temp.expect_error(format('select public.read_content_translation_slots(%L,%L,%L,%L)',outsider_id,'fan_post',p,'en'),'FAN_WEB_NOT_FOUND');
  if public.read_content_translation_slots(viewer_id,'fan_post',p,'en') is null then raise exception 'S10 block must not hide the post from others'; end if;

  -- S11 account deletion removes slot rows of the author's posts.
  p:=pg_temp.mk_post(artist,outsider_id,E'삭제 제목\n삭제 본문'); perform pg_temp.save(viewer_id,p,'{"title":"T","article":"A"}');
  if (select count(*) from public.content_translations where target_id=p)<>2 then raise exception 'S11 setup'; end if;
  update public.app_users set status='disabled' where id=outsider_id;
  insert into public.account_deletion_requests(app_user_id,provider_subject) values(outsider_id,'did:privy:slots-outsider');
  perform set_config('byus.account_deletion_owner',outsider_id::text,true); perform public.scrub_account_deletion(outsider_id);
  if exists(select 1 from public.content_translations where target_id=p) then raise exception 'S11 slot rows survive account deletion'; end if;

  -- S12 revision / hash mismatch.
  p:=pg_temp.mk_post(artist,owner_id,E'제목\n본문'); s:=pg_temp.src(viewer_id,p);
  perform pg_temp.expect_error(format('select public.save_content_translation_slots(%L,%L,%L,%L,%L,2,%L,%L,%L)',viewer_id,'fan_post',p,'en','ko',s->>'sourceHash','{"title":"T","article":"A"}','ko'),'FAN_WEB_CONFLICT');
  perform pg_temp.expect_error(format('select public.save_content_translation_slots(%L,%L,%L,%L,%L,1,%L,%L,%L)',viewer_id,'fan_post',p,'en','ko',repeat('0',64),'{"title":"T","article":"A"}','ko'),'FAN_WEB_CONFLICT');
  -- An edit makes earlier slot rows stale.
  perform pg_temp.save(viewer_id,p,'{"title":"T","article":"A"}');
  update public.fan_posts set body=E'새 제목\n새 본문',revision=revision+1 where id=p;
  if public.read_content_translation_slots(viewer_id,'fan_post',p,'en') is not null then raise exception 'S12 stale rows served after an edit'; end if;
end $$;
rollback;

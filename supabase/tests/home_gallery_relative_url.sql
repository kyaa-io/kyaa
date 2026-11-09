grant usage on schema r8test to service_role;
grant execute on function r8test.check_relative(boolean,text) to service_role;
-- All data below is disposable, not CMS/dev/prod source mutation.
do $$
declare
  c uuid := (select id from public.celebrities where slug='r8data-photo');
  a uuid := '99000000-0000-4000-8000-000000000001';
  n uuid; asset uuid; images jsonb; k integer; j integer;
begin
  -- Eight shape-passing notices / nine photos, including the observed 4032x3024 landscape ratio.
  for k in 1..8 loop
    images := '[]';
    for j in 1..case when k=2 then 2 else 1 end loop
      asset := extensions.gen_random_uuid();
      images := images || jsonb_build_array(jsonb_build_object('src','/api/content-assets/'||asset,'w',case when k=8 then 4032 else 3024 end,'h',case when k=8 then 3024 else 4032 end));
    end loop;
    n := r8test.notice(c,'relative-'||k,'원문 '||k,'https://www.instagram.com/p/relative'||k||'/',images,null,now()+interval '1 hour');
    insert into public.content_assets(id,app_user_id,celebrity_id,notice_id,storage_path,byte_size,width,height,sha256,uploaded_at)
    select substring(i->>'src' from 21)::uuid,a,c,n,c||'/'||substring(i->>'src' from 21)||'.webp',100,(i->>'w')::int,(i->>'h')::int,repeat('a',64),now() from jsonb_array_elements(images) i;
  end loop;
end $$;
create table r8test.source_before as select notice_id,locale,title,body_json from public.celebrity_notice_localizations;
select r8test.check_relative(public.home_gallery_source_shape(id) is not null,'collected source SHAPE unchanged') from public.celebrity_notices where slug like 'relative-%';
set role service_role;
select r8test.check_relative((select count(*)=9 from jsonb_array_elements(public.read_public_home_gallery_photos('ko',0,24)->'items') i where i->'image'->>'url' like '/api/content-assets/%'),'nine relative photos pass RPC');
reset role;
-- Helper and RPC permissions: no new direct caller surface, existing service-role RPC stays usable.
select r8test.check_relative(not has_function_privilege(r,'public.home_gallery_public_content_asset(text)','execute'),'helper not callable by '||r) from unnest(array['anon','authenticated','service_role']) r;
select r8test.check_relative(not has_function_privilege(r,'public.read_public_home_gallery_photos(public.content_locale,integer,integer)','execute'),'RPC still denies '||r) from unnest(array['anon','authenticated']) r;

do $$
declare
  n uuid := (select id from public.celebrity_notices where slug='relative-1');
  asset uuid; src text; other_notice uuid; state text;
  original_c uuid; original_owner uuid;
begin
  select id,celebrity_id,app_user_id into asset,original_c,original_owner from public.content_assets where notice_id=n;
  src := '/api/content-assets/'||asset;
  perform r8test.check_relative(public.read_content_asset(null,asset) is not null,'same anonymous asset route allows public image');
  -- A public source node pointing at an asset owned by a private notice must not leak its URL.
  other_notice := r8test.notice(original_c,'relative-members','회원 사진','https://www.instagram.com/p/members/','[]');
  update public.celebrity_notices set visibility='members' where id=other_notice;
  update public.content_assets set notice_id=other_notice where id=asset;
  perform r8test.check_relative(not public.home_gallery_public_content_asset(src),'public notice cannot launder member-only asset');
  perform r8test.check_relative(not exists(select 1 from jsonb_array_elements(public.read_public_home_gallery_photos('ko',0,24)->'items') i where i->'image'->>'url'=src),'member-only asset excluded by RPC');
  update public.content_assets set notice_id=null where id=asset;
  perform r8test.check_relative(not public.home_gallery_public_content_asset(src),'unattached private upload excluded');
  update public.content_assets set notice_id=n where id=asset;
  foreach state in array array['uploaded_at','deleted_at','cleanup_requested_at','storage_deleted_at'] loop
    execute format('update public.content_assets set %I=%s where id=$1',state,case when state='uploaded_at' then 'null' else 'now()' end) using asset;
    perform r8test.check_relative(not public.home_gallery_public_content_asset(src),state||' excludes unavailable asset');
    perform r8test.check_relative(not exists(select 1 from jsonb_array_elements(public.read_public_home_gallery_photos('ko',0,24)->'items') i where i->'image'->>'url'=src),state||' excluded by RPC');
    execute format('update public.content_assets set %I=%s where id=$1',state,case when state='uploaded_at' then 'now()' else 'null' end) using asset;
  end loop;
  update public.celebrity_notices set publication_status='draft',published_at=null where id=n;
  perform r8test.check_relative(not public.home_gallery_public_content_asset(src),'draft notice excluded');
  update public.celebrity_notices set publication_status='published',published_at=now()+interval '1 hour',archived_at=now(),archived_by_admin_allowlist_id='99000000-0000-4000-8000-000000000002',archive_reason='relative fixture archive' where id=n;
  perform r8test.check_relative(not public.home_gallery_public_content_asset(src),'archived notice excluded');
  update public.celebrity_notices set archived_at=null,archived_by_admin_allowlist_id=null,archive_reason=null where id=n;
  update public.app_users set status='disabled' where id=original_owner;
  perform r8test.check_relative(not public.home_gallery_public_content_asset(src),'inactive asset owner excluded');
  update public.app_users set status='active' where id=original_owner;
  foreach state in array array[src||E'\n',src||'?admin=1',src||'#x',src||'/extra','/'||src,'/api/content-assets/not-a-uuid','/api/content-assets/../../private',E'/api/content-assets/\n', '/api/content-assets/00000000-0000-4000-8000-000000000000'] loop
    perform r8test.check_relative(not public.home_gallery_public_content_asset(state),'invalid or missing asset excluded: '||state);
  end loop;
end $$;
-- The new read must work for the existing non-bypassrls owner without new table grants.
set role service_role;
select r8test.check_relative((select count(*)=9 from jsonb_array_elements(public.read_public_home_gallery_photos('ko',0,24)->'items') i where i->'image'->>'url' like '/api/content-assets/%'),'non-bypassrls owner returns public assets');
reset role;
select r8test.check_relative(not exists(select * from r8test.source_before except select notice_id,locale,title,body_json from public.celebrity_notice_localizations),'gallery reads preserve original CMS text/JSON');

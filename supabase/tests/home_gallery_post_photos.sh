#!/usr/bin/env bash
# Run with BYUS_CLEAN_DB_SHELL_ASSERTION_FILE on the disposable clean-chain DB.
set -euo pipefail
HOME_GALLERY_SETUP_ONLY=1 source "$(dirname "${BASH_SOURCE[0]}")/home_gallery_shorts.sh"
psql -X -v ON_ERROR_STOP=1 -v artist="$C1" -v actor="$A" <<'SQL'
select set_config('fixture.artist', :'artist', false), set_config('fixture.actor', :'actor', false);
do $test$
declare
  artist uuid := current_setting('fixture.artist')::uuid;
  actor uuid := current_setting('fixture.actor')::uuid;
  fp uuid := gen_random_uuid(); gp uuid := gen_random_uuid(); page_id uuid;
  fa uuid := gen_random_uuid(); ga uuid := gen_random_uuid(); result jsonb;
begin
  select id into page_id from public.group_pages where celebrity_id=artist;
  if page_id is null then
    insert into public.group_pages(kind,celebrity_id,name,status,listed)
    values ('fan',artist,'갤러리 검증','published',true) returning id into page_id;
  else
    update public.group_pages set listed=true where id=page_id;
  end if;
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash)
  values(fp,artist,actor,'팬 게시판 사진 예시','public',gen_random_uuid(),'fixture');
  insert into public.content_assets(id,app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,uploaded_at,post_id,position)
  values(fa,actor,artist,actor||'/'||fa||'.webp',100,900,1200,repeat('0',64),now(),fp,0);
  insert into public.group_posts(id,page_id,author_id,title,body,visibility,anonymous)
  values(gp,page_id,actor,'팬페이지 사진 예시','갤러리 검증','public',true);
  insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,
    storage_path,thumbnail_path,state,width,height,request_id,request_hash,attached_type,attached_id,position,access_scope)
  values(ga,actor,'image','group_post','image/webp',100,100,actor||'/'||ga||'/original.webp',actor||'/'||ga||'/thumbnail.webp',
    'ready',1200,900,gen_random_uuid(),'fixture','group_post',gp,0,'group_post');
  result := public.read_public_gallery_post_photos('ko',true,24)->'items';
  if not result @> jsonb_build_array(jsonb_build_object('source','fan_post','sourceHref','/c/r8data-photo/community/'||fp),
    jsonb_build_object('source','group_post','sourceHref','/pages/groups/'||page_id||'?tab=board&post='||gp))
    or result @> '[{"source":"cms_upload"}]' or not result @> '[{"source":"official_sns"}]'
    or result::text like '%'||actor::text||'%' then raise exception 'public photo projection'; end if;
  if public.read_public_gallery_post_photos('ko',false,24)->'items' @> '[{"source":"group_post"}]' then raise exception 'groups disabled'; end if;
  update public.fan_posts set visibility='members' where id=fp;
  update public.group_posts set visibility='members' where id=gp;
  if exists(select 1 from jsonb_array_elements(public.read_public_gallery_post_photos('ko',true,24)->'items') i where i->>'source' in ('fan_post','group_post')) then raise exception 'members photo'; end if;
  update public.fan_posts set visibility='public',hidden_at=now() where id=fp;
  update public.group_posts set visibility='public',removed_at=now() where id=gp;
  if exists(select 1 from jsonb_array_elements(public.read_public_gallery_post_photos('ko',true,24)->'items') i where i->>'source' in ('fan_post','group_post')) then raise exception 'hidden photo'; end if;
  update public.fan_posts set hidden_at=null,deleted_at=now() where id=fp;
  if public.read_public_gallery_post_photos('ko',true,24)->'items' @> '[{"source":"fan_post"}]' then raise exception 'deleted photo'; end if;
  update public.fan_posts set deleted_at=null where id=fp;
  update public.group_posts set removed_at=null where id=gp;
  insert into public.content_reports(app_user_id,celebrity_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key)
    values(actor,artist,'fan_post',fp,1,actor,'fixture',gen_random_uuid());
  insert into public.group_reports(page_id,reporter_id,target_type,target_id,reason) values(page_id,actor,'post',gp,'fixture');
  if exists(select 1 from jsonb_array_elements(public.read_public_gallery_post_photos('ko',true,24)->'items') i where i->>'source' in ('fan_post','group_post')) then raise exception 'reported photo'; end if;
  delete from public.content_reports where target_id=fp;
  delete from public.group_reports where target_id=gp;
end
$test$;
SQL
sq "select public.read_public_gallery_post_photos('ko',true,24)" >/dev/null
echo 'PASS official, fan and group photos, public-only access, reports, deletions and group flag'

# statement_timestamp() is fixed for the entire DO statement, including the RPC reads.
psql -X -v ON_ERROR_STOP=1 <<'SQL'
begin;
do $test$
declare
  fp uuid := (select id from public.fan_posts where body='팬 게시판 사진 예시');
  elapsed interval;
  marked boolean;
begin
  foreach elapsed in array array[interval '-1 second',interval '0',interval '47 hours 59 minutes 59 seconds',interval '48 hours',interval '49 hours'] loop
    update public.fan_posts set created_at=statement_timestamp()-elapsed where id=fp;
    select (i ? 'isNew') into strict marked
      from jsonb_array_elements(public.read_public_gallery_post_photos(true,'ko',true,24)->'items') i where i->>'source'='fan_post';
    if marked <> (elapsed >= interval '0' and elapsed < interval '48 hours') then raise exception 'Unexpected New status for %', elapsed; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(public.read_public_gallery_post_photos('ko',true,24)->'items') i where i ? 'isNew') then
    raise exception 'Unexpected badge on the original gallery response';
  end if;
end
$test$;
rollback;
SQL

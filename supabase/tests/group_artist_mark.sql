-- Synthetic data only. Run on a disposable/local migrated DB; everything rolls back.
begin;
do $$
declare p uuid:=gen_random_uuid(); q uuid:=gen_random_uuid(); art uuid:=gen_random_uuid(); fan uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid(); items jsonb; r jsonb;
begin
 insert into public.app_users(id,privy_user_id,verified_email) values (art,'did:privy:mark-'||art,art||'@example.test'),(fan,'did:privy:mark-'||fan,fan||'@example.test');
 insert into public.admin_allowlist(id,email,active,role) values (adm,adm||'@example.test',true,'admin');
 insert into public.group_pages(id,kind,name) values (p,'hobby','mark page'),(q,'hobby','other page');
 insert into public.group_artist_bindings(page_id,app_user_id,verified_by) values (p,art,adm);
 items:=jsonb_build_array(
  jsonb_build_object('id',1,'profileId',art,'anonymous',false),
  jsonb_build_object('id',2,'profileId',art,'anonymous',true),
  jsonb_build_object('id',3,'profileId',fan,'anonymous',false),
  jsonb_build_object('id',4,'profileId',null,'anonymous',true),
  jsonb_build_object('id',5,'profileId',art));
 r:=public.group_artist_mark_items(p,items);
 if jsonb_array_length(r)<>5 then raise exception 'item count changed'; end if;
 if (r->0->>'artist')::boolean is not true then raise exception 'bound artist must be marked'; end if;
 if (r->1->>'artist')::boolean is not false then raise exception 'anonymous artist must not be marked'; end if;
 if (r->2->>'artist')::boolean is not false then raise exception 'fan must not be marked'; end if;
 if (r->3->>'artist')::boolean is not false then raise exception 'null profile must not be marked'; end if;
 if (r->4->>'artist')::boolean is not true then raise exception 'members rows without anonymous must be marked'; end if;
 if (public.group_artist_mark_items(q,items)->0->>'artist')::boolean is not false then raise exception 'binding is per page'; end if;
 if public.group_artist_mark_items(p,'[]'::jsonb)<>'[]'::jsonb then raise exception 'empty list'; end if;
 -- presence setting does not change the mark
 insert into public.group_artist_presence_settings(app_user_id,enabled) values (art,false) on conflict (app_user_id) do update set enabled=false;
 if (public.group_artist_mark_items(p,items)->0->>'artist')::boolean is not true then raise exception 'mark must ignore presence setting'; end if;
 -- original order and fields preserved
 if (r->0->>'id')<>'1' or (r->4->>'id')<>'5' then raise exception 'order changed'; end if;
 -- members are marked through the dispatcher wrapper
 insert into public.group_memberships(page_id,app_user_id,role) values (p,art,'member'),(p,fan,'member');
 r:=public.groups_dispatch('members',art,p,null,'{}'::jsonb);
 if not exists(select 1 from jsonb_array_elements(r->'items') i where i->>'profileId'=art::text and (i->>'artist')::boolean) then raise exception 'member artist mark missing'; end if;
 if exists(select 1 from jsonb_array_elements(r->'items') i where i->>'profileId'=fan::text and (i->>'artist')::boolean) then raise exception 'fan member marked'; end if;
end $$;
-- Fan-page (celebrity) read paths: the mark comes from the author's binding on the group page of the same celebrity.
do $$
declare c uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); art uuid:=gen_random_uuid(); fan uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid();
 post_a uuid:=gen_random_uuid(); post_f uuid:=gen_random_uuid(); msg_a uuid:=gen_random_uuid(); msg_f uuid:=gen_random_uuid(); r jsonb; slug text:='mark-'||substr(gen_random_uuid()::text,1,8);
begin
 insert into public.app_users(id,privy_user_id,verified_email) values (art,'did:privy:fm-'||art,art||'@example.test'),(fan,'did:privy:fm-'||fan,fan||'@example.test');
 insert into public.admin_allowlist(id,email,active,role) values (adm,adm||'@example.test',true,'admin');
 insert into public.celebrities(id,slug,image_url,roles,primary_role,status,published_at,ever_published_at) values (c,slug,'https://example.test/x.png',array['artist']::public.celebrity_role[],'idol','published',now(),now());
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values (c,'ko','마크 셀럽','요약','대체');
 insert into public.group_pages(id,kind,name,celebrity_id) values (p,'fan','fan mark page',c);
 insert into public.group_artist_bindings(page_id,app_user_id,verified_by) values (p,art,adm);
 insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash) values (post_a,c,art,'artist post',gen_random_uuid(),'h1'),(post_f,c,fan,'fan post',gen_random_uuid(),'h2');
 insert into public.fan_lounge_messages(id,celebrity_id,app_user_id,body,idempotency_key) values (msg_a,c,art,'artist cheer',gen_random_uuid()),(msg_f,c,fan,'fan cheer',gen_random_uuid());
 r:=public.fan_artist_mark(jsonb_build_array(jsonb_build_object('id',post_a),jsonb_build_object('id',post_f),jsonb_build_object('id',gen_random_uuid())),'post');
 if (r->0->>'artist')::boolean is not true then raise exception 'fan post by artist must be marked'; end if;
 if (r->1->>'artist')::boolean is not false then raise exception 'fan post by fan must not be marked'; end if;
 if (r->2->>'artist')::boolean is not false then raise exception 'unknown id must not be marked'; end if;
 r:=public.fan_artist_mark(jsonb_build_array(jsonb_build_object('id',msg_a),jsonb_build_object('id',msg_f)),'cheer');
 if (r->0->>'artist')::boolean is not true or (r->1->>'artist')::boolean is not false then raise exception 'cheer marks wrong'; end if;
 -- an item id looked up under the wrong source must not mark
 if (public.fan_artist_mark(jsonb_build_array(jsonb_build_object('id',post_a)),'comment')->0->>'artist')::boolean is not false then raise exception 'wrong source must not mark'; end if;
 -- wrapped reads keep working and carry the flag
 r:=public.read_celebrity_cheers(slug,fan,null,null,20,'ko');
 if jsonb_typeof(r->'comments') is distinct from 'array' then raise exception 'cheers shape'; end if;
 if not exists(select 1 from jsonb_array_elements(r->'comments') i where i->>'id'=msg_a::text and (i->>'artist')::boolean) then raise exception 'cheer artist flag missing in read'; end if;
 if exists(select 1 from jsonb_array_elements(r->'comments') i where i->>'id'=msg_f::text and (i->>'artist')::boolean) then raise exception 'fan cheer marked in read'; end if;
 r:=public.read_fan_posts(fan,slug,null,null,null,'latest',20,'ko');
 if not exists(select 1 from jsonb_array_elements(r->'items') i where i->>'id'=post_a::text and (i->>'artist')::boolean) then raise exception 'post artist flag missing in read'; end if;
 r:=public.read_fan_post(fan,post_a,'ko');
 if (r->'post'->>'artist')::boolean is not true then raise exception 'post detail artist flag missing'; end if;
 if (public.read_fan_post(fan,post_f,'ko')->'post'->>'artist')::boolean is not false then raise exception 'fan post detail marked'; end if;
end $$;
-- Direct reads of every wrapped RPC, other-celebrity bindings, malformed ids, and the group paths.
do $$
declare c uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); art uuid:=gen_random_uuid(); fan uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid();
 post_a uuid:=gen_random_uuid(); post_f uuid:=gen_random_uuid(); post_x uuid:=gen_random_uuid(); cm_a uuid:=gen_random_uuid(); cm_f uuid:=gen_random_uuid();
 msg uuid:=gen_random_uuid(); rep_a uuid:=gen_random_uuid(); rep_f uuid:=gen_random_uuid(); notice uuid:=gen_random_uuid();
 nc_a uuid:=gen_random_uuid(); nc_f uuid:=gen_random_uuid(); nc_o uuid:=gen_random_uuid(); gpost uuid; r jsonb;
 slug text:='mark2-'||substr(gen_random_uuid()::text,1,8); slug2 text:='mark3-'||substr(gen_random_uuid()::text,1,8); nslug text:='n-'||substr(gen_random_uuid()::text,1,8);
 fn text;
begin
 insert into public.app_users(id,privy_user_id,verified_email) values (art,'did:privy:fm2-'||art,art||'@example.test'),(fan,'did:privy:fm2-'||fan,fan||'@example.test');
 insert into public.admin_allowlist(id,email,active,role) values (adm,adm||'@example.test',true,'admin');
 insert into public.celebrities(id,slug,image_url,roles,primary_role,status,published_at,ever_published_at) values
  (c,slug,'https://example.test/x.png',array['artist']::public.celebrity_role[],'idol','published',now(),now()),
  (c2,slug2,'https://example.test/y.png',array['artist']::public.celebrity_role[],'idol','published',now(),now());
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values (c,'ko','마크 셀럽2','요약','대체'),(c2,'ko','마크 셀럽3','요약','대체');
 insert into public.group_pages(id,kind,name,celebrity_id) values (p,'fan','fan mark page 2',c),(p2,'fan','fan mark page 3',c2);
 insert into public.group_artist_bindings(page_id,app_user_id,verified_by) values (p,art,adm);
 insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash) values
  (post_a,c,art,'artist post',gen_random_uuid(),'h1'),(post_f,c,fan,'fan post',gen_random_uuid(),'h2'),(post_x,c2,art,'artist on another celebrity',gen_random_uuid(),'h3');
 insert into public.fan_post_comments(id,post_id,app_user_id,body,idempotency_key) values (cm_a,post_a,art,'artist comment',gen_random_uuid()),(cm_f,post_a,fan,'fan comment',gen_random_uuid());
 insert into public.fan_lounge_messages(id,celebrity_id,app_user_id,body,idempotency_key) values (msg,c,fan,'parent cheer',gen_random_uuid());
 insert into public.fan_lounge_messages(id,celebrity_id,app_user_id,body,idempotency_key,reply_to_id) values (rep_a,c,art,'artist reply',gen_random_uuid(),msg),(rep_f,c,fan,'fan reply',gen_random_uuid(),msg);
 insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at) values (notice,c,nslug,'published',now(),now());
 insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json) values (notice,'ko','공지','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"본문"}]}]}'::jsonb);
 insert into public.celebrity_notice_comments(id,notice_id,app_user_id,body,idempotency_key,is_official) values
  (nc_a,notice,art,'artist notice comment',gen_random_uuid(),false),(nc_f,notice,fan,'fan notice comment',gen_random_uuid(),false),(nc_o,notice,art,'official notice comment',gen_random_uuid(),true);
 -- the insert trigger recomputes is_official, so flag the official comment afterwards
 update public.celebrity_notice_comments set is_official=true where id=nc_o;

 -- the artist bound to celebrity c is not marked on celebrity c2 (binding is per celebrity page)
 if (public.fan_artist_mark(jsonb_build_array(jsonb_build_object('id',post_x)),'post')->0->>'artist')::boolean is not false then raise exception 'binding on another celebrity must not mark'; end if;
 r:=public.fan_artist_mark(jsonb_build_array(jsonb_build_object('id',cm_a),jsonb_build_object('id',cm_f)),'comment');
 if (r->0->>'artist')::boolean is not true or (r->1->>'artist')::boolean is not false then raise exception 'comment marks wrong'; end if;
 -- malformed or missing ids never raise and never mark
 r:=public.fan_artist_mark(jsonb_build_array(jsonb_build_object('id','not-a-uuid'),jsonb_build_object('id',7),jsonb_build_object('other',1),jsonb_build_object('id',null)),'post');
 if jsonb_array_length(r)<>4 or exists(select 1 from jsonb_array_elements(r) i where (i->>'artist')::boolean) then raise exception 'malformed ids handled wrong'; end if;
 r:=public.group_artist_mark_items(p,jsonb_build_array(jsonb_build_object('id',1,'profileId','not-a-uuid','anonymous',false)));
 if (r->0->>'artist')::boolean is not false then raise exception 'malformed profile id must not mark'; end if;

 -- read_fan_post_comments direct
 r:=public.read_fan_post_comments(fan,post_a,null,null,20,'ko');
 if not exists(select 1 from jsonb_array_elements(r->'items') i where i->>'id'=cm_a::text and (i->>'artist')::boolean) then raise exception 'comment artist flag missing'; end if;
 if exists(select 1 from jsonb_array_elements(r->'items') i where i->>'id'=cm_f::text and (i->>'artist')::boolean) then raise exception 'fan comment marked'; end if;
 if exists(select 1 from jsonb_array_elements(r->'items') i where not i ? 'artist') then raise exception 'comment item without artist key'; end if;
 -- read_celebrity_cheer_replies direct
 r:=public.read_celebrity_cheer_replies(msg,fan,null,null,20,'ko');
 if jsonb_typeof(r->'replies') is distinct from 'array' or jsonb_array_length(r->'replies')<2 then raise exception 'cheer replies shape %',r; end if;
 if not exists(select 1 from jsonb_array_elements(r->'replies') i where i->>'id'=rep_a::text and (i->>'artist')::boolean) then raise exception 'reply artist flag missing'; end if;
 if exists(select 1 from jsonb_array_elements(r->'replies') i where i->>'id'=rep_f::text and (i->>'artist')::boolean) then raise exception 'fan reply marked'; end if;
 if exists(select 1 from jsonb_array_elements(r->'replies') i where not i ? 'artist') then raise exception 'reply item without artist key'; end if;
 -- notice comments: 7-argument and 6-argument overload, official comments never marked
 foreach fn in array array['seven','six'] loop
  r:=case fn when 'seven' then public.read_celebrity_notice_comments(slug,nslug,fan,null,null,20,'ko')
             else public.read_celebrity_notice_comments(slug,nslug,fan,null,null,20) end;
  if jsonb_typeof(r->'comments') is distinct from 'array' then raise exception 'notice comments shape (%) %',fn,r; end if;
  if not exists(select 1 from jsonb_array_elements(r->'comments') i where i->>'id'=nc_a::text and (i->>'artist')::boolean) then raise exception 'notice artist flag missing (%)',fn; end if;
  if exists(select 1 from jsonb_array_elements(r->'comments') i where i->>'id'=nc_f::text and (i->>'artist')::boolean) then raise exception 'fan notice comment marked (%)',fn; end if;
  if exists(select 1 from jsonb_array_elements(r->'comments') i where i->>'id'=nc_o::text and (i->>'artist')::boolean) then raise exception 'official notice comment marked (%)',fn; end if;
  if exists(select 1 from jsonb_array_elements(r->'comments') i where not i ? 'artist') then raise exception 'notice item without artist key (%)',fn; end if;
 end loop;
 -- every read RPC returns the key on every item (posts list, post detail, cheers)
 if exists(select 1 from jsonb_array_elements(public.read_fan_posts(fan,slug,null,null,null,'latest',20,'ko')->'items') i where not i ? 'artist') then raise exception 'post list item without artist key'; end if;
 if not (public.read_fan_post(fan,post_a,'ko')->'post') ? 'artist' then raise exception 'post detail without artist key'; end if;
 if exists(select 1 from jsonb_array_elements(public.read_celebrity_cheers(slug,fan,null,null,20,'ko')->'comments') i where not i ? 'artist') then raise exception 'cheer item without artist key'; end if;

 -- group comment path: an anonymous artist comment is never marked, a named one is
 insert into public.group_memberships(page_id,app_user_id,role) values (p,art,'member'),(p,fan,'member');
 gpost:=(public.groups_content_dispatch('post',fan,p,null,jsonb_build_object('title','g','body','g','visibility','public','requestId',gen_random_uuid()))->>'id')::uuid;
 update public.group_pages set anonymous=true where id=p;
 perform public.groups_content_dispatch('comment',art,p,gpost,jsonb_build_object('body','anonymous artist','requestId',gen_random_uuid()));
 r:=public.groups_content_dispatch('comments',fan,p,gpost);
 if jsonb_array_length(r->'items')<>1 or (r#>>'{items,0,artist}')::boolean is not false or r#>>'{items,0,profileId}' is not null then raise exception 'anonymous group comment leaked the artist mark %',r; end if;
 update public.group_pages set anonymous=false where id=p;
 perform public.groups_content_dispatch('comment',art,p,gpost,jsonb_build_object('body','named artist','requestId',gen_random_uuid()));
 r:=public.groups_content_dispatch('comments',fan,p,gpost);
 if not exists(select 1 from jsonb_array_elements(r->'items') i where i->>'profileId'=art::text and (i->>'artist')::boolean) then raise exception 'named group artist comment not marked %',r; end if;
end $$;
rollback;
select 'group_artist_mark ok' as result;

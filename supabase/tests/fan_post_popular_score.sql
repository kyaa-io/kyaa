\set ON_ERROR_STOP on
-- Synthetic-only assertions for read_fan_post_period_ranking after 20261213030000; run on a disposable cluster after the full migration chain.
-- Pins the score order, the always-filled list, and every condition that keeps a post out of the list.
begin;
do $$
declare
 au uuid:=extensions.gen_random_uuid();l1 uuid:=extensions.gen_random_uuid();l2 uuid:=extensions.gen_random_uuid();l3 uuid:=extensions.gen_random_uuid();
 ud uuid:=extensions.gen_random_uuid();ub uuid:=extensions.gen_random_uuid();viewer uuid:=extensions.gen_random_uuid();
 c1 uuid:=extensions.gen_random_uuid();c2 uuid:=extensions.gen_random_uuid();c3 uuid:=extensions.gen_random_uuid();
 p_hot uuid:=extensions.gen_random_uuid();p_new uuid:=extensions.gen_random_uuid();p_old uuid:=extensions.gen_random_uuid();
 p_members uuid:=extensions.gen_random_uuid();p_hidden uuid:=extensions.gen_random_uuid();p_deleted uuid:=extensions.gen_random_uuid();
 p_disabled uuid:=extensions.gen_random_uuid();p_blocked uuid:=extensions.gen_random_uuid();p_empty uuid:=extensions.gen_random_uuid();
 r jsonb;ids text[];
begin
 insert into public.app_users(id,privy_user_id,verified_email)
  select x,'did:privy:popscore-'||x,x||'@example.test' from unnest(array[au,l1,l2,l3,ud,ub,viewer]) x;
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values
  (c1,'popscore-a','published','/fixture.webp',now(),'{creator}','creator'),
  (c3,'popscore-empty','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values
  (c1,'ko','점수 검증','요약','대체'),(c1,'en','Score fixture','Summary','Alt'),(c3,'ko','빈 페이지','요약','대체'),(c3,'en','Empty page','Summary','Alt');
 insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at)values
  (p_hot,c1,au,'많이 반응받은 글','public',extensions.gen_random_uuid(),'h',now()-interval '3 days'),
  (p_new,c1,au,'방금 쓴 글','public',extensions.gen_random_uuid(),'h',now()-interval '1 hour'),
  (p_old,c1,au,'오래된 글','public',extensions.gen_random_uuid(),'h',now()-interval '20 days'),
  (p_members,c1,au,'팬 전용 글','members',extensions.gen_random_uuid(),'h',now()-interval '2 hours'),
  (p_hidden,c1,au,'숨긴 글','public',extensions.gen_random_uuid(),'h',now()-interval '2 hours'),
  (p_deleted,c1,au,'지운 글','public',extensions.gen_random_uuid(),'h',now()-interval '2 hours'),
  (p_disabled,c1,ud,'탈퇴 작성자 글','public',extensions.gen_random_uuid(),'h',now()-interval '2 hours'),
  (p_blocked,c1,ub,'차단한 작성자 글','public',extensions.gen_random_uuid(),'h',now()-interval '2 hours');
 update public.fan_posts set hidden_at=now() where id=p_hidden;
 update public.fan_posts set deleted_at=now() where id=p_deleted;
 update public.app_users set status='disabled' where id=ud;
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(viewer,ub);
 -- Engagement: the 3 day old post has two likes and a comment today; the members, hidden, deleted, disabled and blocked posts all have many likes.
 insert into public.fan_post_likes(post_id,app_user_id)select p_hot,x from unnest(array[l1,l2]) x;
 insert into public.fan_post_comments(post_id,app_user_id,body,idempotency_key)values(p_hot,l3,'댓글',extensions.gen_random_uuid());
 insert into public.fan_post_likes(post_id,app_user_id)select p,x from unnest(array[p_members,p_hidden,p_deleted,p_disabled,p_blocked]) p cross join unnest(array[l1,l2,l3]) x;
 insert into public.fan_post_views(post_id,app_user_id)values(p_hot,l1);

 -- 1. Engaged posts first even though older; zero-engagement posts follow newest first; the 20 day old one is still listed.
 r:=public.read_fan_post_period_ranking(null,'popscore-a','day','ko');
 ids:=array(select x->>'id' from jsonb_array_elements(r->'items') x);
 -- The blocked author's post is public, so a guest sees it; its three likes today put it first. Then the engaged older post, then newest first.
 if ids<>array[p_blocked::text,p_hot::text,p_new::text,p_old::text] then raise exception 'guest order/visibility: %',ids; end if;
 -- 2. Hidden, deleted, members-only, disabled author never appear for a guest.
 if exists(select 1 from jsonb_array_elements(r->'items') x where (x->>'id')::uuid in(p_members,p_hidden,p_deleted,p_disabled)) then raise exception 'a hidden-class post leaked to a guest: %',ids; end if;
 -- 3. A blocked author is hidden from the blocker only. The guest above did not list it because it has the same public rules.
 r:=public.read_fan_post_period_ranking(viewer,'popscore-a','week','ko');
 if exists(select 1 from jsonb_array_elements(r->'items') x where (x->>'id')::uuid=p_blocked) then raise exception 'blocked author listed for blocker'; end if;
 r:=public.read_fan_post_period_ranking(l1,'popscore-a','week','ko');
 if not exists(select 1 from jsonb_array_elements(r->'items') x where (x->>'id')::uuid=p_blocked) then raise exception 'blocked author must stay visible to others'; end if;
 -- 4. A members-only post is visible only to an issued passport holder (fan_web_is_member); a signed-in viewer without one does not see it either.
 r:=public.read_fan_post_period_ranking(l1,'popscore-a','day','ko');
 if exists(select 1 from jsonb_array_elements(r->'items') x where (x->>'id')::uuid=p_members) then raise exception 'members-only post listed for a non-member'; end if;
 -- 5. Period only changes which engagement counts: a like older than a day does not lift a post in the day list.
 update public.fan_post_likes set created_at=now()-interval '2 days' where post_id=p_hot;
 update public.fan_post_comments set created_at=now()-interval '2 days' where post_id=p_hot;
 update public.fan_post_views set created_at=now()-interval '2 days' where post_id=p_hot;
 r:=public.read_fan_post_period_ranking(null,'popscore-a','day','ko');
 ids:=array(select x->>'id' from jsonb_array_elements(r->'items') x);
 if ids<>array[p_blocked::text,p_new::text,p_hot::text,p_old::text] then raise exception 'day list should fall back to newest first: %',ids; end if;
 r:=public.read_fan_post_period_ranking(null,'popscore-a','week','ko');
 ids:=array(select x->>'id' from jsonb_array_elements(r->'items') x);
 if array_position(ids,p_hot::text)>array_position(ids,p_new::text) then raise exception 'week list should still lift the engaged post above the quiet new one: %',ids; end if;
 -- 6. A page with no posts answers an empty list, an unknown creator or period is not a post list.
 if public.read_fan_post_period_ranking(null,'popscore-empty','day','ko')<>'{"items":[]}'::jsonb then raise exception 'empty page must answer an empty list'; end if;
 if public.read_fan_post_period_ranking(null,'popscore-missing','day','ko')<>'{"items":[]}'::jsonb then raise exception 'unknown creator must answer an empty list'; end if;
 begin perform public.read_fan_post_period_ranking(null,'popscore-a','year','ko'); raise exception 'year period must be refused';
 exception when sqlstate '22023' then null; end;
 -- 7. At most ten rows.
 insert into public.fan_posts(celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at)
  select c1,au,'채움 글 '||g,'public',extensions.gen_random_uuid(),'h',now()-(g||' minutes')::interval from generate_series(1,14) g;
 if jsonb_array_length(public.read_fan_post_period_ranking(null,'popscore-a','day','ko')->'items')<>10 then raise exception 'list must stop at ten'; end if;
end $$;
rollback;

-- Owner configuration. The function keeps whatever owner it had, so replay it under a bypassing owner (dev: postgres) and a row-security
-- bound owner. The replay owner is a superuser, which hides a missing select on the comment and view tables.
do $$ begin
 if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required'; end if;
end $$;
create role pop_owner_bypass nosuperuser bypassrls nologin;
create role pop_owner_plain nosuperuser nobypassrls nologin;
grant usage on schema public to pop_owner_bypass,pop_owner_plain;
grant select on public.fan_posts,public.fan_post_likes,public.app_users,public.celebrities to pop_owner_bypass,pop_owner_plain;
grant execute on function public.fan_web_content_visible(uuid,text,uuid),public.fan_web_post_json(uuid,uuid,public.content_locale) to pop_owner_bypass,pop_owner_plain;
create policy pop_owner_plain_posts on public.fan_posts for select to pop_owner_plain using (true);
create policy pop_owner_plain_likes on public.fan_post_likes for select to pop_owner_plain using (true);
create policy pop_owner_plain_users on public.app_users for select to pop_owner_plain using (true);
create policy pop_owner_plain_celebs on public.celebrities for select to pop_owner_plain using (true);

insert into public.app_users(id,privy_user_id,verified_email)values('fb130000-0000-4000-8000-000000000001','did:privy:popowner-a','popowner-a@example.test'),('fb130000-0000-4000-8000-000000000002','did:privy:popowner-b','popowner-b@example.test');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values('fb130000-0000-4000-8000-000000000011','popowner','draft','/fixture.webp',null,'{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values('fb130000-0000-4000-8000-000000000011','ko','소유자 검증','요약','대체'),('fb130000-0000-4000-8000-000000000011','en','Owner fixture','Summary','Alt');
update public.celebrities set status='published',published_at=now() where slug='popowner';
insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at)values
 ('fb130000-0000-4000-8000-000000000021','fb130000-0000-4000-8000-000000000011','fb130000-0000-4000-8000-000000000001','반응 있는 글','public',extensions.gen_random_uuid(),'h',now()-interval '2 days'),
 ('fb130000-0000-4000-8000-000000000022','fb130000-0000-4000-8000-000000000011','fb130000-0000-4000-8000-000000000001','반응 없는 새 글','public',extensions.gen_random_uuid(),'h',now()-interval '1 hour');
insert into public.fan_post_likes(post_id,app_user_id)values('fb130000-0000-4000-8000-000000000021','fb130000-0000-4000-8000-000000000002');
insert into public.fan_post_comments(post_id,app_user_id,body,idempotency_key)values('fb130000-0000-4000-8000-000000000021','fb130000-0000-4000-8000-000000000002','댓글',extensions.gen_random_uuid());
insert into public.fan_post_views(post_id,app_user_id)values('fb130000-0000-4000-8000-000000000021','fb130000-0000-4000-8000-000000000002');

create function pg_temp.read_as_service() returns jsonb language plpgsql as $$
declare result jsonb;
begin
 set local role service_role;
 result:=public.read_fan_post_period_ranking(null,'popowner','day','ko');
 reset role;
 return result;
exception when others then
 reset role;
 raise;
end $$;
create function pg_temp.expect_reads(label text) returns void language plpgsql as $$
declare r jsonb:=pg_temp.read_as_service();
begin
 if r->'items'->0->>'id'<>'fb130000-0000-4000-8000-000000000021' or r->'items'->1->>'id'<>'fb130000-0000-4000-8000-000000000022' then raise exception 'order for %: %',label,r; end if;
end $$;
create function pg_temp.expect_refused(label text) returns void language plpgsql as $$
begin
 perform pg_temp.read_as_service();
 raise exception 'Expected permission denied: %',label;
exception when insufficient_privilege then null;
end $$;
create function pg_temp.expect_narrow(role_name text) returns void language plpgsql as $$
begin
 if has_table_privilege(role_name,'public.fan_post_comments','insert') or has_table_privilege(role_name,'public.fan_post_comments','update') or has_table_privilege(role_name,'public.fan_post_comments','delete')
  or has_table_privilege(role_name,'public.fan_post_views','insert') or has_table_privilege(role_name,'public.fan_post_views','update') or has_table_privilege(role_name,'public.fan_post_views','delete') then raise exception 'write granted to %',role_name; end if;
 if has_column_privilege(role_name,'public.fan_post_comments','body','select') then raise exception 'comment body readable by %',role_name; end if;
 if has_table_privilege('service_role','public.fan_post_views','select') then raise exception 'service_role reads views directly'; end if;
end $$;

select pg_get_userbyid(proowner) as orig_owner from pg_proc where oid='public.read_fan_post_period_ranking(uuid,text,text,public.content_locale)'::regprocedure \gset
-- Row-security bypassing owner, the dev shape.
alter function public.read_fan_post_period_ranking(uuid,text,text,public.content_locale) owner to pop_owner_bypass;
\ir ../migrations/20261213030000_fan_post_popular_score.sql
select pg_temp.expect_reads('bypass owner');
select pg_temp.expect_narrow('pop_owner_bypass');
do $$ begin
 if exists(select 1 from pg_policy where polname like 'fan_post_popular_read_owner_%' and polrelid in('public.fan_post_comments'::regclass,'public.fan_post_views'::regclass)) then raise exception 'A bypassing owner needs no policy'; end if;
end $$;
\ir ../rollback/20261213030000_fan_post_popular_score.sql
do $$ begin
 if has_column_privilege('pop_owner_bypass','public.fan_post_views','created_at','select') then raise exception 'rollback left the view grant'; end if;
end $$;

-- Owner bound by row security.
alter function public.read_fan_post_period_ranking(uuid,text,text,public.content_locale) owner to pop_owner_plain;
\ir ../migrations/20261213030000_fan_post_popular_score.sql
select pg_temp.expect_reads('plain owner');
select pg_temp.expect_narrow('pop_owner_plain');
\ir ../migrations/20261213030000_fan_post_popular_score.sql
select pg_temp.expect_reads('plain owner, applied twice');
\ir ../rollback/20261213030000_fan_post_popular_score.sql
do $$ begin
 if exists(select 1 from pg_policy where polname like 'fan_post_popular_read_owner_%') then raise exception 'rollback left a policy'; end if;
 if has_column_privilege('pop_owner_plain','public.fan_post_comments','created_at','select') then raise exception 'rollback left the comment grant'; end if;
end $$;
-- Back to the replay owner.
alter function public.read_fan_post_period_ranking(uuid,text,text,public.content_locale) owner to :"orig_owner";

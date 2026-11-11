-- Disposable PostgreSQL fixture only; never run against a project database.
create role anon; create role authenticated; create role service_role;
create type public.content_locale as enum('ko','en');
create table public.app_users(id uuid primary key,status text);
create table public.celebrities(id uuid primary key,slug text,status text,archived_at timestamptz);
create table public.fan_posts(id uuid primary key,celebrity_id uuid,created_at timestamptz,deleted_at timestamptz,hidden_at timestamptz);
create table public.fan_post_likes(post_id uuid,app_user_id uuid,created_at timestamptz);
create function public.fan_web_content_visible(uuid,text,uuid) returns boolean language sql as 'select $3<>''00000000-0000-4000-8000-000000000099''::uuid';
create function public.fan_web_post_json(uuid,uuid,public.content_locale) returns jsonb language sql as 'select jsonb_build_object(''id'',$2)';
insert into public.app_users values('00000000-0000-4000-8000-000000000001','active'),('00000000-0000-4000-8000-000000000002','active');
insert into public.celebrities values('00000000-0000-4000-8000-000000000001','artist','published',null);

-- APPLY_MIGRATIONS
do $$
declare period text; boundary timestamptz; ids jsonb; a uuid='00000000-0000-4000-8000-000000000001'; b uuid='00000000-0000-4000-8000-000000000002';
begin
 foreach period in array array['day','week','month'] loop
  truncate public.fan_posts,public.fan_post_likes;
  boundary=date_trunc(period,now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  insert into public.fan_posts values(a,a,boundary,null,null),(b,a,now(),null,null),('00000000-0000-4000-8000-000000000003',a,boundary-interval '1 microsecond',null,null),('00000000-0000-4000-8000-000000000099',a,now(),null,null);
  insert into public.fan_post_likes values(a,a,now()),(a,b,now()),(b,a,now()),('00000000-0000-4000-8000-000000000099',a,now());
  ids=public.read_fan_post_period_ranking(null,'artist',period,'ko')->'items';
  if jsonb_array_length(ids)<>2 or ids->0->>'id'<>a::text or ids->1->>'id'<>b::text then raise exception 'period/filter/order/visibility failure: % %',period,ids; end if;
 end loop;
 if public.page_notice_seen(a,'raffle-results:artist:1') then raise exception 'unseen marked'; end if;
 if not public.page_notice_seen(a,'raffle-results:artist:1',true) or not public.page_notice_seen(a,'raffle-results:artist:1',true) then raise exception 'mark/idempotence'; end if;
 if public.page_notice_seen(b,'raffle-results:artist:1') or public.page_notice_seen(a,'raffle-results:artist:2') then raise exception 'owner/round isolation'; end if;
 if has_function_privilege('authenticated','public.page_notice_seen(uuid,text,boolean)','execute') or has_table_privilege('anon','public.page_notice_views','select') then raise exception 'history exposed'; end if;
 raise notice 'E2E1650_SQL_PASS';
end $$;

select 'E2E1650_SQL_PASS';

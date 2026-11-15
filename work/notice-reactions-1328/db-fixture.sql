\set ON_ERROR_STOP on
create role anon; create role authenticated; create role service_role;
create type public.content_locale as enum ('ko');
create table public.app_users(id uuid primary key,status text default 'active');
create table public.account_deletion_requests(app_user_id uuid,status text);
create table public.celebrity_notices(id uuid primary key);
create table public.celebrity_notice_likes(notice_id uuid,app_user_id uuid,primary key(notice_id,app_user_id));
create function public.fan_web_lock_active_user(uuid) returns void language plpgsql as $$begin if not exists(select 1 from public.app_users where id=$1 and status='active') then raise exception 'inactive'; end if; perform 1 from public.app_users where id=$1 for update; end$$;
create function public.read_fan_notice(uuid,text,text,public.content_locale) returns jsonb language sql as $$select jsonb_build_object('id',n.id,'likeCount',(select count(*) from public.celebrity_notice_likes where notice_id=n.id),'liked',exists(select 1 from public.celebrity_notice_likes where notice_id=n.id and app_user_id=$1)) from public.celebrity_notices n where $2='elina' and $3='notice'$$;
create function public.set_celebrity_notice_liked(uuid,text,text,boolean) returns jsonb language plpgsql as $$declare n uuid;begin select id into n from public.celebrity_notices; if $4 then insert into public.celebrity_notice_likes values(n,$1) on conflict do nothing; else delete from public.celebrity_notice_likes where notice_id=n and app_user_id=$1; end if; return '{}'::jsonb; end$$;
insert into public.app_users(id) values('11111111-1111-4111-8111-111111111111');
insert into public.celebrity_notices values('22222222-2222-4222-8222-222222222222');

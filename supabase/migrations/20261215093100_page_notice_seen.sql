begin;
set local lock_timeout='5s';
create table public.page_notice_views (
 app_user_id uuid not null references public.app_users(id) on delete cascade,
 notice_key text not null check (notice_key ~ '^raffle-results:[a-z0-9-]{1,80}:[a-f0-9T:.Z+-]{1,120}$'),
 seen_at timestamptz not null default now(),
 primary key(app_user_id,notice_key)
);
alter table public.page_notice_views enable row level security;
revoke all on public.page_notice_views from public,anon,authenticated;
create function public.page_notice_seen(p_app_user_id uuid,p_key text,p_mark boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_app_user_id is null or p_key is null or p_key !~ '^raffle-results:[a-z0-9-]{1,80}:[a-f0-9T:.Z+-]{1,120}$' then raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023'; end if;
 if p_mark then insert into public.page_notice_views(app_user_id,notice_key) values(p_app_user_id,p_key) on conflict do nothing; end if;
 return exists(select 1 from public.page_notice_views where app_user_id=p_app_user_id and notice_key=p_key);
end $$;
revoke all on function public.page_notice_seen(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.page_notice_seen(uuid,text,boolean) to service_role;
commit;

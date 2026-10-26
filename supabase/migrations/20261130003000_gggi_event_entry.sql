-- This configuration deliberately starts closed to entry until explicitly opened.
create table public.gggi_event_config (
 event_key text primary key check(event_key='gggi-goods-2026'),
 status text not null default 'draft' check(status in('draft','open','closed'))
);
insert into public.gggi_event_config(event_key) values('gggi-goods-2026');
create table public.gggi_event_entries (
 event_key text not null references public.gggi_event_config(event_key),
 app_user_id uuid not null references public.app_users(id),
 entered_at timestamptz not null default clock_timestamp(),
 primary key(event_key,app_user_id)
);
alter table public.gggi_event_config enable row level security;
alter table public.gggi_event_config force row level security;
alter table public.gggi_event_entries enable row level security;
alter table public.gggi_event_entries force row level security;
revoke all on public.gggi_event_config,public.gggi_event_entries from public,anon,authenticated,service_role;

create function public.gggi_event_json(p_app_user_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('eventKey',c.event_key,'status',c.status,'participation',
 case when p_app_user_id is null then null else jsonb_build_object(
  'liked',exists(select 1 from public.fan_reactions r join public.celebrities cr on cr.id=r.celebrity_id
    where r.app_user_id=p_app_user_id and cr.slug='gggi' and r.business_status='completed'),
  'enteredAt',(select e.entered_at from public.gggi_event_entries e where e.event_key=c.event_key and e.app_user_id=p_app_user_id)) end)
 from public.gggi_event_config c where c.event_key='gggi-goods-2026'
$$;

create function public.read_gggi_event(p_app_user_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.gggi_event_config where event_key='gggi-goods-2026' for update;
 if not found then raise exception 'GGGI_EVENT_NOT_FOUND'; end if;
 if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id); end if;
 if not exists(select 1 from public.celebrities where slug='gggi' and status='published' and archived_at is null)
 then raise exception 'GGGI_EVENT_NOT_FOUND'; end if;
 return public.gggi_event_json(p_app_user_id);
end $$;

create function public.enter_gggi_event(p_app_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare event_status text;
begin
 select status into event_status from public.gggi_event_config where event_key='gggi-goods-2026' for update;
 if not found then raise exception 'GGGI_EVENT_NOT_FOUND'; end if;
 perform public.fan_web_lock_active_user(p_app_user_id);
 if exists(select 1 from public.gggi_event_entries where event_key='gggi-goods-2026' and app_user_id=p_app_user_id)
 then return public.gggi_event_json(p_app_user_id); end if;
 if event_status<>'open' then raise exception 'GGGI_EVENT_CLOSED'; end if;
 if not exists(select 1 from public.celebrities where slug='gggi' and status='published' and archived_at is null)
 then raise exception 'GGGI_EVENT_NOT_FOUND'; end if;
 if not exists(select 1 from public.fan_reactions r join public.celebrities c on c.id=r.celebrity_id
   where r.app_user_id=p_app_user_id and c.slug='gggi' and r.business_status='completed')
 then raise exception 'GGGI_EVENT_LIKE_REQUIRED'; end if;
 insert into public.gggi_event_entries(event_key,app_user_id) values('gggi-goods-2026',p_app_user_id);
 return public.gggi_event_json(p_app_user_id);
end $$;

create function public.read_admin_gggi_event_entries(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,
 p_offset integer default 0,p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare total bigint; entries jsonb;
begin
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
 if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>100
 then raise exception 'FANPAGE_INVALID_REQUEST'; end if;
 perform 1 from public.gggi_event_config where event_key='gggi-goods-2026' for update;
 select count(*) into total from public.gggi_event_entries where event_key='gggi-goods-2026';
 select coalesce(jsonb_agg(jsonb_build_object('appUserId',e.app_user_id,'enteredAt',e.entered_at)
 order by e.entered_at,e.app_user_id),'[]'::jsonb) into entries from (
  select app_user_id,entered_at from public.gggi_event_entries where event_key='gggi-goods-2026'
  order by entered_at,app_user_id offset p_offset limit p_limit) e;
 return jsonb_build_object('total',total,'entries',entries,
  'nextOffset',case when p_offset+p_limit<total then p_offset+p_limit else null end);
end $$;
revoke all on function public.gggi_event_json(uuid),public.read_gggi_event(uuid),public.enter_gggi_event(uuid),
 public.read_admin_gggi_event_entries(uuid,uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.read_gggi_event(uuid),public.enter_gggi_event(uuid),
 public.read_admin_gggi_event_entries(uuid,uuid,integer,integer) to service_role;

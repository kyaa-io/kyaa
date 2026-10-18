begin;

create table public.mobile_official_post_reads (
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  notice_id uuid not null references public.celebrity_notices(id) on delete cascade,
  read_at timestamptz not null default clock_timestamp(),
  primary key(app_user_id,notice_id)
);
alter table public.mobile_official_post_reads enable row level security;
revoke all on public.mobile_official_post_reads from public,anon,authenticated,service_role;

create function public.read_owned_mobile_latest_official_post(p_app_user_id uuid,p_slug text,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select jsonb_build_object('id',n.id,'slug',n.slug,'title',l.title,'publishedAt',n.published_at,'readAt',r.read_at)
    into v_result
  from public.celebrity_notices n
  join public.celebrities c on c.id=n.celebrity_id
  join public.celebrity_notice_localizations l on l.notice_id=n.id and l.locale=p_locale
  left join public.mobile_official_post_reads r on r.notice_id=n.id and r.app_user_id=p_app_user_id
  where c.slug=p_slug and n.post_type='artist_post'
    and public.fan_web_content_target(p_app_user_id,'notice',n.id,p_locale) is not null
  order by n.published_at desc,n.id desc limit 1;
  return v_result;
end $$;

create function public.mark_owned_mobile_official_post_read(p_app_user_id uuid,p_slug text,p_notice_slug text,p_locale public.content_locale default 'ko')
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_read_at timestamptz;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select n.id into v_id from public.celebrity_notices n
  join public.celebrities c on c.id=n.celebrity_id
  where c.slug=p_slug and n.slug=p_notice_slug and n.post_type='artist_post'
    and public.fan_web_content_target(p_app_user_id,'notice',n.id,p_locale) is not null
  for share of n,c;
  if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  insert into public.mobile_official_post_reads(app_user_id,notice_id) values(p_app_user_id,v_id)
    on conflict(app_user_id,notice_id) do nothing;
  select read_at into v_read_at from public.mobile_official_post_reads
    where app_user_id=p_app_user_id and notice_id=v_id;
  update public.fan_notifications n set read_at=coalesce(n.read_at,v_read_at)
    where n.app_user_id=p_app_user_id and n.kind='official_post' and n.payload->>'targetId'=v_id::text
      and public.fan_web_notification_path(p_app_user_id,n.id) is not null;
  return v_read_at;
end $$;

revoke all on function public.read_owned_mobile_latest_official_post(uuid,text,public.content_locale),
  public.mark_owned_mobile_official_post_read(uuid,text,text,public.content_locale) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_latest_official_post(uuid,text,public.content_locale),
  public.mark_owned_mobile_official_post_read(uuid,text,text,public.content_locale) to service_role;

commit;

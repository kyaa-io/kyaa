begin;

create table public.social_profile_exchanges (
  viewer_id uuid not null references public.app_users(id) on delete cascade,
  profile_id uuid not null references public.app_users(id) on delete cascade,
  celebrity_id uuid not null references public.celebrities(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  primary key(viewer_id,profile_id,celebrity_id),
  check(viewer_id<>profile_id)
);
alter table public.social_profile_exchanges enable row level security;
alter table public.social_profile_exchanges force row level security;
revoke all on public.social_profile_exchanges from public,anon,authenticated,service_role;

alter function public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer) rename to read_social_fan_profile_before_social_states;

create function public.read_social_fan_profile(p_app_user_id uuid,p_profile_id uuid,p_celebrity_slug text,p_locale public.content_locale,p_before timestamptz,p_before_id uuid,p_before_kind text,p_limit integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; viewer_is_fan boolean;
begin
  result:=public.read_social_fan_profile_before_social_states(p_app_user_id,p_profile_id,p_celebrity_slug,p_locale,p_before,p_before_id,p_before_kind,p_limit);
  if result is null then return null; end if;
  select exists(
    select 1
    from public.fan_passports passport
    join public.celebrities celebrity on celebrity.id=passport.celebrity_id
    where passport.app_user_id=p_app_user_id
      and passport.business_status='issued'
      and celebrity.slug=result#>>'{favorite,slug}'
  ) into viewer_is_fan;
  return jsonb_set(
    result,
    '{capabilities,canRequestFriend}',
    to_jsonb(coalesce((result#>>'{capabilities,canRequestFriend}')::boolean,false) and viewer_is_fan)
  );
end $$;

create or replace function public.read_social_fan_profile(p_app_user_id uuid,p_profile_id uuid,p_celebrity_slug text,p_locale public.content_locale) returns jsonb language sql stable security definer set search_path='' as $$
  select public.read_social_fan_profile(p_app_user_id,p_profile_id,p_celebrity_slug,p_locale,null,null,null,12)
$$;

create or replace function public.resolve_social_profile_link(p_app_user_id uuid,p_token uuid,p_celebrity_slug text,p_locale public.content_locale,p_before timestamptz,p_before_id uuid,p_before_kind text,p_limit integer) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_profile_id uuid; result jsonb; v_celebrity_id uuid; selected_slug text;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select l.app_user_id into v_profile_id from public.social_profile_links l join public.app_users u on u.id=l.app_user_id and u.status='active' where l.token=p_token and l.expires_at>now();
  if v_profile_id is null then return null; end if;
  selected_slug:=p_celebrity_slug;
  if selected_slug is null then
    select c.slug into selected_slug
    from public.social_favorite_visibility v
    join public.celebrities c on c.id=v.celebrity_id and c.status='published' and c.archived_at is null
    join public.fan_passports mine on mine.app_user_id=p_app_user_id and mine.celebrity_id=c.id and mine.business_status='issued'
    where v.app_user_id=v_profile_id and v.visible
    order by v.updated_at desc,c.slug
    limit 1;
  end if;
  if selected_slug is null then return null; end if;
  result:=public.read_social_fan_profile(p_app_user_id,v_profile_id,selected_slug,p_locale,p_before,p_before_id,p_before_kind,p_limit);
  if result is not null and v_profile_id<>p_app_user_id then
    select c.id into v_celebrity_id from public.celebrities c where c.slug=result#>>'{favorite,slug}';
    if v_celebrity_id is not null then
      insert into public.social_profile_exchanges(viewer_id,profile_id,celebrity_id,scanned_at)
      values(p_app_user_id,v_profile_id,v_celebrity_id,now())
      on conflict(viewer_id,profile_id,celebrity_id) do update set scanned_at=excluded.scanned_at;
    end if;
  end if;
  return result;
end $$;

create or replace function public.resolve_social_profile_link(p_app_user_id uuid,p_token uuid,p_celebrity_slug text,p_locale public.content_locale) returns jsonb language sql volatile security definer set search_path='' as $$
  select public.resolve_social_profile_link(p_app_user_id,p_token,p_celebrity_slug,p_locale,null,null,null,12)
$$;

create or replace function public.read_owned_social_friends(p_app_user_id uuid,p_locale public.content_locale) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  return jsonb_build_object(
    'friendships',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,
      'profileId',o.id,
      'nickname',coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),
      'avatarUrl',public.public_fan_avatar_url(o.id),
      'celebritySlug',c.slug,
      'status',case when f.status='accepted' then 'friends' when f.requester_id=p_app_user_id then 'outgoing' else 'incoming' end,
      'createdAt',f.created_at,
      'retryAt',f.retry_at
    ) order by coalesce(f.accepted_at,f.created_at) desc,f.id desc)
    from public.social_friendships f
    join public.app_users o on o.id=case when f.requester_id=p_app_user_id then f.addressee_id else f.requester_id end and o.status='active'
    left join public.user_profiles p on p.app_user_id=o.id
    join public.celebrities c on c.id=f.celebrity_id
    where p_app_user_id in(f.requester_id,f.addressee_id) and f.status in('pending','accepted') and not public.fan_web_blocked(p_app_user_id,o.id)),'[]'::jsonb),
    'exchanges',coalesce((select jsonb_agg(jsonb_build_object(
      'profileId',e.profile_id,
      'nickname',coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),
      'avatarUrl',public.public_fan_avatar_url(e.profile_id),
      'favoriteSlug',c.slug,
      'scannedAt',e.scanned_at
    ) order by e.scanned_at desc,e.profile_id)
    from (select * from public.social_profile_exchanges where viewer_id=p_app_user_id order by scanned_at desc limit 20)e
    join public.app_users u on u.id=e.profile_id and u.status='active'
    left join public.user_profiles p on p.app_user_id=e.profile_id
    join public.celebrities c on c.id=e.celebrity_id
    where not public.fan_web_blocked(p_app_user_id,e.profile_id)),'[]'::jsonb)
  );
end $$;

revoke all on function public.read_social_fan_profile_before_social_states(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer),public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer),public.read_social_fan_profile(uuid,uuid,text,public.content_locale),public.resolve_social_profile_link(uuid,uuid,text,public.content_locale),public.resolve_social_profile_link(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer),public.read_owned_social_friends(uuid,public.content_locale) from public,anon,authenticated,service_role;
grant execute on function public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer),public.read_social_fan_profile(uuid,uuid,text,public.content_locale),public.resolve_social_profile_link(uuid,uuid,text,public.content_locale),public.resolve_social_profile_link(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer),public.read_owned_social_friends(uuid,public.content_locale) to service_role;

commit;

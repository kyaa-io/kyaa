begin;

create table public.mobile_default_passports (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null unique references public.app_users(id) on delete cascade,
  passport_number bigint generated always as identity unique,
  issued_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint mobile_default_passports_number_positive check(passport_number>0)
);

alter table public.mobile_default_passports enable row level security;
alter table public.mobile_default_passports force row level security;
revoke all on table public.mobile_default_passports from public,anon,authenticated,service_role;
revoke all on sequence public.mobile_default_passports_passport_number_seq from public,anon,authenticated,service_role;

create function public.ensure_mobile_default_passport(p_app_user_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare passport_id uuid; account_created_at timestamptz;
begin
  select app_user.created_at into account_created_at
  from public.app_users app_user
  where app_user.id=p_app_user_id and app_user.status='active'
  for update;
  if not found then raise exception 'MOBILE_PROFILE_NOT_FOUND'; end if;

  insert into public.mobile_default_passports(app_user_id,issued_at)
  values(p_app_user_id,account_created_at)
  on conflict(app_user_id) do nothing;
  select passport.id into strict passport_id
  from public.mobile_default_passports passport
  where passport.app_user_id=p_app_user_id;
  return passport_id;
end $$;

create function public.provision_mobile_default_passport()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' then perform public.ensure_mobile_default_passport(new.id); end if;
  return new;
end $$;

create trigger app_users_provision_mobile_default_passport
after insert on public.app_users for each row
execute function public.provision_mobile_default_passport();

insert into public.mobile_default_passports(app_user_id,issued_at)
select app_user.id,app_user.created_at
from public.app_users app_user
where app_user.status='active'
order by app_user.created_at,app_user.id
on conflict(app_user_id) do nothing;

create function public.mobile_default_passport_stamps(
  p_app_user_id uuid,p_locale public.content_locale
) returns jsonb language sql stable security definer set search_path='' as $$
  with first_friend as (
    select friendship.id,'friend'::text kind,
      case when p_locale='ko' then '첫 팬 친구' else 'First fan friend' end title,
      friendship.accepted_at issued_at
    from public.social_friendships friendship
    where p_app_user_id in(friendship.requester_id,friendship.addressee_id)
      and friendship.accepted_at is not null
    order by friendship.accepted_at,friendship.id limit 1
  ), first_invite as (
    select stamp.id,'invite'::text kind,
      case when p_locale='ko' then '함께 시작한 우리' else 'Started together' end title,
      stamp.issued_at
    from public.community_stamps stamp
    where stamp.app_user_id=p_app_user_id and stamp.kind='invite'
    order by stamp.issued_at,stamp.id limit 1
  ), actual_stamps as (
    select * from first_friend union all select * from first_invite
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'kind',kind,'title',title,'issuedAt',issued_at
  ) order by issued_at,id),'[]'::jsonb) from actual_stamps
$$;

create or replace function public.read_owned_mobile_passports(
  p_app_user_id uuid,p_locale public.content_locale
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  with default_passport as materialized (
    select passport.id,passport.issued_at,passport.passport_number,
      public.mobile_default_passport_stamps(p_app_user_id,p_locale) stamps,
      profile.nickname
    from public.mobile_default_passports passport
    join public.app_users app_user on app_user.id=passport.app_user_id and app_user.status='active'
    left join public.user_profiles profile on profile.app_user_id=passport.app_user_id
    where passport.app_user_id=p_app_user_id
  ), favorite_passports as materialized (
    select passport.id,passport.issued_at,c.slug,c.image_url,l.name,
      coalesce(sum(score.points),0)::integer fan_xp,
      public.get_fan_effective_tier(p_app_user_id,c.id) fan_tier,
      (select count(*) from public.stamps stamp where stamp.passport_id=passport.id and stamp.business_status='issued')+
      (select count(*) from public.first_reaction_stamps stamp where stamp.passport_id=passport.id) stamp_count
    from public.fan_passports passport
    join public.celebrities c on c.id=passport.celebrity_id
    join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    left join public.fan_score_ledger score on score.app_user_id=passport.app_user_id and score.celebrity_id=passport.celebrity_id
    where passport.app_user_id=p_app_user_id and passport.business_status='issued'
      and c.primary_role<>'brand'
    group by passport.id,passport.issued_at,c.id,c.slug,c.image_url,l.name
  ), items as (
    select 0 sort_group,issued_at,id,jsonb_build_object(
      'id',id,'kind','default','name','ByUs','imageUrl','/byus-app-icon-512.png',
      'ownerNickname',nickname,'passportNumber','BU '||pg_catalog.lpad(passport_number::text,6,'0'),
      'stampCount',jsonb_array_length(stamps),'issuedAt',issued_at
    ) item from default_passport
    union all
    select 1,issued_at,id,jsonb_build_object(
      'id',id,'kind','favorite','favorite',jsonb_build_object('slug',slug,'name',name,'imageUrl',image_url),
      'stampCount',stamp_count,'issuedAt',issued_at,'fanXp',fan_xp,'fanTier',fan_tier,
      'progress',public.get_fan_stage_progress(fan_xp,fan_tier)
    ) from favorite_passports
  )
  select jsonb_build_object('passports',coalesce(jsonb_agg(item order by sort_group,issued_at,id),'[]'::jsonb))
  into result from items;
  return result;
end $$;

create function public.read_owned_mobile_default_passport(
  p_app_user_id uuid,p_passport_id uuid,p_locale public.content_locale
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select jsonb_build_object(
    'id',passport.id,'kind','default','name','ByUs','imageUrl','/byus-app-icon-512.png',
    'ownerNickname',profile.nickname,
    'passportNumber','BU '||pg_catalog.lpad(passport.passport_number::text,6,'0'),
    'issuedAt',passport.issued_at,
    'stamps',public.mobile_default_passport_stamps(p_app_user_id,p_locale)
  ) into result
  from public.mobile_default_passports passport
  join public.app_users app_user on app_user.id=passport.app_user_id and app_user.status='active'
  left join public.user_profiles profile on profile.app_user_id=passport.app_user_id
  where passport.id=p_passport_id and passport.app_user_id=p_app_user_id;
  return result;
end $$;

create function public.scrub_mobile_default_passport_on_deletion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='active' and new.status='disabled'
    and exists(select 1 from public.account_deletion_requests request
      where request.app_user_id=new.id and request.status='pending') then
    delete from public.mobile_default_passports where app_user_id=new.id;
  end if;
  return new;
end $$;

create trigger app_users_scrub_mobile_default_passport
after update of status on public.app_users for each row
execute function public.scrub_mobile_default_passport_on_deletion();

alter table public.community_stamp_share_links
  add column include_nickname boolean not null default false,
  add column include_public_stamps boolean not null default true,
  add column visibility_mode text not null default 'legacy_all'
    check(visibility_mode in('legacy_all','explicit_public')),
  drop constraint community_stamp_share_links_owner_app_user_id_celebrity_id_key,
  add constraint community_stamp_share_links_owner_visibility_key unique(
    owner_app_user_id,celebrity_id,include_nickname,include_public_stamps,visibility_mode
  );

create table public.mobile_passport_public_stamps (
  fan_passport_id uuid not null,
  app_user_id uuid not null,
  celebrity_id uuid not null,
  stamp_source text not null check(stamp_source in('stamp','first_reaction','community')),
  stamp_id uuid not null,
  selected_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(fan_passport_id,stamp_source,stamp_id),
  foreign key(fan_passport_id,app_user_id,celebrity_id)
    references public.fan_passports(id,app_user_id,celebrity_id) on delete cascade
);

create function public.validate_mobile_passport_public_stamp()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.stamp_source='stamp' and not exists(
    select 1 from public.stamps stamp where stamp.id=new.stamp_id
      and stamp.passport_id=new.fan_passport_id and stamp.app_user_id=new.app_user_id
      and stamp.celebrity_id=new.celebrity_id and stamp.business_status='issued'
  ) then raise exception 'MOBILE_PASSPORT_PUBLIC_STAMP_INVALID';
  elsif new.stamp_source='first_reaction' and not exists(
    select 1 from public.first_reaction_stamps stamp where stamp.id=new.stamp_id
      and stamp.passport_id=new.fan_passport_id and stamp.app_user_id=new.app_user_id
      and stamp.celebrity_id=new.celebrity_id and stamp.business_status='issued'
  ) then raise exception 'MOBILE_PASSPORT_PUBLIC_STAMP_INVALID';
  elsif new.stamp_source='community' and not exists(
    select 1 from public.community_stamps stamp where stamp.id=new.stamp_id
      and stamp.app_user_id=new.app_user_id and stamp.celebrity_id=new.celebrity_id
  ) then raise exception 'MOBILE_PASSPORT_PUBLIC_STAMP_INVALID';
  end if;
  return new;
end $$;

create trigger mobile_passport_public_stamps_validate
before insert or update on public.mobile_passport_public_stamps
for each row execute function public.validate_mobile_passport_public_stamp();

alter table public.mobile_passport_public_stamps enable row level security;
alter table public.mobile_passport_public_stamps force row level security;
revoke all on table public.mobile_passport_public_stamps from public,anon,authenticated,service_role;

create function public.read_owned_mobile_passport_public_stamp_count(
  p_app_user_id uuid,p_passport_id uuid
) returns integer language sql stable security definer set search_path='' as $$
  select count(*)::integer from public.mobile_passport_public_stamps public_stamp
  where public_stamp.app_user_id=p_app_user_id
    and public_stamp.fan_passport_id=p_passport_id
    and (
      public_stamp.stamp_source='stamp' and exists(
        select 1 from public.stamps stamp where stamp.id=public_stamp.stamp_id
          and stamp.passport_id=public_stamp.fan_passport_id
          and stamp.app_user_id=public_stamp.app_user_id
          and stamp.celebrity_id=public_stamp.celebrity_id
          and stamp.business_status='issued'
      ) or public_stamp.stamp_source='first_reaction' and exists(
        select 1 from public.first_reaction_stamps stamp where stamp.id=public_stamp.stamp_id
          and stamp.passport_id=public_stamp.fan_passport_id
          and stamp.app_user_id=public_stamp.app_user_id
          and stamp.celebrity_id=public_stamp.celebrity_id
          and stamp.business_status='issued'
      ) or public_stamp.stamp_source='community' and exists(
        select 1 from public.community_stamps stamp where stamp.id=public_stamp.stamp_id
          and stamp.app_user_id=public_stamp.app_user_id
          and stamp.celebrity_id=public_stamp.celebrity_id
      )
    )
$$;

create or replace function public.create_community_stamp_share_link(
  p_app_user_id uuid,p_celebrity_slug text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_celebrity_id uuid;v_passport_id uuid;v_token text;
begin
  if p_app_user_id is null or p_celebrity_slug is null
    or p_celebrity_slug<>pg_catalog.btrim(p_celebrity_slug) then
    raise exception 'COMMUNITY_STAMP_INVALID_REQUEST' using errcode='22023';
  end if;
  perform 1 from public.app_users app_user
    where app_user.id=p_app_user_id and app_user.status='active' for key share;
  if not found then raise exception 'COMMUNITY_STAMP_NOT_FOUND' using errcode='P0002';end if;
  select celebrity.id into v_celebrity_id from public.celebrities celebrity
    where celebrity.slug=p_celebrity_slug and celebrity.status='published'
      and celebrity.archived_at is null for key share;
  if v_celebrity_id is null then raise exception 'COMMUNITY_STAMP_NOT_FOUND' using errcode='P0002';end if;
  select passport.id into v_passport_id from public.fan_passports passport
    where passport.app_user_id=p_app_user_id and passport.celebrity_id=v_celebrity_id
      and passport.business_status='issued' for key share;
  if v_passport_id is null then raise exception 'COMMUNITY_STAMP_PASSPORT_REQUIRED' using errcode='P0001';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'community-stamp:share-link:'||p_app_user_id::text||':'||v_celebrity_id::text,0));
  select link.token into v_token from public.community_stamp_share_links link
    where link.owner_app_user_id=p_app_user_id and link.celebrity_id=v_celebrity_id
      and not link.include_nickname and link.include_public_stamps
      and link.visibility_mode='legacy_all';
  while v_token is null loop
    v_token:=encode(extensions.gen_random_bytes(16),'hex');
    insert into public.community_stamp_share_links(
      token,owner_app_user_id,celebrity_id,fan_passport_id,
      include_nickname,include_public_stamps,visibility_mode)
    values(v_token,p_app_user_id,v_celebrity_id,v_passport_id,false,true,'legacy_all')
    on conflict(token) do nothing;
    if not found then v_token:=null;end if;
  end loop;
  return jsonb_build_object('token',v_token);
end $$;

create function public.create_mobile_passport_share_link(
  p_app_user_id uuid,p_passport_id uuid,p_include_nickname boolean,
  p_include_public_stamps boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_celebrity_id uuid;v_token text;
begin
  if p_app_user_id is null or p_passport_id is null or p_include_nickname is null
    or p_include_public_stamps is null then
    raise exception 'MOBILE_PROFILE_INVALID' using errcode='22023';
  end if;
  perform 1 from public.app_users app_user
    where app_user.id=p_app_user_id and app_user.status='active' for key share;
  if not found then raise exception 'MOBILE_PROFILE_NOT_FOUND' using errcode='P0002';end if;
  select passport.celebrity_id into v_celebrity_id from public.fan_passports passport
    join public.celebrities celebrity on celebrity.id=passport.celebrity_id
      and celebrity.status='published' and celebrity.archived_at is null
    where passport.id=p_passport_id and passport.app_user_id=p_app_user_id
      and passport.business_status='issued' for key share;
  if v_celebrity_id is null then raise exception 'MOBILE_PROFILE_NOT_FOUND' using errcode='P0002';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'community-stamp:share-link:'||p_app_user_id::text||':'||v_celebrity_id::text,0));
  select link.token into v_token from public.community_stamp_share_links link
    where link.owner_app_user_id=p_app_user_id and link.celebrity_id=v_celebrity_id
      and link.include_nickname=p_include_nickname
      and link.include_public_stamps=p_include_public_stamps
      and link.visibility_mode='explicit_public';
  while v_token is null loop
    v_token:=encode(extensions.gen_random_bytes(16),'hex');
    insert into public.community_stamp_share_links(
      token,owner_app_user_id,celebrity_id,fan_passport_id,
      include_nickname,include_public_stamps,visibility_mode)
    values(v_token,p_app_user_id,v_celebrity_id,p_passport_id,
      p_include_nickname,p_include_public_stamps,'explicit_public')
    on conflict(token) do nothing;
    if not found then v_token:=null;end if;
  end loop;
  return jsonb_build_object('token',v_token);
end $$;

create or replace function public.read_shared_passport_activity(p_token text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object('creator',c.slug,'issuedAt',p.issued_at,
    'ownerNickname',case when l.include_nickname then profile.nickname else null end,
    'tier',public.get_fan_effective_tier_for_score(p.app_user_id,p.celebrity_id,coalesce(s.score,0),
      (select policy_version from public.reward_policy_activation where singleton)),
    'score',coalesce(s.score,0),'activityCount',(select count(*) from public.fan_activities a
      where a.app_user_id=p.app_user_id and a.celebrity_id=p.celebrity_id),
    'stampCount',case when l.include_public_stamps then case when l.visibility_mode='explicit_public' then
      public.read_owned_mobile_passport_public_stamp_count(p.app_user_id,p.id)
      else (select count(*) from public.stamps st where st.passport_id=p.id)
      +(select count(*) from public.first_reaction_stamps fs where fs.app_user_id=p.app_user_id and fs.celebrity_id=p.celebrity_id)
      +(select count(*) from public.community_stamps cs where cs.app_user_id=p.app_user_id and cs.celebrity_id=p.celebrity_id)
      end else null end))
  from public.community_stamp_share_links l
  join public.app_users u on u.id=l.owner_app_user_id and u.status='active'
  join public.fan_passports p on p.id=l.fan_passport_id and p.app_user_id=u.id and p.business_status='issued'
  join public.celebrities c on c.id=l.celebrity_id and c.id=p.celebrity_id and c.status='published' and c.archived_at is null
  left join public.user_profiles profile on profile.app_user_id=u.id
  left join lateral(select sum(points)::integer score from public.fan_score_ledger sl
    where sl.app_user_id=u.id and sl.celebrity_id=c.id) s on true
  where l.token=p_token and p_token ~ '^[a-f0-9]{32}$' and l.revoked_at is null
$$;

revoke all on function public.ensure_mobile_default_passport(uuid),
  public.provision_mobile_default_passport(),
  public.mobile_default_passport_stamps(uuid,public.content_locale),
  public.validate_mobile_passport_public_stamp(),
  public.read_owned_mobile_passport_public_stamp_count(uuid,uuid),
  public.read_owned_mobile_default_passport(uuid,uuid,public.content_locale),
  public.create_mobile_passport_share_link(uuid,uuid,boolean,boolean),
  public.scrub_mobile_default_passport_on_deletion()
  from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_default_passport(uuid,uuid,public.content_locale),
  public.read_owned_mobile_passport_public_stamp_count(uuid,uuid),
  public.create_mobile_passport_share_link(uuid,uuid,boolean,boolean)
  to service_role;

commit;

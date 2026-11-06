begin;
-- Second review of the all-public profile change.
-- 1. Friend requests get a per-member daily limit. Every active member can now be reached, so one account could otherwise notify all of them.
-- 2. A signed-out clip reader gets the author's name and picture only, no member id or tier.
-- 3. Support rankings give other members rank, name and picture only. Units count too: one unit is 100 won. A member's own totals stay in "me".
-- 4. read_page_ranking drops sanctioned and disabled members, people in a block with the viewer, anonymous and hidden pages, and the wave page before check-in. It is what /api/pages/<slug>/rankings and /rankings/<slug> read.

-- Change the number here to change the limit.
create function public.social_friend_request_daily_limit()returns integer language sql immutable set search_path='' as $$select 30$$;
revoke all on function public.social_friend_request_daily_limit()from public,anon,authenticated,service_role;

do $patch$
declare def text;patched text;anchor text;owner_name name;
begin
 -- Friend request: counted after the replay check, so a retry of an accepted request still answers. The per-member lock stops parallel requests passing the count together.
 def:=pg_catalog.pg_get_functiondef('public.request_social_friend(uuid,uuid,text,uuid)'::regprocedure);
 anchor:=$a$ insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash)$a$;
 if position(anchor in def)=0 then raise exception 'PUBLIC_PROFILE_LIMITS_UNPATCHED: request_social_friend';end if;
 patched:=replace(def,anchor,$a$ perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social-friend-daily:'||p_app_user_id::text,0));
 if(select count(*)from public.social_friendships where requester_id=p_app_user_id and created_at>now()-interval'24 hours')>=public.social_friend_request_daily_limit()then raise exception 'SOCIAL_RATE_LIMITED';end if;
$a$||anchor);
 execute patched;
 select o.rolname into owner_name from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid=p.proowner where p.oid='public.request_social_friend(uuid,uuid,text,uuid)'::regprocedure and not o.rolsuper;
 if owner_name is not null then execute format('grant execute on function public.social_friend_request_daily_limit() to %I',owner_name);end if;

 -- Signed-out clip: stop before the author's id and tier are added.
 def:=pg_catalog.pg_get_functiondef('public.mobile_content_clip_json(uuid,uuid,public.content_locale)'::regprocedure);
 anchor:=$a$  if result is null then return null; end if;$a$;
 if position(anchor in def)=0 then raise exception 'PUBLIC_PROFILE_LIMITS_UNPATCHED: mobile_content_clip_json';end if;
 execute replace(def,anchor,$a$  if result is null or p_app_user_id is null then return result; end if;$a$);

 -- Support rows for other members.
 def:=pg_catalog.pg_get_functiondef('public.read_owned_mobile_fan_support_fans(uuid,text,public.content_locale,integer,integer)'::regprocedure);
 anchor:=$a$jsonb_build_object('rank',rank,'profileId',app_user_id,'nickname',nickname,'avatarUrl',avatar_url,'supportUnits',units,'supportKrw',krw)$a$;
 if position(anchor in def)=0 then raise exception 'PUBLIC_PROFILE_LIMITS_UNPATCHED: read_owned_mobile_fan_support_fans';end if;
 execute replace(def,anchor,$a$jsonb_build_object('rank',rank,'nickname',nickname,'avatarUrl',avatar_url,'isMe',app_user_id=p_app_user_id)$a$);

 -- The tab passes its viewer so a checked-in viewer still reaches the wave page.
 def:=pg_catalog.pg_get_functiondef('public.read_group_public_ranking(uuid,uuid)'::regprocedure);
 anchor:=$a$public.read_page_ranking(g.celebrity_id,'fan_contribution','all',null)$a$;
 if position(anchor in def)=0 then raise exception 'PUBLIC_PROFILE_LIMITS_UNPATCHED: read_group_public_ranking';end if;
 execute replace(def,anchor,$a$public.read_page_ranking(g.celebrity_id,'fan_contribution','all',p_actor)$a$);
end $patch$;

-- Ranks stay as computed in the snapshot, so gaps are expected. "me" stays: a member can always see their own rank.
create or replace function public.read_page_ranking(p_celebrity uuid, p_kind text, p_period text, p_viewer uuid default null, p_at timestamptz default pg_catalog.clock_timestamp())
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w record; snap public.ranking_snapshots; items jsonb; v_slug text; g public.group_pages;
begin
  if p_kind not in ('fan_contribution', 'dukjil') or (p_kind = 'dukjil' and p_period = 'all') then raise exception 'RANKING_PERIOD_INVALID' using errcode = 'P0001'; end if;
  select c.slug into v_slug from public.celebrities c where c.id = p_celebrity and c.status = 'published' and c.archived_at is null;
  if v_slug is null then raise exception 'CREATOR_NOT_FOUND' using errcode = 'P0001'; end if;
  select p.* into g from public.group_pages p where p.celebrity_id = p_celebrity;
  if g.id is not null and g.status <> 'published' then raise exception 'CREATOR_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_slug = 'kyaa-wave-fanpage' and not exists (
    select 1 from public.kyaa_wave_participants wp join public.app_users wu on wu.id = wp.app_user_id and wu.status = 'active'
     where wp.app_user_id = p_viewer and wp.event_key = 'kyaa-wave-2026') then
    raise exception 'CREATOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into w from public.ranking_period_window(p_period, p_at);
  select * into snap from public.ranking_snapshots where kind = p_kind and scope_id = p_celebrity and period = p_period and period_start = w.period_start;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'rank', (e ->> 'rank')::integer, 'subjectId', e ->> 'subjectId', 'score', (e ->> 'score')::bigint, 'achievedAt', e ->> 'achievedAt',
      'nickname', coalesce(nullif(pg_catalog.btrim(pr.nickname), ''), 'Fan'), 'characterId', coalesce(av.selected_character_id, 'star-pink')
    ) order by (e ->> 'rank')::integer), '[]'::jsonb) into items
    from pg_catalog.jsonb_array_elements(case when coalesce(g.anonymous, false) then '[]'::jsonb else coalesce(snap.rows, '[]'::jsonb) end) e
    join public.app_users au on au.id = (e ->> 'subjectId')::uuid and au.status = 'active'
    left join public.user_profiles pr on pr.app_user_id = au.id
    left join public.app_user_avatars av on av.app_user_id = au.id
    where not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = au.id and mr.revoked_at is null)
      and (p_viewer is null or not exists (select 1 from public.user_blocks b where (b.app_user_id = p_viewer and b.blocked_app_user_id = au.id) or (b.app_user_id = au.id and b.blocked_app_user_id = p_viewer)));
  return pg_catalog.jsonb_build_object('metric', p_kind, 'period', p_period, 'periodStart', w.period_start, 'computedAt', snap.computed_at, 'rows', items,
    'me', public.ranking_my_rank(p_kind, p_celebrity, p_period, p_at, snap.rows, p_viewer));
end $$;

-- read_page_ranking now filters on FORCE RLS tables too, so its owner goes through the same access and check.
create or replace function public.group_public_directory_owner_roles()
returns table(role_oid oid,rolname name,rolsuper boolean,rolbypassrls boolean) language sql stable set search_path='' as $$
 select distinct o.oid,o.rolname,o.rolsuper,o.rolbypassrls from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid=f.proowner
 where f.pronamespace='public'::regnamespace and f.proname in('read_group_public_people','read_group_public_rooms','read_group_public_ranking','social_profile_is_public','read_page_ranking')
$$;
create or replace function public.group_public_directory_owner_tables()returns text[] language sql immutable set search_path='' as $$
 select array['group_pages','celebrities','app_users','kyaa_wave_participants','group_memberships','social_profile_settings','app_user_moderation_restrictions','user_blocks','user_profiles','group_rooms','ranking_snapshots','app_user_avatars']::text[]
$$;
create or replace function public.group_public_directory_owner_functions()returns text[] language sql immutable set search_path='' as $$
 select array['public.group_public_visible_page(uuid,uuid)','public.public_fan_avatar_url(uuid)','public.get_fan_effective_tier(uuid,uuid)','public.read_page_ranking(uuid,text,text,uuid,timestamptz)','public.social_profile_is_public(uuid)','public.ranking_period_window(text,timestamptz)','public.ranking_my_rank(text,uuid,text,timestamptz,jsonb,uuid)']::text[]
$$;
select public.group_public_directory_owner_access();
select public.group_public_directory_owner_check();
commit;

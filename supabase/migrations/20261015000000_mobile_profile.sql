begin;

create function public.mobile_profile_account_level(p_app_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with favorite_xp as materialized (
    select ledger.celebrity_id,coalesce(sum(ledger.points),0)::integer xp
    from public.fan_score_ledger ledger
    join public.celebrities celebrity on celebrity.id=ledger.celebrity_id and celebrity.primary_role<>'brand'
    where ledger.app_user_id=p_app_user_id and exists(
      select 1 from public.fan_passports passport where passport.app_user_id=p_app_user_id
        and passport.celebrity_id=ledger.celebrity_id and passport.business_status='issued'
    )
    group by ledger.celebrity_id
  ), total as materialized(select coalesce(sum(xp),0)::integer xp from favorite_xp), level as materialized(
    select xp,public.fan_level_for_score(xp) tier from total
  )
  select jsonb_build_object('ruleVersion','favorite-xp-sum-v1','status','configured','tier',tier,'xp',xp,'progress',public.get_fan_stage_progress(xp,tier)) from level
$$;

create function public.read_owned_mobile_profile_activities(
  p_app_user_id uuid,p_locale public.content_locale,p_favorite_slug text default null,
  p_before timestamptz default null,p_before_id uuid default null,p_before_kind text default null,p_limit integer default 20
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_limit not between 1 and 30 or ((p_before is null)<>(p_before_id is null)) or ((p_before is null)<>(p_before_kind is null))
    or (p_before_kind is not null and p_before_kind not in('fan_activity','fan_post')) then raise exception 'MOBILE_PROFILE_INVALID_INPUT'; end if;
  if p_favorite_slug is not null and not exists(select 1 from public.celebrities where slug=p_favorite_slug) then raise exception 'MOBILE_PROFILE_INVALID_INPUT'; end if;
  with all_items as materialized (
    select a.id,'fan_activity'::text kind,c.slug,c.image_url,l.name,
      case a.activity_type
        when 'knowledge' then case when p_locale='ko' then l.name||' 팬 인증' else l.name||' fan verification' end
        when 'reservation' then case when p_locale='ko' then l.name||' LIVE 예약' else l.name||' LIVE reservation' end
        when 'attendance' then case when p_locale='ko' then l.name||' LIVE 출석' else l.name||' LIVE attendance' end
        when 'survey' then case when p_locale='ko' then l.name||' 후기 참여' else l.name||' survey' end
        when 'membership' then case when p_locale='ko' then l.name||' 멤버십 인증' else l.name||' membership verification' end
        else case when p_locale='ko' then l.name||' 팬 활동' else l.name||' fan activity' end end title,
      a.occurred_at,null::uuid media_id,
      case when live.slug is not null then 'live' when passport.id is not null then 'passport' else 'none' end target_type,
      coalesce(live.slug,passport.id::text) target_id,false is_public
    from public.fan_activities a join public.celebrities c on c.id=a.celebrity_id
    join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    left join public.live_events live on live.id=a.source_id and a.source_type in('live_reservation','live_attendance','live_survey_response')
    left join public.fan_passports passport on passport.app_user_id=a.app_user_id and passport.celebrity_id=a.celebrity_id and passport.business_status='issued'
    where a.app_user_id=p_app_user_id and (p_favorite_slug is null or c.slug=p_favorite_slug)
    union all
    select post.id,'fan_post',c.slug,c.image_url,l.name,
      case when p_locale='ko' then l.name||' 팬 게시물' else l.name||' fan post' end,
      post.created_at,media.id,'fan_post',post.id::text,post.visibility='public'
    from public.fan_posts post join public.celebrities c on c.id=post.celebrity_id
    join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    left join lateral(select asset.id from public.mobile_media_assets asset where asset.attached_type='fan_post' and asset.attached_id=post.id and asset.state='ready' and asset.storage_deleted_at is null order by asset.position,asset.id limit 1)media on true
    where post.app_user_id=p_app_user_id and post.deleted_at is null and post.hidden_at is null and (p_favorite_slug is null or c.slug=p_favorite_slug)
  ), selected as materialized (
    select * from all_items where p_before is null or (occurred_at,id,kind)<(p_before,p_before_id,p_before_kind)
    order by occurred_at desc,id desc,kind desc limit p_limit+1
  ), page as materialized(select * from selected order by occurred_at desc,id desc,kind desc limit p_limit), last_item as(select * from page order by occurred_at,id,kind limit 1)
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'favorite',jsonb_build_object('slug',slug,'name',name,'imageUrl',image_url),'title',title,'occurredAt',occurred_at,'thumbnailUrl',case when media_id is null then image_url else '/api/media/'||media_id::text||'?variant=thumbnail' end,'target',jsonb_build_object('type',target_type,'id',target_id),'isPublic',is_public) order by occurred_at desc,id desc,kind desc)from page),'[]'::jsonb),
    'nextCursor',case when (select count(*) from selected)>p_limit then (select jsonb_build_object('at',occurred_at,'id',id,'kind',kind)from last_item) else null end
  ) into result;
  return result;
end $$;

create function public.read_owned_mobile_passports(p_app_user_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  with owned as materialized(
    select passport.id,passport.issued_at,c.slug,c.image_url,l.name,c.primary_role,
      coalesce(sum(score.points),0)::integer fan_xp,public.get_fan_effective_tier(p_app_user_id,c.id)fan_tier,
      (select count(*) from public.stamps stamp where stamp.passport_id=passport.id and stamp.business_status='issued')+
      (select count(*) from public.first_reaction_stamps stamp where stamp.passport_id=passport.id) stamp_count
    from public.fan_passports passport join public.celebrities c on c.id=passport.celebrity_id
    join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    left join public.fan_score_ledger score on score.app_user_id=passport.app_user_id and score.celebrity_id=passport.celebrity_id
    where passport.app_user_id=p_app_user_id and passport.business_status='issued'
    group by passport.id,passport.issued_at,c.id,c.slug,c.image_url,l.name,c.primary_role
  )
  select jsonb_build_object('passports',coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',case when primary_role='brand'then'default'else'favorite'end,'favorite',jsonb_build_object('slug',slug,'name',name,'imageUrl',image_url),'stampCount',stamp_count,'issuedAt',issued_at,'fanXp',fan_xp,'fanTier',fan_tier,'progress',public.get_fan_stage_progress(fan_xp,fan_tier))order by(primary_role='brand')desc,issued_at,id),'[]'::jsonb))into result from owned;
  return result;
end $$;

create function public.read_owned_mobile_profile_levels(p_app_user_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  with passport_users as materialized(
    select passport.app_user_id,passport.celebrity_id,passport.issued_at,coalesce(sum(score.points),0)::integer xp
    from public.fan_passports passport join public.app_users app_user on app_user.id=passport.app_user_id and app_user.status='active'
    left join public.fan_score_ledger score on score.app_user_id=passport.app_user_id and score.celebrity_id=passport.celebrity_id
    where passport.business_status='issued' group by passport.app_user_id,passport.celebrity_id,passport.issued_at
  ), ranked as materialized(
    select passport_users.*,row_number()over(partition by celebrity_id order by xp desc,issued_at,app_user_id)::integer rank,
      count(*)over(partition by celebrity_id)::integer participant_count from passport_users
  ), mine as(select ranked.*,c.slug,c.image_url,l.name,public.get_fan_effective_tier(p_app_user_id,c.id)tier from ranked join public.celebrities c on c.id=ranked.celebrity_id join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale where ranked.app_user_id=p_app_user_id)
  select jsonb_build_object('accountLevel',public.mobile_profile_account_level(p_app_user_id),'favorites',coalesce(jsonb_agg(jsonb_build_object('favorite',jsonb_build_object('slug',slug,'name',name,'imageUrl',image_url),'xp',xp,'tier',tier,'rank',rank,'participantCount',participant_count,'progress',public.get_fan_stage_progress(xp,tier))order by rank,slug),'[]'::jsonb))into result from mine;
  return result;
end $$;

create function public.read_owned_mobile_profile(p_app_user_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; activity_page jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  activity_page:=public.read_owned_mobile_profile_activities(p_app_user_id,p_locale,null,null,null,null,1);
  with visible_favorites as materialized(
    select c.slug,c.image_url,l.name,count(*)over() total
    from public.social_favorite_visibility visibility join public.celebrities c on c.id=visibility.celebrity_id
    join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    where visibility.app_user_id=p_app_user_id and visibility.visible
  ), counts as(
    select
      (select count(*) from public.stamps where app_user_id=p_app_user_id and business_status='issued')+
      (select count(*) from public.first_reaction_stamps where app_user_id=p_app_user_id)+
      (select count(*) from public.community_stamps where app_user_id=p_app_user_id) stamps,
      (select count(*) from public.social_friendships where status='accepted' and p_app_user_id in(requester_id,addressee_id)) friends,
      (select count(*) from public.live_collectible_claims where app_user_id=p_app_user_id and business_status='claimed') goods,
      (select count(*) from public.fan_passports where app_user_id=p_app_user_id and business_status='issued') passports
  )
  select jsonb_build_object(
    'profile',jsonb_build_object('nickname',profile.nickname,'avatarUrl',public.public_fan_avatar_url(p_app_user_id),'preferredFavorite',(select jsonb_build_object('slug',slug,'name',name,'imageUrl',image_url)from visible_favorites where total=1)),
    'counts',jsonb_build_object('stamps',counts.stamps,'friends',counts.friends,'goods',counts.goods),
    'passports',jsonb_build_object('count',counts.passports,'stampCount',counts.stamps),
    'recentActivity',activity_page->'items'->0,
    'accountLevel',public.mobile_profile_account_level(p_app_user_id)
  ) into result from public.app_users app_user left join public.user_profiles profile on profile.app_user_id=app_user.id cross join counts where app_user.id=p_app_user_id and app_user.status='active';
  return result;
end $$;

create function public.read_public_mobile_profile_activities(
  p_app_user_id uuid,p_profile_id uuid,p_celebrity_slug text,p_locale public.content_locale,
  p_before timestamptz default null,p_before_id uuid default null,p_before_kind text default null,p_limit integer default 12
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_limit not between 1 and 30 or ((p_before is null)<>(p_before_id is null)) or ((p_before is null)<>(p_before_kind is null)) or (p_before_kind is not null and p_before_kind<>'fan_post') then raise exception 'SOCIAL_CONFLICT'; end if;
  if not exists(select 1 from public.app_users viewer where viewer.id=p_app_user_id and viewer.status='active')
    or not exists(select 1 from public.app_users target where target.id=p_profile_id and target.status='active')
    or public.fan_web_blocked(p_app_user_id,p_profile_id)
    or not coalesce((select profile_visible from public.social_profile_settings where app_user_id=p_profile_id),false) then return null; end if;
  with creator as materialized(select c.id,c.slug,c.image_url,l.name from public.celebrities c join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale where c.slug=p_celebrity_slug and c.status='published' and c.archived_at is null), selected as materialized(
    select post.id,'fan_post'::text kind,c.slug,c.image_url,c.name,case when p_locale='ko'then c.name||' 팬 게시물'else c.name||' fan post'end title,post.created_at,media.id media_id
    from public.fan_posts post join creator c on c.id=post.celebrity_id
    join public.social_favorite_visibility visibility on visibility.app_user_id=p_profile_id and visibility.celebrity_id=c.id and visibility.visible
    left join lateral(select asset.id from public.mobile_media_assets asset where asset.attached_type='fan_post'and asset.attached_id=post.id and asset.state='ready'and asset.storage_deleted_at is null order by asset.position,asset.id limit 1)media on true
    where post.app_user_id=p_profile_id and post.visibility='public'and post.deleted_at is null and post.hidden_at is null and(p_before is null or(post.created_at,post.id,'fan_post'::text)<(p_before,p_before_id,p_before_kind))
    order by post.created_at desc,post.id desc limit p_limit+1
  ),page as materialized(select*from selected order by created_at desc,id desc limit p_limit),last_item as(select*from page order by created_at,id limit 1)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'favorite',jsonb_build_object('slug',slug,'name',name,'imageUrl',image_url),'title',title,'occurredAt',created_at,'thumbnailUrl',case when media_id is null then image_url else '/api/media/'||media_id::text||'?variant=thumbnail'end,'target',jsonb_build_object('type','fan_post','id',id::text),'isPublic',true)order by created_at desc,id desc)from page),'[]'::jsonb),'nextCursor',case when(select count(*)from selected)>p_limit then(select jsonb_build_object('at',created_at,'id',id,'kind',kind)from last_item)else null end)into result;
  return result;
end $$;

alter function public.read_social_fan_profile(uuid,uuid,text,public.content_locale) rename to read_social_fan_profile_before_mobile_profile;
create function public.read_social_fan_profile(p_app_user_id uuid,p_profile_id uuid,p_celebrity_slug text,p_locale public.content_locale,p_before timestamptz,p_before_id uuid,p_before_kind text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb;activity_page jsonb;selected_slug text;
begin
  selected_slug:=p_celebrity_slug;
  if selected_slug is null then
    select c.slug into selected_slug from public.social_favorite_visibility visibility
    join public.celebrities c on c.id=visibility.celebrity_id and c.status='published'and c.archived_at is null
    join public.fan_passports passport on passport.app_user_id=p_profile_id and passport.celebrity_id=c.id and passport.business_status='issued'
    where visibility.app_user_id=p_profile_id and visibility.visible order by passport.issued_at,c.slug limit 1;
  end if;
  if selected_slug is null then return null; end if;
  base:=public.read_social_fan_profile_before_mobile_profile(p_app_user_id,p_profile_id,selected_slug,p_locale);
  if base is null then return null; end if;
  activity_page:=public.read_public_mobile_profile_activities(p_app_user_id,p_profile_id,selected_slug,p_locale,p_before,p_before_id,p_before_kind,p_limit);
  if activity_page is null then return null; end if;
  base:=jsonb_set(base,'{profile,accountLevel}',public.mobile_profile_account_level(p_profile_id));
  base:=jsonb_set(base,'{publicActivityCount}',to_jsonb((select count(*)::integer from public.fan_posts post join public.celebrities c on c.id=post.celebrity_id join public.social_favorite_visibility visibility on visibility.app_user_id=p_profile_id and visibility.celebrity_id=c.id and visibility.visible where post.app_user_id=p_profile_id and c.slug=selected_slug and post.visibility='public'and post.deleted_at is null and post.hidden_at is null)));
  return base||jsonb_build_object('activities',activity_page->'items','activityNextCursor',activity_page->'nextCursor');
end $$;
create function public.read_social_fan_profile(p_app_user_id uuid,p_profile_id uuid,p_celebrity_slug text,p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$select public.read_social_fan_profile(p_app_user_id,p_profile_id,p_celebrity_slug,p_locale,null,null,null,12)$$;

create function public.resolve_social_profile_link(p_app_user_id uuid,p_token uuid,p_celebrity_slug text,p_locale public.content_locale,p_before timestamptz,p_before_id uuid,p_before_kind text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare profile_id uuid;
begin
  select link.app_user_id into profile_id from public.social_profile_links link join public.app_users app_user on app_user.id=link.app_user_id and app_user.status='active' where link.token=p_token and link.expires_at>now();
  if profile_id is null then return null; end if;
  return public.read_social_fan_profile(p_app_user_id,profile_id,p_celebrity_slug,p_locale,p_before,p_before_id,p_before_kind,p_limit);
end $$;

revoke all on function public.mobile_profile_account_level(uuid),public.read_owned_mobile_profile_activities(uuid,public.content_locale,text,timestamptz,uuid,text,integer),public.read_owned_mobile_passports(uuid,public.content_locale),public.read_owned_mobile_profile_levels(uuid,public.content_locale),public.read_owned_mobile_profile(uuid,public.content_locale),public.read_public_mobile_profile_activities(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer),public.read_social_fan_profile_before_mobile_profile(uuid,uuid,text,public.content_locale),public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer),public.read_social_fan_profile(uuid,uuid,text,public.content_locale),public.resolve_social_profile_link(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_profile_activities(uuid,public.content_locale,text,timestamptz,uuid,text,integer),public.read_owned_mobile_passports(uuid,public.content_locale),public.read_owned_mobile_profile_levels(uuid,public.content_locale),public.read_owned_mobile_profile(uuid,public.content_locale),public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer),public.read_social_fan_profile(uuid,uuid,text,public.content_locale),public.resolve_social_profile_link(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer) to service_role;

commit;

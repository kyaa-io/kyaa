begin;

create function public.get_mobile_social_stamp_collection(p_app_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  invitation_count integer;
  invitation_step integer;
  invitation_next integer;
  friend_count integer;
  friend_next integer;
  invitation_milestones jsonb;
  friend_milestones jsonb;
  friend_content jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);

  select policy.milestone_size into invitation_step
  from public.community_stamp_invitation_policy_versions policy
  where policy.effective_at<=pg_catalog.clock_timestamp()
  order by policy.effective_at desc,policy.version desc
  limit 1;
  if invitation_step is null then
    raise exception 'COMMUNITY_STAMP_UNAVAILABLE';
  end if;

  select count(*)::integer into invitation_count
  from public.community_stamp_invitation_relations relation
  join public.app_users invitee
    on invitee.id=relation.invitee_app_user_id and invitee.status='active'
  where relation.inviter_app_user_id=p_app_user_id
    and relation.status='qualified';

  invitation_next:=case
    when invitation_count=0 then 1
    else ((invitation_count/invitation_step)+1)*invitation_step
  end;

  with earned as (
    select 1 threshold,stamp.issued_at achieved_at,'earned'::text status
    from public.community_stamp_invitation_relations relation
    join public.app_users invitee
      on invitee.id=relation.invitee_app_user_id and invitee.status='active'
    join public.community_stamps stamp
      on stamp.app_user_id=p_app_user_id
      and stamp.kind='invite'
      and stamp.source_key='invite:'||relation.redemption_id::text||':inviter'
    where relation.inviter_app_user_id=p_app_user_id
      and relation.status='qualified'
    order by relation.qualified_sequence,stamp.issued_at,stamp.id
    limit 1
  ), rewards as (
    select milestone.qualified_count::integer threshold,
      milestone.created_at achieved_at,milestone.status
    from public.community_stamp_invitation_milestones milestone
    where milestone.inviter_app_user_id=p_app_user_id
  ), combined as (
    select * from earned union all select * from rewards
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'threshold',threshold,'achievedAt',achieved_at,'status',status
  ) order by threshold,achieved_at),'[]'::jsonb)
  into invitation_milestones from combined;

  with accepted as materialized (
    select case when friendship.requester_id=p_app_user_id
        then friendship.addressee_id else friendship.requester_id end friend_id,
      min(friendship.accepted_at) accepted_at
    from public.social_friendships friendship
    join public.app_users friend on friend.id=case
      when friendship.requester_id=p_app_user_id
        then friendship.addressee_id else friendship.requester_id end
      and friend.status='active'
    where p_app_user_id in(friendship.requester_id,friendship.addressee_id)
      and friendship.accepted_at is not null
      and not public.fan_web_blocked(p_app_user_id,friend.id)
    group by friend_id
  ), ranked as (
    select accepted_at,row_number() over(order by accepted_at,friend_id) ordinal
    from accepted
  )
  select count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'threshold',ordinal,'achievedAt',accepted_at,'status','achieved'
    ) order by ordinal) filter(where ordinal in(1,10,100)),'[]'::jsonb)
  into friend_count,friend_milestones from ranked;

  friend_next:=case
    when friend_count<1 then 1
    when friend_count<10 then 10
    when friend_count<100 then 100
    else null
  end;

  with active_friends as materialized (
    select distinct
      case when friendship.requester_id=p_app_user_id
        then friendship.addressee_id else friendship.requester_id end friend_id,
      friendship.celebrity_id
    from public.social_friendships friendship
    join public.app_users counterpart on counterpart.id=case
      when friendship.requester_id=p_app_user_id
        then friendship.addressee_id else friendship.requester_id end
      and counterpart.status='active'
    where p_app_user_id in(friendship.requester_id,friendship.addressee_id)
      and friendship.status='accepted'
      and not public.fan_web_blocked(p_app_user_id,counterpart.id)
  ), shared_event as (
    select distinct on(event.id)
      event.id,event.ends_at activity_at,celebrity.image_url,
      case when coalesce(owner.preferred_locale,'ko')='ko'
        then event.title_ko else event.title_en end title
    from active_friends friend
    join public.mobile_participation_checkins mine
      on mine.app_user_id=p_app_user_id and mine.status='valid'
    join public.mobile_participation_checkins theirs
      on theirs.event_id=mine.event_id and theirs.app_user_id=friend.friend_id
      and theirs.status='valid'
    join public.mobile_participation_events event
      on event.id=mine.event_id and event.celebrity_id=friend.celebrity_id
      and event.state in('published','ended')
    join public.celebrities celebrity
      on celebrity.id=event.celebrity_id and celebrity.status='published'
      and celebrity.archived_at is null
    join public.app_users owner on owner.id=p_app_user_id and owner.status='active'
    where celebrity.image_url is not null
    order by event.id,theirs.confirmed_at,mine.confirmed_at
  ), shared_live as (
    select distinct on(live.id)
      live.id,live.ends_at activity_at,live.approved_hero_url image_url,
      localization.title
    from active_friends friend
    join public.attendance_verification_attempts mine
      on mine.app_user_id=p_app_user_id and mine.category='success'
    join public.attendance_verification_attempts theirs
      on theirs.live_event_id=mine.live_event_id and theirs.app_user_id=friend.friend_id
      and theirs.category='success'
    join public.live_events live on live.id=mine.live_event_id
      and live.celebrity_id=friend.celebrity_id
      and live.publication_status='published' and live.content_status='ended'
    join public.app_users owner on owner.id=p_app_user_id and owner.status='active'
    join public.live_event_localizations localization
      on localization.live_event_id=live.id and localization.locale=case
        when coalesce(owner.preferred_locale,'ko')='ko'
          then 'ko'::public.content_locale else 'en'::public.content_locale end
    order by live.id,theirs.attempted_at,mine.attempted_at
  ), shared as (
    select activity_at,image_url,title,'event'::text kind,id from shared_event
    union all
    select activity_at,image_url,title,'live'::text kind,id from shared_live
  ), page as (
    select * from shared order by activity_at desc,kind,id limit 20
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'imageUrl',image_url,'title',title
  ) order by activity_at desc,kind,id),'[]'::jsonb)
  into friend_content from page;

  return jsonb_build_object(
    'invitation',jsonb_build_object(
      'count',invitation_count,
      'nextThreshold',invitation_next,
      'remaining',invitation_next-invitation_count,
      'milestones',invitation_milestones,
      'content','[]'::jsonb
    ),
    'friendship',jsonb_build_object(
      'count',friend_count,
      'nextThreshold',friend_next,
      'remaining',case when friend_next is null then 0 else friend_next-friend_count end,
      'milestones',friend_milestones,
      'content',friend_content
    )
  );
end $$;

revoke all on function public.get_mobile_social_stamp_collection(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_mobile_social_stamp_collection(uuid)
  to service_role;

commit;

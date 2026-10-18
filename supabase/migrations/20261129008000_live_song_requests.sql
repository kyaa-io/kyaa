-- Song requests opt into the extended contract; existing pending submissions stay private.
alter table public.live_fan_submissions add column song jsonb, add column public_visible boolean not null default false;
alter table public.live_fan_submissions drop constraint live_fan_submissions_kind_check;
alter table public.live_fan_submissions add constraint live_fan_submissions_kind_check check(kind in('question','cheer','song'));
create function public.fan_web_valid_song(p_song jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p_song)='object'
 and p_song ?& array['provider','trackId','title','artist','album','artworkUrl','sourceUrl']
 and (p_song-array['provider','trackId','title','artist','album','artworkUrl','sourceUrl'])='{}'::jsonb
 and jsonb_typeof(p_song->'title')='string' and length(p_song->>'title') between 1 and 200 and length(btrim(p_song->>'title'))>0
 and jsonb_typeof(p_song->'artist')='string' and length(p_song->>'artist') between 1 and 200 and length(btrim(p_song->>'artist'))>0
 and (p_song->'album'='null'::jsonb or (jsonb_typeof(p_song->'album')='string' and length(p_song->>'album')<=200))
 and ((p_song->>'provider'='spotify' and jsonb_typeof(p_song->'trackId')='string' and p_song->>'trackId' ~ '^[A-Za-z0-9]{22}$'
 and p_song->>'sourceUrl'='https://open.spotify.com/track/'||(p_song->>'trackId')
 and (p_song->'artworkUrl'='null'::jsonb or (jsonb_typeof(p_song->'artworkUrl')='string' and p_song->>'artworkUrl' ~ '^https://i[.]scdn[.]co/image/[a-fA-F0-9]+$')))
 or (p_song->>'provider'='manual' and p_song->'trackId'='null'::jsonb and p_song->'album'='null'::jsonb and p_song->'artworkUrl'='null'::jsonb
 and (p_song->'sourceUrl'='null'::jsonb or (jsonb_typeof(p_song->'sourceUrl')='string' and length(p_song->>'sourceUrl')<=2048 and position('#' in p_song->>'sourceUrl')=0 and public.fan_web_replay_url('youtube',p_song->>'sourceUrl'))))),false)
$$;
alter table public.live_fan_submissions add constraint live_fan_submissions_song_check check(
 (kind='song' and song is not null and public.fan_web_valid_song(song) and body=song->>'title') or (kind<>'song' and song is null));
create index live_fan_submissions_public_created_idx on public.live_fan_submissions(live_event_id,created_at desc,id desc) where deleted_at is null and (public_visible or status='selected');
drop function public.fan_web_owned_submission_json(uuid,boolean);
drop function public.fan_web_list_live_submissions(uuid,text,public.content_locale,timestamptz,uuid,integer);
drop function public.fan_web_submit_live_submission(uuid,text,text,text,uuid);
drop function public.fan_web_admin_review_live_submission(uuid,uuid,uuid,uuid,integer,text,text);
drop function public.fan_web_admin_list_live_submissions(uuid,uuid,uuid,uuid,text,timestamptz,uuid,integer);
create function public.fan_web_owned_submission_json(p_id uuid,p_show_body boolean,p_extended boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',s.id,'kind',s.kind,'body',case when p_show_body then s.body else null end,'status',s.status,
    'revision',s.revision,'createdAt',s.created_at,'selectedAt',s.selected_at,'deletedAt',s.deleted_at)||case when p_extended then jsonb_build_object('song',case when p_show_body then s.song else null end,'publicVisible',s.public_visible) else '{}'::jsonb end
  from public.live_fan_submissions s where s.id=p_id;
$$;
create or replace function public.fan_web_get_live_submission_target(p_app_user_id uuid,p_submission_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('targetType','live_submission','targetId',s.id,'celebrityId',l.celebrity_id,'appUserId',s.app_user_id,
    'body',s.body,'revision',s.revision,'visibility',coalesce(settings.visibility,'public'),'liveEventId',l.id,'liveSlug',l.slug,'createdAt',s.created_at)
  from public.live_fan_submissions s join public.live_events l on l.id=s.live_event_id
  join public.celebrities c on c.id=l.celebrity_id join public.app_users u on u.id=s.app_user_id and u.status='active'
  left join public.live_fan_submission_settings settings on settings.live_event_id=l.id
  where s.id=p_submission_id and s.deleted_at is null and s.status<>'hidden' and (s.status='selected' or s.public_visible or s.app_user_id=p_app_user_id)
    and l.publication_status='published' and l.archived_at is null and c.status='published' and c.archived_at is null
    and (p_app_user_id is null or exists(select 1 from public.app_users viewer where viewer.id=p_app_user_id and viewer.status='active'))
    and (coalesce(settings.visibility,'public')='public' or public.fan_web_is_member(p_app_user_id,c.id))
    and not public.fan_web_blocked(p_app_user_id,s.app_user_id);
$$;
create function public.fan_web_list_live_submissions(p_app_user_id uuid,p_live_slug text,p_locale public.content_locale,p_before_at timestamptz,p_before_id uuid,p_limit integer,p_extended boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_live uuid; v_artist uuid; v_settings jsonb; v_access text; v_mine jsonb; v_items jsonb; v_next jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
begin
  select l.id,l.celebrity_id into v_live,v_artist from public.live_events l join public.celebrities c on c.id=l.celebrity_id
    where l.slug=p_live_slug and l.publication_status='published' and l.archived_at is null and c.status='published' and c.archived_at is null;
  if v_live is null then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  if p_app_user_id is not null and not exists(select 1 from public.app_users where id=p_app_user_id and status='active') then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED'; end if;
  v_settings:=public.fan_web_live_settings_json(v_live);
  v_access:=case when v_settings->>'visibility'='public' then 'public' when public.fan_web_is_member(p_app_user_id,v_artist) then 'member' else 'members_required' end;
  select coalesce(jsonb_agg(public.fan_web_owned_submission_json(s.id,public.fan_web_get_live_submission_target(p_app_user_id,s.id) is not null,p_extended) order by s.created_at,s.id),'[]'::jsonb) into v_mine
    from public.live_fan_submissions s where s.live_event_id=v_live and s.app_user_id=p_app_user_id and s.deleted_at is null and (p_extended or s.kind in('question','cheer'));
  with rows as materialized(select s.*,row_number() over(order by (case when p_extended then s.created_at else s.selected_at end) desc,s.id desc) rn from public.live_fan_submissions s
    where s.live_event_id=v_live and (s.status='selected' or (p_extended and s.public_visible and s.status<>'hidden')) and (p_extended or s.kind in('question','cheer')) and s.deleted_at is null and public.fan_web_get_live_submission_target(p_app_user_id,s.id) is not null
      and (p_before_at is null or ((case when p_extended then s.created_at else s.selected_at end),s.id)<(p_before_at,p_before_id)) order by (case when p_extended then s.created_at else s.selected_at end) desc,s.id desc limit v_limit+1)
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'body',r.body,'nickname',coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),
    'avatarUrl',public.public_fan_avatar_url(r.app_user_id),'createdAt',r.created_at,'selectedAt',r.selected_at,'revision',r.revision,'isOwner',coalesce(r.app_user_id=p_app_user_id,false))||case when p_extended then jsonb_build_object('status',r.status,'song',r.song,'publicVisible',r.public_visible) else '{}'::jsonb end order by (case when p_extended then r.created_at else r.selected_at end) desc,r.id desc) filter(where r.rn<=v_limit),'[]'::jsonb),
    case when count(*)>v_limit then (select jsonb_build_object('at',case when p_extended then created_at else selected_at end,'id',id) from rows where rn=v_limit) end into v_items,v_next
    from rows r left join public.user_profiles p on p.app_user_id=r.app_user_id left join public.app_user_avatars a on a.app_user_id=r.app_user_id;
  return jsonb_build_object('settings',v_settings,'access',v_access,'mine',v_mine,'items',v_items,'nextCursor',v_next);
end $$;
create function public.fan_web_submit_live_submission(p_app_user_id uuid,p_live_slug text,p_kind text,p_body text,p_idempotency_key uuid,p_song jsonb default null,p_public_visible boolean default false,p_extended boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.live_fan_submissions%rowtype; settings public.live_fan_submission_settings%rowtype; v_live uuid; v_artist uuid; v_id uuid;
begin
  if p_kind is null or p_kind not in('question','cheer','song') or p_body is null or p_idempotency_key is null or p_public_visible is null
    or (not p_extended and (p_kind='song' or p_song is not null or p_public_visible))
    or (p_kind='song' and (not public.fan_web_valid_song(p_song) or p_body is distinct from p_song->>'title'))
    or (p_kind<>'song' and p_song is not null) then raise exception 'FAN_WEB_INVALID_REQUEST'; end if;
  perform public.fan_web_lock_active_user(p_app_user_id);
  select l.id,l.celebrity_id into v_live,v_artist from public.live_events l join public.celebrities c on c.id=l.celebrity_id
    where l.slug=p_live_slug and l.publication_status='published' and l.archived_at is null and c.status='published' and c.archived_at is null;
  if v_live is null then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  select * into settings from public.live_fan_submission_settings where live_event_id=v_live for update;
  -- The deadline is checked after the same row lock used by the admin-close path.
  if not found then raise exception 'FAN_WEB_CLOSED'; end if;
  select * into r from public.live_fan_submissions where app_user_id=p_app_user_id and idempotency_key=p_idempotency_key;
  if found then
    if r.live_event_id<>v_live or r.kind<>p_kind or r.body<>(case when p_kind='song' then p_body else btrim(p_body) end) or r.song is distinct from p_song or r.public_visible<>p_public_visible then raise exception 'FAN_WEB_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('item',public.fan_web_owned_submission_json(r.id,public.fan_web_get_live_submission_target(p_app_user_id,r.id) is not null,p_extended),'replayed',true);
  end if;
  if not settings.accepting or settings.closes_at is null or clock_timestamp()>=settings.closes_at then raise exception 'FAN_WEB_CLOSED'; end if;
  if settings.visibility='members' and not public.fan_web_is_member(p_app_user_id,v_artist) then raise exception 'FAN_WEB_MEMBERS_REQUIRED'; end if;
  if exists(select 1 from public.live_fan_submissions where app_user_id=p_app_user_id and live_event_id=v_live and kind=p_kind and deleted_at is null) then raise exception 'FAN_WEB_ALREADY_SUBMITTED'; end if;
  if (select count(*) from public.live_fan_submissions where app_user_id=p_app_user_id and created_at>clock_timestamp()-interval '1 hour')>=10 then raise exception 'FAN_WEB_RATE_LIMIT'; end if;
  insert into public.live_fan_submissions(live_event_id,app_user_id,kind,body,idempotency_key,song,public_visible) values(v_live,p_app_user_id,p_kind,case when p_kind='song' then p_body else btrim(p_body) end,p_idempotency_key,p_song,p_public_visible) returning id into v_id;
  return jsonb_build_object('item',public.fan_web_owned_submission_json(v_id,true,p_extended),'replayed',false);
end $$;
create function public.fan_web_admin_review_live_submission(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_submission_id uuid,p_expected_revision integer,p_action text,p_reason text,p_extended boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.live_fan_submissions%rowtype; v_live uuid; v_status text;
begin
  perform public.fan_web_lock_active_user(p_actor_app_user_id);
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  if p_correlation_id is null or p_action not in('select','unselect','hide') or (p_action='hide' and nullif(btrim(p_reason),'') is null) or length(p_reason)>1000 then raise exception 'FAN_WEB_INVALID_REQUEST'; end if;
  select live_event_id into v_live from public.live_fan_submissions where id=p_submission_id;
  perform 1 from public.live_fan_submission_settings where live_event_id=v_live for update;
  select * into r from public.live_fan_submissions where id=p_submission_id for update;
  if not found or r.deleted_at is not null or (not p_extended and r.kind='song') then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  if r.revision<>p_expected_revision then raise exception 'FAN_WEB_REVISION_CONFLICT'; end if;
  if r.status='hidden' and p_action<>'hide' then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  if p_action='select' and not exists(select 1 from public.live_events l join public.celebrities c on c.id=l.celebrity_id join public.app_users u on u.id=r.app_user_id and u.status='active' where l.id=r.live_event_id and l.publication_status='published' and l.archived_at is null and c.status='published' and c.archived_at is null) then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  v_status:=case p_action when 'select' then 'selected' when 'unselect' then 'submitted' else 'hidden' end;
  if r.status<>v_status then
    update public.live_fan_submissions set status=v_status,selected_at=case when p_action='select' then clock_timestamp() when p_action='unselect' then null else selected_at end,selected_by_admin_allowlist_id=case when p_action='select' then p_actor_admin_allowlist_id when p_action='unselect' then null else selected_by_admin_allowlist_id end,revision=revision+1,updated_at=clock_timestamp() where id=r.id;
    perform public.fan_web_participation_audit(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,'live_submission.'||p_action,'live_submission',r.id,jsonb_build_object('status',r.status,'revision',r.revision),jsonb_build_object('status',v_status,'revision',r.revision+1));
  end if;
  return public.fan_web_owned_submission_json(r.id,true,p_extended)||jsonb_build_object('nickname',coalesce((select nullif(btrim(nickname),'') from public.user_profiles where app_user_id=r.app_user_id),'팬'),'avatarUrl',public.public_fan_avatar_url(r.app_user_id));
end $$;
create function public.fan_web_admin_list_live_submissions(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_live_event_id uuid,p_status text,p_before_at timestamptz,p_before_id uuid,p_limit integer,p_extended boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
  with rows as materialized(select *,row_number() over(order by created_at desc,id desc) rn from public.live_fan_submissions
    where live_event_id=p_live_event_id and (p_extended or kind in('question','cheer')) and (p_status is null or status=p_status) and (p_before_at is null or (created_at,id)<(p_before_at,p_before_id)) order by created_at desc,id desc limit v_limit+1)
  select jsonb_build_object('settings',public.fan_web_live_settings_json(p_live_event_id),
    'items',coalesce(jsonb_agg(public.fan_web_owned_submission_json(r.id,true,p_extended)||jsonb_build_object('nickname',coalesce(nullif(btrim(p.nickname),''),'팬'),'avatarUrl',public.public_fan_avatar_url(r.app_user_id)) order by r.created_at desc,r.id desc) filter(where r.rn<=v_limit),'[]'::jsonb),
    'nextCursor',case when count(*)>v_limit then (select jsonb_build_object('at',created_at,'id',id) from rows where rn=v_limit) end) into v_result
    from rows r left join public.user_profiles p on p.app_user_id=r.app_user_id left join public.app_user_avatars a on a.app_user_id=r.app_user_id;
  return v_result;
end $$;

-- Shared report moderation includes songs while keeping its legacy response.
create or replace function public.fan_web_hide_live_submission(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_submission_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_revision integer; v_result jsonb;
begin
  perform public.fan_web_lock_active_user(p_actor_app_user_id);
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  select revision into v_revision from public.live_fan_submissions where id=p_submission_id;
  if v_revision is null then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  v_result:=public.fan_web_admin_review_live_submission(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,p_submission_id,v_revision,'hide',p_reason,true);
  return jsonb_build_object('id',p_submission_id,'hidden',true,'revision',v_result->'revision');
end $$;

create table public.live_song_search_limits (
 app_user_id uuid primary key references public.app_users(id) on delete cascade,
 window_started_at timestamptz not null,
 request_count integer not null check(request_count between 1 and 30)
);
alter table public.live_song_search_limits enable row level security;
revoke all on public.live_song_search_limits from public,anon,authenticated;
create function public.fan_web_authorize_song_search(p_app_user_id uuid,p_live_slug text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_live uuid; v_artist uuid; settings public.live_fan_submission_settings%rowtype; v_count integer;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 select l.id,l.celebrity_id into v_live,v_artist from public.live_events l join public.celebrities c on c.id=l.celebrity_id
 where l.slug=p_live_slug and l.publication_status='published' and l.archived_at is null and c.status='published' and c.archived_at is null;
 if v_live is null then raise exception 'FAN_WEB_NOT_FOUND'; end if;
 select * into settings from public.live_fan_submission_settings where live_event_id=v_live for share;
 if not found or not settings.accepting or settings.closes_at is null or clock_timestamp()>=settings.closes_at then raise exception 'FAN_WEB_CLOSED'; end if;
 if settings.visibility='members' and not public.fan_web_is_member(p_app_user_id,v_artist) then raise exception 'FAN_WEB_MEMBERS_REQUIRED'; end if;
 insert into public.live_song_search_limits(app_user_id,window_started_at,request_count) values(p_app_user_id,clock_timestamp(),1)
 on conflict(app_user_id) do update set
 request_count=case when live_song_search_limits.window_started_at<=clock_timestamp()-interval '1 minute' then 1 else live_song_search_limits.request_count+1 end,
 window_started_at=case when live_song_search_limits.window_started_at<=clock_timestamp()-interval '1 minute' then clock_timestamp() else live_song_search_limits.window_started_at end
 where live_song_search_limits.window_started_at<=clock_timestamp()-interval '1 minute' or live_song_search_limits.request_count<30
 returning request_count into v_count;
 if v_count is null then raise exception 'FAN_WEB_RATE_LIMIT'; end if;
 return true;
end $$;
revoke all on function public.fan_web_owned_submission_json(uuid,boolean,boolean) from public,anon,authenticated;
revoke all on function public.fan_web_list_live_submissions(uuid,text,public.content_locale,timestamptz,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.fan_web_list_live_submissions(uuid,text,public.content_locale,timestamptz,uuid,integer,boolean) to service_role;
revoke all on function public.fan_web_submit_live_submission(uuid,text,text,text,uuid,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.fan_web_submit_live_submission(uuid,text,text,text,uuid,jsonb,boolean,boolean) to service_role;
revoke all on function public.fan_web_admin_review_live_submission(uuid,uuid,uuid,uuid,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.fan_web_admin_review_live_submission(uuid,uuid,uuid,uuid,integer,text,text,boolean) to service_role;
revoke all on function public.fan_web_admin_list_live_submissions(uuid,uuid,uuid,uuid,text,timestamptz,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.fan_web_admin_list_live_submissions(uuid,uuid,uuid,uuid,text,timestamptz,uuid,integer,boolean) to service_role;
revoke all on function public.fan_web_valid_song(jsonb) from public,anon,authenticated;
revoke all on function public.fan_web_authorize_song_search(uuid,text) from public,anon,authenticated;
grant execute on function public.fan_web_authorize_song_search(uuid,text) to service_role;

begin;
-- This campaign is the printed WAVE event, not a synthetic LIVE.
alter table public.kyaa_wave_participation_config
 add column campaign_id uuid not null default '869cfb38-b438-4b66-a9e3-cbce3e2bbd38',
 add column creator_id uuid references public.celebrities(id),
 add column campaign_slug text not null default 'kyaa-wave-2026' check(campaign_slug=event_key),
 add constraint kyaa_wave_event_campaign_unique unique(campaign_id,creator_id,event_key);
update public.kyaa_wave_participation_config set creator_id=(select id from public.celebrities where slug='kyaa-wave-fanpage');
create table public.fan_action_campaign_contexts(
 id uuid primary key,
 creator_id uuid not null references public.celebrities(id),
 live_event_id uuid unique,
 wave_event_key text unique,
 unique(id,creator_id),
 check(num_nonnulls(live_event_id,wave_event_key)=1),
 check(live_event_id is null or id=live_event_id),
 foreign key(live_event_id,creator_id) references public.live_events(id,celebrity_id) on update cascade on delete cascade,
 foreign key(id,creator_id,wave_event_key) references public.kyaa_wave_participation_config(campaign_id,creator_id,event_key) deferrable initially deferred
);
alter table public.fan_action_campaign_contexts enable row level security;
revoke all on public.fan_action_campaign_contexts from public,anon,authenticated,service_role;
insert into public.fan_action_campaign_contexts(id,creator_id,live_event_id) select id,celebrity_id,id from public.live_events;
insert into public.fan_action_campaign_contexts(id,creator_id,wave_event_key) select campaign_id,creator_id,event_key from public.kyaa_wave_participation_config where creator_id is not null;
alter table public.kyaa_wave_participation_config add constraint kyaa_wave_event_campaign_context_fkey foreign key(campaign_id,creator_id) references public.fan_action_campaign_contexts(id,creator_id) deferrable initially deferred;
alter table public.fan_action_occurrences drop constraint fan_action_occurrences_campaign_id_fkey;
alter table public.fan_action_occurrences add constraint fan_action_occurrences_campaign_id_fkey foreign key(campaign_id) references public.fan_action_campaign_contexts(id);
alter table public.fan_action_verified_campaigns drop constraint fan_action_verified_campaigns_campaign_creator_fkey;
alter table public.fan_action_verified_campaigns add constraint fan_action_verified_campaigns_campaign_creator_fkey foreign key(campaign_id,creator_id) references public.fan_action_campaign_contexts(id,creator_id) on delete restrict;
create function public.guard_fan_action_campaign_context() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id is distinct from old.id or new.live_event_id is distinct from old.live_event_id or new.wave_event_key is distinct from old.wave_event_key
 or (old.wave_event_key is not null and new.creator_id is distinct from old.creator_id) then raise exception 'FAN_ACTION_CAMPAIGN_CONTEXT_IMMUTABLE'; end if;
 return new;
end $$;
create trigger fan_action_campaign_context_identity before update on public.fan_action_campaign_contexts for each row execute function public.guard_fan_action_campaign_context();
create function public.sync_live_fan_action_campaign_context() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.fan_action_campaign_contexts(id,creator_id,live_event_id) values(new.id,new.celebrity_id,new.id);
 return new;
end $$;
create trigger live_fan_action_campaign_context after insert on public.live_events for each row execute function public.sync_live_fan_action_campaign_context();
create function public.guard_kyaa_wave_campaign_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if new.event_key is distinct from old.event_key or new.campaign_id is distinct from old.campaign_id or new.campaign_slug is distinct from old.campaign_slug
 or (old.creator_id is not null and new.creator_id is distinct from old.creator_id) then raise exception 'WAVE_EVENT_CAMPAIGN_IMMUTABLE'; end if;
 if new.creator_id is not null and not exists(select 1 from public.celebrities where id=new.creator_id and slug='kyaa-wave-fanpage') then raise exception 'WAVE_EVENT_CREATOR_MISMATCH'; end if;
 return new;
end $$;
create trigger kyaa_wave_campaign_identity before update on public.kyaa_wave_participation_config for each row execute function public.guard_kyaa_wave_campaign_identity();
create function public.sync_kyaa_wave_campaign_context() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.creator_id is not null then
  insert into public.fan_action_campaign_contexts(id,creator_id,wave_event_key) values(new.campaign_id,new.creator_id,new.event_key) on conflict(id) do nothing;
 end if;
 return new;
end $$;
create trigger kyaa_wave_campaign_context after update of creator_id on public.kyaa_wave_participation_config for each row execute function public.sync_kyaa_wave_campaign_context();
create function public.bind_kyaa_wave_campaign_creator() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.slug='kyaa-wave-fanpage' and new.slug is distinct from old.slug
 and exists(select 1 from public.kyaa_wave_participation_config where creator_id=old.id) then raise exception 'WAVE_EVENT_CREATOR_IMMUTABLE'; end if;
 if new.slug='kyaa-wave-fanpage' then
  update public.kyaa_wave_participation_config set creator_id=new.id where event_key='kyaa-wave-2026' and creator_id is null;
 end if;
 return new;
end $$;
create trigger kyaa_wave_campaign_creator after insert or update of slug on public.celebrities for each row execute function public.bind_kyaa_wave_campaign_creator();
create function public.fan_action_campaign_is_public(p_campaign_id uuid,p_creator_id uuid,p_action_code integer)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.fan_action_campaign_contexts context
 join public.celebrities creator on creator.id=context.creator_id and creator.status='published' and creator.archived_at is null
 left join public.live_events live on live.id=context.live_event_id and live.celebrity_id=context.creator_id
 left join public.kyaa_wave_participation_config wave on wave.event_key=context.wave_event_key and wave.campaign_id=context.id and wave.creator_id=context.creator_id
 where context.id=p_campaign_id and context.creator_id=p_creator_id
 and ((live.id is not null and live.publication_status='published' and live.archived_at is null)
 or (wave.event_key='kyaa-wave-2026' and p_action_code=4 and creator.slug='kyaa-wave-fanpage')))
$$;
create or replace function public.fan_action_native_enabled(
  p_action_code integer,
  p_app_user_id uuid,
  p_creator_id uuid,
  p_campaign_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_binding_id uuid;
begin
  if p_action_code not in (2, 3, 4, 5) then
    return public.fan_action_native_enabled(p_action_code, p_app_user_id, p_creator_id);
  end if;

  -- The existing actor-aware helper locks the route before this lookup. Keep
  -- that lock order so canary configuration cannot race this decision.
  v_enabled := public.fan_action_native_enabled(p_action_code, p_app_user_id);
  if not v_enabled then
    return false;
  end if;

  select route.binding_id
    into v_binding_id
  from public.fan_action_producer_routes route
  where route.action_code = p_action_code;

  v_enabled:=public.fan_action_campaign_is_public(p_campaign_id,p_creator_id,p_action_code)
    and p_creator_id is not null
    and p_campaign_id is not null
    and exists (
      select 1
      from public.fan_action_verified_campaigns verified
      where verified.binding_id = v_binding_id
        and verified.campaign_id = p_campaign_id
        and verified.creator_id = p_creator_id
    );
  if not v_enabled and exists(select 1 from public.fan_action_bindings where id=v_binding_id and binding_version>=2) then
    raise exception 'FAN_ACTION_CONTEXT_NOT_VERIFIED';
  end if;
  return v_enabled;

end;
$$;
create function public.guard_kyaa_wave_stamp_activation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.enabled and not exists(select 1 from public.kyaa_wave_participation_config config
 join public.fan_action_producer_routes route on route.action_code=4 and route.enabled
 join public.fan_action_verified_campaigns verified on verified.binding_id=route.binding_id and verified.campaign_id=config.campaign_id and verified.creator_id=config.creator_id
 where config.event_key='kyaa-wave-2026' and public.fan_action_campaign_is_public(config.campaign_id,config.creator_id,4)) then
  raise exception 'WAVE_CAMPAIGN_NOT_READY';
 end if;
 return new;
end $$;
create trigger kyaa_wave_stamp_activation_ready before insert or update on public.kyaa_wave_stamp_activation for each row execute function public.guard_kyaa_wave_stamp_activation();
create function public.assert_kyaa_wave_mission_completion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.kyaa_wave_participants participant
 join public.kyaa_wave_participation_config config on config.event_key=participant.event_key
 where participant.id=new.participant_id and participant.app_user_id=new.app_user_id and participant.event_key=new.event_key
 and config.creator_id=new.celebrity_id
 and (case when new.mission_key='bingo' then participant.bingo_completed_at is not null
 else exists(select 1 from jsonb_array_elements(public.evaluate_owned_kyaa_wave_missions(new.app_user_id)->'progress') mission where mission->>'key'=new.mission_key and mission->>'status'='completed') end)) then
  raise exception 'WAVE_MISSION_EVIDENCE_INVALID';
 end if;
 return new;
end $$;
create trigger kyaa_wave_mission_completion_proof before insert on public.kyaa_wave_mission_completions for each row execute function public.assert_kyaa_wave_mission_completion();
-- Patch only the shared campaign validation and the WAVE branch of the existing stamp producer.
do $$
declare definition text; anchor text;
begin
 definition:=pg_get_functiondef('public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)'::regprocedure);
 anchor:=$anchor$p_creator_id is null or not exists(
      select 1 from public.live_events campaign
      where campaign.id=p_campaign_id and campaign.celebrity_id=p_creator_id
        and campaign.publication_status='published' and campaign.archived_at is null
    )$anchor$;
 if position(anchor in definition)=0 then raise exception 'WAVE_CAMPAIGN_ENQUEUE_PATCH_MISSING'; end if;
 definition:=replace(definition,anchor,'not public.fan_action_campaign_is_public(p_campaign_id,p_creator_id,p_action_code)');
 anchor:=$anchor$select route.* into v_route from public.fan_action_producer_routes route$anchor$;
 if position(anchor in definition)=0 then raise exception 'WAVE_CAMPAIGN_SOURCE_PATCH_MISSING'; end if;
 definition:=replace(definition,anchor,$patch$if (exists(select 1 from public.fan_action_campaign_contexts where id=p_campaign_id and wave_event_key is not null) or exists(select 1 from jsonb_array_elements(p_credentials) credential where credential->'legacyPayload'->>'stampKind'='wave_mission')) and not exists(
    select 1 from public.kyaa_wave_mission_completions completion
    join public.kyaa_wave_participation_config config on config.event_key=completion.event_key and config.creator_id=completion.celebrity_id
    where config.campaign_id=p_campaign_id and completion.app_user_id=p_app_user_id and completion.celebrity_id=p_creator_id
    and p_action_code=4 and p_namespace='community_stamps' and p_source_key='wave-mission:'||completion.id::text||':'||p_app_user_id::text
    and p_occurred_at=completion.completed_at and jsonb_array_length(p_credentials)=1
    and p_credentials->0->>'entityType'='community_stamp'
    and p_credentials->0->'legacyPayload'->>'stampKind'='wave_mission'
    and p_credentials->0->'legacyPayload'->>'celebritySlug'='kyaa-wave-fanpage'
    and p_credentials->0->'legacyPayload'->>'missionKey'=completion.mission_key
    and (select enabled from public.kyaa_wave_stamp_activation where singleton)
  ) then raise exception 'WAVE_MISSION_EVIDENCE_INVALID'; end if;
  select route.* into v_route from public.fan_action_producer_routes route$patch$);
 execute definition;
 definition:=pg_get_functiondef('public.issue_community_stamp(uuid,uuid,public.community_stamp_kind,text)'::regprocedure);
 anchor:=$anchor$v_action_code integer;$anchor$;
 if position(anchor in definition)=0 then raise exception 'WAVE_CAMPAIGN_ISSUE_DECLARATION_PATCH_MISSING'; end if;
 definition:=replace(definition,anchor,'v_action_code integer;v_campaign_id uuid;');
 anchor:='perform public.assert_community_stamp_source(p_app_user_id,p_celebrity_id,p_kind,p_source_key);';
 definition:=replace(definition,anchor,anchor||$patch$
  if p_kind='wave_mission' then
    select config.campaign_id,completion.completed_at into strict v_campaign_id,v_occurred_at
    from public.kyaa_wave_mission_completions completion join public.kyaa_wave_participation_config config on config.event_key=completion.event_key and config.creator_id=completion.celebrity_id
    where completion.app_user_id=p_app_user_id and completion.celebrity_id=p_celebrity_id and p_source_key='wave-mission:'||completion.id::text;
  end if;$patch$);
 definition:=replace(definition,'public.fan_action_native_enabled(4,p_app_user_id,p_celebrity_id)','public.fan_action_native_enabled(4,p_app_user_id,p_celebrity_id,v_campaign_id)');
 anchor:='public.fan_action_native_enabled(v_action_code,p_app_user_id,p_celebrity_id)';
 if position(anchor in definition)=0 then raise exception 'WAVE_CAMPAIGN_ISSUE_GATE_PATCH_MISSING'; end if;
 definition:=replace(definition,anchor,$patch$(case when p_kind='wave_mission' then public.fan_action_native_enabled(v_action_code,p_app_user_id,p_celebrity_id,v_campaign_id) else public.fan_action_native_enabled(v_action_code,p_app_user_id,p_celebrity_id) end)$patch$);
 anchor:='p_app_user_id,p_celebrity_id,null,v_occurred_at,v_action_code';
 if position(anchor in definition)=0 then raise exception 'WAVE_CAMPAIGN_ISSUE_SOURCE_PATCH_MISSING'; end if;
 definition:=replace(definition,anchor,'p_app_user_id,p_celebrity_id,v_campaign_id,v_occurred_at,v_action_code');
 execute definition;
 definition:=pg_get_functiondef('public.read_owned_kyaa_wave_missions(uuid)'::regprocedure);
 anchor:='public.fan_action_native_enabled(4,p_app_user_id,wave_id)';
 if position(anchor in definition)=0 then raise exception 'WAVE_CAMPAIGN_READ_GATE_PATCH_MISSING'; end if;
 execute replace(definition,anchor,$patch$public.fan_action_native_enabled(4,p_app_user_id,wave_id,(select campaign_id from public.kyaa_wave_participation_config where event_key=participant.event_key and creator_id=wave_id))$patch$);
end $$;
revoke all on function public.guard_fan_action_campaign_context(),public.sync_live_fan_action_campaign_context(),public.guard_kyaa_wave_campaign_identity(),public.sync_kyaa_wave_campaign_context(),public.bind_kyaa_wave_campaign_creator(),public.fan_action_campaign_is_public(uuid,uuid,integer),public.guard_kyaa_wave_stamp_activation(),public.assert_kyaa_wave_mission_completion() from public,anon,authenticated,service_role;
commit;

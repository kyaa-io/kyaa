begin;
alter table public.kyaa_wave_participants add column bingo_completed_at timestamptz;
-- Activation stays off until the worker accepts wave_mission payloads and ActionHub action 4.
create table public.kyaa_wave_stamp_activation(singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into public.kyaa_wave_stamp_activation(singleton) values(true);
alter table public.kyaa_wave_stamp_activation enable row level security;
revoke all on public.kyaa_wave_stamp_activation from public,anon,authenticated,service_role;
create table public.kyaa_wave_mission_completions(
 id uuid primary key default extensions.gen_random_uuid(),
 participant_id uuid not null references public.kyaa_wave_participants(id) on delete cascade,
 app_user_id uuid not null references public.app_users(id) on delete cascade,
 celebrity_id uuid not null references public.celebrities(id),
 event_key text not null default 'kyaa-wave-2026' check(event_key='kyaa-wave-2026'),
 mission_key text not null check(mission_key in ('checkin','event-photo','fanpage-like','introduction','friendship','dm-greeting','live-cheer','insight-review','quiz-correct','website-cheer','bingo')),
 evidence_version integer not null default 1 check(evidence_version=1),
 completed_at timestamptz not null default clock_timestamp(),
 unique(participant_id,mission_key)
);
alter table public.kyaa_wave_mission_completions enable row level security;
revoke all on public.kyaa_wave_mission_completions from public,anon,authenticated,service_role;
-- Only the security-definer recorder can insert immutable proofs; no message bodies or names are copied.
create function public.reject_wave_mission_completion_update() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'WAVE_MISSION_PROOF_IMMUTABLE'; end $$;
create trigger wave_mission_completion_immutable before update on public.kyaa_wave_mission_completions for each row execute function public.reject_wave_mission_completion_update();
alter function public.read_owned_kyaa_wave_missions(uuid) rename to evaluate_owned_kyaa_wave_missions;
revoke all on function public.evaluate_owned_kyaa_wave_missions(uuid) from public,anon,authenticated,service_role;
create function public.project_kyaa_wave_mission_stamps(p_participant_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',c.mission_key,'stampId',s.id,'status',
 case when s.id is null then case when exists(select 1 from public.user_wallets w where w.app_user_id=c.app_user_id and w.chain_id=91342 and w.provider='privy' and w.wallet_type='embedded') then 'preparing' else 'waiting_wallet' end
 else public.effective_fan_action_mint(c.app_user_id,'community_stamp',s.id,s.mint_status::text,s.tx_hash,s.token_id::text)->>'status' end) order by c.completed_at,c.id),'[]'::jsonb)
 from public.kyaa_wave_mission_completions c left join public.community_stamps s on s.app_user_id=c.app_user_id and s.kind='wave_mission' and s.source_key='wave-mission:'||c.id::text
 where c.participant_id=p_participant_id
$$;
create function public.read_owned_kyaa_wave_missions(p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; participant public.kyaa_wave_participants%rowtype; wave_id uuid; completion record;
begin
 result:=public.evaluate_owned_kyaa_wave_missions(p_app_user_id);
 select * into strict participant from public.kyaa_wave_participants where app_user_id=p_app_user_id and event_key='kyaa-wave-2026';
 select id into strict wave_id from public.celebrities where slug='kyaa-wave-fanpage' and status='published' and archived_at is null;
 insert into public.kyaa_wave_mission_completions(participant_id,app_user_id,celebrity_id,mission_key)
 select participant.id,p_app_user_id,wave_id,m->>'key' from jsonb_array_elements(result->'progress') m where m->>'status'='completed'
 on conflict(participant_id,mission_key) do nothing;
 if participant.bingo_completed_at is not null then
  insert into public.kyaa_wave_mission_completions(participant_id,app_user_id,celebrity_id,mission_key) values(participant.id,p_app_user_id,wave_id,'bingo') on conflict(participant_id,mission_key) do nothing;
 end if;
 if (select enabled from public.kyaa_wave_stamp_activation where singleton)
 and public.fan_action_native_enabled(4,p_app_user_id,wave_id)
 and exists(select 1 from public.user_wallets where app_user_id=p_app_user_id and chain_id=91342 and provider='privy' and wallet_type='embedded') then
  for completion in select id from public.kyaa_wave_mission_completions where participant_id=participant.id loop
   perform public.issue_community_stamp(p_app_user_id,wave_id,'wave_mission','wave-mission:'||completion.id::text);
  end loop;
 end if;
 return result||jsonb_build_object('stamps',public.project_kyaa_wave_mission_stamps(participant.id));
end $$;
revoke all on function public.read_owned_kyaa_wave_missions(uuid),public.project_kyaa_wave_mission_stamps(uuid),public.reject_wave_mission_completion_update() from public,anon,authenticated,service_role;
grant execute on function public.read_owned_kyaa_wave_missions(uuid) to service_role;
create function public.grant_admin_kyaa_wave_bingo_stamp(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_participant_id uuid,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare participant public.kyaa_wave_participants%rowtype; draw_id uuid;
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
 exception when others then raise exception 'FAN_WEB_FORBIDDEN'; end;
 if p_participant_id is null or p_correlation_id is null then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 select * into participant from public.kyaa_wave_participants where id=p_participant_id and event_key='kyaa-wave-2026';
 if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
 perform public.fan_web_lock_active_user(participant.app_user_id);
 select * into participant from public.kyaa_wave_participants where id=p_participant_id and event_key='kyaa-wave-2026' for update;
 if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
 if participant.bingo_completed_at is null then
  -- Serialize new stamps with the draw's ticket snapshot.
  select id into draw_id from public.kyaa_wave_draw_state where singleton for update;
  if draw_id is not null then raise exception 'FAN_WEB_CONFLICT'; end if;
  update public.kyaa_wave_participants set bingo_completed_at=clock_timestamp() where id=p_participant_id returning * into participant;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)
  values(p_actor_app_user_id,p_actor_admin_allowlist_id,'kyaa_wave.bingo_stamp_granted','kyaa_wave_participant',p_participant_id::text,p_correlation_id,jsonb_build_object('bingoCompletedAt',participant.bingo_completed_at));
 end if;
 perform public.read_owned_kyaa_wave_missions(participant.app_user_id);
 return jsonb_build_object('id',participant.id,'bingoCompletedAt',participant.bingo_completed_at);
end $$;
revoke all on function public.grant_admin_kyaa_wave_bingo_stamp(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.grant_admin_kyaa_wave_bingo_stamp(uuid,uuid,uuid,uuid) to service_role;


-- Preserve the existing quiz lock, draw-close guard, timestamp and response shape.
alter function public.grant_admin_kyaa_wave_quiz_stamp(uuid,uuid,uuid,uuid) rename to grant_admin_kyaa_wave_quiz_stamp_before_onchain;
revoke all on function public.grant_admin_kyaa_wave_quiz_stamp_before_onchain(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.grant_admin_kyaa_wave_quiz_stamp(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_participant_id uuid,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; owner_id uuid;
begin
 result:=public.grant_admin_kyaa_wave_quiz_stamp_before_onchain(p_actor_app_user_id,p_actor_admin_allowlist_id,p_participant_id,p_correlation_id);
 select app_user_id into strict owner_id from public.kyaa_wave_participants where id=p_participant_id;
 perform public.read_owned_kyaa_wave_missions(owner_id);
 return result;
end $$;
revoke all on function public.grant_admin_kyaa_wave_quiz_stamp(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.grant_admin_kyaa_wave_quiz_stamp(uuid,uuid,uuid,uuid) to service_role;
create function public.reconcile_wave_mission_wallet() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.chain_id=91342 and new.provider='privy' and new.wallet_type='embedded' and exists(select 1 from public.kyaa_wave_participants where app_user_id=new.app_user_id and event_key='kyaa-wave-2026') then
  -- A closed fanpage must not prevent wallet creation; hold publication stable during reconciliation.
  perform 1 from public.celebrities where slug='kyaa-wave-fanpage' and status='published' and archived_at is null for share;
  if found then perform public.read_owned_kyaa_wave_missions(new.app_user_id); end if;
 end if;
 return new;
end $$;
revoke all on function public.reconcile_wave_mission_wallet() from public,anon,authenticated,service_role;
create trigger wave_mission_wallet_ready after insert on public.user_wallets for each row execute function public.reconcile_wave_mission_wallet();
do $$
declare definition text; anchor text;
begin
 definition:=pg_get_functiondef('public.assert_community_stamp_source(uuid,uuid,public.community_stamp_kind,text)'::regprocedure);
 anchor:='elsif p_kind=''first_comment'' then';
 if position(anchor in definition)=0 then raise exception 'WAVE_SOURCE_PATCH_MISSING'; end if;
 execute replace(definition,anchor,$patch$elsif p_kind='wave_mission' then
    if not exists(select 1 from public.kyaa_wave_mission_completions c
      join public.kyaa_wave_participants p on p.id=c.participant_id and p.app_user_id=c.app_user_id and p.event_key=c.event_key
      join public.celebrities creator on creator.id=c.celebrity_id and creator.slug='kyaa-wave-fanpage'
      where c.app_user_id=p_app_user_id and c.celebrity_id=p_celebrity_id and c.evidence_version=1
      and p_source_key='wave-mission:'||c.id::text) then
      raise exception 'COMMUNITY_STAMP_INVALID_REQUEST' using errcode='22023';
    end if;
  elsif p_kind='first_comment' then$patch$);
 definition:=pg_get_functiondef('public.issue_community_stamp(uuid,uuid,public.community_stamp_kind,text)'::regprocedure);
 anchor:='when ''welcome'' then 7';
 if position(anchor in definition)=0 then raise exception 'WAVE_ACTION_PATCH_MISSING'; end if;
 definition:=replace(definition,anchor,'when ''wave_mission'' then 4 when ''welcome'' then 7');
 anchor:='perform public.assert_community_stamp_source(p_app_user_id,p_celebrity_id,p_kind,p_source_key);';
 definition:=replace(definition,anchor,anchor||$patch$
  if p_kind='wave_mission' and (not (select enabled from public.kyaa_wave_stamp_activation where singleton) or not public.fan_action_native_enabled(4,p_app_user_id,p_celebrity_id)) then
    raise exception 'COMMUNITY_STAMP_UNAVAILABLE';
  end if;$patch$);
 anchor:=$anchor$'stampKind',p_kind::text,'celebritySlug',v_celebrity_slug);$anchor$;
 if position(anchor in definition)=0 then raise exception 'WAVE_PAYLOAD_PATCH_MISSING'; end if;
 definition:=replace(definition,anchor,anchor||$patch$
  if p_kind='wave_mission' then
    v_payload:=v_payload||jsonb_build_object('missionKey',(select mission_key from public.kyaa_wave_mission_completions where p_source_key='wave-mission:'||id::text));
  end if;$patch$);
 execute definition;
 definition:=pg_get_functiondef('public.assert_community_stamp_blockchain_job_link()'::regprocedure);
 anchor:='if (v_job.payload-''workerSubmission'') is distinct from v_expected_payload';
 if position(anchor in definition)=0 then raise exception 'WAVE_PAYLOAD_GUARD_PATCH_MISSING'; end if;
 execute replace(definition,anchor,$patch$if new.kind='wave_mission' then
    v_expected_payload:=v_expected_payload||jsonb_build_object('missionKey',(select mission_key from public.kyaa_wave_mission_completions where new.source_key='wave-mission:'||id::text));
  end if;
  if (v_job.payload-'workerSubmission') is distinct from v_expected_payload$patch$);
end $$;
create or replace function public.list_admin_kyaa_wave_participants(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_before_at timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
 exception when others then raise exception 'PARTICIPATION_ADMIN_FORBIDDEN' using errcode='42501'; end;
 if (p_before_at is null)<>(p_before_id is null) then raise exception 'PARTICIPATION_INVALID'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'appUserId',p.app_user_id,'nameEncrypted',p.name_encrypted,'createdAt',p.created_at,'quizCorrectAt',p.quiz_correct_at,'bingoCompletedAt',p.bingo_completed_at,'stamps',public.project_kyaa_wave_mission_stamps(p.id)) order by p.created_at desc,p.id desc)
 from (select * from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and (p_before_at is null or (created_at,id)<(p_before_at,p_before_id)) order by created_at desc,id desc limit 51) p),'[]'::jsonb);
end $$;


commit;

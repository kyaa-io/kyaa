begin;
create table public.kyaa_wave_draw_prizes (
 prize_key text primary key, ordinal integer not null unique check(ordinal between 1 and 10), quantity integer not null check(quantity>0)
);
insert into public.kyaa_wave_draw_prizes values
 ('tshirt',1,15),('cap',2,20),('phonecase',3,10),('hoodie',4,3),('mousepad',5,5),('mirror',6,5),('golf',7,5),('camera',8,1),('meal',9,2),('blue',10,1);
create table public.kyaa_wave_draw_state (
 singleton boolean primary key default true check(singleton), id uuid unique,
 seed bytea check(octet_length(seed)=32), executed_at timestamptz,
 revealed_through integer not null default 0 check(revealed_through between 0 and 10),
 check((id is null and seed is null and executed_at is null) or (id is not null and seed is not null and executed_at is not null))
);
insert into public.kyaa_wave_draw_state(singleton) values(true);
create table public.kyaa_wave_draw_preferences (
 app_user_id uuid primary key references public.app_users(id) on delete cascade,
 event_key text not null default 'kyaa-wave-2026', preferences text[] not null check(cardinality(preferences)=3), updated_at timestamptz not null default clock_timestamp(),
 foreign key(event_key,app_user_id) references public.kyaa_wave_participants(event_key,app_user_id) on delete cascade
);
create table public.kyaa_wave_draw_candidates (
 draw_id uuid not null references public.kyaa_wave_draw_state(id) on delete restrict,
 app_user_id uuid not null references public.app_users(id) on delete restrict,
 preferences text[] not null, tickets integer not null check(tickets between 1 and 10),
 priority numeric not null, ordinal integer, prize_key text references public.kyaa_wave_draw_prizes(prize_key),
 primary key(draw_id,app_user_id), unique(draw_id,ordinal)
);
create table public.kyaa_wave_draw_requests (
 actor_id uuid not null references public.app_users(id) on delete cascade, request_id uuid not null,
 operation text not null, payload text not null, response jsonb not null, primary key(actor_id,request_id)
);
alter table public.kyaa_wave_draw_prizes enable row level security;
alter table public.kyaa_wave_draw_prizes force row level security;
alter table public.kyaa_wave_draw_state enable row level security;
alter table public.kyaa_wave_draw_state force row level security;
alter table public.kyaa_wave_draw_preferences enable row level security;
alter table public.kyaa_wave_draw_preferences force row level security;
alter table public.kyaa_wave_draw_candidates enable row level security;
alter table public.kyaa_wave_draw_candidates force row level security;
alter table public.kyaa_wave_draw_requests enable row level security;
alter table public.kyaa_wave_draw_requests force row level security;
revoke all on public.kyaa_wave_draw_prizes,public.kyaa_wave_draw_state,public.kyaa_wave_draw_preferences,public.kyaa_wave_draw_candidates,public.kyaa_wave_draw_requests from public,anon,authenticated,service_role;

create function public.kyaa_wave_draw_winners(p_viewer uuid,p_revealed integer)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('prizeKey',p.prize_key,'winners',(
 select coalesce(jsonb_agg(jsonb_build_object(
 'nickname',case when u.status='active' then coalesce(nullif(btrim(profile.nickname),''),'팬') else '팬' end,
 'avatarUrl',case when u.status='active' then public.public_fan_avatar_url(u.id) else '/images/avatars/star-cream.webp' end
 ) order by candidate.ordinal),'[]'::jsonb)
 from public.kyaa_wave_draw_candidates candidate join public.app_users u on u.id=candidate.app_user_id
 left join public.user_profiles profile on profile.app_user_id=u.id
 where candidate.prize_key=p.prize_key and (p_viewer is null or not public.fan_web_blocked(p_viewer,u.id))
 )) order by p.ordinal),'[]'::jsonb) from public.kyaa_wave_draw_prizes p where p.ordinal<=p_revealed;
$$;

create function public.read_owned_kyaa_wave_draw(p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare state public.kyaa_wave_draw_state%rowtype; entry public.kyaa_wave_draw_preferences%rowtype;
 candidate public.kyaa_wave_draw_candidates%rowtype; tickets integer; prize_ordinal integer; result jsonb;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if not exists(select 1 from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and app_user_id=p_app_user_id) then raise exception 'FAN_WEB_FORBIDDEN'; end if;
 select * into state from public.kyaa_wave_draw_state where singleton;
 select * into entry from public.kyaa_wave_draw_preferences where app_user_id=p_app_user_id;
 select count(*) into tickets from jsonb_array_elements(public.read_owned_kyaa_wave_missions(p_app_user_id)->'progress') mission where mission->>'status'='completed';
 if state.id is not null then
  select * into candidate from public.kyaa_wave_draw_candidates where draw_id=state.id and app_user_id=p_app_user_id;
  if candidate.app_user_id is not null then tickets:=candidate.tickets; end if;
  select ordinal into prize_ordinal from public.kyaa_wave_draw_prizes where prize_key=candidate.prize_key;
 end if;
 result:=case when entry.app_user_id is null and candidate.app_user_id is null then jsonb_build_object('status','not_entered')
 when state.id is null then jsonb_build_object('status','pending')
 when prize_ordinal<=state.revealed_through then jsonb_build_object('status','won','prizeKey',candidate.prize_key)
 when state.revealed_through=10 then jsonb_build_object('status','not_won') else jsonb_build_object('status','pending') end;
 return jsonb_build_object('entry',case when entry.app_user_id is null then null else jsonb_build_object('preferences',entry.preferences,'updatedAt',entry.updated_at) end,
 'tickets',tickets,'draw',case when state.id is null then null else jsonb_build_object('id',state.id,'executedAt',state.executed_at,'revealedThrough',state.revealed_through) end,
 'result',result,'published',public.kyaa_wave_draw_winners(p_app_user_id,state.revealed_through));
end $$;

create function public.save_owned_kyaa_wave_draw_preferences(p_app_user_id uuid,p_preferences text[],p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.kyaa_wave_draw_requests%rowtype; state public.kyaa_wave_draw_state%rowtype; result jsonb; payload text:=md5(p_preferences::text);
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if not exists(select 1 from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and app_user_id=p_app_user_id) then raise exception 'FAN_WEB_FORBIDDEN'; end if;
 if p_request_id is null or p_preferences is null or cardinality(p_preferences)<>3 or (select count(distinct key) from unnest(p_preferences) key)<>3
 or exists(select 1 from unnest(p_preferences) key where not exists(select 1 from public.kyaa_wave_draw_prizes p where p.prize_key=key)) then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 select * into state from public.kyaa_wave_draw_state where singleton for update;
 select * into saved from public.kyaa_wave_draw_requests where actor_id=p_app_user_id and request_id=p_request_id;
 if found then
  if saved.operation<>'preferences' or saved.payload<>payload then raise exception 'FAN_WEB_CONFLICT'; end if;
  return saved.response;
 end if;
 if state.id is not null then raise exception 'FAN_WEB_CONFLICT'; end if;
 insert into public.kyaa_wave_draw_preferences(app_user_id,preferences) values(p_app_user_id,p_preferences)
 on conflict(app_user_id) do update set preferences=excluded.preferences,updated_at=clock_timestamp();
 result:=public.read_owned_kyaa_wave_draw(p_app_user_id);
 insert into public.kyaa_wave_draw_requests values(p_app_user_id,p_request_id,'preferences',payload,result);
 return result;
end $$;

create function public.read_admin_kyaa_wave_draw(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare state public.kyaa_wave_draw_state%rowtype;
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
 exception when others then raise exception 'FAN_WEB_FORBIDDEN'; end;
 select * into state from public.kyaa_wave_draw_state where singleton;
 return jsonb_build_object('draw',case when state.id is null then null else jsonb_build_object('id',state.id,'executedAt',state.executed_at,'revealedThrough',state.revealed_through) end,
 'entryCount',case when state.id is null then (select count(*) from public.kyaa_wave_draw_preferences) else (select count(*) from public.kyaa_wave_draw_candidates where draw_id=state.id) end,
 'results',case when state.id is null then '[]'::jsonb else public.kyaa_wave_draw_winners(null,10) end);
end $$;

create function public.execute_admin_kyaa_wave_draw(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare state public.kyaa_wave_draw_state%rowtype; saved public.kyaa_wave_draw_requests%rowtype;
 entry record; candidate record; tickets integer; chosen text; n integer:=0; result jsonb;
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
 exception when others then raise exception 'FAN_WEB_FORBIDDEN'; end;
 if p_request_id is null or p_correlation_id is null then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 select * into state from public.kyaa_wave_draw_state where singleton for update;
 select * into saved from public.kyaa_wave_draw_requests where actor_id=p_actor_app_user_id and request_id=p_request_id;
 if found then
  if saved.operation<>'execute' then raise exception 'FAN_WEB_CONFLICT'; end if;
  return saved.response;
 end if;
 if state.id is not null then raise exception 'FAN_WEB_CONFLICT'; end if;
 -- Preferences take owner then state; try owner locks here so the reverse order cannot deadlock.
 for entry in select e.app_user_id from public.kyaa_wave_draw_preferences e order by e.app_user_id loop
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||entry.app_user_id::text,0)) then raise exception 'FAN_WEB_ACCOUNT_BUSY' using errcode='55P03'; end if;
 end loop;
 update public.kyaa_wave_draw_state set id=extensions.gen_random_uuid(),seed=extensions.gen_random_bytes(32),executed_at=clock_timestamp() where singleton returning * into state;
 for entry in select e.* from public.kyaa_wave_draw_preferences e join public.app_users u on u.id=e.app_user_id and u.status='active'
 join public.kyaa_wave_participants p on p.app_user_id=e.app_user_id and p.event_key=e.event_key
 where not exists(select 1 from public.app_user_moderation_restrictions restriction where restriction.app_user_id=e.app_user_id and restriction.revoked_at is null)
 order by e.app_user_id loop
  select count(*) into tickets from jsonb_array_elements(public.read_owned_kyaa_wave_missions(entry.app_user_id)->'progress') mission where mission->>'status'='completed';
  if tickets>0 then
   insert into public.kyaa_wave_draw_candidates(draw_id,app_user_id,preferences,tickets,priority)
   values(state.id,entry.app_user_id,entry.preferences,tickets,
   -ln((public.benefit_digest_uint256(extensions.digest(state.seed||pg_catalog.uuid_send(state.id)||pg_catalog.uuid_send(entry.app_user_id),'sha256'))+1)/(power(2::numeric,256)+1))/tickets);
  end if;
 end loop;
 for candidate in select * from public.kyaa_wave_draw_candidates where draw_id=state.id order by priority,app_user_id loop
  n:=n+1;
  select preference.key into chosen from unnest(candidate.preferences) with ordinality preference(key,rank)
  join public.kyaa_wave_draw_prizes p on p.prize_key=preference.key
  where (select count(*) from public.kyaa_wave_draw_candidates c where c.draw_id=state.id and c.prize_key=p.prize_key)<p.quantity
  order by preference.rank limit 1;
  update public.kyaa_wave_draw_candidates set ordinal=n,prize_key=chosen where draw_id=state.id and app_user_id=candidate.app_user_id;
 end loop;
 result:=public.read_admin_kyaa_wave_draw(p_actor_app_user_id,p_actor_admin_allowlist_id);
 insert into public.kyaa_wave_draw_requests values(p_actor_app_user_id,p_request_id,'execute','',result);
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)
 values(p_actor_app_user_id,p_actor_admin_allowlist_id,'kyaa_wave.draw_executed','kyaa_wave_draw',state.id::text,p_correlation_id,jsonb_build_object('drawId',state.id));
 return result;
end $$;

create function public.reveal_admin_kyaa_wave_draw(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_draw_id uuid,p_prize_index integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare state public.kyaa_wave_draw_state%rowtype; saved public.kyaa_wave_draw_requests%rowtype; result jsonb; payload text:=p_draw_id::text||':'||p_prize_index::text;
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
 exception when others then raise exception 'FAN_WEB_FORBIDDEN'; end;
 if p_request_id is null or p_correlation_id is null or p_draw_id is null or p_prize_index is null or p_prize_index not between 1 and 10 then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 select * into state from public.kyaa_wave_draw_state where singleton for update;
 select * into saved from public.kyaa_wave_draw_requests where actor_id=p_actor_app_user_id and request_id=p_request_id;
 if found then
  if saved.operation<>'reveal' or saved.payload<>payload then raise exception 'FAN_WEB_CONFLICT'; end if;
  return saved.response;
 end if;
 if state.id is distinct from p_draw_id or p_prize_index>state.revealed_through+1 then raise exception 'FAN_WEB_CONFLICT'; end if;
 if p_prize_index<=state.revealed_through then
  result:=public.read_admin_kyaa_wave_draw(p_actor_app_user_id,p_actor_admin_allowlist_id);
  insert into public.kyaa_wave_draw_requests values(p_actor_app_user_id,p_request_id,'reveal',payload,result);
  return result;
 end if;
 update public.kyaa_wave_draw_state set revealed_through=p_prize_index where singleton;
 result:=public.read_admin_kyaa_wave_draw(p_actor_app_user_id,p_actor_admin_allowlist_id);
 insert into public.kyaa_wave_draw_requests values(p_actor_app_user_id,p_request_id,'reveal',payload,result);
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)
 values(p_actor_app_user_id,p_actor_admin_allowlist_id,'kyaa_wave.draw_revealed','kyaa_wave_draw',state.id::text,p_correlation_id,jsonb_build_object('drawId',state.id,'revealedThrough',p_prize_index));
 return result;
end $$;
revoke all on function public.kyaa_wave_draw_winners(uuid,integer),public.read_owned_kyaa_wave_draw(uuid),public.save_owned_kyaa_wave_draw_preferences(uuid,text[],uuid),public.read_admin_kyaa_wave_draw(uuid,uuid),public.execute_admin_kyaa_wave_draw(uuid,uuid,uuid,uuid),public.reveal_admin_kyaa_wave_draw(uuid,uuid,uuid,uuid,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_kyaa_wave_draw(uuid),public.save_owned_kyaa_wave_draw_preferences(uuid,text[],uuid),public.read_admin_kyaa_wave_draw(uuid,uuid),public.execute_admin_kyaa_wave_draw(uuid,uuid,uuid,uuid),public.reveal_admin_kyaa_wave_draw(uuid,uuid,uuid,uuid,integer,uuid) to service_role;
create or replace function public.scrub_kyaa_wave_participation_on_disable()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='disabled' and old.status is distinct from new.status then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||new.id::text,0));
  delete from public.kyaa_wave_draw_requests where actor_id=new.id and operation='preferences';
  delete from public.kyaa_wave_participation_requests where app_user_id=new.id;
  delete from public.kyaa_wave_participation_attempts where app_user_id=new.id;
  delete from public.kyaa_wave_participants where app_user_id=new.id;
 end if;
 return new;
end $$;
commit;

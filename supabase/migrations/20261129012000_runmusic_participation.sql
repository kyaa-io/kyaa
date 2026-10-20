-- Campaign secrets and all writes are accessible only through service RPCs.
create table public.runmusic_campaign (
  slug text primary key check(slug='runmusic-2026'),
  revision integer not null default 1,
  published boolean not null default false,
  registration_opens_at timestamptz not null default '2026-10-20T00:00:00+09:00',
  registration_closes_at timestamptz not null default '2026-10-24T00:00:00+09:00',
  event_starts_at timestamptz not null default '2026-10-24T17:00:00+09:00',
  event_ends_at timestamptz not null default '2026-10-24T19:00:00+09:00',
  prize_count integer not null default 100 check(prize_count between 1 and 1000),
  prize_label text not null default '스타벅스 1만원 상품권',
  checkin_hash text,
  quiz_hash text not null default encode(extensions.digest('안동체육관','sha256'),'hex'),
  results_published boolean not null default false,
  draw_id uuid unique,
  draw_request_key uuid unique,
  draw_seed text,
  drawn_at timestamptz,
  check(registration_opens_at<registration_closes_at and registration_closes_at<=event_starts_at and event_starts_at<event_ends_at),
  check(not results_published or draw_id is not null)
);
insert into public.runmusic_campaign(slug) values('runmusic-2026');

create table public.runmusic_registrations(
  app_user_id uuid primary key references public.app_users(id),
  created_at timestamptz not null default clock_timestamp()
);

create table public.runmusic_missions(
  app_user_id uuid not null references public.app_users(id),
  mission text not null check(mission in('pre_cheer','checkin','cheer','photo','quiz')),
  source_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  primary key(app_user_id,mission)
);

create table public.runmusic_requests(
  app_user_id uuid not null references public.app_users(id),
  request_key uuid not null,
  input_hash text not null,
  primary key(app_user_id,request_key)
);

create table public.runmusic_attempts(
  app_user_id uuid not null references public.app_users(id),
  kind text not null,
  window_at timestamptz not null,
  attempts integer not null,
  primary key(app_user_id,kind)
);

create table public.runmusic_draw_entries(
  draw_id uuid not null,
  app_user_id uuid not null references public.app_users(id),
  weight integer not null check(weight between 1 and 8),
  mission_snapshot jsonb not null,
  rank integer not null check(rank>0),
  winner boolean not null,
  receipt_id uuid unique,
  received_at timestamptz,
  received_by uuid references public.admin_allowlist(id),
  primary key(draw_id,app_user_id),
  unique(draw_id,rank),
  check(winner=(receipt_id is not null))
);
do $$
declare t text;
begin
  foreach t in array array[
    'runmusic_campaign','runmusic_registrations','runmusic_missions',
    'runmusic_requests','runmusic_attempts','runmusic_draw_entries'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  end loop;
end;
$$;

create function public.runmusic_campaign_json()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'slug',slug,'published',published,
    'registrationOpensAt',registration_opens_at,'registrationClosesAt',registration_closes_at,
    'eventStartsAt',event_starts_at,'eventEndsAt',event_ends_at,
    'prizeCount',prize_count,'prizeLabel',prize_label,
    'drawn',draw_id is not null,'resultsPublished',results_published
  ) from public.runmusic_campaign
$$;

create function public.runmusic_source_valid(p_user uuid,p_mission text,p_source uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select case
    when p_mission in('pre_cheer','cheer') then exists(
      select 1 from public.fan_lounge_messages m
      join public.celebrities c on c.id=m.celebrity_id
      cross join public.runmusic_campaign r
      where m.id=p_source and m.app_user_id=p_user
        and c.slug='runmusic' and c.status='published' and c.archived_at is null
        and m.reply_to_id is null and m.removed_at is null
        and m.created_at>=case when p_mission='pre_cheer' then r.registration_opens_at else r.event_starts_at end
        and m.created_at<case when p_mission='pre_cheer' then r.registration_closes_at else r.event_ends_at end
    )
    when p_mission='photo' then exists(
      select 1 from public.fan_posts p
      join public.celebrities c on c.id=p.celebrity_id
      cross join public.runmusic_campaign r
      where p.id=p_source and p.app_user_id=p_user
        and c.slug='runmusic' and c.status='published' and c.archived_at is null
        and p.visibility='public' and p.deleted_at is null and p.hidden_at is null
        and p.created_at>=r.event_starts_at and p.created_at<r.event_ends_at
        and (
          exists(
            select 1 from public.content_assets a
            where a.post_id=p.id and a.app_user_id=p_user and a.celebrity_id=c.id
              and a.uploaded_at is not null
              and a.deleted_at is null and a.cleanup_requested_at is null and a.storage_deleted_at is null
          ) or exists(
            select 1 from public.mobile_media_assets a
            where a.attached_type='fan_post' and a.attached_id=p.id and a.app_user_id=p_user
              and a.kind='image' and a.state='ready' and a.storage_deleted_at is null
              and a.cleanup_requested_at is null
          )
        )
    )
    else true
  end
$$;

create function public.read_runmusic_campaign()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.runmusic_campaign where published) then
    raise exception 'RUNMUSIC_NOT_FOUND';
  end if;
  return public.runmusic_campaign_json();
end;
$$;

create function public.read_owned_runmusic(p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c public.runmusic_campaign%rowtype;
  m jsonb;
  n integer;
  multiplier integer;
  e public.runmusic_draw_entries%rowtype;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select * into c from public.runmusic_campaign;
  if not c.published then
    raise exception 'RUNMUSIC_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(mission order by mission),'[]'::jsonb),
    count(*) filter(where mission<>'pre_cheer') into m,n
  from public.runmusic_missions
  where app_user_id=p_app_user_id and public.runmusic_source_valid(p_app_user_id,mission,source_id);
  multiplier:=case when m?'pre_cheer' and exists(
    select 1 from public.runmusic_registrations where app_user_id=p_app_user_id
  ) then 2 else 1 end;
  select * into e from public.runmusic_draw_entries
  where draw_id=c.draw_id and app_user_id=p_app_user_id;
  return jsonb_build_object(
    'campaign',public.runmusic_campaign_json(),
    'registered',exists(select 1 from public.runmusic_registrations where app_user_id=p_app_user_id),
    'missions',m,'multiplier',multiplier,
    'tickets',case when m?'checkin' then n*multiplier else 0 end,
    'result',case
      when not c.results_published then 'pending'
      when e.app_user_id is null then 'not_entered'
      when e.winner then 'winner'
      else 'not_selected'
    end,
    'receiptId',case when c.results_published and e.winner then e.receipt_id end,
    'receivedAt',case when c.results_published and e.winner then e.received_at end
  );
end;
$$;

create function public.submit_owned_runmusic(p_app_user_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c public.runmusic_campaign%rowtype;
  a text:=p_input->>'action';
  k uuid:=(p_input->>'requestKey')::uuid;
  h text:=encode(extensions.digest(p_input::text,'sha256'),'hex');
  old_hash text;
  ts timestamptz;
  src uuid;
  result jsonb;
  tries integer;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select * into c from public.runmusic_campaign for update;
  ts:=clock_timestamp();
  if not c.published then
    raise exception 'RUNMUSIC_NOT_FOUND';
  end if;
  if k is null or a not in('register','pre_cheer','checkin','cheer','photo','quiz') then
    raise exception 'RUNMUSIC_INVALID_REQUEST';
  end if;
  select input_hash into old_hash from public.runmusic_requests
  where app_user_id=p_app_user_id and request_key=k;
  if found and old_hash<>h then
    raise exception 'RUNMUSIC_CONFLICT';
  end if;
  if exists(select 1 from public.runmusic_missions where app_user_id=p_app_user_id and mission=a)
     or (a='register' and exists(select 1 from public.runmusic_registrations where app_user_id=p_app_user_id)) then
    insert into public.runmusic_requests values(p_app_user_id,k,h) on conflict do nothing;
    return public.read_owned_runmusic(p_app_user_id);
  end if;
  if c.draw_id is not null
     or (a in('register','pre_cheer') and (ts<c.registration_opens_at or ts>=c.registration_closes_at))
     or (a not in('register','pre_cheer') and (ts<c.event_starts_at or ts>=c.event_ends_at)) then
    raise exception 'RUNMUSIC_CLOSED';
  end if;
  if a in('cheer','photo','quiz') and not exists(
    select 1 from public.runmusic_missions where app_user_id=p_app_user_id and mission='checkin'
  ) then
    raise exception 'RUNMUSIC_CHECKIN_REQUIRED';
  end if;

  if a in('checkin','quiz') then
    insert into public.runmusic_attempts(app_user_id,kind,window_at,attempts)
      values(p_app_user_id,a,ts,1)
    on conflict(app_user_id,kind) do update set
      window_at=case when runmusic_attempts.window_at<=ts-interval'15 minutes' then ts else runmusic_attempts.window_at end,
      attempts=case when runmusic_attempts.window_at<=ts-interval'15 minutes' then 1 else runmusic_attempts.attempts+1 end
    returning attempts into tries;
    if tries>10 then
      return jsonb_build_object('error',jsonb_build_object('code','RUNMUSIC_RATE_LIMITED'));
    end if;
    if (a='checkin' and (
      c.checkin_hash is null or encode(extensions.digest(coalesce(p_input->>'code',''),'sha256'),'hex')<>c.checkin_hash
    )) or (a='quiz' and
      encode(extensions.digest(regexp_replace(coalesce(p_input->>'answer',''),'\s','','g'),'sha256'),'hex')<>c.quiz_hash
    ) then
      return jsonb_build_object('error',jsonb_build_object('code',
        case when a='checkin' then 'RUNMUSIC_INVALID_CODE' else 'RUNMUSIC_WRONG_ANSWER' end
      ));
    end if;
  end if;

  if a in('pre_cheer','cheer','photo') then
    if p_input?'sourceId' then
      raise exception 'RUNMUSIC_INVALID_REQUEST';
    end if;
    if a='photo' then
      result:=public.save_fan_post(
        p_app_user_id,'runmusic',null,coalesce(p_input->>'body',''),'public',
        array(select jsonb_array_elements_text(coalesce(p_input->'assetIds','[]'))::uuid),null,k
      );
    else
      result:=public.post_celebrity_lounge_message(p_app_user_id,'runmusic',p_input->>'body',k,null,'ko');
    end if;
    if (result->>'replayed')::boolean then
      raise exception 'RUNMUSIC_INVALID_SOURCE';
    end if;
    src:=(result->>'id')::uuid;
    if not public.runmusic_source_valid(p_app_user_id,a,src) then
      raise exception 'RUNMUSIC_INVALID_SOURCE';
    end if;
  end if;
  if a='register' then
    insert into public.runmusic_registrations(app_user_id) values(p_app_user_id);
  else
    insert into public.runmusic_missions(app_user_id,mission,source_id) values(p_app_user_id,a,src);
  end if;
  insert into public.runmusic_requests values(p_app_user_id,k,h) on conflict do nothing;
  return public.read_owned_runmusic(p_app_user_id);
end;
$$;

create function public.admin_runmusic(
  p_actor_app_user_id uuid,
  p_actor_admin_allowlist_id uuid,
  p_correlation_id uuid,
  p_action text default 'read',
  p_input jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c public.runmusic_campaign%rowtype;
  ts timestamptz;
  rid uuid;
  received timestamptz;
  replayed boolean;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,p_action<>'read');
  select * into c from public.runmusic_campaign for update;
  ts:=clock_timestamp();

  if p_action='settings' then
    if (p_input->>'expectedRevision')::integer is distinct from c.revision then
      raise exception 'RUNMUSIC_CONFLICT';
    end if;
    if c.draw_id is not null
       and (p_input-'resultsPublished'-'published'-'expectedRevision')<>'{}'::jsonb then
      raise exception 'RUNMUSIC_DRAW_FROZEN';
    end if;
    update public.runmusic_campaign set
      revision=revision+1,
      published=coalesce((p_input->>'published')::boolean,published),
      registration_opens_at=coalesce((p_input->>'registrationOpensAt')::timestamptz,registration_opens_at),
      registration_closes_at=coalesce((p_input->>'registrationClosesAt')::timestamptz,registration_closes_at),
      event_starts_at=coalesce((p_input->>'eventStartsAt')::timestamptz,event_starts_at),
      event_ends_at=coalesce((p_input->>'eventEndsAt')::timestamptz,event_ends_at),
      prize_count=coalesce((p_input->>'prizeCount')::integer,prize_count),
      results_published=coalesce((p_input->>'resultsPublished')::boolean,results_published);
  elsif p_action='rotate-code' then
    if length(coalesce(p_input->>'code','')) not between 16 and 128 then
      raise exception 'RUNMUSIC_INVALID_REQUEST';
    end if;
    update public.runmusic_campaign
      set checkin_hash=encode(extensions.digest(p_input->>'code','sha256'),'hex');
  elsif p_action='draw' then
    if (p_input->>'requestKey')::uuid is null then
      raise exception 'RUNMUSIC_INVALID_REQUEST';
    end if;
    if c.draw_id is null then
      if ts<c.event_ends_at then
        raise exception 'RUNMUSIC_CLOSED';
      end if;
      rid:=extensions.gen_random_uuid();
      update public.runmusic_campaign set
        draw_id=rid,
        draw_request_key=(p_input->>'requestKey')::uuid,
        draw_seed=encode(extensions.gen_random_bytes(32),'hex'),
        drawn_at=ts
      returning * into c;

      with eligible as (
        select m.app_user_id,
          count(*) filter(where mission<>'pre_cheer')::integer
            * case when bool_or(mission='pre_cheer') and exists(
                select 1 from public.runmusic_registrations r
                where r.app_user_id=m.app_user_id
              ) then 2 else 1 end as weight,
          jsonb_agg(jsonb_build_object(
            'mission',mission,'sourceId',source_id,'completedAt',m.created_at
          ) order by mission) as snapshot
        from public.runmusic_missions m
        join public.app_users u on u.id=m.app_user_id and u.status='active'
        where not exists(
          select 1 from public.app_user_moderation_restrictions r
          where r.app_user_id=m.app_user_id and r.revoked_at is null
        ) and public.runmusic_source_valid(m.app_user_id,m.mission,m.source_id)
        group by m.app_user_id
        having bool_or(mission='checkin')
      ), ranked as (
        select *,row_number() over(order by
          -ln((
            (('x'||substr(encode(extensions.digest(c.draw_seed||app_user_id::text,'sha256'),'hex'),1,15))::bit(60)::bigint)::numeric+1
          )/1152921504606846977::numeric)/weight,
          app_user_id
        )::integer as ranking
        from eligible
      )
      insert into public.runmusic_draw_entries(
        draw_id,app_user_id,weight,rank,winner,receipt_id,mission_snapshot
      )
      select rid,app_user_id,weight,ranking,ranking<=c.prize_count,
        case when ranking<=c.prize_count then extensions.gen_random_uuid() end,snapshot
      from ranked;
    end if;
  elsif p_action='receive' then
    if not c.results_published then
      raise exception 'RUNMUSIC_CLOSED';
    end if;
    select e.received_at into received
    from public.runmusic_draw_entries e
    join public.app_users u on u.id=e.app_user_id and u.status='active'
    where e.draw_id=c.draw_id and e.receipt_id=(p_input->>'receiptId')::uuid
      and e.winner and not exists(
        select 1 from public.app_user_moderation_restrictions r
        where r.app_user_id=e.app_user_id and r.revoked_at is null
      )
    for update of e;
    if not found then
      raise exception 'RUNMUSIC_NOT_FOUND';
    end if;
    replayed:=received is not null;
    if not replayed then
      update public.runmusic_draw_entries
        set received_at=ts,received_by=p_actor_admin_allowlist_id
        where receipt_id=(p_input->>'receiptId')::uuid;
      received:=ts;
    end if;
  elsif p_action<>'read' then
    raise exception 'RUNMUSIC_INVALID_REQUEST';
  end if;

  if p_action<>'read' then
    insert into public.audit_logs(
      actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,
      correlation_id,before_after_summary
    ) values(
      p_actor_app_user_id,p_actor_admin_allowlist_id,'runmusic.'||p_action,
      'runmusic_campaign','runmusic-2026',p_correlation_id,
      jsonb_build_object('operation',p_action,'drawId',coalesce(rid,c.draw_id))
    );
  end if;
  if p_action='receive' then
    return jsonb_build_object('receivedAt',received,'replayed',replayed);
  end if;
  return jsonb_build_object(
    'campaign',public.runmusic_campaign_json(),
    'revision',(select revision from public.runmusic_campaign),
    'participantCount',(select count(distinct app_user_id) from public.runmusic_missions),
    'drawId',(select draw_id from public.runmusic_campaign),
    'winnerCount',(select count(*) from public.runmusic_draw_entries where winner),
    'receivedCount',(select count(*) from public.runmusic_draw_entries where received_at is not null)
  );
end;
$$;

revoke all on function public.runmusic_campaign_json(),public.runmusic_source_valid(uuid,text,uuid),public.read_runmusic_campaign(),public.read_owned_runmusic(uuid),public.submit_owned_runmusic(uuid,jsonb),public.admin_runmusic(uuid,uuid,uuid,text,jsonb)
from public,anon,authenticated;
grant execute on function public.read_runmusic_campaign(),public.read_owned_runmusic(uuid),public.submit_owned_runmusic(uuid,jsonb),public.admin_runmusic(uuid,uuid,uuid,text,jsonb)to service_role;

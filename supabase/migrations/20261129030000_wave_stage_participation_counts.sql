begin;

create table public.participation_count_snapshot (
 singleton boolean primary key default true check(singleton),
 contract_address text not null check(contract_address ~ '^0x[0-9a-f]{40}$'),
 block_number numeric(78,0) not null check(block_number>=0),
 block_hash text not null check(block_hash ~ '^0x[0-9a-f]{64}$'),
 observed_at timestamptz not null, counts jsonb not null,
 finality text not null check(finality in('included','safe','finalized')),finalized_block_number numeric(78,0) check(finalized_block_number>=0)
);
alter table public.participation_count_snapshot enable row level security;
revoke all on public.participation_count_snapshot from public,anon,authenticated,service_role;

create function public.list_participation_count_targets() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_agg(jsonb_build_object('slug',slug,'creator','0x'||rpad(encode(convert_to(slug,'UTF8'),'hex'),64,'0'),
  'scope',scope,'day',case when scope='all' then '0' else ((extract(epoch from '2026-10-21T15:00:00Z'::timestamptz)::bigint+32400)/86400+1)::text end)
  order by slug,scope)
 from unnest(array['changha','wena']) slug cross join unnest(array['all','event-day']) scope;
$$;

create function public.store_participation_count_snapshot(p_contract_address text,p_block_number text,p_block_hash text,p_observed_at timestamptz,p_counts jsonb,p_finality text,p_finalized_block_number text)
returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; key text; cfg public.participation_config;
begin
 select * into strict cfg from public.participation_config;
 if p_contract_address is distinct from cfg.contract_address or p_contract_address !~ '^0x[0-9a-f]{40}$'
  or p_block_number is null or p_block_number !~ '^[0-9]{1,78}$' or p_block_hash is null or p_block_hash !~ '^0x[0-9a-f]{64}$'
  or p_observed_at is null or p_observed_at>clock_timestamp()+interval '30 seconds'
  or p_counts is null or jsonb_typeof(p_counts)<>'array' or jsonb_array_length(p_counts)<>4
  or p_finality is null or p_finality not in('included','safe','finalized')
  or (p_finalized_block_number is not null and p_finalized_block_number !~ '^[0-9]{1,78}$')
  or (p_finality='finalized' and (p_finalized_block_number is null or p_finalized_block_number::numeric<p_block_number::numeric)) then raise exception 'PARTICIPATION_SNAPSHOT_INVALID'; end if;
 for item in select value from jsonb_array_elements(p_counts) loop
  if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>7
   or coalesce(item->>'slug','') not in('changha','wena') or coalesce(item->>'scope','') not in('all','event-day') then raise exception 'PARTICIPATION_SNAPSHOT_INVALID';end if;
  foreach key in array array['reservations','passports','likes','comments','engagedFans'] loop
   if not(item ? key) or jsonb_typeof(item->key)<>'number' or (item->>key)!~'^[0-9]+$'
    or (item->>key)::numeric>9007199254740991 then raise exception 'PARTICIPATION_SNAPSHOT_INVALID';end if;
  end loop;
  if (item->>'engagedFans')::numeric > (item->>'reservations')::numeric+(item->>'passports')::numeric+(item->>'likes')::numeric+(item->>'comments')::numeric then raise exception 'PARTICIPATION_SNAPSHOT_INVALID';end if;
 end loop;
 if (select count(distinct(value->>'slug',value->>'scope')) from jsonb_array_elements(p_counts))<>4 then raise exception 'PARTICIPATION_SNAPSHOT_INVALID';end if;
 insert into public.participation_count_snapshot as old(singleton,contract_address,block_number,block_hash,observed_at,counts,finality,finalized_block_number)
 values(true,p_contract_address,p_block_number::numeric,p_block_hash,p_observed_at,p_counts,p_finality,p_finalized_block_number::numeric)
 on conflict(singleton) do update set contract_address=excluded.contract_address,block_number=excluded.block_number,
  block_hash=excluded.block_hash,observed_at=excluded.observed_at,counts=excluded.counts,finality=excluded.finality,finalized_block_number=excluded.finalized_block_number
 where old.observed_at<=excluded.observed_at and old.block_number<=excluded.block_number;
end $$;

create or replace function public.read_admin_wave_stage_participation(
 p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_scope text default 'all'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare as_of timestamptz:=statement_timestamp();from_at timestamptz;to_at timestamptz;result jsonb;targets jsonb;snapshot public.participation_count_snapshot;
begin
 begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
 exception when others then raise exception 'FAN_WEB_FORBIDDEN';end;
 if p_scope is null or p_scope not in('all','event-day') then raise exception 'FAN_WEB_INVALID_INPUT';end if;
 from_at:=case when p_scope='event-day' then '2026-10-21T15:00:00Z'::timestamptz else null end;
 to_at:=case when p_scope='event-day' then least(as_of,'2026-10-22T15:00:00Z'::timestamptz) else as_of end;
 select jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'name',coalesce(nullif(btrim(loc.name),''),c.slug)) order by c.slug) into targets
 from(values ('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb'::uuid,'fde5ff1b-ac41-4c20-902b-034cba972023'::uuid,'changha'),
  ('c3930f7f-bd2b-4e58-8cec-b3c61f8463fe'::uuid,'45fcead7-24f3-46aa-98ce-84dfe8c8e75b'::uuid,'wena')) pinned(campaign,live,slug)
 join public.live_benefit_campaigns b on b.id=pinned.campaign and b.live_event_id=pinned.live
 join public.live_events l on l.id=pinned.live join public.celebrities c on c.id=l.celebrity_id and c.slug=pinned.slug
 left join public.celebrity_localizations loc on loc.celebrity_id=c.id and loc.locale='ko';
 if coalesce(jsonb_array_length(targets),0)<>2 then raise exception 'FAN_WEB_UNAVAILABLE';end if;
 select s.* into snapshot from public.participation_count_snapshot s join public.participation_config c on c.contract_address=s.contract_address;
 with creators as(select * from jsonb_to_recordset(targets) as t(id uuid,slug text,name text)),
 activity as(select a.* from public.wave_stage_participation_activity() a
  where (from_at is null or a.occurred_at>=from_at) and a.occurred_at<to_at),
 active_activity as(select * from activity where active),
 outstanding as(
  select a.celebrity_id,a.source_namespace,a.source_id,
   exists(select 1 from public.participation_batch_items i join public.participation_batches b on b.id=i.batch_id
    where i.source_row_id=s.id and i.revision=s.revision and b.status='FAILED') failed
  from activity a left join public.participation_sources s on s.source_namespace=a.source_namespace and s.source_id=a.source_id
  where (a.active or s.id is not null) and not exists(
   select 1 from public.participation_batch_items i join public.participation_batches b on b.id=i.batch_id
   where i.source_row_id=s.id and i.revision=s.revision and i.active=a.active and b.status='COMPLETED' and b.inclusion_status='finalized'
    and snapshot.finalized_block_number is not null and b.block_number<=snapshot.finalized_block_number)
 ) select jsonb_build_object('asOf',as_of,'scope',p_scope,'from',from_at,'to',to_at,'eventDate','2026-10-22',
 'creators',(select jsonb_agg(jsonb_build_object('slug',c.slug,'name',c.name,
  'reservations',(select count(*) from active_activity a where a.celebrity_id=c.id and a.kind=1),
  'passports',(select count(*) from active_activity a where a.celebrity_id=c.id and a.kind=2),
  'likes',(select count(*) from active_activity a where a.celebrity_id=c.id and a.kind=3),
  'comments',(select count(*) from active_activity a where a.celebrity_id=c.id and a.kind=4),
  'engagedFans',(select count(distinct app_user_id) from active_activity a where a.celebrity_id=c.id),
  'pending',(select count(*) from outstanding o where o.celebrity_id=c.id and not o.failed),
  'failed',(select count(*) from outstanding o where o.celebrity_id=c.id and o.failed)
 ) order by c.slug) from creators c),
 'onchain',case when snapshot.singleton is null then jsonb_build_object('state','unavailable') else
  jsonb_build_object('state','available','contractAddress',snapshot.contract_address,'blockNumber',snapshot.block_number::text,
   'blockHash',snapshot.block_hash,'observedAt',snapshot.observed_at,'finality',snapshot.finality,'finalizedBlockNumber',snapshot.finalized_block_number::text,
   'creators',(select jsonb_agg(value-'scope' order by value->>'slug') from jsonb_array_elements(snapshot.counts) where value->>'scope'=p_scope)) end
 ) into result;
 return result;
end $$;

revoke all on function public.list_participation_count_targets(),public.store_participation_count_snapshot(text,text,text,timestamptz,jsonb,text,text),public.read_admin_wave_stage_participation(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.list_participation_count_targets(),public.store_participation_count_snapshot(text,text,text,timestamptz,jsonb,text,text),public.read_admin_wave_stage_participation(uuid,uuid,text) to service_role;
commit;

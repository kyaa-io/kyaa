-- Preserve the original snapshot and legacy entry sources; only new draws use equal odds.
alter table public.runmusic_campaign add column auto_publish_enabled boolean not null default false,
  add column entry_closes_at timestamptz not null default '2026-10-24T14:59:00Z',
  add column results_at timestamptz not null default '2026-10-24T14:59:00Z';
alter table public.runmusic_draw_entries add column prize_code text
  check(prize_code in('andong_yogurt_1l','starbucks_10000'));
update public.runmusic_draw_entries set prize_code='starbucks_10000' where winner;

create table public.runmusic_contacts(
  app_user_id uuid primary key references public.app_users(id),
  ciphertext text not null check(length(ciphertext) between 1 and 8192),
  masked text not null check(length(masked) between 1 and 100),
  fingerprint text not null check(length(fingerprint) between 1 and 256),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.runmusic_contacts enable row level security;
alter table public.runmusic_contacts force row level security;
revoke all on public.runmusic_contacts from public,anon,authenticated,service_role;

create function public.runmusic_campaign_json_v2() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('slug',slug,'published',published,
   'entryOpensAt',registration_opens_at,'entryClosesAt',entry_closes_at,
   'resultsAt',results_at,
   'prizes',jsonb_build_array(
     jsonb_build_object('code','andong_yogurt_1l','label','안동참마요거트 1L','count',15,'imageUrl','/images/runmusic/andong-yogurt-1l.png'),
     jsonb_build_object('code','starbucks_10000','label','스타벅스 1만원 상품권','count',150,'imageUrl','/images/kyaa-wave/starbucks-10000-voucher.jpg')),
   'drawn',draw_id is not null,'resultsPublished',results_published)
 from public.runmusic_campaign
$$;
create function public.runmusic_entered(p_app_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.runmusic_registrations where app_user_id=p_app_user_id)
   or exists(select 1 from public.runmusic_missions where app_user_id=p_app_user_id)
$$;
create function public.runmusic_liked(p_app_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.fan_reactions r join public.celebrities c on c.id=r.celebrity_id
   where r.app_user_id=p_app_user_id and c.slug='runmusic')
$$;
create function public.read_runmusic_campaign_v2() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.runmusic_campaign where published) then raise exception 'RUNMUSIC_NOT_FOUND';end if;
 return public.runmusic_campaign_json_v2();
end $$;
create function public.read_owned_runmusic_v2(p_app_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.runmusic_campaign%rowtype;e public.runmusic_draw_entries%rowtype;contact_mask text;
begin
 select * into c from public.runmusic_campaign for update;
 perform public.fan_web_lock_active_user(p_app_user_id);
 if not c.published then raise exception 'RUNMUSIC_NOT_FOUND';end if;
 select * into e from public.runmusic_draw_entries where draw_id=c.draw_id and app_user_id=p_app_user_id;
 select masked into contact_mask from public.runmusic_contacts where app_user_id=p_app_user_id;
 return jsonb_build_object('campaign',public.runmusic_campaign_json_v2(),
  'entered',public.runmusic_entered(p_app_user_id),'liked',public.runmusic_liked(p_app_user_id),
  'contact',jsonb_build_object('saved',contact_mask is not null,'masked',contact_mask),
  'result',case when not c.results_published then 'pending' when e.app_user_id is null then 'not_entered' when e.winner then 'winner' else 'not_selected' end,
  'prizeCode',case when c.results_published and e.winner then e.prize_code end,
  'receiptId',case when c.results_published and e.winner then e.receipt_id end,
  'receivedAt',case when c.results_published and e.winner then e.received_at end);
end $$;

create function public.submit_owned_runmusic_v2(p_app_user_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.runmusic_campaign%rowtype;a text:=p_input->>'action';k uuid:=(p_input->>'requestKey')::uuid;
 h text;old_hash text;ts timestamptz;
begin
 select * into c from public.runmusic_campaign for update;
 perform public.fan_web_lock_active_user(p_app_user_id);
 ts:=clock_timestamp();
 if not c.published then raise exception 'RUNMUSIC_NOT_FOUND';end if;
 if k is null or a is null or a not in('enter','save_contact') or jsonb_typeof(p_input)<>'object' then raise exception 'RUNMUSIC_INVALID_REQUEST';end if;
 if a='save_contact' and (length(coalesce(p_input->>'ciphertext','')) not between 1 and 8192
   or length(coalesce(p_input->>'masked','')) not between 1 and 100
   or length(coalesce(p_input->>'fingerprint','')) not between 1 and 256
   or (p_input->>'masked') ~ '[[:cntrl:]]') then raise exception 'RUNMUSIC_INVALID_REQUEST';end if;
 h:=encode(extensions.digest(jsonb_build_object('action',a,'fingerprint',case when a='save_contact' then p_input->>'fingerprint' end)::text,'sha256'),'hex');
 select input_hash into old_hash from public.runmusic_requests where app_user_id=p_app_user_id and request_key=k;
 if found then
  if old_hash<>h then raise exception 'RUNMUSIC_CONFLICT';end if;
  return public.read_owned_runmusic_v2(p_app_user_id);
 end if;
 if a='enter' then
  if not public.runmusic_entered(p_app_user_id) then
   if c.draw_id is not null or ts<c.registration_opens_at or ts>=c.entry_closes_at then raise exception 'RUNMUSIC_CLOSED';end if;
   if not public.runmusic_liked(p_app_user_id) then raise exception 'RUNMUSIC_LIKE_REQUIRED';end if;
   insert into public.runmusic_registrations(app_user_id) values(p_app_user_id);
  end if;
 else
  if not public.runmusic_entered(p_app_user_id) then raise exception 'RUNMUSIC_ENTRY_REQUIRED';end if;
  -- Publication and contact writes share the campaign lock: a purged loser cannot reinsert.
  if c.results_published and not exists(select 1 from public.runmusic_draw_entries
    where draw_id=c.draw_id and app_user_id=p_app_user_id and winner
      and coalesce(received_at,c.drawn_at)+interval'30 days'>ts) then raise exception 'RUNMUSIC_CLOSED';end if;
  insert into public.runmusic_contacts(app_user_id,ciphertext,masked,fingerprint) values
    (p_app_user_id,p_input->>'ciphertext',p_input->>'masked',p_input->>'fingerprint')
    on conflict(app_user_id) do update set ciphertext=excluded.ciphertext,masked=excluded.masked,
      fingerprint=excluded.fingerprint,updated_at=ts;
 end if;
 insert into public.runmusic_requests values(p_app_user_id,k,h);
 return public.read_owned_runmusic_v2(p_app_user_id);
end $$;

create function public.purge_due_runmusic_contacts() returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 perform 1 from public.runmusic_campaign for update;
 delete from public.runmusic_contacts x using public.runmusic_campaign c
 where not exists(select 1 from public.app_users u where u.id=x.app_user_id and u.status='active')
 or (c.results_published and not exists(select 1 from public.runmusic_draw_entries e
   where e.draw_id=c.draw_id and e.app_user_id=x.app_user_id and e.winner
     and coalesce(e.received_at,c.drawn_at)+interval'30 days'>clock_timestamp()));
 get diagnostics n=row_count;
 return n;
end $$;

-- Internal entry point: callers must hold the campaign row lock. No caller-supplied clock.
create function public.runmusic_publish_locked() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.runmusic_campaign%rowtype;rid uuid;owner_id uuid;notifications integer:=0;purged integer;
begin
 select * into c from public.runmusic_campaign for update;
 if clock_timestamp()<c.results_at then raise exception 'RUNMUSIC_CLOSED';end if;
 if c.draw_id is null then
  -- The same advisory lock used by deletion protects the active-account snapshot.
  for owner_id in select app_user_id from (select app_user_id from public.runmusic_registrations union select app_user_id from public.runmusic_missions) s order by app_user_id loop
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||owner_id::text,0));
  end loop;
  rid:=extensions.gen_random_uuid();
  update public.runmusic_campaign set draw_id=rid,draw_request_key=extensions.gen_random_uuid(),
    draw_seed=encode(extensions.gen_random_bytes(32),'hex'),drawn_at=clock_timestamp() returning * into c;
  with candidates as(
   select s.app_user_id from (select app_user_id from public.runmusic_registrations union select app_user_id from public.runmusic_missions) s
   join public.app_users u on u.id=s.app_user_id and u.status='active'
   where not exists(select 1 from public.app_user_moderation_restrictions r where r.app_user_id=u.id and r.revoked_at is null)
  ),ranked as(
   select app_user_id,row_number()over(order by extensions.digest(c.draw_seed||app_user_id::text,'sha256'),app_user_id)::integer ranking from candidates
  ) insert into public.runmusic_draw_entries(draw_id,app_user_id,weight,mission_snapshot,rank,winner,receipt_id,prize_code)
   select rid,app_user_id,1,'[]'::jsonb,ranking,ranking<=165,
    case when ranking<=165 then extensions.gen_random_uuid() end,
    case when ranking<=15 then 'andong_yogurt_1l' when ranking<=165 then 'starbucks_10000' end from ranked;
 end if;
 if not c.results_published then
  update public.runmusic_campaign set results_published=true;
  notifications:=public.enqueue_runmusic_results(c.draw_id);
 end if;
 purged:=public.purge_due_runmusic_contacts();
 return jsonb_build_object('published',true,'drawId',c.draw_id,'notificationCount',notifications,'purgedCount',purged);
end $$;
create function public.process_due_runmusic() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.runmusic_campaign%rowtype;n integer;
begin
 select * into c from public.runmusic_campaign for update;
 if c.auto_publish_enabled and c.published and clock_timestamp()>=c.results_at then
  return public.runmusic_publish_locked();
 end if;
 n:=public.purge_due_runmusic_contacts();
 return jsonb_build_object('published',c.results_published,'drawId',c.draw_id,'notificationCount',0,'purgedCount',n);
end $$;

create function public.admin_runmusic_v2(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,
 p_correlation_id uuid,p_action text default 'read',p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.runmusic_campaign%rowtype;target_id uuid;received timestamptz;replayed boolean;secret text;result jsonb;
begin
 select * into c from public.runmusic_campaign for update;
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,p_action<>'read');
 if p_action='settings' then
  if (p_input-'expectedRevision'-'published'-'autoPublishEnabled')<>'{}'::jsonb then raise exception 'RUNMUSIC_INVALID_REQUEST';end if;
  if (p_input->>'expectedRevision')::integer is distinct from c.revision then raise exception 'RUNMUSIC_CONFLICT';end if;
  update public.runmusic_campaign set revision=revision+1,published=coalesce((p_input->>'published')::boolean,published),
    auto_publish_enabled=coalesce((p_input->>'autoPublishEnabled')::boolean,auto_publish_enabled);
 elsif p_action='draw' then
  if not c.published then raise exception 'RUNMUSIC_CLOSED';end if;
  perform public.runmusic_publish_locked();
 elsif p_action in('receive','contact') then
  if p_action='receive' then
   if not c.results_published then raise exception 'RUNMUSIC_CLOSED';end if;
   select app_user_id into target_id from public.runmusic_draw_entries where draw_id=c.draw_id and winner and receipt_id=(p_input->>'receiptId')::uuid;
  else target_id:=(p_input->>'appUserId')::uuid;end if;
  if target_id is null then raise exception 'RUNMUSIC_NOT_FOUND';end if;
  perform public.fan_web_lock_active_user(target_id);
  if p_action='receive' then
   select received_at into received from public.runmusic_draw_entries where draw_id=c.draw_id and app_user_id=target_id and winner for update;
   replayed:=received is not null;
   if not replayed then
    received:=clock_timestamp();
    update public.runmusic_draw_entries set received_at=received,received_by=p_actor_admin_allowlist_id where draw_id=c.draw_id and app_user_id=target_id;
   end if;
   result:=jsonb_build_object('receivedAt',received,'replayed',replayed);
  else
   perform public.purge_due_runmusic_contacts();
   select ciphertext into secret from public.runmusic_contacts where app_user_id=target_id;
   if secret is null then raise exception 'RUNMUSIC_NOT_FOUND';end if;
   result:=jsonb_build_object('appUserId',target_id,'ciphertext',secret);
  end if;
 elsif p_action<>'read' or p_action is null then raise exception 'RUNMUSIC_INVALID_REQUEST';end if;
 if p_action<>'read' then
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)
   values(p_actor_app_user_id,p_actor_admin_allowlist_id,'runmusic.'||p_action,'runmusic_campaign','runmusic-2026',p_correlation_id,
    jsonb_build_object('operation',p_action,'appUserId',target_id,'drawId',(select draw_id from public.runmusic_campaign)));
 end if;
 if result is not null then return result;end if;
 select * into c from public.runmusic_campaign;
 return jsonb_build_object('campaign',public.runmusic_campaign_json_v2(),'revision',c.revision,
  'participantCount',(select count(*) from (select app_user_id from public.runmusic_registrations union select app_user_id from public.runmusic_missions) p),
  'drawId',c.draw_id,'winnerCount',(select count(*) from public.runmusic_draw_entries where draw_id=c.draw_id and winner),
  'receivedCount',(select count(*) from public.runmusic_draw_entries where draw_id=c.draw_id and received_at is not null),
  'autoPublishEnabled',c.auto_publish_enabled,'winners',coalesce((select jsonb_agg(jsonb_build_object(
   'appUserId',e.app_user_id,'prizeCode',e.prize_code,'receiptId',e.receipt_id,'receivedAt',e.received_at,
   'contactSaved',x.app_user_id is not null,'contactMasked',x.masked)order by e.rank)
   from public.runmusic_draw_entries e left join public.runmusic_contacts x using(app_user_id)
   where e.draw_id=c.draw_id and e.winner),'[]'::jsonb),
  'delivery',public.runmusic_delivery_stats(c.draw_id));
end $$;

-- Keep old JSON contracts readable; old write endpoints cannot award mission weight.
create or replace function public.submit_owned_runmusic(p_app_user_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_input->>'action' is distinct from 'register' then raise exception 'RUNMUSIC_CLOSED';end if;
 perform public.submit_owned_runmusic_v2(p_app_user_id,jsonb_build_object('action','enter','requestKey',p_input->>'requestKey'));
 return public.read_owned_runmusic(p_app_user_id);
end $$;
create or replace function public.admin_runmusic(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,
 p_action text default 'read',p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 r:=public.admin_runmusic_v2(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,p_action,p_input);
 if p_action='receive' then return r;end if;
 return jsonb_build_object('campaign',public.runmusic_campaign_json(),'revision',r->'revision','participantCount',r->'participantCount',
  'drawId',r->'drawId','winnerCount',r->'winnerCount','receivedCount',r->'receivedCount');
end $$;

-- Reads must follow the same campaign -> owner order as writes and publication.
alter function public.read_owned_runmusic(uuid) rename to read_owned_runmusic_before_simple_entry;
create function public.read_owned_runmusic(p_app_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.runmusic_campaign for update;
 return public.read_owned_runmusic_before_simple_entry(p_app_user_id);
end $$;

alter function public.begin_owned_account_deletion(text) rename to begin_owned_account_deletion_before_runmusic;
create function public.begin_owned_account_deletion(p_privy_user_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.runmusic_campaign for update;
 return public.begin_owned_account_deletion_before_runmusic(p_privy_user_id);
end $$;
create function public.scrub_runmusic_contacts_on_disable() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'active' then delete from public.runmusic_contacts where app_user_id=new.id;end if;
 return new;
end $$;
create trigger app_users_scrub_runmusic_contacts after update of status on public.app_users
 for each row execute function public.scrub_runmusic_contacts_on_disable();
alter function public.scrub_account_deletion(uuid) rename to scrub_account_deletion_before_runmusic;
create function public.scrub_account_deletion(p_app_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from public.runmusic_contacts where app_user_id=p_app_user_id;
 perform public.scrub_account_deletion_before_runmusic(p_app_user_id);
end $$;

revoke all on function public.runmusic_campaign_json_v2(),public.runmusic_entered(uuid),public.runmusic_liked(uuid),
 public.read_runmusic_campaign_v2(),public.read_owned_runmusic_v2(uuid),public.submit_owned_runmusic_v2(uuid,jsonb),
 public.runmusic_publish_locked(),public.purge_due_runmusic_contacts(),public.process_due_runmusic(),
 public.admin_runmusic_v2(uuid,uuid,uuid,text,jsonb),public.read_owned_runmusic_before_simple_entry(uuid),public.read_owned_runmusic(uuid),
 public.begin_owned_account_deletion_before_runmusic(text),public.begin_owned_account_deletion(text),
 public.scrub_runmusic_contacts_on_disable(),public.scrub_account_deletion_before_runmusic(uuid),public.scrub_account_deletion(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.read_runmusic_campaign_v2(),public.read_owned_runmusic_v2(uuid),public.submit_owned_runmusic_v2(uuid,jsonb),
 public.purge_due_runmusic_contacts(),public.process_due_runmusic(),public.admin_runmusic_v2(uuid,uuid,uuid,text,jsonb),
 public.read_owned_runmusic(uuid),public.begin_owned_account_deletion(text),public.scrub_account_deletion(uuid) to service_role;

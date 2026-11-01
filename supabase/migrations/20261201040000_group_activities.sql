begin;
-- A credit returning an existing right must survive account suspension.
-- This private path never permits an inactive owner to debit or exchange.
create function public.group_wallet_refund_lock(p_owner uuid)returns void language plpgsql security definer set search_path='' as $$begin
 if not public.group_wallet_enabled()then return;end if;
 if p_owner is null or not exists(select 1 from public.app_users where id=p_owner)then raise exception 'GROUP_WALLET_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('group-wallet:campaign-barrier',0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-wallet:owner:'||p_owner,0));
 if not public.group_wallet_enabled()then raise exception 'GROUP_WALLET_UNAVAILABLE';end if;
 if exists(select 1 from public.group_wallet_release where singleton and write_fenced)then raise exception 'GROUP_WALLET_WRITE_FENCED';end if;
end $$;
create function public.group_wallet_refund(p_owner uuid,p_amount bigint,p_entry_id uuid)returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.fan_ticket_ledger%rowtype;entry uuid;balance numeric;sequence bigint;begin
 if not public.group_wallet_enabled()then raise exception 'GROUP_WALLET_UNAVAILABLE';end if;
 perform public.group_wallet_refund_lock(p_owner);
 if p_amount is null or p_amount<=0 or p_entry_id is null then raise exception 'GROUP_WALLET_INVALID';end if;
 select *into prior from public.fan_ticket_ledger where app_user_id=p_owner and celebrity_id is null and source_type='group_raffle_refund'and source_id=p_entry_id;
 if found then if prior.amount<>p_amount then raise exception 'GROUP_WALLET_REQUEST_CONFLICT';end if;return prior.id;end if;
 balance:=public.group_wallet_balance(p_owner,'ticket')::numeric+p_amount;
 if balance>9007199254740991 then raise exception 'GROUP_WALLET_BALANCE_INVALID';end if;
 select coalesce(max(owner_sequence),0)+1 into sequence from public.fan_ticket_ledger where app_user_id=p_owner and celebrity_id is null;
 insert into public.fan_ticket_ledger(app_user_id,celebrity_id,entry_kind,amount,source_type,source_id,idempotency_key,policy_version,owner_sequence,resulting_balance)
 values(p_owner,null,'credit',p_amount,'group_raffle_refund',p_entry_id,md5('group-raffle-refund:'||p_entry_id)::uuid,(select policy_version from public.reward_policy_activation where singleton),sequence,balance::bigint)returning id into entry;return entry;
end $$;
do $$declare f record;definition text;begin
 for f in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in('group_wallet_assign_sequence','post_benefit_entry_refund','cancel_admin_benefit_campaign')loop
 definition:=pg_get_functiondef(f.oid);
 if f.proname='group_wallet_assign_sequence'then definition:=replace(definition,'perform public.group_wallet_lock(new.app_user_id);','if new.amount>0 and new.source_type in(''benefit_entry_refund'',''group_raffle_refund'')then perform public.group_wallet_refund_lock(new.app_user_id);else perform public.group_wallet_lock(new.app_user_id);end if;');
 elsif f.proname='post_benefit_entry_refund'then definition:=replace(definition,'public.group_wallet_legacy_lock(','public.group_wallet_refund_lock(');
 else definition:=replace(definition,'public.group_wallet_lock(e.app_user_id)','public.group_wallet_refund_lock(e.app_user_id)');end if;
 execute definition;
 end loop;
end $$;

-- Generic pages do not require a fictitious Creator/LIVE. Original artist event
-- and fulfillment tables remain unchanged; these rows belong to a group page.
create table public.group_events (
 id uuid primary key default extensions.gen_random_uuid(),page_id uuid not null references public.group_pages(id),
 title text not null check(length(btrim(title))between 1 and 200),description text not null default''check(length(description)<=10000),image_url text,
 starts_at timestamptz not null,ends_at timestamptz not null,opens_at timestamptz not null,closes_at timestamptz not null,location text not null check(length(btrim(location))between 1 and 300),
 capacity integer check(capacity between 1 and 100000),requires_approval boolean not null default false,state text not null default'draft'check(state in('draft','published','cancelled','ended')),
 revision integer not null default 1 check(revision>0),official_revision integer,created_by uuid not null references public.app_users(id),created_at timestamptz not null default clock_timestamp(),
 check(starts_at<ends_at and opens_at<closes_at and closes_at<=ends_at)
);
create table public.group_event_registrations (
 id uuid primary key default extensions.gen_random_uuid(),event_id uuid not null references public.group_events(id),app_user_id uuid not null references public.app_users(id),
 status text not null check(status in('pending','confirmed','rejected','cancelled')),ticket_token bytea not null default extensions.gen_random_bytes(32),
 checked_in_at timestamptz,checked_in_by uuid references public.app_users(id),review_body text check(length(review_body)between 1 and 5000),reviewed_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),unique(event_id,app_user_id),unique(ticket_token),check(octet_length(ticket_token)=32)
);
create table public.group_official_event_applications (
 id uuid primary key default extensions.gen_random_uuid(),event_id uuid not null references public.group_events(id),event_revision integer not null,
 applicant_id uuid not null references public.app_users(id),description text not null check(length(btrim(description))between 1 and 10000),source_url text,
 status text not null default'submitted'check(status in('submitted','changes_requested','approved','rejected')),reason text,
 reviewed_by uuid references public.admin_allowlist(id),created_at timestamptz not null default clock_timestamp(),reviewed_at timestamptz
);
create table public.group_collections (
 id uuid primary key default extensions.gen_random_uuid(),page_id uuid not null references public.group_pages(id),title text not null check(length(btrim(title))between 1 and 200),
 image_url text,external_url text not null check(external_url~'^https://'),status text not null check(status in('active','sold_out','hidden')),revision integer not null default 1,
 created_at timestamptz not null default clock_timestamp()
);
create table public.group_missions (
 id uuid primary key default extensions.gen_random_uuid(),page_id uuid not null references public.group_pages(id),title text not null check(length(btrim(title))between 1 and 200),
 instructions text not null check(length(btrim(instructions))between 1 and 10000),image_url text,state text not null check(state in('draft','published','closed')),
 reward_points integer not null default 0 check(reward_points between 0 and 100000),reward_budget bigint not null default 0 check(reward_budget>=0),reward_approved_by uuid references public.admin_allowlist(id),revision integer not null default 1,
 check(reward_points=0 or(reward_approved_by is not null and reward_budget>=reward_points)),created_at timestamptz not null default clock_timestamp()
);
create table public.group_mission_submissions (
 id uuid primary key default extensions.gen_random_uuid(),mission_id uuid not null references public.group_missions(id),app_user_id uuid not null references public.app_users(id),body text not null check(length(btrim(body))between 1 and 10000),
 status text not null default'pending'check(status in('pending','rejected','completed')),reason text,reviewed_by uuid references public.app_users(id),reviewed_at timestamptz,
 reward_points integer not null default 0,reward_ledger_id uuid unique references public.mobile_fan_economy_ledger(id),created_at timestamptz not null default clock_timestamp(),unique(mission_id,app_user_id)
);
create table public.group_activity_receipts (
 actor_id uuid not null references public.app_users(id),request_id uuid not null,operation text not null,payload jsonb not null,response jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_id)
);
create trigger group_activity_receipts_immutable before update or delete on public.group_activity_receipts for each row execute function public.reject_fan_ticket_ledger_mutation();
create trigger group_activity_receipts_no_truncate before truncate on public.group_activity_receipts for each statement execute function public.reject_fan_ticket_ledger_mutation();
create index group_events_page on public.group_events(page_id,starts_at,id);
create index group_mission_submissions_mission on public.group_mission_submissions(mission_id,status);

-- Page reward sources use the same lock/sequence/ledger as existing wallet paths.
do $$declare definition text;begin
 select pg_get_functiondef(oid)into strict definition from pg_proc where pronamespace='public'::regnamespace and proname='group_wallet_post';
 if position('''group_support'''in definition)=0 then raise exception 'GROUP_ACTIVITY_WALLET_CONTRACT_CHANGED';end if;
 execute replace(definition,'''group_support''','''group_support'',''group_mission'',''group_raffle_entry'',''group_raffle_refund''');
end $$;
create function public.group_event_json(p_id uuid,p_actor uuid)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'imageUrl',e.image_url,'startsAt',e.starts_at,'endsAt',e.ends_at,'opensAt',e.opens_at,'closesAt',e.closes_at,'location',e.location,'capacity',e.capacity,'requiresApproval',e.requires_approval,'state',e.state,'revision',e.revision,'official',coalesce(e.official_revision=e.revision,false),'entryStatus',coalesce((select status from public.group_event_registrations where event_id=e.id and app_user_id=p_actor),'none'),'ticketAvailable',exists(select 1 from public.group_event_registrations where event_id=e.id and app_user_id=p_actor and status='confirmed'and e.state<>'cancelled'and exists(select 1 from public.group_memberships where page_id=e.page_id and app_user_id=p_actor)))from public.group_events e where e.id=p_id
$$;
create function public.group_mission_json(p_id uuid,p_actor uuid)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'title',m.title,'instructions',m.instructions,'imageUrl',m.image_url,'state',m.state,'revision',m.revision,'rewardPoints',m.reward_points,'status',coalesce((select status from public.group_mission_submissions where mission_id=m.id and app_user_id=p_actor),'available'),'actionHref','/pages/groups/'||m.page_id::text||'/missions/'||m.id::text)from public.group_missions m where m.id=p_id
$$;
create function public.group_activity_next_cursor(p_kind text,p_scope uuid,p_manage boolean,p_limit integer,p_cursor uuid)returns uuid language plpgsql stable security definer set search_path='' as $$
declare table_name text;filter text;ids uuid[];begin
 case p_kind
 when'events'then table_name:='group_events';filter:='page_id=$1 and(state<>''draft''or $2)';
 when'collections'then table_name:='group_collections';filter:='page_id=$1 and(status<>''hidden''or $2)';
 when'missions'then table_name:='group_missions';filter:='page_id=$1 and(state=''published''or $2)';
 when'event-participants'then table_name:='group_event_registrations';filter:='event_id=$1';
 when'mission-submissions'then table_name:='group_mission_submissions';filter:='mission_id=$1';
 when'admin-official-applications'then table_name:='group_official_event_applications';filter:='true';
 when'admin-missions'then table_name:='group_missions';filter:='true';
 else raise exception 'GROUP_ACTIVITY_INVALID';end case;
 execute format('select array_agg(id order by id)from(select id from public.%I where %s and($3 is null or id>$3)order by id limit $4)x',table_name,filter)into ids using p_scope,p_manage,p_cursor,p_limit+1;
 return case when cardinality(ids)>p_limit then ids[p_limit]end;
end $$;
create function public.group_activities_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_sub_id uuid default null,p_input jsonb default'{}',p_admin_id uuid default null)returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.group_pages%rowtype;e public.group_events%rowtype;r public.group_event_registrations%rowtype;m public.group_missions%rowtype;s public.group_mission_submissions%rowtype;c public.group_collections%rowtype;a public.group_official_event_applications%rowtype;prior public.group_activity_receipts%rowtype;role text;manager boolean;platform boolean:=false;writing boolean;req uuid;payload jsonb;result jsonb;new_id uuid;page_limit integer;entry uuid;count_confirmed integer;spent bigint;qr_parts text[];begin
 if p_operation='mission-review'and p_actor is not null then perform public.group_wallet_invitation_lock(p_actor,(select app_user_id from public.group_mission_submissions where id=p_sub_id and mission_id=p_item_id));end if;
 if p_actor is not null then perform public.fan_web_lock_active_user(p_actor);end if;
 if p_admin_id is not null then perform public.assert_active_admin(p_actor,p_admin_id,p_operation not in('admin-official-applications','admin-missions'));platform:=true;end if;
 writing:=p_operation in('event-save','event-apply','event-cancel','event-review-participant','event-check-in','event-review-write','official-submit','official-review','collection-save','mission-save','mission-submit','mission-review','mission-reward-policy');
 if writing and p_actor is null then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
 if p_operation in('official-review','admin-official-applications','admin-missions','mission-reward-policy')and not platform then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
 select *into g from public.group_pages where id=p_page_id and status='published'and(celebrity_id is null or exists(select 1 from public.celebrities where id=celebrity_id and status='published'and archived_at is null));
 if p_operation not in('admin-official-applications','admin-missions')and g.id is null then raise exception 'GROUP_ACTIVITY_NOT_FOUND';end if;
 select x.role into role from public.group_memberships x where page_id=p_page_id and app_user_id=p_actor;
 manager:=platform or coalesce(role in('owner','manager'),false);
 if writing then
  -- Currency-producing reviews acquire the account before the mission row.
  if p_operation='mission-review'then select app_user_id into new_id from public.group_mission_submissions where id=p_sub_id and mission_id=p_item_id; if new_id is not null and exists(select 1 from public.group_missions where id=p_item_id and reward_points>0)then perform public.group_wallet_lock(new_id);end if;end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-activity-page:'||p_page_id,0));
  req:=(p_input->>'requestId')::uuid;if req is null then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  payload:=jsonb_build_object('pageId',p_page_id,'itemId',p_item_id,'subId',p_sub_id,'input',p_input);
  select *into prior from public.group_activity_receipts where actor_id=p_actor and request_id=req;
  if found then if prior.operation<>p_operation or prior.payload<>payload then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;return prior.response;end if;
 end if;
 page_limit:=least(greatest(coalesce((p_input->>'limit')::integer,30),1),100);
 if p_operation like'event-%'or p_operation in('event','official-submit','official-review')then
  if p_item_id is not null then select *into e from public.group_events where id=p_item_id and page_id=p_page_id for update;if not found or(e.state='draft'and not manager)then raise exception 'GROUP_ACTIVITY_NOT_FOUND';end if;end if;
 end if;
 if p_operation like'mission-%'or p_operation='mission'then
  if p_item_id is not null then select *into m from public.group_missions where id=p_item_id and page_id=p_page_id for update;if not found or(m.state='draft'and not manager)then raise exception 'GROUP_ACTIVITY_NOT_FOUND';end if;end if;
 end if;
 case p_operation
 when 'activities'then
  result:=jsonb_build_object('certificationHref',case when g.kind='fan'then '/'||(select slug from public.celebrities where id=g.celebrity_id)||'?tab=certifications'end,'missions',coalesce((select jsonb_agg(public.group_mission_json(id,p_actor)order by created_at desc,id)from(select *from public.group_missions where page_id=g.id and(state='published'or manager)order by created_at desc,id limit page_limit)x),'[]'),'events',coalesce((select jsonb_agg(public.group_event_json(id,p_actor)order by starts_at,id)from(select *from public.group_events where page_id=g.id and(state<>'draft'or manager)order by starts_at,id limit page_limit)x),'[]'));
 when 'events'then result:=jsonb_build_object('events',coalesce((select jsonb_agg(public.group_event_json(id,p_actor)order by starts_at,id)from(select *from public.group_events where page_id=g.id and(state<>'draft'or manager)and((p_input->>'cursor')is null or id>(p_input->>'cursor')::uuid)order by id limit page_limit)x),'[]'),'canManage',manager);
 when 'event'then
  select *into r from public.group_event_registrations where event_id=e.id and app_user_id=p_actor;
  result:=jsonb_build_object('event',public.group_event_json(e.id,p_actor),'participation',jsonb_build_object('status',coalesce(r.status,'none'),'ticketId',case when r.status='confirmed'then r.id end,'checkedInAt',r.checked_in_at),'canApply',role is not null and e.state='published'and clock_timestamp()>=e.opens_at and clock_timestamp()<e.closes_at and coalesce(r.status,'none')in('none','cancelled','rejected'),'canReview',role is not null and r.checked_in_at is not null and clock_timestamp()>=e.ends_at,'canManage',manager);
 when 'event-save'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if p_item_id is null then
   insert into public.group_events(page_id,title,description,image_url,starts_at,ends_at,opens_at,closes_at,location,capacity,requires_approval,state,created_by)values(g.id,p_input->>'title',p_input->>'description',p_input->>'imageUrl',(p_input->>'startsAt')::timestamptz,(p_input->>'endsAt')::timestamptz,(p_input->>'opensAt')::timestamptz,(p_input->>'closesAt')::timestamptz,p_input->>'location',(p_input->>'capacity')::integer,(p_input->>'requiresApproval')::boolean,p_input->>'state',p_actor)returning *into e;
  else
   if e.revision is distinct from(p_input->>'expectedRevision')::integer then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
   if exists(select 1 from public.group_event_registrations where event_id=e.id)and((p_input->>'startsAt')::timestamptz<>e.starts_at or(p_input->>'endsAt')::timestamptz<>e.ends_at or(p_input->>'requiresApproval')::boolean<>e.requires_approval)then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
   select count(*)into count_confirmed from public.group_event_registrations where event_id=e.id and status='confirmed';
   if(p_input->>'capacity')::integer<count_confirmed then raise exception 'GROUP_ACTIVITY_CAPACITY';end if;
   update public.group_events set title=p_input->>'title',description=p_input->>'description',image_url=p_input->>'imageUrl',starts_at=(p_input->>'startsAt')::timestamptz,ends_at=(p_input->>'endsAt')::timestamptz,opens_at=(p_input->>'opensAt')::timestamptz,closes_at=(p_input->>'closesAt')::timestamptz,location=p_input->>'location',capacity=(p_input->>'capacity')::integer,requires_approval=(p_input->>'requiresApproval')::boolean,state=p_input->>'state',revision=revision+1,official_revision=null where id=e.id returning *into e;
  end if;result:=jsonb_build_object('event',public.group_event_json(e.id,p_actor));
 when 'event-apply'then
  if role is null then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if e.state<>'published'or clock_timestamp()<e.opens_at or clock_timestamp()>=e.closes_at then raise exception 'GROUP_ACTIVITY_CLOSED';end if;
  select *into r from public.group_event_registrations where event_id=e.id and app_user_id=p_actor;
  if r.id is not null and r.status in('pending','confirmed')then result:=jsonb_build_object('status',r.status,'eventId',e.id);
  else
   select count(*)into count_confirmed from public.group_event_registrations where event_id=e.id and status='confirmed';
   if not e.requires_approval and e.capacity is not null and count_confirmed>=e.capacity then raise exception 'GROUP_ACTIVITY_CAPACITY';end if;
   insert into public.group_event_registrations(event_id,app_user_id,status)values(e.id,p_actor,case when e.requires_approval then'pending'else'confirmed'end)on conflict(event_id,app_user_id)do update set status=excluded.status,ticket_token=extensions.gen_random_bytes(32),checked_in_at=null,checked_in_by=null returning *into r;
   result:=jsonb_build_object('status',r.status,'eventId',e.id);
  end if;
 when 'event-cancel'then
  select *into r from public.group_event_registrations where event_id=e.id and app_user_id=p_actor for update;
  if not found or r.checked_in_at is not null then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  update public.group_event_registrations set status='cancelled'where id=r.id;result:=jsonb_build_object('status','cancelled','eventId',e.id);
 when 'event-participants'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  result:=jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'appUserId',app_user_id,'nickname',coalesce(nullif(btrim((select nickname from public.user_profiles where app_user_id=x.app_user_id)),''),'회원'),'avatarUrl',public.public_fan_avatar_url(app_user_id),'status',status,'checkedInAt',checked_in_at)order by created_at,id)from(select *from public.group_event_registrations where event_id=e.id and((p_input->>'cursor')is null or id>(p_input->>'cursor')::uuid)order by id limit page_limit)x),'[]'));
 when 'event-review-participant'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  select *into r from public.group_event_registrations where event_id=e.id and id=p_sub_id for update;
  if not found or r.status<>'pending'or e.state<>'published'then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  select count(*)into count_confirmed from public.group_event_registrations where event_id=e.id and status='confirmed';
  if p_input->>'action'='confirm'and e.capacity is not null and count_confirmed>=e.capacity then raise exception 'GROUP_ACTIVITY_CAPACITY';end if;
  update public.group_event_registrations set status=case when p_input->>'action'='confirm'then'confirmed'else'rejected'end where id=r.id returning *into r;
  result:=jsonb_build_object('status',r.status,'eventId',e.id);
 when 'event-ticket'then
  if role is null then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  select *into r from public.group_event_registrations where event_id=e.id and app_user_id=p_actor and status='confirmed';
  if not found or e.state in('cancelled','draft')then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  result:=jsonb_build_object('qrPayload','kyaa-event:'||r.id::text||':'||encode(r.ticket_token,'hex'),'status',case when r.checked_in_at is null then'valid'else'checked_in'end);
 when 'event-check-in'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if e.state<>'published'or clock_timestamp()<e.starts_at or clock_timestamp()>=e.ends_at then raise exception 'GROUP_ACTIVITY_CLOSED';end if;
  qr_parts:=string_to_array(p_input->>'qrPayload',':');
  select *into r from public.group_event_registrations where event_id=e.id and id=qr_parts[2]::uuid and encode(ticket_token,'hex')=qr_parts[3]and status='confirmed'for update;
  if not found or not exists(select 1 from public.group_memberships where page_id=g.id and app_user_id=r.app_user_id)then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if r.checked_in_at is null then update public.group_event_registrations set checked_in_at=clock_timestamp(),checked_in_by=p_actor where id=r.id returning *into r;end if;
  result:=jsonb_build_object('status','checked_in','registrationId',r.id,'checkedInAt',r.checked_in_at);
 when 'event-review-write'then
  select *into r from public.group_event_registrations where event_id=e.id and app_user_id=p_actor and status='confirmed'for update;
  if role is null or not found or r.checked_in_at is null or clock_timestamp()<e.ends_at or e.state='cancelled'then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  update public.group_event_registrations set review_body=p_input->>'body',reviewed_at=clock_timestamp()where id=r.id;result:=jsonb_build_object('status','saved','eventId',e.id);
 when 'official-submit'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  insert into public.group_official_event_applications(event_id,event_revision,applicant_id,description,source_url)values(e.id,e.revision,p_actor,p_input->>'description',p_input->>'sourceUrl')returning *into a;
  result:=jsonb_build_object('id',a.id,'status',a.status,'eventId',e.id);
 when 'admin-official-applications'then
  result:=jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)order by created_at,id)from(select application_row.id,application_row.event_id,application_row.event_revision,application_row.applicant_id,application_row.description,application_row.source_url,application_row.status,application_row.reason,application_row.created_at,event_row.page_id,event_row.title as event_title,gp.name as page_name from public.group_official_event_applications application_row join public.group_events event_row on event_row.id=application_row.event_id join public.group_pages gp on gp.id=event_row.page_id where((p_input->>'cursor')is null or application_row.id>(p_input->>'cursor')::uuid)order by application_row.id limit page_limit)x),'[]'));
 when 'official-review'then
  select *into a from public.group_official_event_applications where id=p_sub_id and event_id=e.id for update;
  if not found or a.status<>'submitted'or a.event_revision<>e.revision then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  if p_input->>'action'<>'approve'and length(btrim(coalesce(p_input->>'reason','')))=0 then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  update public.group_official_event_applications set status=case p_input->>'action'when'approve'then'approved'when'reject'then'rejected'else'changes_requested'end,reason=p_input->>'reason',reviewed_by=p_admin_id,reviewed_at=clock_timestamp()where id=a.id returning *into a;
  if a.status='approved'then update public.group_events set official_revision=revision where id=e.id;end if;result:=jsonb_build_object('id',a.id,'status',a.status,'eventId',e.id);
 when 'collections'then
  result:=jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'imageUrl',image_url,'externalUrl',external_url,'status',status,'revision',revision)order by created_at desc,id)from(select *from public.group_collections where page_id=g.id and(status<>'hidden'or manager)and((p_input->>'cursor')is null or id>(p_input->>'cursor')::uuid)order by id limit page_limit)x),'[]'),'canManage',manager);
 when 'collection-save'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if p_item_id is null then insert into public.group_collections(page_id,title,image_url,external_url,status)values(g.id,p_input->>'title',p_input->>'imageUrl',p_input->>'externalUrl',p_input->>'status')returning *into c;
  else update public.group_collections set title=p_input->>'title',image_url=p_input->>'imageUrl',external_url=p_input->>'externalUrl',status=p_input->>'status',revision=revision+1 where id=p_item_id and page_id=g.id and revision=(p_input->>'expectedRevision')::integer returning *into c;if not found then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;end if;
  result:=jsonb_build_object('id',c.id,'revision',c.revision,'status',c.status);
 when 'missions'then result:=jsonb_build_object('missions',coalesce((select jsonb_agg(public.group_mission_json(id,p_actor)order by created_at desc,id)from(select *from public.group_missions where page_id=g.id and(state='published'or manager)and((p_input->>'cursor')is null or id>(p_input->>'cursor')::uuid)order by id limit page_limit)x),'[]'),'canManage',manager);
 when 'mission'then
  select *into s from public.group_mission_submissions where mission_id=m.id and app_user_id=p_actor;
  result:=jsonb_build_object('mission',public.group_mission_json(m.id,p_actor),'submission',case when s.id is null then null else jsonb_build_object('id',s.id,'body',s.body,'status',s.status,'reason',s.reason,'rewardPoints',s.reward_points)end,'canSubmit',role is not null and m.state='published'and coalesce(s.status,'none')in('none','rejected'),'canReview',manager);
 when 'admin-missions'then
  result:=jsonb_build_object('items',coalesce((select jsonb_agg(public.group_mission_json(x.id,p_actor)||jsonb_build_object('pageId',x.page_id,'pageName',x.page_name,'budgetPoints',x.reward_budget,'submissionCount',(select count(*)from public.group_mission_submissions where mission_id=x.id))order by x.id)from(select mission_row.*,gp.name as page_name from public.group_missions mission_row join public.group_pages gp on gp.id=mission_row.page_id where((p_input->>'cursor')is null or mission_row.id>(p_input->>'cursor')::uuid)order by mission_row.id limit page_limit)x),'[]'));
 when 'mission-save'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if p_item_id is null then insert into public.group_missions(page_id,title,instructions,image_url,state)values(g.id,p_input->>'title',p_input->>'instructions',p_input->>'imageUrl',p_input->>'state')returning *into m;
  else update public.group_missions set title=p_input->>'title',instructions=p_input->>'instructions',image_url=p_input->>'imageUrl',state=p_input->>'state',revision=revision+1 where id=m.id and revision=(p_input->>'expectedRevision')::integer returning *into m;if not found then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;end if;result:=jsonb_build_object('mission',public.group_mission_json(m.id,p_actor));
 when 'mission-reward-policy'then
  if exists(select 1 from public.group_mission_submissions where mission_id=m.id)then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  update public.group_missions set reward_points=(p_input->>'rewardPoints')::integer,reward_budget=(p_input->>'budgetPoints')::bigint,reward_approved_by=p_admin_id,revision=revision+1 where id=m.id returning *into m;result:=jsonb_build_object('mission',public.group_mission_json(m.id,p_actor));
 when 'mission-submit'then
  if role is null then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if m.state<>'published'then raise exception 'GROUP_ACTIVITY_CLOSED';end if;
  select *into s from public.group_mission_submissions where mission_id=m.id and app_user_id=p_actor for update;
  if s.id is not null and s.status<>'rejected'then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  insert into public.group_mission_submissions(mission_id,app_user_id,body)values(m.id,p_actor,p_input->>'body')on conflict(mission_id,app_user_id)do update set body=excluded.body,status='pending',reason=null,reviewed_at=null,reviewed_by=null returning *into s;
  result:=jsonb_build_object('id',s.id,'status',s.status);
 when 'mission-submissions'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  result:=jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'appUserId',app_user_id,'nickname',coalesce(nullif(btrim((select nickname from public.user_profiles where app_user_id=x.app_user_id)),''),'회원'),'avatarUrl',public.public_fan_avatar_url(app_user_id),'body',body,'status',status,'reason',reason,'rewardPoints',reward_points)order by created_at,id)from(select *from public.group_mission_submissions where mission_id=m.id and((p_input->>'cursor')is null or id>(p_input->>'cursor')::uuid)order by id limit page_limit)x),'[]'));
 when 'mission-review'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  select *into s from public.group_mission_submissions where id=p_sub_id and mission_id=m.id for update;
  if not found or s.status<>'pending'then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  if p_input->>'action'='reject'and length(btrim(coalesce(p_input->>'reason','')))=0 then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  if p_input->>'action'='approve'and m.reward_points>0 then
   select coalesce(sum(reward_points),0)into spent from public.group_mission_submissions where mission_id=m.id and status='completed';
   if spent+m.reward_points>m.reward_budget then raise exception 'GROUP_ACTIVITY_CAPACITY';end if;
   entry:=public.group_wallet_post(s.app_user_id,'fan_point',m.reward_points,'group_mission',s.id);
  end if;
  update public.group_mission_submissions set status=case when p_input->>'action'='approve'then'completed'else'rejected'end,reason=p_input->>'reason',reviewed_by=p_actor,reviewed_at=clock_timestamp(),reward_points=case when p_input->>'action'='approve'then m.reward_points else 0 end,reward_ledger_id=entry where id=s.id returning *into s;
  result:=jsonb_build_object('id',s.id,'status',s.status,'rewardPoints',s.reward_points);
 else raise exception 'GROUP_ACTIVITY_INVALID';
 end case;
 if p_operation in('events','collections','missions','event-participants','mission-submissions','admin-official-applications','admin-missions')then result:=result||jsonb_build_object('nextCursor',public.group_activity_next_cursor(p_operation,case when p_operation in('event-participants','mission-submissions')then p_item_id else p_page_id end,manager,page_limit,(p_input->>'cursor')::uuid));end if;
 if writing then insert into public.group_activity_receipts(actor_id,request_id,operation,payload,response)values(p_actor,req,p_operation,payload,result);end if;
 return result;
end $$;
do $$declare t text;f record;begin
 foreach t in array array['group_events','group_event_registrations','group_official_event_applications','group_collections','group_missions','group_mission_submissions','group_activity_receipts']loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
 end loop;
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and proname in('group_event_json','group_mission_json','group_activity_next_cursor','group_activities_dispatch','group_wallet_refund_lock','group_wallet_refund')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);if f.proname='group_activities_dispatch'then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
commit;

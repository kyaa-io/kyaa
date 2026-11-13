-- Enum values must commit before any notification row can use them.
alter type public.notification_kind add value if not exists 'group_raffle_result';

begin;
alter table public.group_raffles
 add column entry_mode text not null default 'ticket' check(entry_mode in ('ticket','free')),
 add column conditions jsonb not null default '[]'::jsonb check(jsonb_typeof(conditions)='array' and jsonb_array_length(conditions)<=3),
 add column approval_status text not null default 'approved' check(approval_status in ('pending','approved','rejected')),
 add column results_public boolean not null default true;
alter table public.group_raffle_entries alter column ledger_id drop not null;
create unique index group_raffle_free_once on public.group_raffle_entries(raffle_id,app_user_id) where ledger_id is null;
-- Validate the persisted contract too: direct service-role RPCs cannot bypass HTTP validation.
create function public.group_raffle_conditions_valid(p_conditions jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare c jsonb; cap integer;
begin
 if p_conditions is null or jsonb_typeof(p_conditions)<>'array' then return false; end if;
 if jsonb_array_length(p_conditions)>3 then return false; end if;
 for c in select value from jsonb_array_elements(p_conditions) loop
  if jsonb_typeof(c)<>'object' or (select count(*) from jsonb_object_keys(c))<>2
    or not(c ? 'type' and c ? 'min') or jsonb_typeof(c->'min')<>'number'
    or (c->>'min')!~'^[0-9]+$' then return false; end if;
  cap:=case c->>'type' when 'attendance_days' then 30 when 'mission_approved' then 10 when 'post_or_comment' then 50 else 0 end;
  if (c->>'min')::numeric not between 1 and cap then return false; end if;
 end loop;
 return true;
end $$;
alter table public.group_raffles add constraint group_raffle_conditions_valid check(public.group_raffle_conditions_valid(conditions));
alter table public.group_raffles add constraint group_raffle_finite_times check(isfinite(opens_at) and isfinite(closes_at));
alter table public.group_raffles add constraint group_raffle_free_limit check(entry_mode<>'free' or per_user_limit=1);
create function public.group_raffle_condition_progress(p_page uuid,p_user uuid,p_conditions jsonb,p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c jsonb; n bigint; celebrity uuid; result jsonb:='[]'::jsonb;
begin
 if not public.group_raffle_conditions_valid(p_conditions) then raise exception 'GROUP_RAFFLE_INVALID'; end if;
 select celebrity_id into celebrity from public.group_pages where id=p_page;
 for c in select value from jsonb_array_elements(p_conditions) loop
  n:=0;
  if p_since is not null then
   if c->>'type'='attendance_days' then
    if celebrity is null then select count(*) into n from public.group_visits where page_id=p_page and app_user_id=p_user and day >= (p_since at time zone 'Asia/Seoul')::date;
    else select count(*) into n from public.group_creator_attendance where celebrity_id=celebrity and app_user_id=p_user and attendance_date >= (p_since at time zone 'Asia/Seoul')::date; end if;
   elsif c->>'type'='mission_approved' then
    select count(*) into n from public.group_mission_submissions s join public.group_missions m on m.id=s.mission_id where m.page_id=p_page and s.app_user_id=p_user and s.status='completed' and s.created_at>=p_since;
   else
    select count(*) into n from (select id from public.group_posts where page_id=p_page and author_id=p_user and removed_at is null and created_at>=p_since union all select c.id from public.group_comments c join public.group_posts p on p.id=c.post_id where p.page_id=p_page and c.author_id=p_user and c.removed_at is null and p.removed_at is null and c.created_at>=p_since) activities;
   end if;
  end if;
  result:=result||jsonb_build_array(c||jsonb_build_object('current',n,'met',n >= (c->>'min')::integer));
 end loop;
 return result;
end $$;
create function public.group_raffle_conditions_met(p_page uuid,p_user uuid,p_conditions jsonb,p_since timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select p_since is not null and not exists(select 1 from jsonb_array_elements(public.group_raffle_condition_progress(p_page,p_user,p_conditions,p_since)) c where not (c->>'met')::boolean)
$$;
-- The gift wrapper's existing scoped list remains the source of public display data.
create or replace function public.group_raffle_list(p_page_id uuid,p_actor uuid default null)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('raffles',coalesce(jsonb_agg(item||jsonb_build_object('giftSnapshot',r.gift_snapshot,'entryMode',r.entry_mode,'conditions',r.conditions,'approvalStatus',r.approval_status,'opensAt',r.opens_at,'attendanceSource',case when exists(select 1 from public.group_pages g where g.id=r.page_id and g.celebrity_id is not null)then 'attendance'else 'visit'end)order by n),'[]'::jsonb))
 from jsonb_array_elements(public.group_raffle_list_before_gifts(p_page_id,p_actor)->'raffles')with ordinality x(item,n)join public.group_raffles r on r.id=(item->>'id')::uuid
$$;
create or replace function public.group_raffle_dispatch_before_gifts(p_operation text,p_actor uuid,p_page_id uuid,p_id uuid default null,p_input jsonb default '{}',p_admin_id uuid default null)returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.group_raffles;w public.group_raffle_winners;old public.group_action_receipts;v_key uuid;result jsonb;new_id uuid;entry_id uuid;amount integer;total bigint;manager boolean;entry record;begin
 if not public.group_wallet_enabled()then raise exception 'GROUP_WALLET_UNAVAILABLE';end if;
 if p_admin_id is not null then perform public.assert_active_admin(p_actor,p_admin_id,p_operation not in('list','detail','recipients'));end if;
 if not exists(select 1 from public.group_pages where id=p_page_id and status='published') or (p_admin_id is null and not public.group_scope_visible(p_actor,p_page_id))then raise exception 'GROUP_RAFFLE_NOT_FOUND';end if;
 if p_operation='list'then return public.group_raffle_list(p_page_id,p_actor);end if;
 if p_operation='cancel'then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-wallet:campaign-barrier',0));
  perform public.group_wallet_refund_lock(e.owner)from(select p_actor owner union select app_user_id from public.group_raffle_entries where raffle_id=p_id order by owner)e;
  perform public.group_wallet_lock(p_actor);
 else perform public.group_wallet_lock(p_actor,p_operation not in('detail','recipients'));end if;
 -- Read-only detail must remain recoverable while writes are fenced.
 if p_operation='detail' then null;elsif exists(select 1 from public.group_wallet_release where write_fenced)then raise exception 'GROUP_WALLET_WRITE_FENCED';end if;
 manager:=exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor and role in('owner','manager'));
 if p_admin_id is not null then perform public.assert_active_admin(p_actor,p_admin_id,true);manager:=true;end if;
 if p_operation in('create','cancel','recipients','fulfill')and not manager then raise exception 'GROUP_RAFFLE_FORBIDDEN';end if;
 if p_operation not in('detail','recipients')then
  v_key:=(p_input->>'requestId')::uuid;if v_key is null then raise exception 'GROUP_RAFFLE_INVALID';end if;
  select *into old from public.group_action_receipts where actor_id=p_actor and request_id=v_key;
  if found then if old.operation<>'raffle:'||p_operation or old.payload<>jsonb_build_object('page',p_page_id,'id',p_id,'inputHash',encode(extensions.digest(p_input::text,'sha256'),'hex'))then raise exception 'GROUP_RAFFLE_CONFLICT';end if;return old.response;end if;
 end if;
 if p_operation='create'then
  if not public.group_raffle_conditions_valid(coalesce(p_input->'conditions','[]'::jsonb)) or coalesce(p_input->>'entryMode','ticket') not in('ticket','free') or not isfinite(coalesce((p_input->>'opensAt')::timestamptz,clock_timestamp())) or not isfinite((p_input->>'closesAt')::timestamptz) or (p_input->>'closesAt')::timestamptz<=coalesce((p_input->>'opensAt')::timestamptz,clock_timestamp()) then raise exception 'GROUP_RAFFLE_INVALID'; end if;
  insert into public.group_raffles(page_id,title,summary,image_url,winner_quantity,per_user_limit,opens_at,entry_mode,conditions,closes_at,submission_days,fulfillment_method,created_by)
  values(p_page_id,p_input->>'title',coalesce(p_input->>'summary',''),p_input->>'imageUrl',(p_input->>'winnerQuantity')::integer,case when p_input->>'entryMode'='free' then 1 else (p_input->>'perUserLimit')::integer end,coalesce((p_input->>'opensAt')::timestamptz,clock_timestamp()),coalesce(p_input->>'entryMode','ticket'),coalesce(p_input->'conditions','[]'::jsonb),(p_input->>'closesAt')::timestamptz,(p_input->>'submissionDays')::integer,(p_input->>'fulfillmentMethod')::public.benefit_fulfillment_method,p_actor)returning id into new_id;
  result:=jsonb_build_object('id',new_id);
 else
  select *into r from public.group_raffles where id=p_id and page_id=p_page_id for update;
  if not found then raise exception 'GROUP_RAFFLE_NOT_FOUND';end if;
  case p_operation
  when 'detail'then
   return jsonb_build_object('raffle',(select x from jsonb_array_elements(public.group_raffle_list(p_page_id,p_actor)->'raffles')x where x->>'id'=r.id::text),'enteredTickets',(select coalesce(sum(e.amount),0)from public.group_raffle_entries e where raffle_id=r.id and app_user_id=p_actor),'winner',(select jsonb_build_object('id',w0.id,'status',w0.status,'submitBy',w0.submit_by)from public.group_raffle_winners w0 where raffle_id=r.id and app_user_id=p_actor),'consentVersion',(select version from public.benefit_recipient_consent_versions where active and effective_at<=clock_timestamp()order by effective_at desc limit 1),'consentDocuments',(select documents from public.benefit_recipient_consent_versions where active and effective_at<=clock_timestamp() and public.mobile_benefit_consent_documents_complete(documents) order by effective_at desc limit 1),'conditionProgress',public.group_raffle_condition_progress(p_page_id,p_actor,r.conditions,(select joined_at from public.group_memberships where page_id=p_page_id and app_user_id=p_actor)),'canEnter',r.approval_status='approved' and r.cancelled_at is null and r.drawn_at is null and r.opens_at<=clock_timestamp() and r.closes_at>clock_timestamp() and (select coalesce(sum(amount),0) from public.group_raffle_entries where raffle_id=r.id and app_user_id=p_actor)<r.per_user_limit and public.group_raffle_conditions_met(p_page_id,p_actor,r.conditions,(select joined_at from public.group_memberships where page_id=p_page_id and app_user_id=p_actor)),'winnersMasked',case when r.results_public and r.drawn_at is not null and exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor) then coalesce((select jsonb_agg(left(coalesce(u.nickname,'팬'),1)||'*') from public.group_raffle_winners w left join public.user_profiles u on u.app_user_id=w.app_user_id where w.raffle_id=r.id and w.status<>'expired'),'[]'::jsonb) else '[]'::jsonb end,'canManage',manager,'member',exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor));
  when 'enter'then
   if not exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor)then raise exception 'GROUP_RAFFLE_MEMBERS_REQUIRED';end if;
   if r.approval_status<>'approved' then raise exception 'GROUP_RAFFLE_CLOSED';end if;
   if r.cancelled_at is not null or r.drawn_at is not null or r.closes_at<=clock_timestamp()or r.opens_at>clock_timestamp()then raise exception 'GROUP_RAFFLE_CLOSED';end if;
   if not public.group_raffle_conditions_met(p_page_id,p_actor,r.conditions,(select joined_at from public.group_memberships where page_id=p_page_id and app_user_id=p_actor)) then raise exception 'GROUP_RAFFLE_CONDITIONS_REQUIRED';end if;
   amount:=(p_input->>'amount')::integer;
   select coalesce(sum(e.amount),0)into total from public.group_raffle_entries e where raffle_id=r.id and app_user_id=p_actor;
   if amount is null or amount<1 or amount+total>r.per_user_limit then raise exception 'GROUP_RAFFLE_LIMIT';end if;
   if r.entry_mode='free' and amount<>1 then raise exception 'GROUP_RAFFLE_LIMIT';end if;
   perform public.group_wallet_assert_new_request(p_actor,v_key);
   if r.entry_mode='ticket' then entry_id:=public.group_wallet_post(p_actor,'ticket',-amount::bigint,'group_raffle_entry',v_key);else entry_id:=null;end if;
   insert into public.group_raffle_entries(raffle_id,app_user_id,request_key,amount,ledger_id)values(r.id,p_actor,v_key,amount,entry_id)returning id into new_id;
   result:=jsonb_build_object('id',new_id,'amount',amount,'enteredTickets',total+amount,'tickets',public.group_wallet_balance(p_actor,'ticket'));
  when 'cancel'then
   if r.drawn_at is not null or r.cancelled_at is not null then raise exception 'GROUP_RAFFLE_CLOSED';end if;
   for entry in select *from public.group_raffle_entries where raffle_id=r.id and ledger_id is not null order by app_user_id,id loop
    perform public.group_wallet_refund(entry.app_user_id,entry.amount::bigint,entry.id);
   end loop;
   update public.group_raffles set cancelled_at=clock_timestamp()where id=r.id;result:=jsonb_build_object('cancelled',true);
  when 'recipient'then
   select *into w from public.group_raffle_winners where raffle_id=r.id and app_user_id=p_actor for update;
   if not found or w.status<>'information_required'or w.submit_by<=clock_timestamp()then raise exception 'GROUP_RAFFLE_CLOSED';end if;
   if (p_input->>'consented')::boolean is distinct from true or not exists(select 1 from public.benefit_recipient_consent_versions where active and version=p_input->>'consentVersion'and effective_at<=clock_timestamp() and public.mobile_benefit_consent_documents_complete(documents))then raise exception 'GROUP_RAFFLE_INVALID';end if;
   if r.fulfillment_method='physical_shipping'and length(btrim(coalesce(p_input->>'address','')))<5 then raise exception 'GROUP_RAFFLE_INVALID';end if;
   insert into public.group_raffle_recipients(winner_id,name,phone,address,consent_version)values(w.id,p_input->>'name',p_input->>'phone',p_input->>'address',p_input->>'consentVersion');
   update public.group_raffle_winners set status='submitted'where id=w.id;result:=jsonb_build_object('saved',true);
  when 'recipients'then
   insert into public.group_raffle_access_audit(raffle_id,actor_id)values(r.id,p_actor);
   return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',w0.id,'status',w0.status,'name',p.name,'phone',p.phone,'address',p.address))from public.group_raffle_winners w0 left join public.group_raffle_recipients p on p.winner_id=w0.id where raffle_id=r.id),'[]'::jsonb));
  when 'fulfill'then
   update public.group_raffle_winners set status='fulfilled',fulfilled_at=clock_timestamp()where id=(p_input->>'winnerId')::uuid and raffle_id=r.id and status='submitted';
   if not found then raise exception 'GROUP_RAFFLE_CONFLICT';end if;result:=jsonb_build_object('saved',true);
  else raise exception 'GROUP_RAFFLE_INVALID';end case;
 end if;
 insert into public.group_action_receipts(actor_id,request_id,operation,payload,response)values(p_actor,v_key,'raffle:'||p_operation,jsonb_build_object('page',p_page_id,'id',p_id,'inputHash',encode(extensions.digest(p_input::text,'sha256'),'hex')),result);
 return result;
end $$;
create function public.group_raffle_entry_mode_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.group_raffles;
begin
 select * into strict r from public.group_raffles where id=new.raffle_id for update;
 if (r.entry_mode='free' and (new.ledger_id is not null or new.amount<>1)) or (r.entry_mode='ticket' and new.ledger_id is null) then raise exception 'GROUP_RAFFLE_INVALID'; end if;
 return new;
end $$;
create trigger group_raffle_entry_mode_guard before insert on public.group_raffle_entries for each row execute function public.group_raffle_entry_mode_guard();
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('public.group_raffle_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 if position('gift_snapshot)values' in definition)=0 then raise exception 'GROUP_GIFT_RAFFLE_CONTRACT_CHANGED'; end if;
 definition:=replace(definition,'gift_snapshot)values','gift_snapshot,entry_mode,conditions,opens_at)values');
 definition:=replace(definition,'g.image_asset_id,snapshot)returning','g.image_asset_id,snapshot,coalesce(p_input->>''entryMode'',''ticket''),coalesce(p_input->''conditions'',''[]''::jsonb),coalesce((p_input->>''opensAt'')::timestamptz,clock_timestamp()))returning');
 definition:=replace(definition,' insert into public.group_raffles(',' if (not public.group_raffle_conditions_valid(coalesce(p_input->''conditions'',''[]''::jsonb)) or coalesce(p_input->>''entryMode'',''ticket'') not in(''ticket'',''free'') or not isfinite(coalesce((p_input->>''opensAt'')::timestamptz,clock_timestamp())) or not isfinite((p_input->>''closesAt'')::timestamptz) or (p_input->>''closesAt'')::timestamptz<=coalesce((p_input->>''opensAt'')::timestamptz,clock_timestamp())) then raise exception ''GROUP_RAFFLE_INVALID''; end if;'||chr(10)||' insert into public.group_raffles(');
 definition:=replace(definition,'amount,(p_input->>''perUserLimit'')::integer','amount,case when p_input->>''entryMode''=''free'' then 1 else (p_input->>''perUserLimit'')::integer end');
 execute definition;
end $patch$;
-- Snapshot only the prize name; member identities never enter result notification bodies.
create function public.group_raffle_notify_result() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.drawn_at is null and new.drawn_at is not null and new.approval_status='approved' then
  insert into public.fan_notifications(app_user_id,kind,source_key,scheduled_for,deep_link,payload,web_only)
  select distinct e.app_user_id,'group_raffle_result','group-raffle-result:'||new.id,clock_timestamp(),'/my',
   jsonb_build_object('targetType','group_raffle','targetId',new.id,'revision',1,'prizeName',coalesce(new.gift_snapshot->>'name',new.title)),true
  from public.group_raffle_entries e join public.group_memberships m on m.page_id=new.page_id and m.app_user_id=e.app_user_id
   join public.app_users u on u.id=e.app_user_id and u.status='active'
  where e.raffle_id=new.id and public.group_scope_visible(e.app_user_id,new.page_id)
  on conflict(app_user_id,source_key)do nothing;
 end if;
 return new;
end $$;
create trigger group_raffle_notify_result after update of drawn_at on public.group_raffles for each row execute function public.group_raffle_notify_result();
create or replace function public.group_raffle_notify_winner()returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.fan_notifications(app_user_id,kind,source_key,scheduled_for,deep_link,payload,web_only)
 select new.app_user_id,'group_raffle_won','group-raffle-winner:'||new.id,clock_timestamp(),'/my',
  jsonb_build_object('targetType','group_raffle_winner','targetId',new.id,'revision',1,'prizeName',coalesce(r.gift_snapshot->>'name',r.title)),true
 from public.group_raffles r join public.group_memberships m on m.page_id=r.page_id and m.app_user_id=new.app_user_id
  join public.app_users u on u.id=new.app_user_id and u.status='active'
 where r.id=new.raffle_id and public.group_scope_visible(new.app_user_id,r.page_id)
 on conflict(app_user_id,source_key)do nothing;
 return new;
end $$;
do $$declare previous text; was_valid boolean; definition text;
begin
 select pg_get_expr(conbin,conrelid),convalidated into strict previous,was_valid from pg_constraint where conrelid='public.fan_notifications'::regclass and conname='fan_notifications_source_shape';
 alter table public.fan_notifications drop constraint fan_notifications_source_shape;
 execute 'alter table public.fan_notifications add constraint fan_notifications_source_shape check (('||previous||') or (kind::text=''group_raffle_result'' and live_event_id is null and benefit_id is null and web_only)) not valid';
 if was_valid then alter table public.fan_notifications validate constraint fan_notifications_source_shape; end if;
 -- Preserve OIDs and the authority/ACL of the existing notification entry points.
 definition:=pg_get_functiondef('public.fan_web_notification_kind(text)'::regprocedure);
 definition:=replace(definition,'select p_kind = ''group_notice''','select p_kind = ''group_raffle_result'' or p_kind = ''group_notice''');
 if definition=pg_get_functiondef('public.fan_web_notification_kind(text)'::regprocedure) then raise exception 'GROUP_RAFFLE_NOTIFICATION_CONTRACT_CHANGED'; end if;
 execute definition;
 definition:=pg_get_functiondef('public.process_due_group_raffles()'::regprocedure);
 definition:=replace(definition,'where r.cancelled_at is null and r.closes_at','where r.approval_status=''approved'' and r.cancelled_at is null and r.closes_at');
 execute definition;
 definition:=pg_get_functiondef('public.group_raffle_advance(uuid)'::regprocedure);
 definition:=replace(definition,'if not found or r.cancelled_at','if not found or r.approval_status<>''approved'' or r.cancelled_at');
 execute definition;
end $$;
-- A result link disappears immediately on leaving or losing page visibility.
alter function public.fan_web_notification_path(uuid,uuid) rename to fan_web_notification_path_before_raffle_result;
create function public.fan_web_notification_path(p_owner uuid,p_notification uuid)returns text language plpgsql stable security definer set search_path='' as $$
declare n public.fan_notifications; r public.group_raffles;
begin
 select *into n from public.fan_notifications where id=p_notification and app_user_id=p_owner and superseded_at is null and scheduled_for<=now();
 if not found or n.kind::text<>'group_raffle_result' then return public.fan_web_notification_path_before_raffle_result(p_owner,p_notification);end if;
 if coalesce(n.payload->>'targetId','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null;end if;
 select *into r from public.group_raffles where id=(n.payload->>'targetId')::uuid and drawn_at is not null and approval_status='approved';
 if not found or not exists(select 1 from public.app_users where id=p_owner and status='active') or not exists(select 1 from public.group_pages where id=r.page_id and status='published') or not exists(select 1 from public.group_memberships where page_id=r.page_id and app_user_id=p_owner) or not public.group_scope_visible(p_owner,r.page_id) or not public.group_notification_row_allowed(n) then return null;end if;
 return '/pages/groups/'||r.page_id||'/raffles/'||r.id;
end $$;
revoke all on function public.group_raffle_notify_result(),public.group_raffle_notify_winner(),public.fan_web_notification_path_before_raffle_result(uuid,uuid),public.fan_web_notification_path(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.fan_web_notification_path(uuid,uuid) to service_role;
-- Default function EXECUTE is public; internal security-definer helpers are never client APIs.
revoke all on function public.group_raffle_condition_progress(uuid,uuid,jsonb,timestamptz),public.group_raffle_conditions_met(uuid,uuid,jsonb,timestamptz),public.group_raffle_entry_mode_guard(),public.group_raffle_conditions_valid(jsonb),public.group_raffle_dispatch_before_gifts(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
-- Persisted CHECK constraints and existing wrapper owners need the validation helper.
grant execute on function public.group_raffle_conditions_valid(jsonb) to service_role;
-- Replaced functions keep their owners; those owners alone may call the new internal helpers.
do $$declare owner_name text;
begin
 for owner_name in select distinct pg_get_userbyid(proowner) from pg_proc where oid=any(array['public.group_raffle_dispatch_before_gifts(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure,'public.group_raffle_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure]) loop
  execute format('grant execute on function public.group_raffle_conditions_valid(jsonb),public.group_raffle_conditions_met(uuid,uuid,jsonb,timestamptz),public.group_raffle_condition_progress(uuid,uuid,jsonb,timestamptz) to %I',owner_name);
 end loop;
end $$;

-- Match the established notification wrapper ownership contract. New internal readers
-- use the notification table's trusted owner, rather than depending on the applying role.
do $$declare owner_name text; helper_owner text; f text; g record;
begin
 select pg_get_userbyid(proowner) into owner_name from pg_proc where oid='public.fan_web_notification_path_before_raffle_result(uuid,uuid)'::regprocedure;
 select pg_get_userbyid(relowner) into helper_owner from pg_class where oid='public.fan_notifications'::regclass;
 if owner_name in('anon','authenticated','service_role') or helper_owner in('anon','authenticated','service_role')then raise exception 'GROUP_RAFFLE_OWNER_GAP';end if;
 execute format('alter function public.fan_web_notification_path(uuid,uuid) owner to %I',owner_name);
 execute format('grant execute on function public.fan_web_notification_path_before_raffle_result(uuid,uuid),public.group_scope_visible(uuid,uuid),public.group_notification_row_allowed(public.fan_notifications) to %I',owner_name);
 for g in select distinct pg_get_userbyid(a.grantee) rolname from pg_proc p,aclexplode(p.proacl)a where p.oid='public.fan_web_notification_path_before_raffle_result(uuid,uuid)'::regprocedure and a.privilege_type='EXECUTE' and a.grantee<>0 loop
  execute format('grant execute on function public.fan_web_notification_path(uuid,uuid) to %I',g.rolname);
 end loop;
 foreach f in array array['group_raffle_conditions_valid(jsonb)','group_raffle_condition_progress(uuid,uuid,jsonb,timestamptz)','group_raffle_conditions_met(uuid,uuid,jsonb,timestamptz)','group_raffle_entry_mode_guard()','group_raffle_notify_result()']loop
  execute format('alter function public.%s owner to %I',f,helper_owner);
 end loop;
 execute format('grant execute on function public.group_scope_visible(uuid,uuid),public.group_raffle_conditions_valid(jsonb),public.group_raffle_condition_progress(uuid,uuid,jsonb,timestamptz) to %I',helper_owner);
 select pg_get_userbyid(proowner)into owner_name from pg_proc where oid='public.group_raffle_notify_winner()'::regprocedure;
 execute format('grant execute on function public.group_scope_visible(uuid,uuid) to %I',owner_name);
end $$;
-- Roles with BYPASSRLS still need table privileges. Other trusted function owners
-- receive policies only for the reads/writes performed by these functions.
do $$declare r record;t text;cmd text;tables text[];
begin
 for r in select distinct o.oid,o.rolname,o.rolsuper,o.rolbypassrls,x.tables from(values
  ('public.group_raffle_condition_progress(uuid,uuid,jsonb,timestamptz)'::regprocedure,array['group_pages:select','group_visits:select','group_creator_attendance:select','group_mission_submissions:select','group_missions:select','group_posts:select','group_comments:select','group_raffles:select']),
  ('public.group_raffle_entry_mode_guard()'::regprocedure,array['group_raffles:select','group_raffles:update']),
  ('public.group_raffle_notify_result()'::regprocedure,array['fan_notifications:select','fan_notifications:insert','group_raffle_entries:select','group_memberships:select','app_users:select']),
  ('public.group_raffle_notify_winner()'::regprocedure,array['fan_notifications:select','fan_notifications:insert','group_raffles:select','group_memberships:select','app_users:select']),
  ('public.fan_web_notification_path(uuid,uuid)'::regprocedure,array['fan_notifications:select','group_raffles:select','group_pages:select','group_memberships:select','app_users:select']))x(sig,tables)
  join pg_proc f on f.oid=x.sig join pg_roles o on o.oid=f.proowner loop
  if r.rolsuper then continue;end if;
  foreach t in array r.tables loop
   cmd:=split_part(t,':',2);t:=split_part(t,':',1);
   execute format('grant %s on table public.%I to %I',cmd,t,r.rolname);
   if not r.rolbypassrls and exists(select 1 from pg_class c where c.oid=('public.'||t)::regclass and c.relrowsecurity and(c.relforcerowsecurity or c.relowner<>r.oid)) and not exists(select 1 from pg_policy p where p.polrelid=('public.'||t)::regclass and r.oid=any(p.polroles)and p.polpermissive and p.polcmd in('*',case cmd when 'select'then'r'when 'update'then'w'else'a'end))then
    execute format('create policy %I on public.%I for %s to %I %s','l6_'||cmd||'_'||r.rolname,t,cmd,r.rolname,case cmd when'select'then'using(true)'when'update'then'using(true) with check(true)'else'with check(true)'end);
   end if;
  end loop;
 end loop;
end $$;

notify pgrst, 'reload schema';
commit;

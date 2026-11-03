begin;
create table public.group_capsule_campaigns (
 id uuid primary key default extensions.gen_random_uuid(),
 name text not null check(length(btrim(name)) between 1 and 100),
 status text not null default 'draft' check(status in('draft','active','paused','closed')),
 blank_weight integer not null check(blank_weight between 0 and 1000000),
 created_by uuid not null references public.admin_allowlist(id),
 request_key uuid not null, create_input jsonb not null, unique(created_by,request_key),
 created_at timestamptz not null default clock_timestamp(), activated_at timestamptz
);
create table public.group_capsule_prizes (
 id uuid primary key default extensions.gen_random_uuid(),
 campaign_id uuid not null references public.group_capsule_campaigns(id),
 name text not null check(length(btrim(name)) between 1 and 100),
 image_url text check(image_url is null or image_url ~ '^https://' or image_url ~ '^/[^/]'),
 weight integer not null check(weight between 1 and 1000000),
 initial_stock integer not null check(initial_stock between 1 and 1000000),
 stock integer not null check(stock between 0 and initial_stock)
);
create table public.group_capsule_receipts (
 owner_id uuid not null references public.app_users(id), request_key uuid not null,
 campaign_id uuid not null references public.group_capsule_campaigns(id),
 draw_count integer not null check(draw_count in(1,10)),
 ledger_id uuid not null unique references public.fan_ticket_ledger(id),
 result jsonb not null, created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,request_key)
);
create table public.group_capsule_fulfillments (
 id uuid primary key default extensions.gen_random_uuid(),
 owner_id uuid not null, request_key uuid not null,
 draw_index integer not null check(draw_index between 1 and 10),
 prize_id uuid not null references public.group_capsule_prizes(id),
 status text not null default 'pending' check(status in('pending','fulfilled')),
 fulfilled_at timestamptz, fulfilled_by uuid references public.admin_allowlist(id),
 unique(owner_id,request_key,draw_index),
 foreign key(owner_id,request_key) references public.group_capsule_receipts(owner_id,request_key) deferrable initially deferred
);
create trigger group_capsule_receipt_immutable before update or delete on public.group_capsule_receipts for each row execute function public.reject_fan_ticket_ledger_mutation();
create trigger group_capsule_receipt_no_truncate before truncate on public.group_capsule_receipts for each statement execute function public.reject_fan_ticket_ledger_mutation();
-- Integer rejection sampling avoids modulo bias for the published million-unit weights.
create function public.group_capsule_roll() returns integer language plpgsql volatile security definer set search_path='' as $$
declare b bytea; n bigint;begin
 loop
  b:=extensions.gen_random_bytes(4);
  n:=get_byte(b,0)::bigint*16777216+get_byte(b,1)::bigint*65536+get_byte(b,2)::bigint*256+get_byte(b,3);
  if n<4294000000 then return (n%1000000)::integer;end if;
 end loop;
end $$;
create function public.group_capsule_dispatch(p_operation text,p_actor uuid,p_campaign uuid default null,p_input jsonb default '{}',p_admin_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.group_capsule_campaigns; prize public.group_capsule_prizes; receipt public.group_capsule_receipts;
 v_request_key uuid; n integer; roll integer; cumulative integer; i integer; new_id uuid; entry uuid; results jsonb:='[]'; result jsonb; input_prize jsonb;
begin
 if not public.group_wallet_enabled() then raise exception 'GROUP_WALLET_UNAVAILABLE';end if;
 if p_operation in('create','activate','pause','close','admin-list','fulfillments','fulfill')then
  perform public.assert_active_admin(p_actor,p_admin_id,p_operation not in('admin-list','fulfillments'));
 end if;
 if p_operation='list' or p_operation='admin-list'then
  with batch as (
   select c0.* from public.group_capsule_campaigns c0
   where (p_operation='admin-list' or c0.status in('active','paused'))
   and (p_input->>'cursor' is null or c0.id>(p_input->>'cursor')::uuid) order by c0.id limit 31
  ), visible as(select * from batch order by id limit 30)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'status',v.status,'blankWeight',v.blank_weight,'weightTotal',1000000,'prizes',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'imageUrl',p.image_url,'weight',p.weight,'stock',p.stock)order by p.id)from public.group_capsule_prizes p where p.campaign_id=v.id),'[]'::jsonb))order by v.id)from visible v),'[]'::jsonb),'nextCursor',case when(select count(*)from batch)>30 then(select id::text from visible order by id desc limit 1)end)into result;return result;
 end if;
 if p_operation='create'then
  v_request_key:=(p_input->>'requestKey')::uuid;
  if v_request_key is null then raise exception 'CAPSULE_INVALID';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('capsule:create:'||p_admin_id||':'||v_request_key,0));
  select * into c from public.group_capsule_campaigns where created_by=p_admin_id and group_capsule_campaigns.request_key=v_request_key;
  if found then if c.create_input<>p_input then raise exception 'CAPSULE_REQUEST_CONFLICT';end if;return jsonb_build_object('id',c.id);end if;
  if jsonb_typeof(p_input->'prizes')<>'array' or jsonb_array_length(p_input->'prizes') not between 1 and 50 then raise exception 'CAPSULE_INVALID';end if;
  insert into public.group_capsule_campaigns(name,blank_weight,created_by,request_key,create_input)values(p_input->>'name',(p_input->>'blankWeight')::integer,p_admin_id,v_request_key,p_input)returning id into new_id;
  for input_prize in select value from jsonb_array_elements(p_input->'prizes')loop
   insert into public.group_capsule_prizes(campaign_id,name,image_url,weight,initial_stock,stock)values(new_id,input_prize->>'name',input_prize->>'imageUrl',(input_prize->>'weight')::integer,(input_prize->>'stock')::integer,(input_prize->>'stock')::integer);
  end loop;
  if (select blank_weight+(select sum(weight)from public.group_capsule_prizes where campaign_id=new_id)from public.group_capsule_campaigns where id=new_id)<>1000000 then raise exception 'CAPSULE_INVALID';end if;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_actor,p_admin_id,'groups.capsule.create','group_capsule',new_id::text,v_request_key,jsonb_build_object('prizes',jsonb_array_length(p_input->'prizes')));
  return jsonb_build_object('id',new_id);
 end if;
 if p_operation in('draw','receipt')then
  perform public.group_wallet_lock(p_actor,p_operation='draw');
  v_request_key:=(p_input->>'requestKey')::uuid;
  if v_request_key is null then raise exception 'CAPSULE_INVALID';end if;
  select * into receipt from public.group_capsule_receipts where owner_id=p_actor and group_capsule_receipts.request_key=v_request_key;
  if found then
   if p_operation='draw' and (receipt.campaign_id is distinct from p_campaign or receipt.draw_count is distinct from (p_input->>'count')::integer)then raise exception 'CAPSULE_REQUEST_CONFLICT';end if;
   return receipt.result;
  end if;
  if p_operation='receipt'then raise exception 'CAPSULE_NOT_FOUND';end if;
  perform public.group_wallet_assert_new_request(p_actor,v_request_key);
  if exists(select 1 from public.group_wallet_receipts where app_user_id=p_actor and request_key=v_request_key)then raise exception 'CAPSULE_REQUEST_CONFLICT';end if;
  n:=(p_input->>'count')::integer;if n is null or n not in(1,10)then raise exception 'CAPSULE_INVALID';end if;
 end if;
 if p_operation='fulfillments'then
  with batch as (
   select f.id,f.status,p.name as prize_name,c0.name as campaign_name,up.nickname,f.fulfilled_at
   from public.group_capsule_fulfillments f join public.group_capsule_prizes p on p.id=f.prize_id
   join public.group_capsule_campaigns c0 on c0.id=p.campaign_id left join public.user_profiles up on up.app_user_id=f.owner_id
   where (p_input->>'cursor' is null or f.id>(p_input->>'cursor')::uuid) order by f.id limit 31
  ), visible as(select * from batch order by id limit 30)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(v)order by v.id)from visible v),'[]'::jsonb),'nextCursor',case when(select count(*)from batch)>30 then(select id::text from visible order by id desc limit 1)end)into result;return result;
 end if;
 if p_operation='fulfill'then
  update public.group_capsule_fulfillments set status='fulfilled',fulfilled_at=clock_timestamp(),fulfilled_by=p_admin_id where id=(p_input->>'id')::uuid and status='pending';
  if found then insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_actor,p_admin_id,'groups.capsule.fulfill','group_capsule_fulfillment',p_input->>'id',extensions.gen_random_uuid(),jsonb_build_object('status','fulfilled'));
  elsif not exists(select 1 from public.group_capsule_fulfillments where id=(p_input->>'id')::uuid and status='fulfilled')then raise exception 'CAPSULE_NOT_FOUND';end if;return jsonb_build_object('saved',true);
 end if;
 select * into c from public.group_capsule_campaigns where id=p_campaign for update;
 if not found then raise exception 'CAPSULE_NOT_FOUND';end if;
 if p_operation in('activate','pause','close')then
  if c.status='closed' or (p_operation='pause' and c.status<>'active')then raise exception 'CAPSULE_CONFLICT';end if;
  if p_operation='activate' and exists(select 1 from public.group_capsule_prizes where campaign_id=c.id and stock=0)then raise exception 'CAPSULE_SOLD_OUT';end if;
  update public.group_capsule_campaigns set status=case p_operation when 'activate'then 'active' when 'pause'then 'paused'else 'closed'end,activated_at=case when p_operation='activate'then coalesce(activated_at,clock_timestamp())else activated_at end where id=c.id;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_actor,p_admin_id,'groups.capsule.'||p_operation,'group_capsule',c.id::text,extensions.gen_random_uuid(),jsonb_build_object('from',c.status,'operation',p_operation));
  return jsonb_build_object('saved',true);
 end if;
 if p_operation<>'draw'then raise exception 'CAPSULE_INVALID';end if;
 if c.status<>'active'then raise exception 'CAPSULE_CLOSED';end if;
 if exists(select 1 from public.group_capsule_prizes where campaign_id=c.id and stock<n)then raise exception 'CAPSULE_INSUFFICIENT_STOCK';end if;
 entry:=public.group_wallet_post(p_actor,'ticket',-n::bigint,'group_capsule',v_request_key);
 for i in 1..n loop
  roll:=public.group_capsule_roll(); cumulative:=c.blank_weight;prize:=null;
  if roll>=cumulative then
   for prize in select * from public.group_capsule_prizes where campaign_id=c.id order by id loop
    cumulative:=cumulative+prize.weight;exit when roll<cumulative;
   end loop;
   update public.group_capsule_prizes set stock=stock-1 where id=prize.id and stock>0;
   if not found then raise exception 'CAPSULE_INSUFFICIENT_STOCK';end if;
   insert into public.group_capsule_fulfillments(owner_id,request_key,draw_index,prize_id)values(p_actor,v_request_key,i,prize.id);
  end if;
  results:=results||jsonb_build_array(jsonb_build_object('index',i,'prizeId',prize.id,'name',prize.name,'imageUrl',prize.image_url));
 end loop;
 if exists(select 1 from public.group_capsule_prizes where campaign_id=c.id and stock=0)then update public.group_capsule_campaigns set status='paused'where id=c.id;end if;
 result:=jsonb_build_object('requestKey',v_request_key,'campaignId',c.id,'count',n,'results',results,'tickets',public.group_wallet_balance(p_actor,'ticket'));
 insert into public.group_capsule_receipts(owner_id,request_key,campaign_id,draw_count,ledger_id,result)values(p_actor,v_request_key,c.id,n,entry,result);
 return result;
end $$;
do $$declare t text;begin
 foreach t in array array['group_capsule_campaigns','group_capsule_prizes','group_capsule_receipts','group_capsule_fulfillments']loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
revoke all on function public.group_capsule_roll(),public.group_capsule_dispatch(text,uuid,uuid,jsonb,uuid)from public,anon,authenticated,service_role;
grant execute on function public.group_capsule_dispatch(text,uuid,uuid,jsonb,uuid)to service_role;
commit;

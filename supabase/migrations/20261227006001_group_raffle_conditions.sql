begin;
alter table public.group_raffles
 add column entry_mode text not null default 'ticket' check(entry_mode in ('ticket','free')),
 add column conditions jsonb not null default '[]'::jsonb check(jsonb_typeof(conditions)='array' and jsonb_array_length(conditions)<=3),
 add column approval_status text not null default 'approved' check(approval_status in ('pending','approved','rejected')),
 add column results_public boolean not null default true;
alter table public.group_raffle_entries alter column ledger_id drop not null;
create unique index group_raffle_free_once on public.group_raffle_entries(raffle_id,app_user_id) where ledger_id is null;
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
  insert into public.group_raffles(page_id,title,summary,image_url,winner_quantity,per_user_limit,opens_at,entry_mode,closes_at,submission_days,fulfillment_method,created_by)
  values(p_page_id,p_input->>'title',coalesce(p_input->>'summary',''),p_input->>'imageUrl',(p_input->>'winnerQuantity')::integer,case when p_input->>'entryMode'='free' then 1 else (p_input->>'perUserLimit')::integer end,coalesce((p_input->>'opensAt')::timestamptz,clock_timestamp()),coalesce(p_input->>'entryMode','ticket'),(p_input->>'closesAt')::timestamptz,(p_input->>'submissionDays')::integer,(p_input->>'fulfillmentMethod')::public.benefit_fulfillment_method,p_actor)returning id into new_id;
  result:=jsonb_build_object('id',new_id);
 else
  select *into r from public.group_raffles where id=p_id and page_id=p_page_id for update;
  if not found then raise exception 'GROUP_RAFFLE_NOT_FOUND';end if;
  case p_operation
  when 'detail'then
   return jsonb_build_object('raffle',(select x from jsonb_array_elements(public.group_raffle_list(p_page_id,p_actor)->'raffles')x where x->>'id'=r.id::text),'enteredTickets',(select coalesce(sum(e.amount),0)from public.group_raffle_entries e where raffle_id=r.id and app_user_id=p_actor),'winner',(select jsonb_build_object('id',w0.id,'status',w0.status,'submitBy',w0.submit_by)from public.group_raffle_winners w0 where raffle_id=r.id and app_user_id=p_actor),'consentVersion',(select version from public.benefit_recipient_consent_versions where active and effective_at<=clock_timestamp()order by effective_at desc limit 1),'consentDocuments',(select documents from public.benefit_recipient_consent_versions where active and effective_at<=clock_timestamp() and public.mobile_benefit_consent_documents_complete(documents) order by effective_at desc limit 1),'canManage',manager,'member',exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor));
  when 'enter'then
   if not exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor)then raise exception 'GROUP_RAFFLE_MEMBERS_REQUIRED';end if;
   if r.approval_status<>'approved' then raise exception 'GROUP_RAFFLE_CLOSED';end if;
   if r.cancelled_at is not null or r.closes_at<=clock_timestamp()or r.opens_at>clock_timestamp()then raise exception 'GROUP_RAFFLE_CLOSED';end if;
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
commit;

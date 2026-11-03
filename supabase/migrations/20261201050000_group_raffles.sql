begin;
-- Generic pages have no synthetic LIVE/artist. Reuse the existing weighted
-- ranking primitive and original ticket ledger while retaining page authority.
create table public.group_raffles (
 id uuid primary key default extensions.gen_random_uuid(), page_id uuid not null references public.group_pages(id),
 title text not null check(length(btrim(title)) between 1 and 100), summary text not null default '' check(length(summary)<=1000),
 image_url text check(image_url is null or image_url ~ '^https://' or image_url ~ '^/[^/]'),
 winner_quantity integer not null check(winner_quantity between 1 and 1000),
 per_user_limit integer not null check(per_user_limit between 1 and 10000),
 opens_at timestamptz not null default clock_timestamp(), closes_at timestamptz not null,
 submission_days integer not null check(submission_days between 1 and 30),
 fulfillment_method public.benefit_fulfillment_method not null,
 created_by uuid not null references public.app_users(id), cancelled_at timestamptz, drawn_at timestamptz,
 seed bytea check(seed is null or octet_length(seed)=32), seed_hash text,
 check(closes_at>opens_at)
);
create table public.group_raffle_entries (
 id uuid primary key default extensions.gen_random_uuid(), raffle_id uuid not null references public.group_raffles(id),
 app_user_id uuid not null references public.app_users(id), request_key uuid not null,
 amount integer not null check(amount>0), ledger_id uuid not null unique references public.fan_ticket_ledger(id),
 created_at timestamptz not null default clock_timestamp(), unique(app_user_id,request_key)
);
create table public.group_raffle_candidates (
 raffle_id uuid not null references public.group_raffles(id), app_user_id uuid not null references public.app_users(id),
 weight integer not null check(weight>0), digest text not null, rank_value double precision not null,
 primary key(raffle_id,app_user_id)
);
create table public.group_raffle_winners (
 id uuid primary key default extensions.gen_random_uuid(), raffle_id uuid not null references public.group_raffles(id),
 app_user_id uuid not null references public.app_users(id),
 status text not null check(status in('information_required','submitted','fulfilled','expired')),
 selected_at timestamptz not null default clock_timestamp(), submit_by timestamptz not null, fulfilled_at timestamptz,
 unique(raffle_id,app_user_id),foreign key(raffle_id,app_user_id)references public.group_raffle_candidates(raffle_id,app_user_id)
);
create table public.group_raffle_recipients (
 winner_id uuid primary key references public.group_raffle_winners(id),
 name text not null check(length(btrim(name)) between 1 and 120),phone text not null check(length(phone)between 7 and 40),
 address text check(length(address)<=1000),consent_version text not null references public.benefit_recipient_consent_versions(version),
 submitted_at timestamptz not null default clock_timestamp()
);
create table public.group_raffle_access_audit(id uuid primary key default extensions.gen_random_uuid(),raffle_id uuid not null references public.group_raffles(id),actor_id uuid not null references public.app_users(id),accessed_at timestamptz not null default clock_timestamp());
create trigger group_raffle_entries_immutable before update or delete on public.group_raffle_entries for each row execute function public.reject_fan_ticket_ledger_mutation();
create trigger group_raffle_candidates_immutable before update or delete on public.group_raffle_candidates for each row execute function public.reject_fan_ticket_ledger_mutation();
create function public.group_raffle_list(p_page_id uuid,p_actor uuid default null)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('raffles',coalesce(jsonb_agg(jsonb_build_object('id',r.id,'benefitId',r.id,'title',r.title,'summary',r.summary,'imageUrl',r.image_url,'winnerQuantity',r.winner_quantity,'status',case when r.cancelled_at is not null then 'cancelled'when clock_timestamp()<r.opens_at then 'preparing'when clock_timestamp()<r.closes_at then 'open'else 'closed'end,'entryOpensAt',r.opens_at,'entryClosesAt',r.closes_at,'fulfillmentMethod',r.fulfillment_method,'perFanTicketLimit',r.per_user_limit,'resultsPublishedAt',r.drawn_at)order by r.closes_at desc),'[]'::jsonb))from public.group_raffles r join public.group_pages g on g.id=r.page_id and g.status='published'where r.page_id=p_page_id and public.group_scope_visible(p_actor,p_page_id)
$$;
create function public.group_raffle_advance(p_id uuid)returns void language plpgsql security definer set search_path='' as $$
declare r public.group_raffles;slots integer;begin
 select * into r from public.group_raffles where id=p_id for update;
 if not found or r.cancelled_at is not null or r.closes_at>clock_timestamp()then return;end if;
 if r.drawn_at is null then
  r.seed:=extensions.gen_random_bytes(32);
  insert into public.group_raffle_candidates(raffle_id,app_user_id,weight,digest,rank_value)
  with weights as(select e.app_user_id,sum(e.amount)::integer weight from public.group_raffle_entries e join public.app_users u on u.id=e.app_user_id and u.status='active'where e.raffle_id=r.id group by e.app_user_id),
  digests as(select w.*,extensions.digest(r.seed||pg_catalog.uuid_send(r.id)||pg_catalog.uuid_send(w.app_user_id),'sha256')bytes from weights w)
  select r.id,d.app_user_id,d.weight,encode(d.bytes,'hex'),(-ln((public.benefit_digest_uint256(d.bytes)+1)/(power(2::numeric,256)+1))/d.weight)::double precision from digests d;
  update public.group_raffles set drawn_at=clock_timestamp(),seed=r.seed,seed_hash=encode(extensions.digest(r.seed,'sha256'),'hex')where id=r.id;
 end if;
 update public.group_raffle_winners set status='expired'where raffle_id=r.id and status='information_required'and submit_by<=clock_timestamp();
 select r.winner_quantity-count(*)::integer into slots from public.group_raffle_winners where raffle_id=r.id and status<>'expired';
 if slots>0 then
  insert into public.group_raffle_winners(raffle_id,app_user_id,status,submit_by,fulfilled_at)
  select r.id,c.app_user_id,case when r.fulfillment_method='digital'then 'submitted'else 'information_required'end,clock_timestamp()+make_interval(days=>r.submission_days),null
  from public.group_raffle_candidates c join public.app_users u on u.id=c.app_user_id and u.status='active'
  where c.raffle_id=r.id and not exists(select 1 from public.group_raffle_winners w where w.raffle_id=r.id and w.app_user_id=c.app_user_id)
  order by c.rank_value,c.app_user_id limit slots;
 end if;
end $$;
create function public.process_due_group_raffles()returns integer language plpgsql security definer set search_path='' as $$
declare id uuid;n integer:=0;begin
 if not public.group_wallet_enabled()or exists(select 1 from public.group_wallet_release where write_fenced)then return 0;end if;
 perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('group-wallet:campaign-barrier',0));
 for id in select r.id from public.group_raffles r where r.cancelled_at is null and r.closes_at<=clock_timestamp()and(r.drawn_at is null or exists(select 1 from public.group_raffle_winners w where w.raffle_id=r.id and w.status='information_required'and w.submit_by<=clock_timestamp()))order by r.id limit 50 for update skip locked loop
  perform public.group_raffle_advance(id);n:=n+1;
 end loop;
 delete from public.group_raffle_recipients p using public.group_raffle_winners w where p.winner_id=w.id and w.status='fulfilled'and w.fulfilled_at<clock_timestamp()-interval '30 days';
 return n;
end $$;
create function public.group_raffle_dispatch(p_operation text,p_actor uuid,p_page_id uuid,p_id uuid default null,p_input jsonb default '{}',p_admin_id uuid default null)returns jsonb language plpgsql security definer set search_path='' as $$
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
  insert into public.group_raffles(page_id,title,summary,image_url,winner_quantity,per_user_limit,closes_at,submission_days,fulfillment_method,created_by)
  values(p_page_id,p_input->>'title',coalesce(p_input->>'summary',''),p_input->>'imageUrl',(p_input->>'winnerQuantity')::integer,(p_input->>'perUserLimit')::integer,(p_input->>'closesAt')::timestamptz,(p_input->>'submissionDays')::integer,(p_input->>'fulfillmentMethod')::public.benefit_fulfillment_method,p_actor)returning id into new_id;
  result:=jsonb_build_object('id',new_id);
 else
  select *into r from public.group_raffles where id=p_id and page_id=p_page_id for update;
  if not found then raise exception 'GROUP_RAFFLE_NOT_FOUND';end if;
  case p_operation
  when 'detail'then
   return jsonb_build_object('raffle',(select x from jsonb_array_elements(public.group_raffle_list(p_page_id,p_actor)->'raffles')x where x->>'id'=r.id::text),'enteredTickets',(select coalesce(sum(e.amount),0)from public.group_raffle_entries e where raffle_id=r.id and app_user_id=p_actor),'winner',(select jsonb_build_object('id',w0.id,'status',w0.status,'submitBy',w0.submit_by)from public.group_raffle_winners w0 where raffle_id=r.id and app_user_id=p_actor),'consentVersion',(select version from public.benefit_recipient_consent_versions where active and effective_at<=clock_timestamp()order by effective_at desc limit 1),'consentDocuments',(select documents from public.benefit_recipient_consent_versions where active and effective_at<=clock_timestamp() and public.mobile_benefit_consent_documents_complete(documents) order by effective_at desc limit 1),'canManage',manager,'member',exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor));
  when 'enter'then
   if not exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor)then raise exception 'GROUP_RAFFLE_MEMBERS_REQUIRED';end if;
   if r.cancelled_at is not null or r.closes_at<=clock_timestamp()or r.opens_at>clock_timestamp()then raise exception 'GROUP_RAFFLE_CLOSED';end if;
   amount:=(p_input->>'amount')::integer;
   select coalesce(sum(e.amount),0)into total from public.group_raffle_entries e where raffle_id=r.id and app_user_id=p_actor;
   if amount is null or amount<1 or amount+total>r.per_user_limit then raise exception 'GROUP_RAFFLE_LIMIT';end if;
   perform public.group_wallet_assert_new_request(p_actor,v_key);
   entry_id:=public.group_wallet_post(p_actor,'ticket',-amount::bigint,'group_raffle_entry',v_key);
   insert into public.group_raffle_entries(raffle_id,app_user_id,request_key,amount,ledger_id)values(r.id,p_actor,v_key,amount,entry_id)returning id into new_id;
   result:=jsonb_build_object('id',new_id,'amount',amount,'enteredTickets',total+amount,'tickets',public.group_wallet_balance(p_actor,'ticket'));
  when 'cancel'then
   if r.drawn_at is not null or r.cancelled_at is not null then raise exception 'GROUP_RAFFLE_CLOSED';end if;
   for entry in select *from public.group_raffle_entries where raffle_id=r.id order by app_user_id,id loop
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
do $$declare t text;begin
 foreach t in array array['group_raffles','group_raffle_entries','group_raffle_candidates','group_raffle_winners','group_raffle_recipients','group_raffle_access_audit']loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
revoke all on function public.group_raffle_list(uuid,uuid),public.group_raffle_advance(uuid),public.process_due_group_raffles(),public.group_raffle_dispatch(text,uuid,uuid,uuid,jsonb,uuid)from public,anon,authenticated,service_role;
grant execute on function public.group_raffle_list(uuid,uuid),public.process_due_group_raffles(),public.group_raffle_dispatch(text,uuid,uuid,uuid,jsonb,uuid)to service_role;
commit;

-- Run only against an isolated local/dev DB with the inquiry migrations installed.
begin;
-- Isolate quotas from other synthetic local test data; rolled back below.
delete from public.wave_engagements;
delete from public.business_inquiries;
insert into public.app_users(id,privy_user_id,verified_email) values
  ('33333333-3333-4333-8333-333333333333','did:privy:wave-test-admin','wave-admin@example.test');
insert into public.admin_allowlist(id,email,role,active) values
  ('44444444-4444-4444-8444-444444444444','wave-admin@example.test','viewer',true);
set local role service_role;
do $$
declare inquiry_id uuid := '11111111-1111-4111-8111-111111111111'; value boolean; total bigint;
begin
  if has_function_privilege('anon','public.submit_wave_inquiry(uuid,text,text,text,text,boolean,text,text,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.record_wave_engagement(text,uuid,text,text,text,text)','EXECUTE')
    or has_function_privilege('anon','public.wave_engagement_summary(uuid,uuid,integer)','EXECUTE')
    or has_table_privilege('authenticated','public.wave_engagements','SELECT')
    then raise exception 'public access leaked'; end if;
  value := public.submit_wave_inquiry(inquiry_id,'en','Name','person@example.com','Hello',true,repeat('a',64),repeat('b',64),'wave_creator',repeat('c',64),'google');
  if value then raise exception 'first submit replayed'; end if;
  value := public.submit_wave_inquiry(inquiry_id,'en','Name','person@example.com','Hello',true,repeat('a',64),repeat('b',64),'wave_creator',repeat('c',64),'google');
  if not value then raise exception 'repeat was not replayed'; end if;
  select event_count into total from public.wave_engagement_summary('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',7) where channel='google' and event='inquiry_accepted';
  if total is distinct from 1 then raise exception 'accepted aggregate mismatch'; end if;
  begin
    perform public.submit_wave_inquiry(inquiry_id,'en','Name','person@example.com','Changed',true,repeat('a',64),repeat('d',64),'wave_partner',repeat('c',64),'google');
    raise exception 'changed submission accepted';
  exception when others then if sqlerrm<>'INQUIRY_IDEMPOTENCY_CONFLICT' then raise; end if; end;
  begin
    perform public.record_wave_engagement('inquiry_accepted',gen_random_uuid(),repeat('c',64),repeat('a',64),'google','en');
    raise exception 'client forged acceptance';
  exception when others then if sqlerrm<>'INQUIRY_INVALID' then raise; end if; end;
  value := public.record_wave_engagement('page_view',inquiry_id,repeat('c',64),repeat('a',64),'google','en');
  if value then raise exception 'first event replayed'; end if;
  value := public.record_wave_engagement('page_view',inquiry_id,repeat('c',64),repeat('a',64),'google','en');
  if not value then raise exception 'event replay lost'; end if;
  begin
    perform public.record_wave_engagement('page_view',inquiry_id,repeat('d',64),repeat('a',64),'google','en');
    raise exception 'changed session accepted';
  exception when others then if sqlerrm<>'INQUIRY_IDEMPOTENCY_CONFLICT' then raise; end if; end;
  begin
    perform public.wave_engagement_summary(null,null,7);
    raise exception 'inactive actor read allowed';
  exception when others then if sqlerrm<>'active admin required' then raise; end if; end;
  begin
    perform public.wave_engagement_summary('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',8);
    raise exception 'unsupported period accepted';
  exception when others then if sqlerrm<>'INQUIRY_INVALID' then raise; end if; end;
end $$;
reset role;
create function pg_temp.fail_wave_acceptance() returns trigger language plpgsql as $$
begin
  if new.payload_hash=repeat('0',64) then raise exception 'test accepted insert unavailable'; end if;
  return new;
end $$;
create trigger test_wave_atomic_acceptance before insert on public.wave_engagements
  for each row execute function pg_temp.fail_wave_acceptance();
do $$
declare inquiry_id uuid := '11111111-1111-4111-8111-111111111111'; value boolean; total bigint;
begin
  if (select inquiry_type<>'wave_creator' or company<>'kyaa wave' from public.business_inquiries where business_inquiries.id=inquiry_id) then raise exception 'queue category or company mismatch'; end if;
  -- The accepted aggregate and idempotency survive seven-day queue retention.
  delete from public.business_inquiries where business_inquiries.id=inquiry_id;
  value := public.submit_wave_inquiry(inquiry_id,'en','Name','person@example.com','Hello',true,repeat('a',64),repeat('b',64),'wave_creator',repeat('c',64),'google');
  if not value or exists(select 1 from public.business_inquiries where business_inquiries.id=inquiry_id) then raise exception 'purged inquiry was enqueued twice'; end if;
  -- Constraint failure in accepted insertion must roll back the durable enqueue too.
  begin
    perform public.submit_wave_inquiry(gen_random_uuid(),'en','Name','person@example.com','Hello',true,repeat('a',64),repeat('e',64),'wave_creator',repeat('c',64),'invalid');
    raise exception 'invalid atomic insert accepted';
  exception when others then if sqlerrm<>'INQUIRY_INVALID' then raise; end if; end;
  if exists(select 1 from public.business_inquiries) then raise exception 'failed transaction left queued inquiry'; end if;
  begin
    perform public.submit_wave_inquiry(gen_random_uuid(),'en','Name','person@example.com','Hello',true,repeat('a',64),repeat('0',64),'wave_creator',repeat('c',64),'direct');
    raise exception 'accepted insert failure ignored';
  exception when others then if sqlerrm<>'test accepted insert unavailable' then raise; end if; end;
  if exists(select 1 from public.business_inquiries) then raise exception 'failed acceptance left queued inquiry'; end if;
  -- Existing shared inquiry limits include wave categories and legacy submissions.
  perform public.submit_business_inquiry(gen_random_uuid(),'ko','Name','Company','person@example.com','Hello',true,repeat('a',64),repeat('e',64));
  perform public.submit_categorized_business_inquiry(gen_random_uuid(),'ko','Name','Company','person@example.com','Hello',true,repeat('a',64),repeat('e',64),'partner');
  perform public.submit_wave_inquiry(gen_random_uuid(),'en','Name','person@example.com','Hello',true,repeat('a',64),repeat('f',64),'wave_partner',repeat('c',64),'direct');
  begin
    perform public.submit_wave_inquiry(gen_random_uuid(),'en','Name','person@example.com','Hello',true,repeat('a',64),repeat('f',64),'wave_partner',repeat('c',64),'direct');
    raise exception 'shared IP limit bypassed';
  exception when others then if sqlerrm<>'INQUIRY_RATE_LIMITED' then raise; end if; end;
  select count(*) into total from public.wave_engagements where event='inquiry_accepted';
  if total<>2 then raise exception 'failed enqueue produced acceptance'; end if;
  -- Per-IP analytics quota is atomic with insert, and replay still succeeds at quota.
  insert into public.wave_engagements(event,request_id,session_hash,ip_hash,channel,locale)
    select 'page_view',gen_random_uuid(),repeat('d',64),repeat('d',64),'direct','ko' from generate_series(1,600);
  begin
    perform public.record_wave_engagement('inquiry_open',gen_random_uuid(),repeat('d',64),repeat('d',64),'direct','ko');
    raise exception 'event IP quota bypassed';
  exception when others then if sqlerrm<>'INQUIRY_RATE_LIMITED' then raise; end if; end;
  update public.wave_engagements set created_at=now()-interval '91 days' where ip_hash=repeat('d',64);
  perform public.maintain_wave_engagements();
  if exists(select 1 from public.wave_engagements where ip_hash=repeat('d',64)) then raise exception 'retention failed'; end if;
  select event_count into total from public.wave_engagement_summary('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',90) where channel='google' and event='inquiry_accepted';
  if total is distinct from 1 then raise exception 'accepted event disappeared with queue'; end if;
  -- The global event budget applies even to a new IP.
  insert into public.wave_engagements(event,request_id,session_hash,ip_hash,channel,locale)
    select 'page_view',gen_random_uuid(),repeat('e',64),repeat('e',64),'other','en'
    from generate_series(1,10000-(select count(*)::integer from public.wave_engagements));
  begin
    perform public.record_wave_engagement('page_view',gen_random_uuid(),repeat('f',64),repeat('f',64),'direct','ko');
    raise exception 'global event quota bypassed';
  exception when others then if sqlerrm<>'INQUIRY_RATE_LIMITED' then raise; end if; end;
  -- The existing global inquiry budget remains shared across all categories.
  insert into public.business_inquiries(id,locale,contact_name,company,email,message,ip_hash,payload_hash)
    select gen_random_uuid(),'ko','Name','Company','person@example.com','Hello',repeat('e',64),repeat('e',64)
    from generate_series(1,100-(select count(*)::integer from public.business_inquiries));
  begin
    perform public.submit_wave_inquiry(gen_random_uuid(),'en','Name','person@example.com','Hello',true,repeat('f',64),repeat('f',64),'wave_partner',repeat('c',64),'direct');
    raise exception 'global inquiry quota bypassed';
  exception when others then if sqlerrm<>'INQUIRY_RATE_LIMITED' then raise; end if; end;
end $$;
rollback;

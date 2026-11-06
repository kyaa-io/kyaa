-- The operator check under an ordinary function owner (not a superuser, no BYPASSRLS), the layout AWS uses. group_events and group_memberships are FORCE RLS with no policy,
-- so such an owner gets an error or zero rows. Neither may lose a payout silently: it becomes a failure row, and the retry pays members and closes operators once access exists.
-- Disposable clean-chain DB only; everything rolls back, the role included.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required'; end if; end $$;
begin;

create function pg_temp.mkuser(u uuid, n integer) returns void language plpgsql as $$
begin
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:eoo-'||n,'eoo-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'||lpad(n::text,4,'0'),'privy','embedded');
end $$;

create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'eoo-pass-'||p,1,jsonb_build_object('recipient','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0001','celebritySlug','eoo','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  return p;
end $$;

-- a published open event, one application by the member, a manual check-in by the actor. Returns the event.
create function pg_temp.attend(actor uuid, member uuid, pg uuid, title text) returns uuid language plpgsql as $$
declare r jsonb; ev uuid; reg uuid;
begin
  r := public.group_activities_dispatch('event-save',actor,pg,null,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'title',title,'description','eoo','imageUrl',null,
    'startsAt',now()-interval '1 hour','endsAt',now()+interval '1 hour','opensAt',now()-interval '2 hours','closesAt',now()+interval '30 minutes','location','eoo','capacity',20,'requiresApproval',false,'state','published'),null);
  ev := (r#>>'{event,id}')::uuid;
  perform public.group_activities_dispatch('event-apply',member,pg,ev,null,jsonb_build_object('requestId',extensions.gen_random_uuid()),null);
  select id into reg from public.group_event_registrations where event_id=ev and app_user_id=member;
  perform public.group_activities_dispatch('event-manual-check-in',actor,pg,ev,reg,jsonb_build_object('requestId',extensions.gen_random_uuid(),'confirmedName','회원','reason','eoo'),null);
  if (select checked_in_at from public.group_event_registrations where id=reg) is null then raise exception 'the check-in itself must always work'; end if;
  return ev;
end $$;

create function pg_temp.held(u uuid) returns text language sql as $$
  select (select count(*) from public.community_stamps where app_user_id=u and kind='event_checkin')||' stamps, '||public.group_wallet_balance(u,'fan_point')||'P'
$$;

create function pg_temp.resolution(u uuid, ev uuid) returns text language plpgsql as $$
declare v text;
begin
  execute 'select resolution from public.dukjil_wire_failures where app_user_id=$1 and action_key=''event_checkin'' and source_key=$2 and resolved_at is not null' into v using u, ev::text;
  return v;
end $$;

create function pg_temp.open_failure(u uuid, ev uuid) returns text language sql as $$
  select error_message from public.dukjil_wire_failures where app_user_id=u and action_key='event_checkin' and source_key=ev::text and resolved_at is null
$$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

create role eoo_fn_owner nosuperuser nobypassrls nologin;
grant usage on schema public to eoo_fn_owner;

do $$
declare
  c uuid := 'f1800000-0000-4000-8000-000000000001';
  owner_u uuid := 'f1800000-0000-4000-8000-000000000021'; member1 uuid := 'f1800000-0000-4000-8000-000000000022';
  member2 uuid := 'f1800000-0000-4000-8000-000000000023'; member3 uuid := 'f1800000-0000-4000-8000-000000000024';
  promoted uuid := 'f1800000-0000-4000-8000-000000000025'; demoted uuid := 'f1800000-0000-4000-8000-000000000026';
  member4 uuid := 'f1800000-0000-4000-8000-000000000027'; owner2 uuid := 'f1800000-0000-4000-8000-000000000028'; member5 uuid := 'f1800000-0000-4000-8000-000000000029';
  c2 uuid := 'f1800000-0000-4000-8000-000000000002';
  pg uuid; pg2 uuid; u uuid; ev1 uuid; ev2 uuid; ev3 uuid; ev4 uuid; ev5 uuid; ev6 uuid; ev7 uuid; ev8 uuid; ev9 uuid; ev10 uuid; msg text; k integer := 0; f record; t text;
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c,'eoo-1','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c,'ko','EOO','EOO','EOO'),(c,'en','EOO','EOO','EOO');
  update public.celebrities set status='published' where id=c;
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c2,'eoo-2','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c2,'ko','EOO2','EOO2','EOO2'),(c2,'en','EOO2','EOO2','EOO2');
  update public.celebrities set status='published' where id=c2;
  perform pg_temp.mkuser(owner_u,21); perform pg_temp.mkuser(member1,22); perform pg_temp.mkuser(member2,23); perform pg_temp.mkuser(member3,24); perform pg_temp.mkuser(promoted,25); perform pg_temp.mkuser(demoted,26);
  perform pg_temp.mkuser(member4,27); perform pg_temp.mkuser(owner2,28); perform pg_temp.mkuser(member5,29);
  foreach u in array array[owner_u,member1,member2,member3,promoted,demoted,member4] loop perform pg_temp.mkpass(u,c); end loop;
  perform pg_temp.mkpass(owner2,c2); perform pg_temp.mkpass(member5,c2);
  select id into pg from public.group_pages where celebrity_id=c;
  if pg is null then insert into public.group_pages(kind,celebrity_id,name,description,image_url,question) values('fan',c,'EOO','EOO','/d.webp',null) returning id into pg; end if;
  insert into public.group_memberships(page_id,app_user_id,role) values(pg,owner_u,'owner'),(pg,member1,'member'),(pg,member2,'member'),(pg,member3,'member'),(pg,promoted,'member'),(pg,demoted,'manager'),(pg,member4,'member')
    on conflict(page_id,app_user_id) do update set role=excluded.role;
  select id into pg2 from public.group_pages where celebrity_id=c2;
  if pg2 is null then insert into public.group_pages(kind,celebrity_id,name,description,image_url,question) values('fan',c2,'EOO2','EOO2','/d.webp',null) returning id into pg2; end if;
  insert into public.group_memberships(page_id,app_user_id,role) values(pg2,owner2,'owner'),(pg2,member5,'member') on conflict(page_id,app_user_id) do update set role=excluded.role;

  -- the functions that judge and pay the check-in run as the ordinary owner; everything they call stays executable, as the owner loops make it on AWS
  for f in select oid::regprocedure::text sig from pg_proc where pronamespace='public'::regnamespace
            and proname in ('dukjil_wire_event','dukjil_event_operator_attendance','dukjil_event_award_celebrity','dukjil_wire_event_attendance') loop
    execute format('alter function %s owner to eoo_fn_owner', f.sig);
  end loop;
  grant execute on function public.dukjil_wire_award(text,uuid,uuid,text,text,jsonb), public.dukjil_policy_replaces_earning(timestamptz),
    public.record_dukjil_award_failure(uuid,uuid,text,text,jsonb,text,text) to eoo_fn_owner;

  -- ===== no table rights (42501): member and operator both become failure rows, nobody is paid, the check-in stands =====
  ev1 := pg_temp.attend(owner_u,member1,pg,'no rights member');
  ev2 := pg_temp.attend(owner_u,owner_u,pg,'no rights operator');
  if pg_temp.held(member1) <> '0 stamps, 0P' or pg_temp.held(owner_u) <> '0 stamps, 0P' then raise exception 'no rights: paid %, %', pg_temp.held(member1), pg_temp.held(owner_u); end if;
  msg := pg_temp.open_failure(member1,ev1);
  if msg is null then raise exception 'no rights: an ordinary member''s payout vanished without a failure row'; end if;
  if position('permission denied' in msg) = 0 then raise exception 'no rights: wrong failure %', msg; end if;
  if pg_temp.open_failure(owner_u,ev2) is null then raise exception 'no rights: operator failure row missing'; end if;
  k := k + 1;

  -- ===== table rights but no policy (zero rows under FORCE RLS): the same, it must not read as "not an operator" =====
  foreach t in array array['group_events','group_pages','group_event_registrations','group_memberships'] loop
    execute format('grant select on table public.%I to eoo_fn_owner', t);
  end loop;
  ev3 := pg_temp.attend(owner_u,member2,pg,'zero rows member');
  ev4 := pg_temp.attend(owner_u,owner_u,pg,'zero rows operator');
  if pg_temp.held(member2) <> '0 stamps, 0P' or pg_temp.held(owner_u) <> '0 stamps, 0P' then raise exception 'zero rows: paid %, %', pg_temp.held(member2), pg_temp.held(owner_u); end if;
  msg := pg_temp.open_failure(member2,ev3);
  if msg is null or position('EVENT_OPERATOR_UNREADABLE' in msg) = 0 then raise exception 'zero rows: wrong failure %', msg; end if;
  if pg_temp.open_failure(owner_u,ev4) is null then raise exception 'zero rows: operator failure row missing'; end if;
  -- a retry before access is fixed keeps the rows open and pays nothing
  perform public.retry_dukjil_wire_failures(50);
  if pg_temp.held(member2) <> '0 stamps, 0P' or pg_temp.open_failure(member2,ev3) is null then raise exception 'retry without access: %, %', pg_temp.held(member2), pg_temp.open_failure(member2,ev3); end if;
  k := k + 1;

  -- a page whose members all left: its open row waits for access, then pays, because an empty page is not a read failure
  ev9 := pg_temp.attend(owner2,member5,pg2,'page emptied');
  if pg_temp.open_failure(member5,ev9) is null then raise exception 'emptied page: failure row missing'; end if;
  delete from public.group_memberships where page_id=pg2;
  k := k + 1;

  -- ===== only group_memberships hidden: without this check an operator would read as "not an operator" and be paid =====
  foreach t in array array['group_events','group_pages','group_event_registrations'] loop
    execute format('create policy eoo_test_read on public.%I for select to eoo_fn_owner using (true)', t);
  end loop;
  ev6 := pg_temp.attend(owner_u,owner_u,pg,'members hidden operator');
  ev7 := pg_temp.attend(owner_u,member4,pg,'members hidden member');
  if pg_temp.held(owner_u) <> '0 stamps, 0P' then raise exception 'members hidden: an operator was paid %', pg_temp.held(owner_u); end if;
  if pg_temp.held(member4) <> '0 stamps, 0P' then raise exception 'members hidden: member paid before the role could be read %', pg_temp.held(member4); end if;
  msg := pg_temp.open_failure(owner_u,ev6);
  if msg is null or position('EVENT_OPERATOR_UNREADABLE: group_memberships' in msg) = 0 then raise exception 'members hidden: operator failure %', msg; end if;
  msg := pg_temp.open_failure(member4,ev7);
  if msg is null or position('EVENT_OPERATOR_UNREADABLE: group_memberships' in msg) = 0 then raise exception 'members hidden: member failure %', msg; end if;
  -- rows whose role changes before the retry: the retry judges by the role at that moment (recorded behaviour, see the ledger)
  ev8 := pg_temp.attend(owner_u,promoted,pg,'promoted later');
  ev10 := pg_temp.attend(owner_u,demoted,pg,'demoted later');
  update public.group_memberships set role='manager' where page_id=pg and app_user_id=promoted;
  update public.group_memberships set role='member' where page_id=pg and app_user_id=demoted;
  perform public.retry_dukjil_wire_failures(50);
  if pg_temp.open_failure(member4,ev7) is null or pg_temp.held(member4) <> '0 stamps, 0P' then raise exception 'members hidden: retry must keep the row open'; end if;
  k := k + 1;

  -- ===== the migration's access step: reads work as the ordinary owner, the role stays ordinary =====
  perform public.dukjil_event_operator_owner_access();
  if (select rolsuper or rolbypassrls from pg_roles where rolname='eoo_fn_owner') then raise exception 'the test owner must stay ordinary'; end if;
  if (select count(*) from pg_proc p join pg_roles r on r.oid=p.proowner where p.pronamespace='public'::regnamespace and r.rolname='eoo_fn_owner' and p.proname in ('dukjil_wire_event','dukjil_event_award_celebrity','dukjil_wire_event_attendance')) <> 3 then raise exception 'owners not moved'; end if;
  ev5 := pg_temp.attend(owner_u,member3,pg,'access member');
  if pg_temp.held(member3) <> '1 stamps, 100P' or pg_temp.open_failure(member3,ev5) is not null then raise exception 'access: member %', pg_temp.held(member3); end if;
  ev5 := pg_temp.attend(owner_u,owner_u,pg,'access operator');
  if pg_temp.held(owner_u) <> '0 stamps, 0P' or pg_temp.open_failure(owner_u,ev5) is not null then raise exception 'access: operator %', pg_temp.held(owner_u); end if;
  k := k + 1;

  -- ===== the retry pays the members and closes the operator rows unpaid =====
  perform public.retry_dukjil_wire_failures(50);
  if pg_temp.held(member1) <> '1 stamps, 100P' or pg_temp.held(member2) <> '1 stamps, 100P' or pg_temp.held(member4) <> '1 stamps, 100P' then raise exception 'retry: members %, %, %', pg_temp.held(member1), pg_temp.held(member2), pg_temp.held(member4); end if;
  if pg_temp.held(owner_u) <> '0 stamps, 0P' then raise exception 'retry paid the operator %', pg_temp.held(owner_u); end if;
  if pg_temp.open_failure(member5,ev9) is not null then raise exception 'a page whose members left must not read as a read failure: %', pg_temp.open_failure(member5,ev9); end if;
  if (select count(*) from public.community_stamps where app_user_id=member5 and kind='event_checkin') <> 1 or public.group_wallet_balance(member5,'fan_point') <> 100 then raise exception 'emptied page: member not paid %', pg_temp.held(member5); end if;
  if exists(select 1 from public.dukjil_wire_failures where action_key='event_checkin' and resolved_at is null) then raise exception 'retry left open rows'; end if;
  -- every closed row says why, so an unpaid close cannot be mistaken for a payment
  if pg_temp.resolution(member1,ev1) is distinct from 'paid' or pg_temp.resolution(member5,ev9) is distinct from 'paid' then raise exception 'paid rows: %, %', pg_temp.resolution(member1,ev1), pg_temp.resolution(member5,ev9); end if;
  if pg_temp.resolution(owner_u,ev2) is distinct from 'event_no_award' or pg_temp.resolution(owner_u,ev6) is distinct from 'event_no_award' then raise exception 'operator rows: %, %', pg_temp.resolution(owner_u,ev2), pg_temp.resolution(owner_u,ev6); end if;
  -- recorded behaviour: promoted after the check-in closes unpaid, demoted after it is paid
  if pg_temp.held(promoted) <> '0 stamps, 0P' or pg_temp.resolution(promoted,ev8) is distinct from 'event_no_award' then raise exception 'promoted: %, %', pg_temp.held(promoted), pg_temp.resolution(promoted,ev8); end if;
  if pg_temp.held(demoted) <> '1 stamps, 100P' or pg_temp.resolution(demoted,ev10) is distinct from 'paid' then raise exception 'demoted: %, %', pg_temp.held(demoted), pg_temp.resolution(demoted,ev10); end if;
  -- no second payment on another retry
  perform public.retry_dukjil_wire_failures(50);
  if pg_temp.held(member1) <> '1 stamps, 100P' then raise exception 'second retry paid again'; end if;
  k := k + 1;

  raise notice 'passport event operator owner: % assertion groups passed', k;
end $$;

select 'passport event operator owner verification passed' as result;
rollback;

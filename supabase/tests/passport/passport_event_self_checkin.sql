-- An event's owner or manager earns nothing from attending their own event: no points, stamp or slot, on manual or QR check-in and on the review.
-- The check-in itself still works. Ordinary members are paid as before. Disposable clean-chain DB only; everything rolls back.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required'; end if; end $$;
begin;

create function pg_temp.mkuser(u uuid, n integer) returns void language plpgsql as $$
begin
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:esc-'||n,'esc-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'||lpad(n::text,4,'0'),'privy','embedded');
end $$;

create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'esc-pass-'||p,1,jsonb_build_object('recipient','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0001','celebritySlug','esc','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  return p;
end $$;

-- a published, open event created by the actor
create function pg_temp.mkevent(actor uuid, pg uuid, title text) returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := public.group_activities_dispatch('event-save',actor,pg,null,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'title',title,'description','esc','imageUrl',null,
    'startsAt',now()-interval '1 hour','endsAt',now()+interval '1 hour','opensAt',now()-interval '2 hours','closesAt',now()+interval '30 minutes','location','esc','capacity',20,'requiresApproval',false,'state','published'),null);
  return (r#>>'{event,id}')::uuid;
end $$;

create function pg_temp.apply(u uuid, pg uuid, ev uuid) returns uuid language plpgsql as $$
begin
  perform public.group_activities_dispatch('event-apply',u,pg,ev,null,jsonb_build_object('requestId',extensions.gen_random_uuid()),null);
  return (select id from public.group_event_registrations where event_id=ev and app_user_id=u);
end $$;

create function pg_temp.manual(actor uuid, pg uuid, ev uuid, reg uuid) returns void language plpgsql as $$
begin
  perform public.group_activities_dispatch('event-manual-check-in',actor,pg,ev,reg,jsonb_build_object('requestId',extensions.gen_random_uuid(),'confirmedName','회원','reason','esc'),null);
end $$;

create function pg_temp.qr(actor uuid, pg uuid, ev uuid, reg uuid) returns void language plpgsql as $$
declare payload text;
begin
  select 'kyaa-event:'||id::text||':'||encode(ticket_token,'hex') into payload from public.group_event_registrations where id=reg;
  perform public.group_activities_dispatch('event-check-in',actor,pg,ev,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'qrPayload',payload),null);
end $$;

create function pg_temp.review(u uuid, pg uuid, ev uuid) returns void language plpgsql as $$
begin
  update public.group_events set ends_at = clock_timestamp() - interval '1 minute', closes_at = clock_timestamp() - interval '2 minutes' where id=ev;
  perform public.group_activities_dispatch('event-review-write',u,pg,ev,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'body','후기를 남깁니다'),null);
end $$;

-- what a member holds from event rewards
create function pg_temp.held(u uuid, c uuid) returns text language sql as $$
  select (select count(*) from public.community_stamps where app_user_id=u and kind in ('event_checkin','event_review'))
    ||' stamps, '||(select count(*) from public.passport_page_slots s join public.fan_passports f on f.id=s.passport_id join public.community_stamps st on st.id=s.stamp_id
                     where f.app_user_id=u and f.celebrity_id=c and st.kind in ('event_checkin','event_review'))
    ||' slots, '||public.group_wallet_balance(u,'fan_point')||'P, '
    ||(select count(*) from public.dukjil_action_log where app_user_id=u and action_key in ('event_checkin','event_review'))||' log, '
    ||(select count(*) from public.dukjil_wire_failures where app_user_id=u)||' failures'
$$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  c uuid := 'f1700000-0000-4000-8000-000000000001';
  owner_u uuid := 'f1700000-0000-4000-8000-000000000021'; manager_u uuid := 'f1700000-0000-4000-8000-000000000022';
  member1 uuid := 'f1700000-0000-4000-8000-000000000023'; member2 uuid := 'f1700000-0000-4000-8000-000000000024';
  demoted uuid := 'f1700000-0000-4000-8000-000000000025';
  none_held constant text := '0 stamps, 0 slots, 0P, 0 log, 0 failures';
  pg uuid; ev uuid; reg uuid; k integer := 0; u uuid;
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c,'esc-1','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c,'ko','ESC','ESC','ESC'),(c,'en','ESC','ESC','ESC');
  update public.celebrities set status='published' where id=c;
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;
  perform pg_temp.mkuser(owner_u,21); perform pg_temp.mkuser(manager_u,22); perform pg_temp.mkuser(member1,23); perform pg_temp.mkuser(member2,24); perform pg_temp.mkuser(demoted,25);
  foreach u in array array[owner_u,manager_u,member1,member2,demoted] loop perform pg_temp.mkpass(u,c); end loop;
  select id into pg from public.group_pages where celebrity_id=c;
  if pg is null then insert into public.group_pages(kind,celebrity_id,name,description,image_url,question) values('fan',c,'ESC','ESC','/d.webp',null) returning id into pg; end if;
  insert into public.group_memberships(page_id,app_user_id,role) values(pg,owner_u,'owner'),(pg,manager_u,'manager'),(pg,member1,'member'),(pg,member2,'member'),(pg,demoted,'manager')
    on conflict(page_id,app_user_id) do update set role=excluded.role;

  -- owner, manual, repeated over new events: the check-in works and pays nothing
  for i in 1..3 loop
    ev := pg_temp.mkevent(owner_u,pg,'own manual '||i); reg := pg_temp.apply(owner_u,pg,ev);
    perform pg_temp.manual(owner_u,pg,ev,reg);
    if (select checked_in_at from public.group_event_registrations where id=reg) is null then raise exception 'owner check-in must still work'; end if;
  end loop;
  if pg_temp.held(owner_u,c) <> none_held then raise exception 'owner manual check-in paid: %', pg_temp.held(owner_u,c); end if;
  k := k + 1;

  -- owner, QR
  ev := pg_temp.mkevent(owner_u,pg,'own qr'); reg := pg_temp.apply(owner_u,pg,ev);
  perform pg_temp.qr(owner_u,pg,ev,reg);
  if (select checked_in_at from public.group_event_registrations where id=reg) is null then raise exception 'owner QR check-in must still work'; end if;
  if pg_temp.held(owner_u,c) <> none_held then raise exception 'owner QR check-in paid: %', pg_temp.held(owner_u,c); end if;
  k := k + 1;

  -- owner's review of an event attended that way
  perform pg_temp.review(owner_u,pg,ev);
  if (select review_body from public.group_event_registrations where id=reg) is null then raise exception 'owner review must still save'; end if;
  if pg_temp.held(owner_u,c) <> none_held then raise exception 'owner review paid: %', pg_temp.held(owner_u,c); end if;
  k := k + 1;

  -- manager, manual and QR, on an event the manager did not create
  ev := pg_temp.mkevent(owner_u,pg,'manager manual'); reg := pg_temp.apply(manager_u,pg,ev);
  perform pg_temp.manual(manager_u,pg,ev,reg);
  if pg_temp.held(manager_u,c) <> none_held then raise exception 'manager manual check-in paid: %', pg_temp.held(manager_u,c); end if;
  ev := pg_temp.mkevent(owner_u,pg,'manager qr'); reg := pg_temp.apply(manager_u,pg,ev);
  perform pg_temp.qr(manager_u,pg,ev,reg);
  if pg_temp.held(manager_u,c) <> none_held then raise exception 'manager QR check-in paid: %', pg_temp.held(manager_u,c); end if;
  k := k + 1;

  -- operators checking each other in pay nothing either
  ev := pg_temp.mkevent(owner_u,pg,'cross 1'); reg := pg_temp.apply(manager_u,pg,ev);
  perform pg_temp.manual(owner_u,pg,ev,reg);
  if pg_temp.held(manager_u,c) <> none_held then raise exception 'owner checking in the manager paid: %', pg_temp.held(manager_u,c); end if;
  ev := pg_temp.mkevent(manager_u,pg,'cross 2'); reg := pg_temp.apply(owner_u,pg,ev);
  perform pg_temp.qr(manager_u,pg,ev,reg);
  if pg_temp.held(owner_u,c) <> none_held then raise exception 'manager checking in the owner paid: %', pg_temp.held(owner_u,c); end if;
  k := k + 1;

  -- a manager's own check-in stays unpaid after a demotion, including the later review
  ev := pg_temp.mkevent(owner_u,pg,'demoted'); reg := pg_temp.apply(demoted,pg,ev);
  perform pg_temp.manual(demoted,pg,ev,reg);
  update public.group_memberships set role='member' where page_id=pg and app_user_id=demoted;
  perform pg_temp.review(demoted,pg,ev);
  if pg_temp.held(demoted,c) <> none_held then raise exception 'demoted manager review paid: %', pg_temp.held(demoted,c); end if;
  k := k + 1;

  -- an event's creator earns nothing even after losing the role, when someone else checks them in
  update public.group_memberships set role='manager' where page_id=pg and app_user_id=demoted;
  ev := pg_temp.mkevent(demoted,pg,'creator demoted'); reg := pg_temp.apply(demoted,pg,ev);
  update public.group_memberships set role='member' where page_id=pg and app_user_id=demoted;
  perform pg_temp.manual(owner_u,pg,ev,reg);
  if pg_temp.held(demoted,c) <> none_held then raise exception 'a demoted creator was paid: %', pg_temp.held(demoted,c); end if;
  k := k + 1;

  -- ordinary members are paid exactly as before, on both check-in paths
  ev := pg_temp.mkevent(owner_u,pg,'member manual'); reg := pg_temp.apply(member1,pg,ev);
  perform pg_temp.manual(owner_u,pg,ev,reg);
  if pg_temp.held(member1,c) <> '1 stamps, 1 slots, 100P, 1 log, 0 failures' then raise exception 'member manual check-in: %', pg_temp.held(member1,c); end if;
  perform pg_temp.review(member1,pg,ev);
  if pg_temp.held(member1,c) <> '2 stamps, 2 slots, 130P, 2 log, 0 failures' then raise exception 'member review: %', pg_temp.held(member1,c); end if;
  ev := pg_temp.mkevent(manager_u,pg,'member qr'); reg := pg_temp.apply(member2,pg,ev);
  perform pg_temp.qr(manager_u,pg,ev,reg);
  if pg_temp.held(member2,c) <> '1 stamps, 1 slots, 100P, 1 log, 0 failures' then raise exception 'member QR check-in: %', pg_temp.held(member2,c); end if;
  k := k + 1;

  raise notice 'passport event self check-in: % assertion groups passed', k;
end $$;

select 'passport event self check-in verification passed' as result;
rollback;

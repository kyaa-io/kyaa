-- 20261221130000: steady_checkin needs consecutive valid KST attendance days; stamps issued before stay. Disposable clean-chain DB only; everything rolls back.
-- The KST date helper cannot be moved, so the day window is exercised with dates relative to today and the KST day edge is checked on the helper itself.
\set ON_ERROR_STOP on
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required'; end if; end $$;
begin;
update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;
update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true, migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

create function pg_temp.mkuser(u uuid, n integer) returns void language plpgsql as $$
begin
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:sc-'||n,'sc-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(u,91342,'0xdddddddddddddddddddddddddddddddddddd'||lpad(n::text,4,'0'),'privy','embedded');
end $$;
create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'sc-pass-'||p,1,jsonb_build_object('recipient','0xdddddddddddddddddddddddddddddddddddd0001','celebritySlug','sc','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  return p;
end $$;
create function pg_temp.mkstamp(u uuid, c uuid, k public.community_stamp_kind, sk text, at timestamptz) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); s uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'community_stamp',s,'sc-stamp-'||s,1,'{}'::jsonb);
  insert into public.community_stamps(id,app_user_id,celebrity_id,kind,source_key,issued_at,blockchain_job_id) values(s,u,c,k,sk,at,j);
  set local session_replication_role = origin;
  return s;
end $$;
-- one attendance day (with its check-in stamp) at today - ago days
create function pg_temp.day(u uuid, c uuid, ago integer, voided boolean default false) returns void language plpgsql as $$
declare d date := public.dukjil_kst_date() - ago; s uuid;
begin
  s := pg_temp.mkstamp(u, c, 'daily_checkin', 'daily-checkin:' || c::text || ':' || d::text, now() - (ago || ' days')::interval);
  insert into public.group_creator_attendance(app_user_id,celebrity_id,attendance_date,streak,points,stamp_id,request_key,policy_version)
    values(u,c,d,1,10,s,extensions.gen_random_uuid(),1);
  if voided then update public.community_stamps set revoked_at = clock_timestamp(), revoked_reason = 'test' where id = s; end if;
end $$;

do $$
declare
  c uuid := 'f2300000-0000-4000-8000-000000000001'; n integer; sid uuid; r uuid; need integer;
  u_ok uuid := 'f2300000-0000-4000-8000-000000000011'; u_gap uuid := 'f2300000-0000-4000-8000-000000000012'; u_old uuid := 'f2300000-0000-4000-8000-000000000013';
  u_void uuid := 'f2300000-0000-4000-8000-000000000014'; u_kept uuid := 'f2300000-0000-4000-8000-000000000015'; u_two uuid := 'f2300000-0000-4000-8000-000000000016';
  u_voidiss uuid := 'f2300000-0000-4000-8000-000000000017';
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c,'sc-steady','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c,'ko','sc','sc','sc'),(c,'en','sc','sc','sc');
  update public.celebrities set status='published' where id=c;
  select nullif(x ->> 'days','')::integer into need from public.dukjil_policy_versions v, jsonb_array_elements(v.mission_book #> '{pages,0,slots}') x
   where v.version = (select version from public.passport_policy_row()) and x ->> 'action' = 'steady_checkin';
  if need is distinct from 3 then raise exception 'steady_checkin must need 3 days, got %', need; end if;
  perform pg_temp.mkuser(u_ok,1); perform pg_temp.mkuser(u_gap,2); perform pg_temp.mkuser(u_old,3); perform pg_temp.mkuser(u_void,4);
  perform pg_temp.mkuser(u_kept,5); perform pg_temp.mkuser(u_two,6); perform pg_temp.mkuser(u_voidiss,7);
  perform pg_temp.mkpass(u_ok,c); perform pg_temp.mkpass(u_gap,c); perform pg_temp.mkpass(u_old,c); perform pg_temp.mkpass(u_void,c);
  perform pg_temp.mkpass(u_kept,c); perform pg_temp.mkpass(u_two,c); perform pg_temp.mkpass(u_voidiss,c);

  -- three consecutive days ending today issue once; the window edge (today-2) counts
  perform pg_temp.day(u_ok,c,2); perform pg_temp.day(u_ok,c,1); perform pg_temp.day(u_ok,c,0);
  sid := public.passport_issue_steady_checkin(u_ok,c);
  if sid is null then raise exception 'three consecutive days did not issue'; end if;
  if public.passport_issue_steady_checkin(u_ok,c) is distinct from sid then raise exception 'second call issued another stamp'; end if;
  -- two consecutive days are not enough
  perform pg_temp.day(u_two,c,1); perform pg_temp.day(u_two,c,0);
  if public.passport_issue_steady_checkin(u_two,c) is not null then raise exception 'two days issued'; end if;
  -- a gap: today-3, today-1, today (three days, not consecutive)
  perform pg_temp.day(u_gap,c,3); perform pg_temp.day(u_gap,c,1); perform pg_temp.day(u_gap,c,0);
  if public.passport_issue_steady_checkin(u_gap,c) is not null then raise exception 'a gap issued'; end if;
  -- an old consecutive run that ended before the window does not count: today-5, -4, -3
  perform pg_temp.day(u_old,c,5); perform pg_temp.day(u_old,c,4); perform pg_temp.day(u_old,c,3);
  if public.passport_issue_steady_checkin(u_old,c) is not null then raise exception 'a run outside the window issued'; end if;
  -- an invalid (voided) attendance stamp inside the window breaks the run
  perform pg_temp.day(u_void,c,2); perform pg_temp.day(u_void,c,1,true); perform pg_temp.day(u_void,c,0);
  if public.passport_issue_steady_checkin(u_void,c) is not null then raise exception 'a voided day counted'; end if;
  -- a stamp issued before stays: returned as it is, even when the days are not consecutive, and nothing new is added
  perform pg_temp.day(u_kept,c,4); perform pg_temp.day(u_kept,c,2); perform pg_temp.day(u_kept,c,0);
  sid := pg_temp.mkstamp(u_kept,c,'steady_checkin','steady-checkin:'||c::text||':page1',now() - interval '20 days');
  if public.passport_issue_steady_checkin(u_kept,c) is distinct from sid then raise exception 'earlier stamp not preserved'; end if;
  select count(*) into n from public.community_stamps where app_user_id = u_kept and kind = 'steady_checkin';
  if n <> 1 then raise exception 'preserved stamp duplicated: %', n; end if;
  -- an earlier stamp that was voided is not issued again
  sid := pg_temp.mkstamp(u_voidiss,c,'steady_checkin','steady-checkin:'||c::text||':page1',now() - interval '20 days');
  update public.community_stamps set revoked_at = clock_timestamp(), revoked_reason = 'test' where id = sid;
  perform pg_temp.day(u_voidiss,c,2); perform pg_temp.day(u_voidiss,c,1); perform pg_temp.day(u_voidiss,c,0);
  if public.passport_issue_steady_checkin(u_voidiss,c) is distinct from sid then raise exception 'voided earlier stamp was re-issued'; end if;
  select count(*) into n from public.community_stamps where app_user_id = u_voidiss and kind = 'steady_checkin';
  if n <> 1 then raise exception 'voided steady stamp was replaced: %', n; end if;
  -- no passport policy, no stamp (unknown user)
  if public.passport_issue_steady_checkin(null,c) is not null or public.passport_issue_steady_checkin(u_ok,null) is not null then raise exception 'null arguments issued'; end if;

  -- the KST day edge: 14:59:59 UTC is still the 10th in Seoul, 15:00:00 UTC is the 11th
  if public.dukjil_kst_date('2026-11-10 14:59:59+00') <> date '2026-11-10' or public.dukjil_kst_date('2026-11-10 15:00:00+00') <> date '2026-11-11' then
    raise exception 'KST day edge moved';
  end if;
  raise notice 'passport_steady_consecutive ok';
end $$;
rollback;

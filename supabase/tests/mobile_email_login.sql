begin;
create function pg_temp.email_assert(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
do $$
declare uid uuid:=extensions.gen_random_uuid(); sid uuid:=extensions.gen_random_uuid(); owner_id uuid:=extensions.gen_random_uuid();
  other_id uuid:=extensions.gen_random_uuid(); result jsonb; job jsonb; token uuid; binding_count integer;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values(owner_id,'did:privy:email-sql-test','email-sql-test@example.test'),(other_id,'did:privy:email-other','email-other@example.test');
  insert into public.user_wallets(app_user_id,chain_id,address) values(owner_id,91342,'0x'||replace(owner_id::text,'-','')||'00000000');
  insert into auth.users(id,email,email_confirmed_at) values(uid,'email-sql-test@example.test',now());
  insert into auth.sessions(id,user_id,not_after) values(sid,uid,now()+interval '1 hour');
  perform pg_temp.email_assert(public.check_mobile_email_session(uid,sid) is null,'unbound user allowed');
  insert into public.mobile_email_login_bindings(supabase_user_id,app_user_id,enabled) values(uid,owner_id,true);
  perform pg_temp.email_assert(public.check_mobile_email_session(uid,sid)->>'appUserId'=owner_id::text,'explicit binding lost owner');
  insert into public.mobile_fan_economy_requests(app_user_id,request_key,operation,input,result) values(owner_id,sid,'exchange','{}','{"status":"completed","privateAmount":10}');
  perform pg_temp.email_assert(public.read_owned_mobile_fan_economy_request(other_id,sid,'exchange')->>'status'='unknown','other owner read email fan point exchange');
  perform pg_temp.email_assert(public.read_owned_mobile_fan_economy_request(owner_id,sid,'exchange')->>'privateAmount'='10','email owner lost own point request');
  begin insert into public.mobile_email_login_bindings(supabase_user_id,app_user_id) values(extensions.gen_random_uuid(),owner_id); raise exception 'duplicate binding allowed';
  exception when unique_violation then null; end;
  perform pg_temp.email_assert(public.check_mobile_email_session(uid,extensions.gen_random_uuid()) is null,'wrong session allowed');
  update auth.users set email_confirmed_at=null where id=uid;
  perform pg_temp.email_assert(public.check_mobile_email_session(uid,sid) is null,'unconfirmed allowed');
  update auth.users set email_confirmed_at=now() where id=uid;
  update public.mobile_email_login_bindings set enabled=false where supabase_user_id=uid;
  perform pg_temp.email_assert(public.check_mobile_email_session(uid,sid) is null,'disabled binding allowed');
  update public.mobile_email_login_bindings set enabled=true where supabase_user_id=uid;
  update public.app_users set status='disabled' where id=owner_id;
  perform pg_temp.email_assert(public.check_mobile_email_session(uid,sid) is null,'disabled owner allowed');
  update public.app_users set status='active' where id=owner_id;
  insert into public.admin_allowlist(email,role,active) values('email-sql-test@example.test','viewer',false);
  perform pg_temp.email_assert(public.check_mobile_email_session(uid,sid) is null,'admin allowed');
  delete from public.admin_allowlist where email='email-sql-test@example.test';
  insert into public.apple_auth_owners(privy_user_id) values('did:privy:email-sql-test');
  insert into public.apple_lifecycle_subjects(subject_hash,privy_user_id,credential_state,credential_event_time)
    values(repeat('e',64),'did:privy:email-sql-test','revoked',1720000000000);
  perform pg_temp.email_assert(public.check_mobile_email_session(uid,sid) is null,'Apple revoked email allowed');
  begin perform public.begin_owned_account_deletion('supabase-email:'||uid); raise exception 'Apple revoked deletion allowed';
  exception when insufficient_privilege then null; end;
  update public.apple_lifecycle_subjects set credential_state='deleted' where subject_hash=repeat('e',64);
  perform pg_temp.email_assert(public.check_mobile_email_session(uid,sid) is null,'Apple deleted email allowed');
  begin perform public.begin_owned_account_deletion('supabase-email:'||uid); raise exception 'Apple deleted deletion allowed';
  exception when insufficient_privilege then null; end;
  update public.apple_lifecycle_subjects set credential_state='authorized' where subject_hash=repeat('e',64);
  update auth.sessions set not_after=now()-interval '1 second' where id=sid;
  perform pg_temp.email_assert(public.check_mobile_email_session(uid,sid) is null,'expired session allowed');
  update auth.sessions set not_after=null where id=sid;
  perform pg_temp.email_assert(not public.has_approved_email_account_deletion(uid),'unaccepted deletion tombstone allowed');
  perform pg_temp.email_assert(public.mobile_get_email_account_deletion_status(uid)->>'status'='none','unaccepted deletion status not none');
  result:=public.begin_owned_account_deletion('supabase-email:'||uid);
  perform pg_temp.email_assert(result->>'status'='pending','deletion not accepted');
  perform pg_temp.email_assert(public.has_approved_email_account_deletion(uid),'accepted tombstone missing');
  perform pg_temp.email_assert(public.mobile_get_email_account_deletion_status(uid)->>'status'='pending','accepted pending status missing');
  perform pg_temp.email_assert(public.check_mobile_email_session(uid,sid) is null,'tombstone authorized fan access');
  perform pg_temp.email_assert(exists(select 1 from public.account_deletion_requests where app_user_id=owner_id and supabase_user_id=uid and privy_provider_subject='did:privy:email-sql-test'),'provider snapshots missing');
  job:=public.claim_account_deletion(owner_id); token:=(job->>'leaseToken')::uuid;
  perform pg_temp.email_assert(job->>'supabaseUserId'=uid::text,'claim lost Supabase snapshot');
  -- Supabase deletion cascades binding removal while the durable request survives.
  delete from auth.users where id=uid;
  perform pg_temp.email_assert(not exists(select 1 from public.mobile_email_login_bindings where app_user_id=owner_id),'binding FK blocks provider deletion');
  perform public.finish_account_deletion_provider(owner_id,token,'supabase');
  perform pg_temp.email_assert(not public.complete_account_deletion(owner_id,token),'completed before Privy cleanup');
  perform public.retry_account_deletion(owner_id,token,'PROVIDER_UNAVAILABLE');
  update public.account_deletion_requests set available_at=now() where app_user_id=owner_id;
  job:=public.claim_account_deletion(owner_id); token:=(job->>'leaseToken')::uuid;
  perform pg_temp.email_assert((job->>'supabaseDeleted')::boolean and not (job->>'privyDeleted')::boolean,'restart lost provider progress');
  perform pg_temp.email_assert(job->>'providerSubject'='did:privy:email-sql-test' and job->>'supabaseUserId'=uid::text,'restart lost provider IDs');
  perform public.finish_account_deletion_provider(owner_id,token,'privy');
  perform pg_temp.email_assert(public.complete_account_deletion(owner_id,token),'two-provider cleanup did not complete');
  perform pg_temp.email_assert(public.begin_owned_account_deletion('supabase-email:'||uid)->>'status'='completed','completed tombstone retry failed');
  perform pg_temp.email_assert(exists(select 1 from public.account_deletion_requests where app_user_id=owner_id and supabase_user_id is null and privy_provider_subject is null and provider_subject is null),'completed plaintext provider IDs retained');
  perform pg_temp.email_assert(public.check_mobile_email_session(uid,sid) is null,'completed tombstone authorized access');
  perform pg_temp.email_assert(public.mobile_get_email_account_deletion_status(uid)->>'status'='completed','completed status lost after provider deletion');
  -- Reverse failure order: Privy is gone, Supabase survives a process restart.
  uid:=extensions.gen_random_uuid();sid:=extensions.gen_random_uuid();owner_id:=extensions.gen_random_uuid();
  insert into public.app_users(id,privy_user_id,verified_email) values(owner_id,'did:privy:email-second','email-second@example.test');
  insert into auth.users(id,email,email_confirmed_at) values(uid,'email-second@example.test',now());
  insert into auth.sessions(id,user_id) values(sid,uid);
  insert into public.mobile_email_login_bindings(supabase_user_id,app_user_id,enabled) values(uid,owner_id,true);
  perform pg_temp.email_assert(not public.check_mobile_email_provisioning('email-second@example.test'),'provider-only collision preflight allowed');
  perform public.begin_owned_account_deletion('did:privy:email-second');
  job:=public.claim_account_deletion(owner_id);token:=(job->>'leaseToken')::uuid;
  perform public.finish_account_deletion_provider(owner_id,token,'privy');
  perform pg_temp.email_assert(not public.complete_account_deletion(owner_id,token),'completed before Supabase cleanup');
  perform public.retry_account_deletion(owner_id,token,'PROVIDER_UNAVAILABLE');
  update public.account_deletion_requests set available_at=now() where app_user_id=owner_id;
  job:=public.claim_account_deletion(owner_id);token:=(job->>'leaseToken')::uuid;
  perform pg_temp.email_assert((job->>'privyDeleted')::boolean and not (job->>'supabaseDeleted')::boolean,'reverse restart lost progress');
  perform pg_temp.email_assert(job->>'supabaseUserId'=uid::text,'Privy-first deletion lost Supabase ID');
  delete from auth.users where id=uid;
  perform public.finish_account_deletion_provider(owner_id,token,'supabase');
  perform pg_temp.email_assert(public.complete_account_deletion(owner_id,token),'reverse provider cleanup did not complete');

end $$;
-- API roles cannot read bindings or execute either the public gate or internal helpers.
do $$
begin
  if has_table_privilege('anon','public.mobile_email_login_bindings','SELECT')
    or has_table_privilege('authenticated','public.mobile_email_login_bindings','INSERT')
    or has_function_privilege('authenticated','public.check_mobile_email_session(uuid,uuid)','EXECUTE')
    or has_function_privilege('anon','public.has_approved_email_account_deletion(uuid)','EXECUTE')
    or has_function_privilege('service_role','public.begin_privy_account_deletion(text)','EXECUTE') then raise exception 'email auth ACL exposed'; end if;
end $$;
rollback;

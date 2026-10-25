begin;
create function pg_temp.live_assert(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
do $$
declare
  suffix text:=extensions.gen_random_uuid()::text;
  test_run uuid:=extensions.gen_random_uuid(); historical_id uuid; native_id uuid; promoted_id uuid; empty_id uuid;
  issuer text:='https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_livefixture';
  google text:='https://accounts.google.com'; records jsonb; accounts jsonb; n integer; privy_n integer;
  result jsonb; original_run jsonb; original_owners integer; original_unowned jsonb;
  w1 text:='0x'||substr(md5(extensions.gen_random_uuid()::text)||md5(extensions.gen_random_uuid()::text),1,40);
  w2 text:='0x'||substr(md5(extensions.gen_random_uuid()::text)||md5(extensions.gen_random_uuid()::text),1,40);
  w3 text:='0x'||substr(md5(extensions.gen_random_uuid()::text)||md5(extensions.gen_random_uuid()::text),1,40);
  w4 text:='0x'||substr(md5(extensions.gen_random_uuid()::text)||md5(extensions.gen_random_uuid()::text),1,40);
  w5 text:='0x'||substr(md5(extensions.gen_random_uuid()::text)||md5(extensions.gen_random_uuid()::text),1,40);
begin
  select app_user_id into historical_id from public.sync_privy_identity('did:privy:historical-'||suffix,'historical-'||suffix||'@example.test',91342,w1);
  select jsonb_agg(jsonb_build_object('appUserId',u.id,'privyUserId',u.privy_user_id,'accounts',
      case when u.id=historical_id then jsonb_build_array(jsonb_build_object('issuer',google,'subject','historical-'||suffix)) else '[]'::jsonb end)),count(*)
    into records,n from public.app_users u;
  perform public.import_cognito_legacy_inventory(test_run,repeat('7',64),n,records);
  select count(*) into privy_n from public.app_users where privy_user_id like 'did:privy:%';
  perform public.import_cognito_unowned_inventory(test_run,privy_n+1,jsonb_build_array(jsonb_build_object(
    'privyUserId','did:privy:unowned-'||suffix,'accounts',jsonb_build_array(jsonb_build_object('issuer',google,'subject','unowned-'||suffix)),
    'emails',jsonb_build_array('unowned-'||suffix||'@example.test'))));
  perform public.complete_cognito_legacy_inventory(test_run);
  select to_jsonb(r) into original_run from public.legacy_auth_inventory_runs r where id=test_run;
  select count(*) into original_owners from public.legacy_auth_inventory_owners o where o.run_id=test_run;
  select to_jsonb(u) into original_unowned from public.legacy_auth_inventory_unowned u where u.run_id=test_run;
  perform pg_temp.live_assert(public.cognito_rollout_ready(),'baseline inventory incomplete');

  accounts:=jsonb_build_array(jsonb_build_object('issuer',google,'subject','native-'||suffix));
  select app_user_id into native_id from public.sync_privy_identity_with_provider_accounts(
    'did:privy:native-'||suffix,'native-'||suffix||'@example.test',91342,w2,accounts);
  perform pg_temp.live_assert(public.cognito_rollout_ready(),'new native owner blocked all web enrollment');
  result:=public.classify_cognito_enrollment(google,'native-'||suffix,'native-'||suffix||'@example.test');
  perform pg_temp.live_assert(result->>'mode'='recovery' and result->>'expectedPrivyUserId'='did:privy:native-'||suffix,'native subject lost original owner');
  perform pg_temp.live_assert((select app_user_id from public.sync_privy_identity_with_provider_accounts(
    'did:privy:native-'||suffix,'native-'||suffix||'@example.test',91342,w2,accounts))=native_id,'retry changed UUID');
  result:=public.link_external_auth_identity(issuer,'native-'||suffix,'did:privy:native-'||suffix,w2,91342,'native-'||suffix||'@example.test',false);
  perform pg_temp.live_assert(result->>'appUserId'=native_id::text,'live recovery could not enter pending link');
  result:=public.link_external_auth_identity(issuer,'native-'||suffix,'did:privy:native-'||suffix,w2,91342,'native-'||suffix||'@example.test');
  perform pg_temp.live_assert(result->>'appUserId'=native_id::text and result->>'walletAddress'=w2,'live linking changed owner or wallet');
  perform pg_temp.live_assert(public.classify_cognito_enrollment(google,'other-'||suffix,'native-'||suffix||'@example.test')->>'mode'='blocked','email collision merged owners');

  accounts:=jsonb_build_array(jsonb_build_object('issuer',google,'subject','unowned-'||suffix));
  perform pg_temp.live_assert(public.classify_cognito_enrollment(google,'unowned-'||suffix,'unowned-'||suffix||'@example.test')->>'mode'='blocked','unowned fixture not blocked');
  select app_user_id into promoted_id from public.sync_privy_identity_with_provider_accounts(
    'did:privy:unowned-'||suffix,'unowned-'||suffix||'@example.test',91342,w3,accounts);
  perform pg_temp.live_assert(public.cognito_rollout_ready(),'promoted unowned DID invalidated coverage');
  result:=public.classify_cognito_enrollment(google,'unowned-'||suffix,'unowned-'||suffix||'@example.test');
  perform pg_temp.live_assert(result->>'mode'='recovery' and result->>'expectedPrivyUserId'='did:privy:unowned-'||suffix,'stale unowned row blocked verified owner');
  select app_user_id into empty_id from public.sync_privy_identity_with_provider_accounts(
    'did:privy:emailonly-'||suffix,'emailonly-'||suffix||'@example.test',91342,w4,'[]');
  perform pg_temp.live_assert(public.cognito_rollout_ready(),'verified email-only owner was left uncovered');
  perform pg_temp.live_assert(public.classify_cognito_enrollment(google,'fresh-'||suffix,'fresh-'||suffix||'@example.test')->>'mode'='new','safe new enrollment blocked');

  for accounts in select jsonb_build_array(jsonb_build_object('issuer',google,'subject',s)) from unnest(array['native-'||suffix,'historical-'||suffix,'unowned-'||suffix]) s loop
    begin
      perform public.sync_privy_identity_with_provider_accounts('did:privy:collision-'||suffix,'collision-'||suffix||'@example.test',91342,w5,accounts);
      raise exception 'conflicting provider accepted';
    exception when others then
      perform pg_temp.live_assert(sqlerrm='VERIFIED_PROVIDER_OWNER_CONFLICT','unexpected provider conflict result: '||sqlerrm);
    end;
    perform pg_temp.live_assert(not exists(select 1 from public.app_users where privy_user_id='did:privy:collision-'||suffix),'conflict committed owner');
    perform pg_temp.live_assert(not exists(select 1 from public.user_wallets where address=w5),'conflict committed wallet');
  end loop;
  begin
    perform public.sync_privy_identity_with_provider_accounts('did:privy:invalid-'||suffix,'invalid-'||suffix||'@example.test',91342,w5,'[{"issuer":"https://accounts.google.com","subject":42}]');
    raise exception 'malformed provider accepted';
  exception when others then perform pg_temp.live_assert(sqlerrm='INVALID_VERIFIED_PROVIDER_ACCOUNTS','malformed provider wrong failure'); end;
  begin
    perform public.sync_privy_identity_with_provider_accounts('did:privy:native-'||suffix,'native-'||suffix||'@example.test',91342,w5,'[]');
    raise exception 'wallet replacement accepted';
  exception when check_violation then null; end;

  -- Scrubbing keeps the historical subject blocked even after the stored DID is retired.
  update public.app_users set status='disabled',privy_user_id='deleted:'||promoted_id::text where id=promoted_id;
  perform pg_temp.live_assert(public.classify_cognito_enrollment(google,'unowned-'||suffix,'unowned-'||suffix||'@example.test')->>'mode'='blocked','scrubbed live subject became new');
  update public.app_users set status='disabled',privy_user_id='deleted:'||native_id::text where id=native_id;
  perform pg_temp.live_assert(public.classify_cognito_enrollment(google,'native-'||suffix,'changed-'||suffix||'@example.test')->>'mode'='blocked','live-only scrubbed subject became new');
  insert into public.cognito_enrollment_permits(token_hash,issuer,subject,provider_issuer,provider_subject,verified_email,expires_at)
    values(repeat('9',64),issuer,'scrubbed-'||suffix,google,'native-'||suffix,'changed-'||suffix||'@example.test',now()+interval '10 minutes');
  perform pg_temp.live_assert(not public.cognito_initial_wallet_allowed(repeat('9',64),issuer,'scrubbed-'||suffix,google,'native-'||suffix,'changed-'||suffix||'@example.test','did:privy:replacement-'||suffix),'scrubbed subject permitted replacement wallet');
  update public.app_users set status='disabled' where id=empty_id;
  begin
    perform public.sync_privy_identity_with_provider_accounts('did:privy:emailonly-'||suffix,'emailonly-'||suffix||'@example.test',91342,w4,'[]');
    raise exception 'disabled owner accepted';
  exception when insufficient_privilege then null; end;

  perform pg_temp.live_assert((select to_jsonb(r)=original_run from public.legacy_auth_inventory_runs r where id=test_run),'snapshot run mutated');
  perform pg_temp.live_assert((select count(*)=original_owners from public.legacy_auth_inventory_owners o where o.run_id=test_run),'snapshot owners mutated');
  perform pg_temp.live_assert((select to_jsonb(u)=original_unowned from public.legacy_auth_inventory_unowned u where u.run_id=test_run),'unowned snapshot mutated');
  perform pg_temp.live_assert(not has_function_privilege('anon','public.sync_privy_identity_with_provider_accounts(text,text,bigint,text,jsonb)','execute'),'anonymous live sync allowed');
  perform pg_temp.live_assert(not has_function_privilege('authenticated','public.sync_privy_identity_with_provider_accounts(text,text,bigint,text,jsonb)','execute'),'authenticated live sync allowed');
  perform pg_temp.live_assert(not has_table_privilege('authenticated','public.live_privy_auth_accounts','select'),'live provider claims publicly readable');
end;
$$;
rollback;

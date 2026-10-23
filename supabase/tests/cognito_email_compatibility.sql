begin;
create function pg_temp.cognito_email_assert(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
do $$
declare owner_id uuid:=extensions.gen_random_uuid(); legacy_id uuid:=extensions.gen_random_uuid(); session_id uuid:=extensions.gen_random_uuid(); next_session uuid:=extensions.gen_random_uuid();
  issuer text:='https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_fixture'; result jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values(owner_id,'did:privy:cognito-email-fixture','cognito-email-fixture@example.test');
  insert into public.legacy_email_credentials(legacy_user_id,app_user_id,email,encrypted_password,email_confirmed_at,enabled)
    values(legacy_id,owner_id,'cognito-email-fixture@example.test',extensions.crypt('test-only-password',extensions.gen_salt('bf',6)),now(),true);
  perform pg_temp.cognito_email_assert(public.verify_legacy_email_password('cognito-email-fixture@example.test','wrong') is null,'wrong password accepted');
  result:=public.verify_legacy_email_password('cognito-email-fixture@example.test','test-only-password');
  perform pg_temp.cognito_email_assert(result->>'legacyUserId'=legacy_id::text,'legacy UUID changed during migration');
  result:=public.resolve_cognito_email_owner(legacy_id,issuer,'cognito-email-sub','cognito-email-fixture@example.test');
  perform pg_temp.cognito_email_assert(result->>'appUserId'=owner_id::text and result->>'privyUserId'='did:privy:cognito-email-fixture','email owner remapped');
  perform pg_temp.cognito_email_assert(public.resolve_cognito_email_owner(legacy_id,issuer,'wrong-sub','cognito-email-fixture@example.test') is null,'other Cognito identity took over existing owner');
  perform public.write_cognito_email_session(session_id,legacy_id,'encrypted',repeat('a',64),now()+interval '10 minutes');
  perform pg_temp.cognito_email_assert(public.read_cognito_email_session(session_id,null)->>'legacyUserId'=legacy_id::text,'email access session missing');
  perform public.write_cognito_email_session(next_session,legacy_id,'rotated',repeat('b',64),now()+interval '10 minutes',repeat('a',64));
  perform pg_temp.cognito_email_assert(public.read_cognito_email_session(session_id,null) is null,'old access session survived rotation');
  begin
    perform public.write_cognito_email_session(extensions.gen_random_uuid(),legacy_id,'replay',repeat('c',64),now()+interval '10 minutes',repeat('a',64));
    raise exception 'email refresh replay accepted';
  exception when others then if sqlerrm='email refresh replay accepted' then raise; end if; end;
  perform public.revoke_cognito_email_session(next_session);
  perform pg_temp.cognito_email_assert(public.read_cognito_email_session(next_session,null) is null,'revoked access allowed');
  perform pg_temp.cognito_email_assert(not has_table_privilege('service_role','public.legacy_email_credentials','select'),'app role can read password hashes');
  perform pg_temp.cognito_email_assert(not has_function_privilege('service_role','public.verify_legacy_email_password(text,text)','execute'),'app role can invoke password migration verifier');
  perform pg_temp.cognito_email_assert(has_function_privilege('legacy_auth_migrator','public.verify_legacy_email_password(text,text)','execute'),'restricted migration role cannot verify passwords');
  update public.legacy_email_credentials set banned_until=now()+interval '1 hour' where legacy_user_id=legacy_id;
  perform pg_temp.cognito_email_assert(public.verify_legacy_email_password('cognito-email-fixture@example.test','test-only-password') is null,'banned user migrated');
  perform pg_temp.cognito_email_assert(public.resolve_cognito_email_owner(legacy_id,issuer,'cognito-email-sub','cognito-email-fixture@example.test') is null,'banned email owner allowed');
end;
$$;
rollback;

do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then
    raise exception 'Account onboarding tests require disposable local byus_clean';
  end if;
end $$;
begin;

do $$ begin
  if exists(select 1 from public.app_users where id='af040000-0000-4000-8000-000000000099') then
    if public.get_owned_account_onboarding('af040000-0000-4000-8000-000000000099')#>>'{profile,nickname}'<>'Before Passport'
      or public.get_owned_account_onboarding('af040000-0000-4000-8000-000000000099')->'passport'<>'null'::jsonb then
      raise exception 'Upgrade changed an existing web profile or invented consent';
    end if;
  end if;
end $$;

create function pg_temp.expect_onboarding_error(statement text,expected text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm)=0 then raise exception 'Unexpected error %, wanted %',sqlerrm,expected; end if;
    return;
  end;
  raise exception 'Expected error was not raised: %',expected;
end $$;

do $$
declare
  owner constant uuid:='af040000-0000-4000-8000-000000000001';
  other_owner constant uuid:='af040000-0000-4000-8000-000000000002';
  request_id constant uuid:='af040000-0000-4000-8000-000000000010';
  first_result jsonb;
  second_result jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (owner,'did:privy:mobile-onboarding','mobile-onboarding@example.invalid'),
    (other_owner,'did:privy:mobile-onboarding-other','mobile-onboarding-other@example.invalid');
  if public.get_owned_account_onboarding(owner)->'passport'<>'null'::jsonb then raise exception 'Passport issued before consent'; end if;
  perform pg_temp.expect_onboarding_error(format(
    'select public.complete_owned_account_onboarding(%L,%L,%L,false,true,%L)',owner,request_id,'Passport Fan','2026-10-11'),'ONBOARDING_CONSENT_REQUIRED');
  perform pg_temp.expect_onboarding_error(format(
    'select public.complete_owned_account_onboarding(%L,%L,%L,true,true,%L)',owner,request_id,'Passport Fan','old'),'ONBOARDING_POLICY_CHANGED');
  if exists(select 1 from public.user_profiles where app_user_id=owner) then raise exception 'Rejected consent changed profile'; end if;

  first_result:=public.complete_owned_account_onboarding(owner,request_id,'Passport Fan',true,true,'2026-10-11');
  second_result:=public.complete_owned_account_onboarding(owner,request_id,'  Passport Fan  ',true,true,'2026-10-11');
  if first_result is distinct from second_result or first_result#>>'{profile,completed}'<>'true'
    or first_result#>>'{passport,id}' is null then raise exception 'Completion is not idempotent'; end if;
  if public.complete_owned_account_onboarding(owner,extensions.gen_random_uuid(),'Passport Fan',true,true,'2026-10-11') is distinct from first_result then
    raise exception 'Lost request key duplicated passport';
  end if;
  perform pg_temp.expect_onboarding_error(format(
    'select public.complete_owned_account_onboarding(%L,%L,%L,true,true,%L)',owner,request_id,'Changed Fan','2026-10-11'),'ONBOARDING_REQUEST_CONFLICT');
  perform pg_temp.expect_onboarding_error(format(
    'select public.complete_owned_account_onboarding(%L,%L,%L,true,true,%L)',other_owner,request_id,'passport fan','2026-10-11'),'FAN005_NICKNAME_TAKEN');
  if exists(select 1 from public.account_passports where app_user_id=other_owner) then raise exception 'Nickname collision issued passport'; end if;
  if (select count(*) from public.account_passports where app_user_id=owner)<>1
    or exists(select 1 from public.quiz_passes where app_user_id=owner)
    or exists(select 1 from public.community_stamps where app_user_id=owner) then
    raise exception 'Account passport duplicated or counted as fan authentication';
  end if;
  if public.read_owned_nickname_availability(other_owner,'Passport Fan')->>'reason'<>'taken'
    or public.read_owned_nickname_availability(owner,'Passport Fan')->>'available'<>'true'
    or public.read_owned_nickname_availability(other_owner,'admin')->>'reason'<>'prohibited'
    or public.read_owned_nickname_availability(other_owner,E'a\nb')->>'reason'<>'invalid' then
    raise exception 'Nickname availability contract failed';
  end if;

  -- Existing web profiles keep their nickname and receive no passport until consent.
  perform public.set_owned_user_nickname(other_owner,'Existing Web Fan');
  if public.get_owned_account_onboarding(other_owner)->'passport'<>'null'::jsonb then raise exception 'Legacy profile was silently enrolled'; end if;
  perform public.complete_owned_account_onboarding(other_owner,request_id,'Existing Web Fan',true,true,'2026-10-11');
  update public.app_users set status='disabled' where id=owner;
  if exists(select 1 from public.account_passports where app_user_id=owner) then raise exception 'Disabled account retained passport data'; end if;
  perform pg_temp.expect_onboarding_error(format('select public.get_owned_account_onboarding(%L)',owner),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');

  if has_table_privilege('anon','public.account_passports','select')
    or has_table_privilege('authenticated','public.account_passports','select')
    or has_table_privilege('service_role','public.account_passports','insert')
    or has_function_privilege('authenticated','public.complete_owned_account_onboarding(uuid,uuid,text,boolean,boolean,text)','execute')
    or not has_function_privilege('service_role','public.complete_owned_account_onboarding(uuid,uuid,text,boolean,boolean,text)','execute') then
    raise exception 'Onboarding access boundary failed';
  end if;
end $$;
rollback;
select 'Account onboarding consent, idempotency, legacy profile, deletion and access PASS' as result;

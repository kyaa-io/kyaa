\set ON_ERROR_STOP on
begin;
do $$
declare
  owner_id uuid:=extensions.gen_random_uuid();
  subject text:='did:privy:native-reauth-test';
  input jsonb;
  binding jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values(owner_id,subject,'native-reauth@example.invalid');
  insert into public.apple_auth_owners(privy_user_id,generation) values(subject,4);
  input:=jsonb_build_object('handoffHash',repeat('a',64),'privyUserId',subject,
    'sessionHash',repeat('b',64),'provider','google','providerSubjectHash',repeat('c',64),
    'generation',4,'locale','zh-Hant','returnState',repeat('N',43));
  if not public.create_native_apple_reauth_handoff(input) then raise exception 'handoff not created'; end if;
  binding:=public.consume_native_apple_reauth_handoff(repeat('a',64));
  if binding->>'sessionHash'<>repeat('b',64) or binding->>'privyUserId'<>subject
    or binding->>'locale'<>'zh-Hant' or binding->>'returnState'<>repeat('N',43) then
    raise exception 'native binding changed';
  end if;
  if public.consume_native_apple_reauth_handoff(repeat('a',64)) is not null then raise exception 'handoff replay accepted'; end if;
  perform public.create_native_apple_reauth_handoff(input||jsonb_build_object('handoffHash',repeat('d',64)));
  update public.apple_auth_owners set generation=5 where privy_user_id=subject;
  if public.consume_native_apple_reauth_handoff(repeat('d',64)) is not null then raise exception 'stale generation accepted'; end if;
  if public.create_native_apple_reauth_handoff(input||jsonb_build_object('handoffHash',repeat('e',64))) then raise exception 'stale generation created'; end if;
  input:=input||jsonb_build_object('generation',5,'handoffHash',repeat('e',64));
  perform public.create_native_apple_reauth_handoff(input);
  update public.native_apple_reauth_handoffs set expires_at=pg_catalog.clock_timestamp()-interval '1 second' where handoff_hash=repeat('e',64);
  if public.consume_native_apple_reauth_handoff(repeat('e',64)) is not null then raise exception 'expired handoff accepted'; end if;
  perform public.create_native_apple_reauth_handoff(input||jsonb_build_object('handoffHash',repeat('f',64)));
  insert into public.account_subject_tombstones(subject_hash,app_user_id)
    values(encode(extensions.digest(subject,'sha256'),'hex'),owner_id);
  if public.consume_native_apple_reauth_handoff(repeat('f',64)) is not null then raise exception 'deleted account accepted'; end if;
  if public.create_native_apple_reauth_handoff(input||jsonb_build_object('handoffHash',repeat('1',64))) then raise exception 'deleted account created handoff'; end if;
  delete from public.apple_auth_owners where privy_user_id=subject;
  if exists(select 1 from public.native_apple_reauth_handoffs where privy_user_id=subject) then raise exception 'account cleanup left handoff'; end if;
  if has_function_privilege('anon','public.consume_native_apple_reauth_handoff(text)','execute')
    or has_function_privilege('authenticated','public.create_native_apple_reauth_handoff(jsonb)','execute') then raise exception 'handoff RPC exposed'; end if;
end $$;
rollback;

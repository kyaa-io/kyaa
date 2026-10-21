begin;
insert into public.app_users(id,privy_user_id,verified_email,status) values
('aa000000-0000-4000-8000-000000000001','did:privy:kyaa-owner','kyaa-owner@example.test','active'),
('aa000000-0000-4000-8000-000000000002','did:privy:kyaa-other','kyaa-other@example.test','active'),
('aa000000-0000-4000-8000-000000000003','did:privy:kyaa-disabled','kyaa-disabled@example.test','disabled'),
('aa000000-0000-4000-8000-000000000004','did:privy:kyaa-admin','kyaa-admin@example.test','active');
insert into public.admin_allowlist(id,email,role,active) values('aa000000-0000-4000-8000-000000000005','kyaa-admin@example.test','admin',true);
-- No printed code is present in source or fixtures: this is only a synthetic hash.
update public.kyaa_wave_participation_config set code_hash=repeat('a',64),enabled=true;
do $$
declare role_name text; table_name text; result jsonb; first_receipt jsonb;
 owner_id uuid:='aa000000-0000-4000-8000-000000000001'; other_id uuid:='aa000000-0000-4000-8000-000000000002';
 request_id uuid:='aa000000-0000-4000-8000-000000000010';
 cipher text:='v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('C',12);
begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  foreach table_name in array array['kyaa_wave_participation_config','kyaa_wave_participants','kyaa_wave_participation_requests','kyaa_wave_participation_attempts'] loop
   if has_table_privilege(role_name,'public.'||table_name,'select,insert,update,delete') then raise exception 'direct ACL exposure % %',role_name,table_name; end if;
   if not exists(select 1 from pg_class where oid=('public.'||table_name)::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'missing forced RLS'; end if;
  end loop;
  if role_name<>'service_role' and has_function_privilege(role_name,'public.submit_kyaa_wave_participation(uuid,uuid,text,text,text,text)','execute') then raise exception 'RPC exposure'; end if;
 end loop;
 if not has_function_privilege('service_role','public.submit_kyaa_wave_participation(uuid,uuid,text,text,text,text)','execute') then raise exception 'service RPC missing'; end if;
 begin perform public.read_owned_kyaa_wave_participation('aa000000-0000-4000-8000-000000000003'); raise exception 'inactive owner allowed'; exception when insufficient_privilege then null; end;
 if public.read_owned_kyaa_wave_participation(other_id)<>jsonb_build_object('participation',null) then raise exception 'owner read not empty'; end if;
 result:=public.submit_kyaa_wave_participation(owner_id,request_id,repeat('b',64),repeat('c',64),cipher,repeat('1',64));
 if result#>>'{error,code}'<>'PARTICIPATION_CODE_INVALID' or (select attempts from public.kyaa_wave_participation_attempts where app_user_id=owner_id)<>1 then raise exception 'wrong-code attempt lost'; end if;
 result:=public.submit_kyaa_wave_participation(owner_id,request_id,repeat('a',64),repeat('d',64),cipher,repeat('1',64));
 if result->'participation' is null then raise exception 'corrected retry failed'; end if;
 first_receipt:=result;
 if public.read_owned_kyaa_wave_participation(other_id)<>jsonb_build_object('participation',null) then raise exception 'cross-owner exposure'; end if;
 result:=public.submit_kyaa_wave_participation(owner_id,request_id,repeat('a',64),repeat('d',64),replace(cipher,'C','D'),repeat('1',64));
 if result<>first_receipt then raise exception 'random-cipher retry changed receipt'; end if;
 result:=public.submit_kyaa_wave_participation(owner_id,request_id,repeat('a',64),repeat('e',64),cipher,repeat('1',64));
 if result#>>'{error,code}'<>'PARTICIPATION_IDEMPOTENCY_CONFLICT' then raise exception 'changed name same request accepted'; end if;
 result:=public.submit_kyaa_wave_participation(owner_id,gen_random_uuid(),repeat('a',64),repeat('e',64),replace(cipher,'C','D'),repeat('1',64));
 if result<>first_receipt or (select name_encrypted from public.kyaa_wave_participants where app_user_id=owner_id)<>cipher then raise exception 'existing name overwritten'; end if;
 for attempt in 1..10 loop perform public.submit_kyaa_wave_participation(other_id,gen_random_uuid(),repeat('b',64),repeat('d',64),cipher,repeat('2',64)); end loop;
 result:=public.submit_kyaa_wave_participation(other_id,gen_random_uuid(),repeat('a',64),repeat('d',64),cipher,repeat('2',64));
 if result#>>'{error,code}'<>'PARTICIPATION_RATE_LIMITED' or (select attempts from public.kyaa_wave_participation_attempts where app_user_id=other_id)<>10 then raise exception 'invalid attempts not rate limited'; end if;
 update public.kyaa_wave_participation_config set manual_code_hash=repeat('f',64);
 update public.kyaa_wave_participation_attempts set window_started_at=clock_timestamp()-interval '16 minutes' where app_user_id=other_id;
 result:=public.submit_kyaa_wave_participation(other_id,gen_random_uuid(),repeat('f',64),repeat('d',64),cipher,repeat('2',64));
 if result->'participation' is null then raise exception 'quota window failed to reset'; end if;
 begin perform public.list_admin_kyaa_wave_participants(owner_id,'aa000000-0000-4000-8000-000000000005'); raise exception 'wrong admin actor allowed'; exception when insufficient_privilege then null; end;
 begin perform public.list_admin_kyaa_wave_participants('aa000000-0000-4000-8000-000000000004',owner_id); raise exception 'wrong admin allowlist allowed'; exception when insufficient_privilege then null; end;
 result:=public.list_admin_kyaa_wave_participants('aa000000-0000-4000-8000-000000000004','aa000000-0000-4000-8000-000000000005');
 if jsonb_array_length(result)<>2 then raise exception 'admin projection failed'; end if;
 update public.kyaa_wave_participation_config set enabled=false;
 if public.submit_kyaa_wave_participation(owner_id,request_id,repeat('a',64),repeat('d',64),cipher,repeat('1',64))<>first_receipt then raise exception 'closed event lost historical retry'; end if;
 result:=public.submit_kyaa_wave_participation(owner_id,gen_random_uuid(),repeat('a',64),repeat('d',64),cipher,repeat('1',64));
 if result#>>'{error,code}'<>'PARTICIPATION_CLOSED' then raise exception 'closed event accepted'; end if;
 update public.app_users set status='disabled' where id=owner_id;
 if exists(select 1 from public.kyaa_wave_participants where app_user_id=owner_id) or exists(select 1 from public.kyaa_wave_participation_requests where app_user_id=owner_id) or exists(select 1 from public.kyaa_wave_participation_attempts where app_user_id=owner_id) then raise exception 'disable kept private data'; end if;
end $$;
set local role service_role;
select public.read_owned_kyaa_wave_participation('aa000000-0000-4000-8000-000000000002');
reset role;
rollback;

\ir kyaa_wave_duplicate_participation.sql

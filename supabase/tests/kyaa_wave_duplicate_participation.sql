begin;
insert into public.app_users(id,privy_user_id,verified_email,status)
 select ('ad000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'did:privy:wave-duplicate-'||n,'wave-duplicate-'||n||'@example.test','active' from generate_series(1,8) n;
insert into public.admin_allowlist(id,email,role,active) values
 ('ad000000-0000-4000-8000-000000000010','wave-duplicate-7@example.test','admin',true),
 ('ad000000-0000-4000-8000-000000000011','wave-duplicate-8@example.test','viewer',true);
update public.kyaa_wave_participation_config set code_hash=repeat('a',64),enabled=true;
create function pg_temp.wave_submit(owner_number integer,fingerprint text default null,code_hash text default repeat('a',64)) returns jsonb language sql as $$
 select public.submit_kyaa_wave_participation(('ad000000-0000-4000-8000-'||lpad(owner_number::text,12,'0'))::uuid,gen_random_uuid(),code_hash,repeat('b',64),'v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('C',12),fingerprint)
$$;
do $$
declare result jsonb; receipt jsonb; role_name text;
 admin_id uuid:='ad000000-0000-4000-8000-000000000007'; allowlist_id uuid:='ad000000-0000-4000-8000-000000000010';
 target_id uuid:='ad000000-0000-4000-8000-000000000002';
 cipher text:='v1.'||repeat('A',16)||'.'||repeat('B',22)||'.'||repeat('C',12);
begin
 if to_regprocedure('public.submit_kyaa_wave_participation(uuid,uuid,text,text,text)') is not null then raise exception 'legacy overload remains'; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'public.kyaa_wave_participation_name_exceptions','select,insert,update,delete') then raise exception 'exception ACL exposed'; end if;
  if role_name<>'service_role' and (has_function_privilege(role_name,'public.submit_kyaa_wave_participation(uuid,uuid,text,text,text,text)','execute') or has_function_privilege(role_name,'public.grant_kyaa_wave_participation_name_exception(uuid,uuid,uuid,uuid,text)','execute')) then raise exception 'RPC exposed'; end if;
 end loop;
 if not exists(select 1 from pg_class where oid='public.kyaa_wave_participation_name_exceptions'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'exception missing forced RLS'; end if;
 result:=public.submit_kyaa_wave_participation(target_id,gen_random_uuid(),repeat('a',64),repeat('b',64),cipher);
 if result#>>'{error,code}' is distinct from 'PARTICIPATION_REVIEW_REQUIRED' then raise exception 'legacy new entry bypass'; end if;
 receipt:=pg_temp.wave_submit(1,repeat('1',64));
 if receipt->'participation' is null then raise exception 'first name rejected'; end if;
 result:=pg_temp.wave_submit(2,repeat('1',64));
 if result#>>'{error,code}' is distinct from 'PARTICIPATION_REVIEW_REQUIRED' then raise exception 'same name admitted'; end if;
 if (select attempts from public.kyaa_wave_participation_attempts where app_user_id=target_id)<>2 then raise exception 'review attempts lost'; end if;
 if pg_temp.wave_submit(1)<>receipt then raise exception 'legacy own receipt lost'; end if;
 result:=pg_temp.wave_submit(3,repeat('3',64));
 if result->'participation' is null then raise exception 'distinct name blocked'; end if;
 begin
  insert into public.kyaa_wave_participants(app_user_id,name_encrypted) values('ad000000-0000-4000-8000-000000000004',cipher);
  raise exception 'new NULL fingerprint accepted';
 exception when check_violation then null; end;
 -- A historical unknown name blocks only new participation, even with an exception.
 alter table public.kyaa_wave_participants drop constraint kyaa_wave_participants_name_fingerprint_required;
 insert into public.kyaa_wave_participants(app_user_id,name_encrypted) values('ad000000-0000-4000-8000-000000000004',cipher);
 alter table public.kyaa_wave_participants add constraint kyaa_wave_participants_name_fingerprint_required check(name_fingerprint is not null) not valid;
 result:=pg_temp.wave_submit(5,repeat('5',64));
 if result#>>'{error,code}' is distinct from 'PARTICIPATION_REVIEW_REQUIRED' then raise exception 'null backfill guard bypass'; end if;
 if public.read_owned_kyaa_wave_participation('ad000000-0000-4000-8000-000000000001')<>receipt then raise exception 'null backfill changed receipt'; end if;
 begin perform public.grant_kyaa_wave_participation_name_exception('ad000000-0000-4000-8000-000000000008','ad000000-0000-4000-8000-000000000011',gen_random_uuid(),target_id,repeat('1',64)); raise exception 'viewer wrote'; exception when insufficient_privilege then null; end;
 begin perform public.grant_kyaa_wave_participation_name_exception(target_id,allowlist_id,gen_random_uuid(),target_id,repeat('1',64)); raise exception 'nonadmin wrote'; exception when insufficient_privilege then null; end;
 begin perform public.grant_kyaa_wave_participation_name_exception(admin_id,allowlist_id,gen_random_uuid(),target_id,'bad'); raise exception 'bad hash accepted'; exception when others then if sqlerrm<>'PARTICIPATION_INVALID' then raise; end if; end;
 if public.grant_kyaa_wave_participation_name_exception(admin_id,allowlist_id,gen_random_uuid(),target_id,repeat('1',64))<>jsonb_build_object('approved',true) then raise exception 'grant failed'; end if;
 result:=pg_temp.wave_submit(2,repeat('1',64));
 if result#>>'{error,code}' is distinct from 'PARTICIPATION_REVIEW_REQUIRED' then raise exception 'exception bypassed null guard'; end if;
 delete from public.kyaa_wave_participants where app_user_id='ad000000-0000-4000-8000-000000000004';
 result:=pg_temp.wave_submit(2,repeat('1',64),repeat('c',64));
 if result#>>'{error,code}' is distinct from 'PARTICIPATION_CODE_INVALID' or not exists(select 1 from public.kyaa_wave_participation_name_exceptions where app_user_id=target_id and consumed_at is null) then raise exception 'invalid code consumed exception'; end if;
 result:=pg_temp.wave_submit(5,repeat('1',64));
 if result#>>'{error,code}' is distinct from 'PARTICIPATION_REVIEW_REQUIRED' then raise exception 'exception crossed account'; end if;
 result:=pg_temp.wave_submit(2,repeat('3',64));
 if result#>>'{error,code}' is distinct from 'PARTICIPATION_REVIEW_REQUIRED' then raise exception 'exception crossed name'; end if;
 result:=pg_temp.wave_submit(2,repeat('1',64));
 if result->'participation' is null or not exists(select 1 from public.kyaa_wave_participation_name_exceptions where app_user_id=target_id and consumed_at is not null) then raise exception 'approved entry or consumption failed'; end if;
 if pg_temp.wave_submit(2,repeat('1',64))<>result then raise exception 'exception retry changed receipt'; end if;
 delete from public.kyaa_wave_participants where app_user_id=target_id;
 result:=pg_temp.wave_submit(2,repeat('1',64));
 if result#>>'{error,code}' is distinct from 'PARTICIPATION_REVIEW_REQUIRED' then raise exception 'exception reused'; end if;
 begin perform public.grant_kyaa_wave_participation_name_exception(admin_id,allowlist_id,gen_random_uuid(),target_id,repeat('1',64)); raise exception 'consumed exception regranted'; exception when others then if sqlerrm<>'PARTICIPATION_IDEMPOTENCY_CONFLICT' then raise; end if; end;
 perform public.grant_kyaa_wave_participation_name_exception(admin_id,allowlist_id,gen_random_uuid(),'ad000000-0000-4000-8000-000000000006',repeat('1',64));
 update public.app_users set status='disabled' where id='ad000000-0000-4000-8000-000000000006';
 if exists(select 1 from public.kyaa_wave_participation_name_exceptions where app_user_id='ad000000-0000-4000-8000-000000000006') then raise exception 'disable retained exception'; end if;
 begin perform public.grant_kyaa_wave_participation_name_exception(admin_id,allowlist_id,gen_random_uuid(),'ad000000-0000-4000-8000-000000000006',repeat('1',64)); raise exception 'disabled exception granted'; exception when insufficient_privilege then null; end;
 if not exists(select 1 from pg_constraint where conrelid='public.kyaa_wave_participation_name_exceptions'::regclass and confrelid='public.app_users'::regclass and contype='f' and confdeltype='c') then raise exception 'exception user FK must cascade'; end if;
 if (select count(*) from public.audit_logs where action='kyaa_wave.participation_name_exception_granted' and actor_app_user_id=admin_id)<>2 then raise exception 'audit missing'; end if;
end $$;
rollback;

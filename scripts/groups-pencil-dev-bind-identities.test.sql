\set ON_ERROR_STOP on
\ir seed-groups-pencil-dev.test.sql
\if :{?fixture_native}
insert into public.fan_action_bindings(id,chain_id,environment_id,hub_proxy,relayer,schema_uid,schema_version,binding_version,asset_base_uri,assets)
values('fa140000-0000-4000-8000-000000000001',91342,'0x'||repeat('1',64),'0x'||repeat('2',40),'0x'||repeat('3',40),'0x'||repeat('4',64),1,1,'ipfs://bafyfixture',jsonb_build_object('1','0x'||repeat('5',40)));
insert into public.fan_action_producer_routes(action_code,binding_id,enabled,policy_version,enabled_at)
values(7,'fa140000-0000-4000-8000-000000000001',true,1,clock_timestamp());
\endif
set byus.groups_pencil_identities='[{"n":1,"privyUserId":"did:privy:fixture1","email":"privy1@example.test","walletAddress":"0x1111111111111111111111111111111111111111"},{"n":2,"privyUserId":"did:privy:fixture2","email":"privy2@example.test","walletAddress":"0x2222222222222222222222222222222222222222"},{"n":3,"privyUserId":"did:privy:fixture3","email":"privy3@example.test","walletAddress":"0x3333333333333333333333333333333333333333"}]';
\ir fixtures/groups-pencil-dev-bind-identities.sql
create temp table binding_before as select jsonb_agg((to_jsonb(u)-'updated_at'-'last_authenticated_at')order by id)rows from public.app_users u where id::text like'f1610000-%';
create temp table outbox_before as select jsonb_agg(to_jsonb(j)order by id)rows from public.fan_action_outbox j;
create temp table jobs_before as select jsonb_agg(to_jsonb(j)order by id)rows from public.blockchain_jobs j;
\ir fixtures/groups-pencil-dev-bind-identities.sql
\ir fixtures/groups-pencil-dev.sql
do $$begin
 if(select rows from binding_before)is distinct from(select jsonb_agg((to_jsonb(u)-'updated_at'-'last_authenticated_at')order by id)from public.app_users u where id::text like'f1610000-%')then raise exception 'Identity replay changed accounts';end if;
 if(select rows from jobs_before)is distinct from(select jsonb_agg(to_jsonb(j)order by id)from public.blockchain_jobs j)then raise exception 'Identity replay changed jobs';end if;
 if(select rows from outbox_before)is distinct from(select jsonb_agg(to_jsonb(j)order by id)from public.fan_action_outbox j)then raise exception 'Identity replay changed outbox';end if;
 if(select count(*)from public.community_stamps where app_user_id::text like'f1610000-%'and mint_status='permanent_failure')<>3 then raise exception 'Expected three stopped welcome fixtures';end if;
end $$;

\getenv fixture_repo PWD
create temp table fixture_binding_source as select regexp_replace(pg_read_file(:'fixture_repo'||'/scripts/fixtures/groups-pencil-dev-bind-identities.sql'),'(?m)^begin;|^commit;','','g') sql;
do $$declare original text:=current_setting('byus.groups_pencil_identities');before_accounts jsonb;begin
 select jsonb_agg(to_jsonb(u)order by id)into before_accounts from public.app_users u where id::text like'f1610000-%';
 perform set_config('byus.groups_pencil_identities',jsonb_set(original::jsonb,'{2,email}','"wrong@example.test"'::jsonb)::text,false);
 begin
  execute(select sql from fixture_binding_source);
  raise exception 'Identity collision was accepted';
 exception when raise_exception then if sqlerrm<>'DEV_FIXTURE_IDENTITY_COLLISION'then raise;end if;end;
 if before_accounts is distinct from(select jsonb_agg(to_jsonb(u)order by id)from public.app_users u where id::text like'f1610000-%')then raise exception 'Collision changed an account';end if;
 perform set_config('byus.groups_pencil_identities',original,false);
end $$;

\if :{?fixture_native}
do $$begin if(select count(*)from public.fan_action_outbox where last_error_code='DEV_FIXTURE_NO_BROADCAST')<>3 then raise exception 'Native welcome lane not exercised';end if;end $$;
\else
do $$begin if(select count(*)from public.blockchain_jobs where last_error_code='DEV_FIXTURE_NO_BROADCAST')<>3 then raise exception 'Legacy welcome lane not exercised';end if;end $$;
\endif

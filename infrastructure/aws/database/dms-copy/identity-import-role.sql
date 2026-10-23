-- Run only on the target with the reviewed operator. Provision its secret separately.
create role byus_identity_migrator login noinherit nosuperuser nocreatedb nocreaterole noreplication bypassrls;
grant usage on schema public to byus_identity_migrator;
grant select,insert,update,delete on public.legacy_email_credentials,public.legacy_auth_inventory_runs,public.legacy_auth_inventory_owners,public.legacy_auth_inventory_accounts,public.legacy_auth_inventory_unowned to byus_identity_migrator;
grant execute on function public.import_cognito_legacy_inventory(uuid,text,integer,jsonb),public.import_cognito_unowned_inventory(uuid,integer,jsonb),public.complete_cognito_legacy_inventory(uuid) to byus_identity_migrator;

-- Password hashes must never enter statement/error/statistics logs.
alter role byus_identity_migrator set log_statement='none';
alter role byus_identity_migrator set log_min_error_statement='panic';
alter role byus_identity_migrator set log_parameter_max_length_on_error=0;
alter role byus_identity_migrator set pg_stat_statements.track='none';
alter role byus_identity_migrator set log_min_duration_statement=-1;
alter role byus_identity_migrator set log_min_duration_sample=-1;

-- Managed RDS audit settings may be read-only to its administrator; require safe defaults.
do $$ begin
 if coalesce(current_setting('pgaudit.log',true),'none') not in('','none') or coalesce(current_setting('pgaudit.role',true),'')<>'' or coalesce(current_setting('auto_explain.log_min_duration',true),'-1')<>'-1' then raise exception 'Identity import requires safe audit and explain defaults';end if;
end $$;

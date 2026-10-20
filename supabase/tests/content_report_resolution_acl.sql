begin;
do $$
declare
  admin_id uuid := 'fa400000-0000-4000-8000-000000000001';
  reporter_id uuid := 'fa400000-0000-4000-8000-000000000002';
  allowlist_id uuid := 'fa400000-0000-4000-8000-000000000003';
  creator_id uuid := 'fa400000-0000-4000-8000-000000000004';
  post_id uuid;
  report_id uuid;
  correlation_id uuid := extensions.gen_random_uuid();
  result jsonb;
begin
  if has_function_privilege('anon','public.resolve_admin_content_report(uuid,uuid,uuid,uuid,text,boolean,text,boolean)','execute')
    or has_function_privilege('authenticated','public.resolve_admin_content_report(uuid,uuid,uuid,uuid,text,boolean,text,boolean)','execute') then
    raise exception 'untrusted roles can execute report moderation';
  end if;
  if not has_function_privilege('service_role','public.resolve_admin_content_report(uuid,uuid,uuid,uuid,text,boolean,text,boolean)','execute') then
    raise exception 'service role cannot execute report moderation';
  end if;
  if has_function_privilege('service_role','public.resolve_admin_content_report_before_moderation(uuid,uuid,uuid,uuid,text,boolean,text)','execute')
    or has_function_privilege('service_role','public.resolve_admin_content_report_before_mobile_participation(uuid,uuid,uuid,uuid,text,boolean,text)','execute') then
    raise exception 'service role can bypass the report moderation wrapper';
  end if;
  insert into public.app_users(id,privy_user_id,verified_email) values
    (admin_id,'did:privy:report-acl-admin','report-acl-admin@example.test'),
    (reporter_id,'did:privy:report-acl-reporter','report-acl-reporter@example.test');
  insert into public.admin_allowlist(id,email,role) values(allowlist_id,'report-acl-admin@example.test','operator');
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
    values(creator_id,'report-acl-qa','published','/images/creator.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
    values(creator_id,'ko','신고 권한 검사','소개','사진');
  result := public.save_fan_post(admin_id,'report-acl-qa',null,'Original reported post','public','{}',null,extensions.gen_random_uuid());
  post_id := (result->>'id')::uuid;
  result := public.post_content_report(reporter_id,'fan_post',post_id,'Community policy report',extensions.gen_random_uuid());
  report_id := (result->>'id')::uuid;

  execute 'set local role service_role';
  -- Keep the legacy seven-argument runtime call: the new sanction flag defaults false.
  result := public.resolve_admin_content_report(admin_id,allowlist_id,correlation_id,report_id,
    'resolved',true,'Confirmed community policy violation');
  execute 'reset role';
  if result->>'status'<>'resolved' or result->>'targetHidden'<>'true'
    or public.read_fan_post(null,post_id) is not null
    or not exists(select 1 from public.audit_logs where action='content.report.resolve' and entity_id=report_id::text) then
    raise exception 'service-role moderation did not preserve hiding and audit behavior: %',result;
  end if;
end $$;
rollback;

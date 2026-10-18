do $$
declare before_payload jsonb; after_payload jsonb;
begin
  select payload into before_payload from public.invitation_content_upgrade_snapshot;
  after_payload:=public.get_mobile_social_stamp_collection('1a127000-0000-4000-8000-000000000001');
  if after_payload-'invitation' is distinct from before_payload-'invitation'
    or after_payload#>'{invitation,count}' is distinct from before_payload#>'{invitation,count}'
    or after_payload#>'{invitation,milestones}' is distinct from before_payload#>'{invitation,milestones}'
    or after_payload#>'{invitation,content}'<>'[]'::jsonb then
    raise exception 'INVITATION_CONTENT_UPGRADE_CHANGED_EXISTING_PROJECTION: before %, after %',before_payload,after_payload;
  end if;
  if to_regclass('public.community_stamp_invitation_content_configs') is null
    or has_table_privilege('service_role','public.community_stamp_invitation_content_configs','SELECT')
    or has_function_privilege('authenticated','public.get_mobile_social_stamp_collection(uuid)','EXECUTE') then
    raise exception 'INVITATION_CONTENT_UPGRADE_EXPOSED_INTERNALS';
  end if;
end $$;

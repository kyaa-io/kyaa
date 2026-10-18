-- Preserve the existing CS ownership/replay/attachment checks and call its real signature.
begin;
do $$
declare
 definition text := pg_get_functiondef('public.mobile_cs_post(uuid,uuid,uuid,text,uuid,uuid,uuid[])'::regprocedure);
 original text := 'public.cs_post(p_app_user_id,null,p_inquiry_id,p_body,p_idempotency_key,null)';
 replacement text := 'public.cs_post(p_app_user_id=>p_app_user_id,p_inquiry_id=>p_inquiry_id,p_body=>p_body,p_idempotency_key=>p_idempotency_key,p_admin_allowlist_id=>null,p_correlation_id=>null)';
begin
 if position(original in definition)=0 then
  raise exception 'MOBILE_CS_POST_CONTRACT_CHANGED';
 end if;
 execute replace(definition,original,replacement);
end $$;
commit;

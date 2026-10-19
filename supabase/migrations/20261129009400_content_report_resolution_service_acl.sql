-- The mobile participation wrapper replaced this RPC without restoring the server execution grant.
revoke all on function public.resolve_admin_content_report(uuid,uuid,uuid,uuid,text,boolean,text)
  from public,anon,authenticated;
grant execute on function public.resolve_admin_content_report(uuid,uuid,uuid,uuid,text,boolean,text)
  to service_role;

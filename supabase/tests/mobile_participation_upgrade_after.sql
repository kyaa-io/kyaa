do $$ begin
  if to_regclass('public.mobile_participation_events') is null or to_regclass('public.mobile_participation_contexts') is null or to_regclass('public.mobile_participation_qr_codes') is null then raise exception 'mobile participation tables missing'; end if;
  if to_regprocedure('public.read_owned_mobile_participation_context(uuid,text,uuid,timestamp with time zone,uuid,integer)') is null then raise exception 'participation context read RPC missing'; end if;
  if to_regprocedure('public.claim_mobile_participation_activity_completion(integer)') is null then raise exception 'participation completion claim RPC missing'; end if;
  if to_regprocedure('public.confirm_admin_mobile_participation_qr(uuid,uuid,uuid,text,uuid)') is null then raise exception 'participation QR confirmation RPC missing'; end if;
  if not exists(select 1 from pg_constraint where conname='content_reports_target_type_check'and pg_get_constraintdef(oid)like'%participation_comment%')then raise exception'content report targets not upgraded';end if;
end $$;

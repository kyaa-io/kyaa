begin;
-- Extend only the already-authorized self-ticket projection; retain every access guard.
do $patch$
declare source text;needle text:=$old$'qrPayload','kyaa-event:'||r.id::text||':'||encode(r.ticket_token,'hex')$old$;
begin
 source:=pg_get_functiondef('public.group_activities_dispatch_before_operations(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 if (length(source)-length(replace(source,needle,'')))/length(needle)<>1 then raise exception 'Expected one event ticket projection';end if;
 execute replace(source,needle,$new$'participantName',(select nullif(btrim(nickname),'') from public.user_profiles where app_user_id=r.app_user_id),'qrPayload','kyaa-event:'||r.id::text||':'||encode(r.ticket_token,'hex')$new$);
end $patch$;
commit;

-- Late SNS recovery must not move an artist notification's representative backwards.
begin;
set local lock_timeout='5s';
do $migration$
declare signature regprocedure:='public.fan_web_drain_notification_intents(uuid,integer)'::regprocedure;
 definition text; owner_name text;
 old_fragment text:=$old$payload=f.payload||jsonb_build_object('targetId',intent.target_id,'revision',intent.revision,'count',coalesce((f.payload->>'count')::integer,1)+1)$old$;
 new_fragment text:=$new$payload=f.payload||jsonb_build_object('count',coalesce((f.payload->>'count')::integer,1)+1)
          ||case when (select coalesce(s.source_published_at,n.published_at,n.created_at)
                       from public.celebrity_notices n left join public.sns_ingest_posts s on s.notice_id=n.id where n.id=intent.target_id)
                     >= coalesce((select coalesce(s.source_published_at,n.published_at,n.created_at)
                       from public.celebrity_notices n left join public.sns_ingest_posts s on s.notice_id=n.id where n.id=(f.payload->>'targetId')::uuid),'-infinity'::timestamptz)
             then jsonb_build_object('targetId',intent.target_id,'revision',intent.revision) else '{}'::jsonb end$new$;
begin
 select pg_get_functiondef(signature),r.rolname into definition,owner_name from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=signature;
 if position(old_fragment in definition)=0 then raise exception 'ARTIST_NOTIFICATION_SOURCE_ORDER_BASE_CHANGED'; end if;
 if owner_name in ('anon','authenticated','service_role') then raise exception 'UNEXPECTED_NOTIFICATION_FUNCTION_OWNER'; end if;
 execute format('grant select on public.sns_ingest_posts to %I',owner_name);
 execute replace(definition,old_fragment,new_fragment);
end $migration$;
commit;

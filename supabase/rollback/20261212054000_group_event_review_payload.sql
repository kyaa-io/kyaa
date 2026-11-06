-- Rollback for 20261212054000_group_event_review_payload.sql. The web may stay: without the values it uses the old wording.
-- Notifications written meanwhile keep their values.
begin;
set local lock_timeout='5s';
do $patch$
declare def text;anchor text;
begin
 def:=pg_catalog.pg_get_functiondef('public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 anchor:=$a$jsonb_build_object('targetType','group_event','targetId',e.id,'revision',decisions,'decision',e.approval_status,'eventTitle',e.title)$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_EVENT_REVIEW_PAYLOAD_ROLLBACK';end if;
 execute replace(def,anchor,$a$jsonb_build_object('targetType','group_event','targetId',e.id,'revision',decisions)$a$);
end $patch$;
commit;

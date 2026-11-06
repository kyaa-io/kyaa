begin;
-- A review notification says which decision and which event. The review's own decision and title are stored, so a later review cannot change what an older notification says.
-- Only those two: the rejection reason stays on the event, where its owner reads it. Earlier notifications have neither and keep the old wording.
-- The web reads only named payload fields and this kind ignores the rest, so the deployed web keeps its old wording.
do $patch$
declare def text;anchor text;
begin
 def:=pg_catalog.pg_get_functiondef('public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 anchor:=$a$jsonb_build_object('targetType','group_event','targetId',e.id,'revision',decisions)$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_EVENT_REVIEW_PAYLOAD_UNPATCHED';end if;
 execute replace(def,anchor,$a$jsonb_build_object('targetType','group_event','targetId',e.id,'revision',decisions,'decision',e.approval_status,'eventTitle',e.title)$a$);
end $patch$;
commit;

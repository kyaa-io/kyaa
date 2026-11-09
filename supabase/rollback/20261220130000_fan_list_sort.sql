begin;
-- Deploy the previous web first. Legacy readers were never changed by this migration.
do $rollback$
declare def text;anchor text;
begin
 def:=pg_get_functiondef('public.group_public_directory_owner_roles()'::regprocedure);
 anchor:='''read_group_fans'',''heart_totals'',';
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: rollback roles';end if;
 execute replace(def,anchor,'');
 def:=pg_get_functiondef('public.group_public_directory_owner_tables()'::regprocedure);
 anchor:='''community_stamps'',''fan_activities'',';
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: rollback tables';end if;
 execute replace(def,anchor,'');
 def:=pg_get_functiondef('public.group_public_directory_owner_functions()'::regprocedure);
 anchor:='''public.group_fan_sort_stats(uuid,uuid,timestamptz)'',''public.heart_totals()'',';
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: rollback functions';end if;
 execute replace(def,anchor,'');
end $rollback$;
drop function public.read_group_fans(uuid,uuid,text,text,jsonb,integer,public.content_locale);
drop function public.group_fan_sort_stats(uuid,uuid,timestamptz);
select public.group_public_directory_owner_check();
notify pgrst,'reload schema';
commit;

-- 20261227102001 renamed the old groups_dispatch to groups_dispatch_before_external_links and put a new
-- groups_dispatch in front of it. Keep the wrapper-owner access check in sync: groups_dispatch calls the
-- renamed function, so its owner needs EXECUTE on it. Same grant-then-verify step as list_facts_wrapper_access();
-- no broad grant, no role bypass.
begin;
do $patch$
declare def text;
 old_text constant text:='from (values';
 new_text constant text:=$b$from (values
   ('public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.groups_dispatch_before_external_links(text,uuid,uuid,uuid,jsonb,uuid)'),$b$;
begin
 def:=pg_catalog.pg_get_functiondef('public.list_facts_wrapper_access()'::regprocedure);
 if (length(def)-length(replace(def,new_text,'')))/length(new_text)=1 then return;end if;
 if (length(def)-length(replace(def,old_text,'')))/length(old_text)<>1 then raise exception 'GROUP_EXTERNAL_LINKS_ACCESS_SHAPE';end if;
 execute replace(def,old_text,new_text);
end $patch$;
select public.list_facts_wrapper_access();
commit;

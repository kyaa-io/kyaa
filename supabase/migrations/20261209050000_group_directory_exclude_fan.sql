-- Directory filter `type='nonfan'` (hobby + brand) so the fan-first directory can page the lower list on the server
-- instead of dropping fan pages from already-paged results. The directory body lives in whichever groups_dispatch
-- layer currently holds the type filter, so patch every layer that still carries the filter (older shadowed layers keep the same text); refuse if none is found or any is left unpatched.
do $$declare fn record;definition text;patched integer:=0;
 old_filter constant text:='(coalesce(p_input->>''type'',''all'')=''all'' or gp.kind=p_input->>''type'')';
 new_filter constant text:='(coalesce(p_input->>''type'',''all'')=''all'' or gp.kind=p_input->>''type'' or p_input->>''type''=''nonfan'' and gp.kind<>''fan'')';
begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'groups\_dispatch%' and position(old_filter in p.prosrc)>0 loop
  definition:=pg_get_functiondef(fn.oid);
  execute replace(definition,old_filter,new_filter);
  patched:=patched+1;
 end loop;
 if patched<1 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'groups\_dispatch%' and position(old_filter in p.prosrc)>0) then raise exception 'GROUP_DIRECTORY_FILTER_SHAPE';end if;
end $$;

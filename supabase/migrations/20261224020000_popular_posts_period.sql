-- Select the Hot board window before ranking and pagination. Preserve the existing visibility and block predicates.
do $migration$
declare
  def text;
  old_source text := 'and (p_sort<>''likes'' or p.created_at>=now()-interval ''30 days'')';
  old_rank text := 'where p_sort<>''likes'' or u.created_at>=now()-(select case when (select count(*) from (select created_at from fan union all select created_at from grp) w where w.created_at>=now()-interval ''7 days'')>=5 then interval ''7 days'' else interval ''30 days'' end)';
  source_filter text := 'and p.created_at>=now()-interval ''30 days''';
  rank_filter text := 'where u.created_at>=case p_period when ''today'' then (date_trunc(''day'', now() at time zone ''Asia/Seoul'') at time zone ''Asia/Seoul'') when ''month'' then now()-interval ''30 days'' else now()-interval ''7 days'' end';
  owner_name text;
begin
  select pg_get_functiondef(p.oid),r.rolname into def,owner_name from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid='public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)'::regprocedure;
  if (length(def)-length(replace(def,old_source,'')))/length(old_source)<>2
    or (length(def)-length(replace(def,old_rank,'')))/length(old_rank)<>1 then
    raise exception 'POPULAR_POSTS_PERIOD_CONTRACT_CHANGED';
  end if;
  def:=replace(def,'public.read_public_popular_posts_sorted(', 'public.read_public_popular_posts_period(');
  def:=replace(def,'p_sort text DEFAULT ''likes''::text)', 'p_sort text DEFAULT ''likes''::text, p_period text DEFAULT ''week''::text)');
  def:=replace(replace(def,old_source,source_filter),old_rank,rank_filter);
  execute def;
  revoke all on function public.read_public_popular_posts_period(uuid,public.content_locale,integer,boolean,text,text) from public,anon,authenticated,service_role;
  grant execute on function public.read_public_popular_posts_period(uuid,public.content_locale,integer,boolean,text,text) to service_role;
  execute format('alter function public.read_public_popular_posts_period(uuid,public.content_locale,integer,boolean,text,text) owner to %I',owner_name);
end $migration$;
notify pgrst,'reload schema';

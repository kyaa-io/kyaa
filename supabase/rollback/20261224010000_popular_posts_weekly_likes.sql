-- Roll back the web first. Hot posts by likes rank every eligible post again, however old.
do $rollback$
declare
  def text;
  window_filter text := ' and (p_sort<>''likes'' or p.created_at>=now()-interval ''30 days'')';
  ranked_filter text := ' where p_sort<>''likes'' or u.created_at>=now()-(select case when (select count(*) from (select created_at from fan union all select created_at from grp) w where w.created_at>=now()-interval ''7 days'')>=5 then interval ''7 days'' else interval ''30 days'' end)';
begin
  select pg_get_functiondef('public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)'::regprocedure) into def;
  if (length(def)-length(replace(def,window_filter,'')))/length(window_filter)<>2
    or (length(def)-length(replace(def,ranked_filter,'')))/length(ranked_filter)<>1 then
    raise exception 'POPULAR_WEEKLY_LIKES_ROLLBACK_CONTRACT_CHANGED';
  end if;
  execute replace(replace(def,window_filter,''),ranked_filter,'');
end $rollback$;
notify pgrst,'reload schema';

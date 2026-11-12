-- Hot posts by likes rank posts written in the last 7 days (the likes of those posts). Fewer than 5 such posts widens the window to 30 days.
-- Comments, views and latest keep ranking every eligible post. The date filter sits in the two source selects so the created_at indexes serve it.
do $migration$
declare
  def text;
  fan_needle text := 'p.category is distinct from ''proof''';
  group_needle text := 'p.visibility=''public'' and p.removed_at is null and p.category<>''notice''';
  union_needle text := 'from (select * from fan union all select * from grp) u';
  window_filter text := ' and (p_sort<>''likes'' or p.created_at>=now()-interval ''30 days'')';
  ranked_filter text := ' where p_sort<>''likes'' or u.created_at>=now()-(select case when (select count(*) from (select created_at from fan union all select created_at from grp) w where w.created_at>=now()-interval ''7 days'')>=5 then interval ''7 days'' else interval ''30 days'' end)';
begin
  select pg_get_functiondef('public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)'::regprocedure) into def;
  if (length(def)-length(replace(def,fan_needle,'')))/length(fan_needle)<>1
    or (length(def)-length(replace(def,group_needle,'')))/length(group_needle)<>1
    or (length(def)-length(replace(def,union_needle,'')))/length(union_needle)<>1 then
    raise exception 'POPULAR_WEEKLY_LIKES_CONTRACT_CHANGED';
  end if;
  def:=replace(def,fan_needle,fan_needle||window_filter);
  def:=replace(def,group_needle,group_needle||window_filter);
  def:=replace(def,union_needle,union_needle||ranked_filter);
  execute def;
end $migration$;
notify pgrst,'reload schema';

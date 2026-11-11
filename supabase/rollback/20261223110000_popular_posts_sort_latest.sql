-- Roll back the web first. The sorted Hot reader goes back to likes/comments/views only; 'latest' falls back to likes.
do $rollback$
declare
  def text;
  ordering text := 'order by case when p_sort=''comments'' then comments when p_sort=''views'' then views else likes end desc,likes desc,comments desc,created_at desc,id desc';
  needle text := 'order by case when p_sort=''latest'' then created_at end desc nulls last,case when p_sort=''comments'' then comments when p_sort=''views'' then views else likes end desc,likes desc,comments desc,created_at desc,id desc';
begin
  select pg_get_functiondef('public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)'::regprocedure) into def;
  if (length(def)-length(replace(def,needle,'')))/length(needle)<>3 then raise exception 'POPULAR_SORT_LATEST_ROLLBACK_CONTRACT_CHANGED'; end if;
  execute replace(def,needle,ordering);
end $rollback$;
notify pgrst,'reload schema';

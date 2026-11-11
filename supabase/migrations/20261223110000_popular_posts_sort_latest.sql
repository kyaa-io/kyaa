-- Hot posts: add p_sort='latest' (newest created_at first) to the sorted reader; likes/comments/views keep their order.
do $migration$
declare
  def text;
  needle text := 'order by case when p_sort=''comments'' then comments when p_sort=''views'' then views else likes end desc,likes desc,comments desc,created_at desc,id desc';
  ordering text := 'order by case when p_sort=''latest'' then created_at end desc nulls last,case when p_sort=''comments'' then comments when p_sort=''views'' then views else likes end desc,likes desc,comments desc,created_at desc,id desc';
begin
  select pg_get_functiondef('public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)'::regprocedure) into def;
  if (length(def)-length(replace(def,needle,'')))/length(needle)<>3 then raise exception 'POPULAR_SORT_LATEST_ORDER_CONTRACT_CHANGED'; end if;
  execute replace(def,needle,ordering);
end $migration$;
notify pgrst,'reload schema';

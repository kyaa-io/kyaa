-- Keep the existing visibility and block rules while sorting all eligible posts before paging.
do $migration$
declare
  def text;
  needle text := 'order by likes desc,comments desc,created_at desc,id desc';
  ordering text := 'order by case when p_sort=''comments'' then comments when p_sort=''views'' then views else likes end desc,likes desc,comments desc,created_at desc,id desc';
  owner_name text;
begin
  select pg_get_functiondef(p.oid), r.rolname into def, owner_name
    from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid='public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean)'::regprocedure;
  if (length(def)-length(replace(def,needle,'')))/length(needle)<>3 then raise exception 'POPULAR_SORT_ORDER_CONTRACT_CHANGED'; end if;
  if position('p_include_groups boolean DEFAULT true)' in def)=0
    or position('(select count(*) from public.fan_post_comments m where m.post_id=p.id and m.deleted_at is null and m.hidden_at is null) comments' in def)=0
    or position('(select count(*) from public.group_comments m where m.post_id=p.id and m.removed_at is null) comments' in def)=0 then
    raise exception 'POPULAR_SORT_SOURCE_CONTRACT_CHANGED';
  end if;
  def:=replace(def,'public.read_public_popular_posts_page(', 'public.read_public_popular_posts_sorted(');
  def:=replace(def,'p_include_groups boolean DEFAULT true)', 'p_include_groups boolean DEFAULT true, p_sort text DEFAULT ''likes''::text)');
  def:=replace(def,'(select count(*) from public.fan_post_comments m where m.post_id=p.id and m.deleted_at is null and m.hidden_at is null) comments', '(select count(*) from public.fan_post_comments m where m.post_id=p.id and m.deleted_at is null and m.hidden_at is null) comments, (select count(*) from public.fan_post_views v where v.post_id=p.id) views');
  def:=replace(def,'(select count(*) from public.group_comments m where m.post_id=p.id and m.removed_at is null) comments', '(select count(*) from public.group_comments m where m.post_id=p.id and m.removed_at is null) comments, (select count(*) from public.group_post_views v where v.post_id=p.id) views');
  def:=replace(def,needle,ordering);
  execute def;
  revoke all on function public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text) from public,anon,authenticated,service_role;
  grant execute on function public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text) to service_role;
  execute format('alter function public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text) owner to %I',owner_name);
end $migration$;
notify pgrst,'reload schema';

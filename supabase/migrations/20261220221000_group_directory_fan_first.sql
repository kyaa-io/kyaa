-- In the combined directory, fan pages precede hobby and brand pages.
do $$
declare def text; changed text;
begin
  select pg_catalog.pg_get_functiondef('public.groups_dispatch_before_qualification(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure) into def;
  changed:=replace(def, $old$select gp.id,gp.created_at,(select count(*) from public.group_memberships m where m.page_id=gp.id) n,$old$, $new$select gp.id,gp.created_at,gp.kind directory_kind,(select count(*) from public.group_memberships m where m.page_id=gp.id) n,$new$);
  if changed=def then raise exception 'directory projection changed'; end if;
  def:=changed;
  changed:=replace(def, $old$row_number() over(order by
   case when p_input->>'sort'='discovery' then case when challenge$old$, $new$row_number() over(order by
   case when p_input->>'sort'='discovery' and coalesce(p_input->>'type','all')='all' then case when directory_kind='fan' then 0 else 1 end end,
   case when p_input->>'sort'='discovery' then case when challenge$new$);
  if changed=def then raise exception 'directory ordering changed'; end if;
  execute changed;
end $$;

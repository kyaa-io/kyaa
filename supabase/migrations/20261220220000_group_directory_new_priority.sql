-- Directory ordering and NEW use the creator's publication date; personal lists keep their own ordering.
do $$
declare def text; changed text;
begin
  select pg_catalog.pg_get_functiondef('public.groups_dispatch_before_qualification(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure) into def;
  changed := replace(def, $old$select gp.id,gp.created_at,(select count(*) from public.group_memberships m where m.page_id=gp.id) n$old$, $new$
   select gp.id,gp.created_at,(select count(*) from public.group_memberships m where m.page_id=gp.id) n,
     coalesce(p_input->>'sort'='discovery' and gp.kind='fan' and c.status='published' and c.published_at<=now() and c.published_at>=now()-interval '1 month',false) is_new,
     coalesce(p_input->>'sort'='discovery' and gp.kind='fan' and exists(select 1 from public.jjinfan_challenge_campaigns j where j.celebrity_id=c.id and public.jjinfan_campaign_open(j.enabled,j.ends_on) and public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id)),false) challenge,
     case when p_input->>'sort'='discovery' and gp.kind='fan' and c.slug is not null then coalesce((public.read_celebrity_fanpage(c.slug,'ko'::public.content_locale)->>'fanCount')::bigint,0) else 0 end fan_count$new$);
  if changed=def then raise exception 'directory projection changed'; end if;
  def:=changed;
  changed:=replace(def, $old$from public.group_pages gp where public.group_scope_visible(p_actor,gp.id)$old$, $new$from public.group_pages gp left join public.celebrities c on c.id=gp.celebrity_id where public.group_scope_visible(p_actor,gp.id)$new$);
  if changed=def then raise exception 'directory source changed'; end if;
  def:=changed;
  changed:=replace(def, $old$row_number() over(order by case when p_input->>'sort'='popular' then n end desc nulls last,created_at desc,id)$old$, $new$row_number() over(order by
   case when p_input->>'sort'='discovery' then case when challenge then 0 when is_new then 1 else 2 end end,
   case when p_input->>'sort'='discovery' then fan_count end desc nulls last,
   case when p_input->>'sort'='popular' then n end desc nulls last,created_at desc,id)$new$);
  if changed=def then raise exception 'directory ordering changed'; end if;
  def:=changed;
  changed:=replace(def, $old$jsonb_agg(public.group_page_json(id) order by rn)$old$, $new$jsonb_agg(public.group_page_json(id) || case when p_input->>'sort'='discovery' then jsonb_build_object('isNew',is_new,'challenge',challenge,'fanCount',fan_count) else '{}'::jsonb end order by rn)$new$);
  if changed=def then raise exception 'directory result changed'; end if;
  execute changed;
end $$;

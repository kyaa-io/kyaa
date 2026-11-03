begin;
-- Discovery is read-only; joining, submission, ticket use and rewards keep their existing detail/write guards.
create function public.read_group_benefits_catalog(p_kind text,p_actor uuid default null,p_cursor uuid default null,p_limit integer default 30)returns jsonb language plpgsql security definer set search_path=''as $$
declare cursor_visible boolean;result jsonb;begin
 if p_kind is null or p_kind not in('raffles','missions')or p_limit is null or p_limit not between 1 and 30 then raise exception 'GROUP_BENEFITS_INVALID';end if;
 if p_actor is not null then perform public.fan_web_lock_active_user(p_actor);end if;
 with eligible as(
  select r.id from public.group_raffles r join public.group_pages g on g.id=r.page_id
  where p_kind='raffles'and r.cancelled_at is null and r.closes_at>statement_timestamp()and public.group_scope_visible(p_actor,g.id)
  union all
  select m.id from public.group_missions m join public.group_pages g on g.id=m.page_id
  where p_kind='missions'and m.state='published'and m.submission_kind in('photo','survey')and public.group_scope_visible(p_actor,g.id)
 ),selected as(select id from eligible where p_cursor is null or id>p_cursor order by id limit p_limit+1),shown as(select id from selected order by id limit p_limit)
 select p_cursor is null or exists(select 1 from eligible where id=p_cursor),jsonb_build_object('kind',p_kind,'items',coalesce((select jsonb_agg(case when p_kind='raffles'then
  (select jsonb_build_object('id',r.id,'pageId',g.id,'pageName',g.name,'title',r.title,'description',r.summary,'imageUrl',case when r.image_url~'^https://'or r.image_url~'^/[^/\\]'then r.image_url end,'status',case when statement_timestamp()<r.opens_at then'preparing'else'open'end,'closesAt',r.closes_at,'href','/pages/groups/'||g.id||'/raffles/'||r.id)from public.group_raffles r join public.group_pages g on g.id=r.page_id where r.id=s.id)
 else
  (select jsonb_build_object('id',m.id,'pageId',g.id,'pageName',g.name,'title',m.title,'description',m.instructions,'imageUrl',case when image.url~'^https://'or image.url~'^/[^/\\]'then image.url end,'status','published','submissionKind',m.submission_kind,'rewardPoints',m.reward_points,'href','/pages/groups/'||g.id||'/missions/'||m.id)from public.group_missions m join public.group_pages g on g.id=m.page_id cross join lateral(select public.group_mission_json(m.id,p_actor)->>'imageUrl'as url)image where m.id=s.id)
 end order by s.id)from shown s),'[]'::jsonb),'nextCursor',case when(select count(*)from selected)>p_limit then(select id from shown order by id desc limit 1)end)into cursor_visible,result;
 if not cursor_visible then raise exception 'GROUP_BENEFITS_NOT_FOUND';end if;
 return result;
end $$;
revoke all on function public.read_group_benefits_catalog(text,uuid,uuid,integer)from public,anon,authenticated,service_role;
grant execute on function public.read_group_benefits_catalog(text,uuid,uuid,integer)to service_role;
commit;

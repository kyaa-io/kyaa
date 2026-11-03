begin;
-- Extend the management response without changing membership, cursors, or public social reads.
do $patch$
declare source text; needle text:=$needle$'answer',case when member_role in ('owner','manager') then m.answer end$needle$;
begin
 source:=pg_get_functiondef('public.groups_dispatch_before_content(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 if position(needle in source)=0 then raise exception 'Expected management member DTO missing';end if;
 source:=replace(source,needle,$replacement$'answer',case when member_role in ('owner','manager') then m.answer end,
 'joinedAt',case when member_role in ('owner','manager') then m.joined_at end,
 'tier',case when member_role in ('owner','manager') and g.celebrity_id is not null then public.get_fan_effective_tier(m.app_user_id,g.celebrity_id) end,
 'postCount',case when member_role in ('owner','manager') then (select count(*) from public.group_posts p where p.page_id=g.id and p.author_id=m.app_user_id and p.removed_at is null and not p.anonymous) end,
 'commentCount',case when member_role in ('owner','manager') then (select count(*) from public.group_comments c join public.group_posts p on p.id=c.post_id where p.page_id=g.id and c.author_id=m.app_user_id and c.removed_at is null and p.removed_at is null and not c.anonymous) end,
 'lastActiveAt',case when member_role in ('owner','manager') then greatest((select max(p.created_at) from public.group_posts p where p.page_id=g.id and p.author_id=m.app_user_id and p.removed_at is null and not p.anonymous),(select max(c.created_at) from public.group_comments c join public.group_posts p on p.id=c.post_id where p.page_id=g.id and c.author_id=m.app_user_id and c.removed_at is null and p.removed_at is null and not c.anonymous)) end$replacement$);
 execute source;
end $patch$;
commit;

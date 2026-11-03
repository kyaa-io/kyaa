begin;
-- Read-only adapter: page membership filters the existing global social and Creator leaderboard results.
create function public.read_group_people(p_actor uuid,p_page_id uuid,p_mode text default 'members',p_search text default '',p_cursor uuid default null,p_limit integer default 30,p_locale public.content_locale default 'ko')returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.group_pages;slug text;ranking jsonb;result jsonb;
begin
 if p_actor is null or not exists(select 1 from public.app_users where id=p_actor and status='active')then raise exception 'GROUPS_FORBIDDEN';end if;
 if p_mode is null or p_mode not in('members','friends','ranking')or p_limit is null or p_limit not between 1 and 100 or p_search is null or length(p_search)>100 or p_locale is null then raise exception 'GROUPS_INVALID_REQUEST';end if;
 select *into g from public.group_pages where id=p_page_id and status='published'and(celebrity_id is null or exists(select 1 from public.celebrities c where c.id=celebrity_id and c.status='published'and c.archived_at is null));
 if not found or not public.group_scope_visible(p_actor,p_page_id)then raise exception 'GROUPS_NOT_FOUND';end if;
 if not exists(select 1 from public.group_memberships where page_id=g.id and app_user_id=p_actor)then raise exception 'GROUPS_FORBIDDEN';end if;
 if p_mode='ranking' then
  select c.slug into slug from public.celebrities c where c.id=g.celebrity_id;
  if slug is null then return jsonb_build_object('items','[]'::jsonb,'nextCursor',null,'ranking',jsonb_build_object('available',false,'reason','creator_required','asOf',statement_timestamp(),'fanCount',0));end if;
  ranking:=public.read_celebrity_fan_leaderboard(slug,p_actor,p_locale,'all');
  if not coalesce((ranking->>'available')::boolean,false)then return jsonb_build_object('items','[]'::jsonb,'nextCursor',null,'ranking',jsonb_build_object('available',false,'reason','threshold','asOf',ranking->'asOf','fanCount',coalesce((ranking->>'fanCount')::integer,0)));end if;
 end if;
 with people as materialized(
  select m.app_user_id,m.joined_at,m.role,coalesce(nullif(btrim(u.nickname),''),case when p_locale='ko'then'팬'else'Fan'end)nickname,public.public_fan_avatar_url(m.app_user_id)avatar_url,
   case when p_mode='ranking'then (r.value->>'rank')::bigint else row_number()over(order by m.joined_at,m.app_user_id)end sort_order,
   case when p_mode='ranking'then(r.value->>'rank')::bigint end rank,case when p_mode='ranking'then(r.value->>'points')::integer end points
  from public.group_memberships m join public.app_users a on a.id=m.app_user_id and a.status='active'left join public.user_profiles u on u.app_user_id=m.app_user_id
  left join lateral(select value from jsonb_array_elements(coalesce(ranking->'rows','[]'::jsonb))where(value->>'profileId')::uuid=m.app_user_id)r on true
  where m.page_id=g.id and not public.fan_web_blocked(p_actor,m.app_user_id)
   and(p_mode<>'friends'or exists(select 1 from public.social_friendships f where f.user_low_id=least(p_actor,m.app_user_id)and f.user_high_id=greatest(p_actor,m.app_user_id)and f.status='accepted'))
   and(p_mode<>'ranking'or r.value is not null)
 ),filtered as materialized(select *from people where position(lower(btrim(p_search))in lower(nickname))>0),selected as materialized(
  select *from filtered where p_cursor is null or(sort_order,app_user_id)>(select sort_order,app_user_id from filtered where app_user_id=p_cursor)order by sort_order,app_user_id limit p_limit+1
 ),shown as materialized(select *from selected order by sort_order,app_user_id limit p_limit)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('profileId',app_user_id,'nickname',nickname,'avatarUrl',avatar_url,'role',role,'rank',rank,'points',points)order by sort_order,app_user_id)from shown),'[]'::jsonb),
  'nextCursor',case when(select count(*)from selected)>p_limit then(select app_user_id from shown order by sort_order desc,app_user_id desc limit 1)end,
  'ranking',case when p_mode='ranking'then jsonb_build_object('available',true,'reason',null,'asOf',ranking->'asOf','fanCount',ranking->'fanCount')else null end)into result;
 return result;
end $$;
revoke all on function public.read_group_people(uuid,uuid,text,text,uuid,integer,public.content_locale)from public,anon,authenticated,service_role;
grant execute on function public.read_group_people(uuid,uuid,text,text,uuid,integer,public.content_locale)to service_role;
-- Keep the existing management DTO/ACL and joined-at cursor; search precedes its n+1 selection.
do $patch$declare source text;needle text:='where m.page_id=g.id and (v_cursor is null';begin
 source:=pg_get_functiondef('public.groups_dispatch_before_content(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 if position(needle in source)=0 then raise exception 'Expected members selection missing';end if;
 source:=replace(source,needle,'where m.page_id=g.id and position(lower(btrim(coalesce(p_input->>''search'','''')))in lower(coalesce((select p.nickname from public.user_profiles p where p.app_user_id=m.app_user_id),''팬'')))>0 and (v_cursor is null');
 execute source;
end $patch$;
commit;

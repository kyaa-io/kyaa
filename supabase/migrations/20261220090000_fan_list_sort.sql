begin;
-- Same heart source as rankings. First title date is MIN, not heart_totals.achieved_at (MAX).
-- This helper is invoker: directory owner access/check covers every table and heart_totals owner.
create function public.group_fan_sort_stats(p_user uuid,p_creator uuid,p_joined timestamptz)
returns table(hearts bigint,stamps bigint,first_jjinfan_at timestamptz,last_active_at timestamptz)
language sql stable set search_path='' as $$
 select coalesce(h.hearts,0),s.n,
  case when coalesce(h.hearts,0)>0 then least(
   (select min(l.created_at) from public.creator_heart_ledger l where l.app_user_id=p_user and l.celebrity_id=p_creator and l.source_type='passport_page_claim'),
   (select min(c.converted_at) from public.fan_heart_conversions c where c.app_user_id=p_user and c.celebrity_id=p_creator and c.hearts>0)) end,
  greatest(p_joined,h.achieved_at,s.last_at,
   (select max(a.occurred_at) from public.fan_activities a where a.app_user_id=p_user and a.celebrity_id=p_creator))
 from (select count(*) n,max(issued_at) last_at from public.community_stamps where app_user_id=p_user and celebrity_id=p_creator and revoked_at is null)s
 left join public.heart_totals()h on h.app_user_id=p_user and h.celebrity_id=p_creator
$$;

-- Clone the current public reader, preserving current page visibility, sanctions, blocks and public-profile rules.
-- Old offset readers and their strict DTOs remain deploy-compatible. New web explicitly selects sort=hearts.
do $patch$
declare def text;anchor text;replacement text;owner_name name;
begin
 def:=pg_catalog.pg_get_functiondef('public.read_group_public_people(uuid,uuid,integer,integer,public.content_locale)'::regprocedure);
 anchor:='public.read_group_public_people(';
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: signature';end if;
 def:=replace(def,anchor,'public.read_group_fans(');
 anchor:='p_offset integer DEFAULT 0';
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: arguments';end if;
 def:=replace(def,anchor,$a$p_mode text DEFAULT 'members', p_search text DEFAULT '', p_cursor jsonb DEFAULT NULL$a$);
 anchor:='p_offset is null or p_offset not between 0 and 270';
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: validation';end if;
 def:=replace(def,anchor,$a$p_mode is null or p_mode not in('members','jjinfans','friends') or p_search is null or length(p_search)>100$a$);
 anchor:='g:=public.group_public_visible_page(p_actor,p_page_id);';
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: visibility';end if;
 def:=replace(def,anchor,anchor||$a$
 if p_actor is not null and not exists(select 1 from public.app_users where id=p_actor and status='active')then raise exception 'GROUPS_FORBIDDEN';end if;
 if p_mode='friends' and (p_actor is null or not exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor))then raise exception 'GROUPS_FORBIDDEN';end if;
 if p_cursor is not null and (jsonb_typeof(p_cursor)<>'object' or not(p_cursor ?& array['hearts','stamps','last_active_at','app_user_id']))then raise exception 'GROUPS_INVALID_REQUEST';end if;
$a$);
 def:=replace(def,'''nextOffset''','''nextCursor''');
 anchor:='with selected as materialized(';
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: selection';end if;
 def:=replace(def,anchor,'with eligible as materialized(');
 anchor:='m.app_user_id,m.joined_at,row_number()over(order by m.joined_at,m.app_user_id)ord';
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: ordering';end if;
 def:=replace(def,anchor,'m.app_user_id,m.joined_at,stats.*');
 anchor:='where m.page_id=g.id';
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: membership';end if;
 def:=replace(def,anchor,$a$cross join lateral public.group_fan_sort_stats(m.app_user_id,g.celebrity_id,m.joined_at) stats
  where m.page_id=g.id
   and(p_mode<>'jjinfans' or stats.hearts>0)
   and(p_mode<>'friends' or exists(select 1 from public.social_friendships f where f.user_low_id=least(p_actor,m.app_user_id) and f.user_high_id=greatest(p_actor,m.app_user_id) and f.status='accepted'))
   and position(lower(btrim(p_search)) in lower(coalesce((select nullif(btrim(u.nickname),'') from public.user_profiles u where u.app_user_id=m.app_user_id),case when p_locale='ko' then '팬' else 'Fan' end)))>0$a$);
 anchor:=$a$order by m.joined_at,m.app_user_id offset p_offset limit p_limit+1
 ),shown as materialized(select *from selected order by ord limit p_limit)$a$;
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: cursor';end if;
 def:=replace(def,anchor,$a$
 ),selected as materialized(
  select * from eligible where p_cursor is null or
   (-hearts,-stamps,-extract(epoch from last_active_at),app_user_id)>
   (-(p_cursor->>'hearts')::bigint,-(p_cursor->>'stamps')::bigint,-extract(epoch from (p_cursor->>'last_active_at')::timestamptz),(p_cursor->>'app_user_id')::uuid)
  order by hearts desc,stamps desc,last_active_at desc,app_user_id limit p_limit+1
 ),shown as materialized(select *from selected order by hearts desc,stamps desc,last_active_at desc,app_user_id limit p_limit)$a$);
 anchor:=$a$'tier',case when g.kind='fan'then public.get_fan_effective_tier(x.app_user_id,g.celebrity_id)end$a$;
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: fields';end if;
 def:=replace(def,anchor,anchor||$a$,
    'hearts',x.hearts,'stamps',x.stamps,'first_jjinfan_at',x.first_jjinfan_at,'last_active_at',x.last_active_at$a$);
 def:=replace(def,'order by x.ord','order by x.hearts desc,x.stamps desc,x.last_active_at desc,x.app_user_id');
 anchor:='case when(select count(*)from selected)>p_limit and p_offset+p_limit<=270 then p_offset+p_limit end';
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: next cursor';end if;
 def:=replace(def,anchor,$a$case when(select count(*)from selected)>p_limit then
  (select jsonb_build_object('hearts',hearts,'stamps',stamps,'last_active_at',last_active_at,'app_user_id',app_user_id)
   from shown order by hearts,stamps,last_active_at,app_user_id desc limit 1)end$a$);
 if position('p_offset' in def)>0 or position('x.ord' in def)>0 then raise exception 'FAN_LIST_SORT_SHAPE: stale ordering';end if;
 execute def;
 select pg_get_userbyid(proowner)into owner_name from pg_proc where oid='public.read_group_public_people(uuid,uuid,integer,integer,public.content_locale)'::regprocedure;
 execute format('alter function public.read_group_fans(uuid,uuid,text,text,jsonb,integer,public.content_locale) owner to %I',owner_name);

 -- Append to current registries instead of replacing later migrations' entries.
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_roles()'::regprocedure);
 anchor:='f.proname in(';
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: owner roles';end if;
 execute replace(def,anchor,anchor||'''read_group_fans'',''heart_totals'',');
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_tables()'::regprocedure);
 anchor:='ARRAY[';
 if position(anchor in def)=0 then anchor:='array[';end if;
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: owner tables';end if;
 execute replace(def,anchor,anchor||'''community_stamps'',''fan_activities'',');
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_functions()'::regprocedure);
 anchor:='ARRAY[';
 if position(anchor in def)=0 then anchor:='array[';end if;
 if position(anchor in def)=0 then raise exception 'FAN_LIST_SORT_SHAPE: owner functions';end if;
 execute replace(def,anchor,anchor||'''public.group_fan_sort_stats(uuid,uuid,timestamptz)'',''public.heart_totals()'',');
end $patch$;
revoke all on function public.group_fan_sort_stats(uuid,uuid,timestamptz),public.read_group_fans(uuid,uuid,text,text,jsonb,integer,public.content_locale) from public,anon,authenticated,service_role;
grant execute on function public.read_group_fans(uuid,uuid,text,text,jsonb,integer,public.content_locale) to service_role;
-- Existing check uses has_table_privilege + FORCE RLS policy checks, and raises PUBLIC_DIRECTORY_OWNER_GAP.
select public.group_public_directory_owner_access();
select public.group_public_directory_owner_check();
notify pgrst,'reload schema';
commit;

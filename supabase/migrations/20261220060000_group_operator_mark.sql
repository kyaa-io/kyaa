-- 운영자 표시: 글·댓글 응답의 각 행에 `operator`(그 페이지의 소유자·운영진이 쓴 글인가)를 더한다.
-- 아티스트 표시(20261209090000)와 같은 방식이다: groups_content_dispatch를 이름만 바꿔 감싸고, posts·comments·post-detail 결과에만 값을 붙인다.
-- 공개되는 것은 '그 페이지의 소유자·운영진인가' 하나뿐이고 가입 시각·답변 같은 회원 정보는 응답에 들어가지 않는다.
-- 익명 작성자는 늘 false라 이 값으로 익명 글쓴이를 알아낼 수 없다. 아티스트 표시와 별개 값이다(아티스트이면서 운영진이면 둘 다 true,
-- 어느 쪽을 그릴지는 화면이 정한다). 팬페이지(celebrity) 읽기 함수는 이번에 바꾸지 않는다.
-- Rollback: supabase/rollback/20261220060000_group_operator_mark.sql.
begin;
set local lock_timeout = '5s';

create function public.group_operator_mark_items(p_page uuid, p_items jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(item || jsonb_build_object('operator',
    not coalesce((item->>'anonymous')::boolean, false)
    and k.pid is not null
    and exists (select 1 from public.group_memberships m where m.page_id = p_page and m.app_user_id = k.pid and m.role in ('owner', 'manager'))
  ) order by ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as entries(item, ord)
  cross join lateral (select case when item->>'profileId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (item->>'profileId')::uuid end as pid) k
$$;

alter function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch_before_operator_mark;
create function public.groups_content_dispatch(p_operation text, p_actor uuid default null, p_page_id uuid default null, p_item_id uuid default null, p_input jsonb default '{}'::jsonb, p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  result := public.groups_content_dispatch_before_operator_mark(p_operation, p_actor, p_page_id, p_item_id, p_input, p_admin_id);
  if p_operation in ('posts', 'comments') and jsonb_typeof(result->'items') = 'array' then
    result := jsonb_set(result, '{items}', public.group_operator_mark_items(p_page_id, result->'items'));
  elsif p_operation = 'post-detail' and jsonb_typeof(result) = 'object' and result ? 'id' then
    result := public.group_operator_mark_items(p_page_id, jsonb_build_array(result)) -> 0;
  end if;
  return result;
end $$;

revoke all on function public.group_operator_mark_items(uuid,jsonb),
  public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid),
  public.groups_content_dispatch_before_operator_mark(text,uuid,uuid,uuid,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;

-- 적용 역할이 superuser가 아닌 dev에서도 새 함수가 group_memberships를 읽고, 이름을 바꾼 함수를 부르는 다른 소유자의 함수가 감싼 함수를 계속 실행할 수 있어야 한다.
-- 20261215030000과 같은 원인이다. 못 채우는 것이 있으면 OWNER_GAP으로 멈춘다.
do $check$
declare
  me pg_catalog.pg_roles; c pg_catalog.pg_class; gaps text[] := '{}'; target regprocedure; owner_name name; target_owner name;
begin
  select * into me from pg_catalog.pg_roles where rolname = current_user;
  if not me.rolsuper then
    select * into c from pg_catalog.pg_class where oid = 'public.group_memberships'::regclass;
    if not pg_catalog.has_table_privilege(me.oid, c.oid, 'select') then
      begin execute format('grant select on table public.group_memberships to %I', me.rolname);
      exception when insufficient_privilege then gaps := gaps || 'select on group_memberships'; end;
    end if;
    if not me.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or not pg_catalog.pg_has_role(me.oid, c.relowner, 'USAGE'))
       and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and (me.oid = any (p.polroles) or 0 = any (p.polroles)) and p.polpermissive and p.polcmd in ('r', '*')) then
      begin execute format('create policy %I on public.group_memberships for select to %I using (true)', 'operator_mark_read_' || me.rolname, me.rolname);
      exception when insufficient_privilege then gaps := gaps || 'read policy on group_memberships'; end;
    end if;
    if not pg_catalog.has_table_privilege(me.oid, c.oid, 'select') then gaps := gaps || 'select on group_memberships (still)'; end if;
    if not pg_catalog.has_function_privilege(me.oid, 'public.groups_content_dispatch_before_operator_mark(text,uuid,uuid,uuid,jsonb,uuid)', 'execute') then
      gaps := gaps || 'execute groups_content_dispatch_before_operator_mark';
    end if;
  end if;
  foreach target in array array['public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure, 'public.group_operator_mark_items(uuid,jsonb)'::regprocedure] loop
    select pg_get_userbyid(proowner) into target_owner from pg_proc where oid = target;
    for owner_name in select distinct pg_get_userbyid(p.proowner) from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.oid <> target and p.prosrc ~* ('\m' || (select proname from pg_proc where oid = target) || '\s*\(') loop
      if owner_name in ('anon', 'authenticated', 'service_role') then raise exception 'GROUP_OPERATOR_MARK_UNTRUSTED_OWNER % for %', owner_name, target; end if;
      if owner_name <> target_owner then execute format('grant execute on function %s to %I', target, owner_name); end if;
    end loop;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'GROUP_OPERATOR_MARK_OWNER_GAP: % lacks %', current_user, array_to_string(gaps, '; '); end if;
end $check$;

-- 감싼 함수가 이름 바꾼 함수 하나만 부르고 그 전의 층을 건너뛰지 않았는지 확인한다.
do $shape$
begin
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure), 'groups_content_dispatch_before_operator_mark') = 0 then
    raise exception 'GROUP_OPERATOR_MARK_SHAPE: wrapper does not call the renamed function';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.groups_content_dispatch_before_operator_mark(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure), 'group_operator_mark_items') > 0 then
    raise exception 'GROUP_OPERATOR_MARK_SHAPE: renamed function is already a wrapper of this migration';
  end if;
end $shape$;

commit;

notify pgrst, 'reload schema';

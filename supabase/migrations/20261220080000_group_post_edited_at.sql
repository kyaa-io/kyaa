-- 모임 글 '수정됨': 글에 본문 수정 시각(edited_at)을 두고, 글 목록·상세·수정 응답에 `editedAt`(없으면 null)을 더한다.
-- 수정 시각은 post-edit 요청 전후의 제목·본문·공개 범위·분류·본문 문서를 비교해 실제로 바뀐 때만 적는다. 조회수·좋아요·댓글 수와
-- 같은 이유로 달라지는 갱신, 같은 내용을 다시 저장하는 요청은 적지 않는다. 이미 있던 글은 null이라 이후 수정부터 표시된다.
-- 모임 댓글은 수정 경로가 없고 삭제만 있다. 그래서 댓글 응답에는 아무것도 더하지 않는다.
-- 아티스트 표시(20261209090000)·운영자 표시(20261220060000)와 같은 방식이다: groups_content_dispatch를 이름만 바꿔 감싼다.
-- 본문을 다시 쓰지 않으므로 앞뒤 마이그레이션이 이 함수를 고쳤는지와 상관없이 적용된다.
-- Rollback: supabase/rollback/20261220080000_group_post_edited_at.sql.
begin;
set local lock_timeout = '5s';

alter table public.group_posts add column edited_at timestamptz;

create function public.group_post_edited_items(p_items jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(entries.item || jsonb_build_object('editedAt', p.edited_at) order by entries.ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as entries(item, ord)
  left join public.group_posts p on p.id = case when entries.item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (entries.item->>'id')::uuid end
$$;

alter function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch_before_edited_at;
create function public.groups_content_dispatch(p_operation text, p_actor uuid default null, p_page_id uuid default null, p_item_id uuid default null, p_input jsonb default '{}'::jsonb, p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; before_post public.group_posts;
begin
  if p_operation = 'post-edit' and p_item_id is not null then
    select * into before_post from public.group_posts where id = p_item_id;
  end if;
  result := public.groups_content_dispatch_before_edited_at(p_operation, p_actor, p_page_id, p_item_id, p_input, p_admin_id);
  if p_operation = 'post-edit' and before_post.id is not null then
    update public.group_posts p set edited_at = clock_timestamp()
    where p.id = before_post.id
      and (p.title, p.body, p.visibility, p.category, p.body_doc) is distinct from (before_post.title, before_post.body, before_post.visibility, before_post.category, before_post.body_doc);
  end if;
  if p_operation = 'posts' and jsonb_typeof(result->'items') = 'array' then
    result := jsonb_set(result, '{items}', public.group_post_edited_items(result->'items'));
  elsif p_operation in ('post-detail', 'post-edit') and jsonb_typeof(result) = 'object' and result ? 'id' then
    result := public.group_post_edited_items(jsonb_build_array(result)) -> 0;
  end if;
  return result;
end $$;

revoke all on function public.group_post_edited_items(jsonb),
  public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid),
  public.groups_content_dispatch_before_edited_at(text,uuid,uuid,uuid,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;

-- 적용 역할이 superuser가 아닌 dev에서도 새 함수가 group_posts를 읽고 고칠 수 있고, 이름을 바꾼 함수를 부르는 다른 소유자의 함수가
-- 감싼 함수를 계속 실행할 수 있어야 한다. 20261215030000·20261220060000과 같은 원인이다. 못 채우는 것이 있으면 OWNER_GAP으로 멈춘다.
do $check$
declare
  me pg_catalog.pg_roles; c pg_catalog.pg_class; gaps text[] := '{}'; target regprocedure; owner_name name; target_owner name; need record;
begin
  select * into me from pg_catalog.pg_roles where rolname = current_user;
  if not me.rolsuper then
    select * into c from pg_catalog.pg_class where oid = 'public.group_posts'::regclass;
    for need in select * from (values ('select', 'r'), ('update', 'w')) as v(priv, cmd) loop
      if not pg_catalog.has_table_privilege(me.oid, c.oid, need.priv) then
        begin execute format('grant %s on table public.group_posts to %I', need.priv, me.rolname);
        exception when insufficient_privilege then gaps := gaps || (need.priv || ' on group_posts'); end;
      end if;
      if not me.rolbypassrls and c.relrowsecurity and (c.relforcerowsecurity or not pg_catalog.pg_has_role(me.oid, c.relowner, 'USAGE'))
         and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid and (me.oid = any (p.polroles) or 0 = any (p.polroles)) and p.polpermissive and p.polcmd in (need.cmd::"char", '*')) then
        begin execute format('create policy %I on public.group_posts for %s to %I using (true)', 'edited_at_' || need.priv || '_' || me.rolname, need.priv, me.rolname);
        exception when insufficient_privilege then gaps := gaps || ('policy for ' || need.priv || ' on group_posts'); end;
      end if;
      if not pg_catalog.has_table_privilege(me.oid, c.oid, need.priv) then gaps := gaps || (need.priv || ' on group_posts (still)'); end if;
    end loop;
    if not pg_catalog.has_function_privilege(me.oid, 'public.groups_content_dispatch_before_edited_at(text,uuid,uuid,uuid,jsonb,uuid)', 'execute') then
      gaps := gaps || 'execute groups_content_dispatch_before_edited_at';
    end if;
  end if;
  foreach target in array array['public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure, 'public.group_post_edited_items(jsonb)'::regprocedure] loop
    select pg_get_userbyid(proowner) into target_owner from pg_proc where oid = target;
    for owner_name in select distinct pg_get_userbyid(p.proowner) from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.oid <> target and p.prosrc ~* ('\m' || (select proname from pg_proc where oid = target) || '\s*\(') loop
      if owner_name in ('anon', 'authenticated', 'service_role') then raise exception 'GROUP_POST_EDITED_AT_UNTRUSTED_OWNER % for %', owner_name, target; end if;
      if owner_name <> target_owner then execute format('grant execute on function %s to %I', target, owner_name); end if;
    end loop;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'GROUP_POST_EDITED_AT_OWNER_GAP: % lacks %', current_user, array_to_string(gaps, '; '); end if;
end $check$;

-- 감싼 함수가 이름 바꾼 함수를 부르고, 이름 바꾼 함수는 아직 이 마이그레이션의 층이 아닌지만 확인한다.
-- 앞뒤 마이그레이션이 같은 함수를 감쌌더라도 통과한다.
do $shape$
begin
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure), 'groups_content_dispatch_before_edited_at') = 0 then
    raise exception 'GROUP_POST_EDITED_AT_SHAPE: wrapper does not call the renamed function';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.groups_content_dispatch_before_edited_at(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure), 'group_post_edited_items') > 0 then
    raise exception 'GROUP_POST_EDITED_AT_SHAPE: renamed function is already a wrapper of this migration';
  end if;
end $shape$;

commit;

notify pgrst, 'reload schema';

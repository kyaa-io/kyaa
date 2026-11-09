-- B8 1단계 (설계 board/tasks/b8-plan/plan.md 3판 3.1·3.2·3.6 1번)
-- 1. group_operator_role(): 새 운영자 연산 전용 접근 판정(활성 계정 + 페이지 공개 범위 + published + owner·manager). 매 호출 판정.
-- 2. group_operator_read_budgets + group_operator_consume_read(): 운영자 목록·현황 호출량(행위자 x 페이지 x 종류, 분당 group_operator_read_limit()).
-- 3. group_role_audit: group_memberships 역할 변화 감사(추가 전용). 트리거가 같은 트랜잭션에서 남긴다.
-- 4. groups_dispatch 한 겹 감싸기: role·transfer·review에 행위자·연산·requestId를 트랜잭션 로컬 설정으로 넘기고(판정은 그대로),
--    운영자가 부르는 기존 members는 operator-members와 같은 예산(member_list)에서 1회 차감하고 limit를 50으로 묶는다.
--    operator-members·operator-members-export는 20261219081000의 group_operator_members_dispatch로 넘긴다.
-- 5. 기존 members 분기의 'answer' 키 제거(pg_get_functiondef 치환 1개). 원문은 group_memberships.answer에 그대로 둔다.
-- 롤백: supabase/rollback/20261219080000_group_operator_access.sql (가입 답변이 운영자 응답에 다시 나가므로 감독 승인 필요).
begin;
set local lock_timeout = '5s';

create table public.group_operator_read_budgets (
  actor_app_user_id uuid not null,
  page_id uuid not null,
  kind text not null check (kind in ('member_list','mission_stats')),
  window_start timestamptz not null,
  calls integer not null default 0,
  primary key (actor_app_user_id, page_id, kind, window_start)
);

create table public.group_role_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  page_id uuid not null,
  target_app_user_id uuid not null,
  actor_app_user_id uuid null,
  actor_admin_id uuid null,
  operation text not null check (operation in ('role','transfer','application_approved','admin_assign','join','leave','system')),
  before_role text null check (before_role is null or before_role in ('owner','manager','member')),
  after_role text null check (after_role is null or after_role in ('owner','manager','member')),
  request_id uuid null,
  txid bigint not null default txid_current(),
  created_at timestamptz not null default clock_timestamp(),
  check (before_role is distinct from after_role)
);
create index group_role_audit_page on public.group_role_audit(page_id, created_at desc);

do $$ declare t text; begin
  foreach t in array array['group_operator_read_budgets','group_role_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;

-- 숫자는 여기 하나에서 바꾼다.
create function public.group_operator_read_limit() returns integer language sql immutable set search_path = '' as $$ select 30 $$;

create function public.group_operator_role(p_actor uuid, p_page uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.group_memberships m
  join public.app_users u on u.id = m.app_user_id and u.status = 'active'
  join public.group_pages g on g.id = m.page_id and g.status = 'published'
  where m.page_id = p_page and m.app_user_id = p_actor and m.role in ('owner','manager')
    and public.group_scope_visible(p_actor, p_page)
$$;

-- 역할이 없으면 기존 오류 이름 그대로: 페이지가 안 보이면 GROUPS_NOT_FOUND, 보이면 GROUPS_FORBIDDEN.
create function public.group_operator_require(p_actor uuid, p_page uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_role text;
begin
  if p_actor is null then raise exception 'GROUPS_FORBIDDEN'; end if;
  if p_page is null then raise exception 'GROUPS_NOT_FOUND'; end if;
  v_role := public.group_operator_role(p_actor, p_page);
  if v_role is not null then return v_role; end if;
  if not exists (select 1 from public.group_pages g where g.id = p_page and g.status = 'published') or not public.group_scope_visible(p_actor, p_page) then
    raise exception 'GROUPS_NOT_FOUND';
  end if;
  raise exception 'GROUPS_FORBIDDEN';
end $$;

-- 분 단위 창. 초과하면 GROUPS_RATE_LIMITED(그 호출의 차감도 함께 롤백되므로 창 안의 수는 상한에 머문다).
create function public.group_operator_consume_read(p_actor uuid, p_page uuid, p_kind text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_window timestamptz := pg_catalog.date_trunc('minute', clock_timestamp()); v_calls integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-operator-read:' || p_actor::text || ':' || p_page::text, 0));
  insert into public.group_operator_read_budgets as b (actor_app_user_id, page_id, kind, window_start, calls)
  values (p_actor, p_page, p_kind, v_window, 1)
  on conflict (actor_app_user_id, page_id, kind, window_start) do update set calls = b.calls + 1
  returning calls into v_calls;
  if v_calls > public.group_operator_read_limit() then raise exception 'GROUPS_RATE_LIMITED'; end if;
  delete from public.group_operator_read_budgets where actor_app_user_id = p_actor and page_id = p_page and window_start < v_window - interval '10 minutes';
end $$;

create function public.group_role_audit_capture() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := nullif(current_setting('kyaa.group_actor', true), '')::uuid;
  v_admin uuid := nullif(current_setting('kyaa.group_admin', true), '')::uuid;
  v_operation text := nullif(current_setting('kyaa.group_operation', true), '');
  v_request uuid := nullif(current_setting('kyaa.group_request', true), '')::uuid;
  v_before text; v_after text; v_page uuid; v_target uuid;
begin
  if tg_op = 'INSERT' then v_after := new.role; v_page := new.page_id; v_target := new.app_user_id;
  elsif tg_op = 'UPDATE' then v_before := old.role; v_after := new.role; v_page := new.page_id; v_target := new.app_user_id;
  else v_before := old.role; v_page := old.page_id; v_target := old.app_user_id;
  end if;
  if v_before is not distinct from v_after then return null; end if;
  -- 일반 회원의 가입·탈퇴는 남기지 않는다. owner·manager가 관련된 행만.
  if coalesce(v_before, 'member') = 'member' and coalesce(v_after, 'member') = 'member' then return null; end if;
  insert into public.group_role_audit(page_id, target_app_user_id, actor_app_user_id, actor_admin_id, operation, before_role, after_role, request_id)
  values (v_page, v_target, v_actor, v_admin,
    coalesce(v_operation, case tg_op when 'INSERT' then 'join' when 'DELETE' then 'leave' else 'system' end),
    v_before, v_after, v_request);
  return null;
end $$;
create trigger group_role_audit_capture after insert or update of role or delete on public.group_memberships
  for each row execute function public.group_role_audit_capture();

create function public.group_role_audit_immutable() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'GROUP_ROLE_AUDIT_APPEND_ONLY'; end $$;
create trigger group_role_audit_no_update before update or delete on public.group_role_audit for each row execute function public.group_role_audit_immutable();
create trigger group_role_audit_no_truncate before truncate on public.group_role_audit for each statement execute function public.group_role_audit_immutable();

-- 기존 members 분기에서 가입 답변 키를 지운다(일반 회원 응답에는 원래 없던 키).
do $patch$
declare
  sig constant regprocedure := 'public.groups_dispatch_before_content(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure;
  needle constant text := $n$,'answer',case when member_role in ('owner','manager') then m.answer end$n$;
  definition text := pg_catalog.pg_get_functiondef(sig);
begin
  if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then raise exception 'GROUP_OPERATOR_ACCESS_SHAPE: members answer'; end if;
  execute replace(definition, needle, '');
end $patch$;

alter function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_dispatch_before_operator_access;
create function public.groups_dispatch(p_operation text, p_actor uuid default null, p_page_id uuid default null, p_item_id uuid default null, p_input jsonb default '{}'::jsonb, p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; v_input jsonb := p_input;
begin
  if p_operation in ('operator-members','operator-members-export') then
    return public.group_operator_members_dispatch(p_operation, p_actor, p_page_id, p_input);
  end if;
  if p_operation = 'members' and p_actor is not null and p_page_id is not null and public.group_operator_role(p_actor, p_page_id) is not null then
    perform public.group_operator_consume_read(p_actor, p_page_id, 'member_list');
    v_input := coalesce(v_input, '{}'::jsonb) || jsonb_build_object('limit', least(greatest(coalesce((v_input->>'limit')::integer, 30), 1), 50));
  end if;
  if p_operation not in ('role','transfer','review') then
    return public.groups_dispatch_before_operator_access(p_operation, p_actor, p_page_id, p_item_id, v_input, p_admin_id);
  end if;
  perform set_config('kyaa.group_actor', coalesce(p_actor::text, ''), true);
  perform set_config('kyaa.group_admin', coalesce(p_admin_id::text, ''), true);
  perform set_config('kyaa.group_operation', case p_operation when 'review' then 'application_approved' else p_operation end, true);
  perform set_config('kyaa.group_request', coalesce(p_input->>'requestId', ''), true);
  result := public.groups_dispatch_before_operator_access(p_operation, p_actor, p_page_id, p_item_id, v_input, p_admin_id);
  perform set_config('kyaa.group_actor', '', true);
  perform set_config('kyaa.group_admin', '', true);
  perform set_config('kyaa.group_operation', '', true);
  perform set_config('kyaa.group_request', '', true);
  return result;
end $$;

-- 소유자·실행 권한: 새 진입 함수는 감싼 함수의 소유자와 실행 권한을 그대로 받고, 감싼 함수는 내부 전용이 된다.
-- 헬퍼는 그 소유자 소유, 누구에게도 실행 권한 없음.
do $$
declare
  old_sig constant regprocedure := 'public.groups_dispatch_before_operator_access(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure;
  new_sig constant regprocedure := 'public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure;
  owner_name text; g record; f text;
begin
  select pg_get_userbyid(proowner) into owner_name from pg_proc where oid = old_sig;
  if owner_name in ('anon','authenticated','service_role') then raise exception 'GROUP_OPERATOR_ACCESS_OWNER_GAP: % may not own the dispatcher', owner_name; end if;
  begin
    execute format('alter function %s owner to %I', new_sig, owner_name);
    foreach f in array array['group_operator_read_limit()','group_operator_role(uuid,uuid)','group_operator_require(uuid,uuid)',
        'group_operator_consume_read(uuid,uuid,text)','group_role_audit_capture()','group_role_audit_immutable()'] loop
      execute format('alter function public.%s owner to %I', f, owner_name);
      execute format('revoke all on function public.%s from public, anon, authenticated, service_role', f);
    end loop;
    execute format('alter table public.group_operator_read_budgets owner to %I', owner_name);
    execute format('alter table public.group_role_audit owner to %I', owner_name);
  exception when insufficient_privilege then raise exception 'GROUP_OPERATOR_ACCESS_OWNER_GAP: applier cannot act as %', owner_name;
  end;
  execute format('revoke all on function %s from public, anon, authenticated, service_role', new_sig);
  for g in select distinct pg_get_userbyid(a.grantee) rolname from pg_proc p, aclexplode(p.proacl) a
      where p.oid = old_sig and a.privilege_type = 'EXECUTE' and a.grantee <> 0 loop
    execute format('grant execute on function %s to %I', new_sig, g.rolname);
  end loop;
  execute format('revoke all on function %s from public, anon, authenticated, service_role', old_sig);
end $$;

-- 소유자가 슈퍼유저·BYPASSRLS가 아니면(dev byus_admin) FORCE row security 표마다 그 역할 전용 정책이 있어야 0행이 아니다.
do $access$
declare r record; t record; gaps text[] := '{}';
begin
  select o.oid, o.rolname, o.rolsuper, o.rolbypassrls into r from pg_proc f join pg_roles o on o.oid = f.proowner
    where f.oid = 'public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure;
  -- BYPASSRLS는 권한을 주지 않으므로 grant는 늘 하고, 정책만 BYPASSRLS가 없을 때 만든다. grant 실패는 아래 권한 확인이 잡는다.
  if r.rolsuper then return; end if;
  for t in select * from (values
      ('group_operator_read_budgets','select, insert, update, delete','all'), ('group_role_audit','select, insert','all'),
      ('group_memberships','select','select'), ('group_pages','select','select'), ('app_users','select','select'), ('celebrities','select','select')) v(tname, privs, cmd) loop
    begin execute format('grant %s on table public.%I to %I', t.privs, t.tname, r.rolname); exception when insufficient_privilege then null; end;
    if not r.rolbypassrls and exists (select 1 from pg_class c where c.oid = ('public.' || t.tname)::regclass and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.oid))
       and not exists (select 1 from pg_policy p where p.polrelid = ('public.' || t.tname)::regclass and r.oid = any(p.polroles) and p.polpermissive
         and (p.polcmd = '*' or (t.cmd = 'select' and p.polcmd = 'r'))) then
      begin
        execute format('create policy %I on public.%I for %s to %I using (true)%s', 'b8_owner_' || r.rolname, t.tname, t.cmd, r.rolname,
          case when t.cmd = 'select' then '' else ' with check (true)' end);
      exception when insufficient_privilege then null; end;
    end if;
    if not r.rolbypassrls and exists (select 1 from pg_class c where c.oid = ('public.' || t.tname)::regclass and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.oid))
       and not exists (select 1 from pg_policy p where p.polrelid = ('public.' || t.tname)::regclass and r.oid = any(p.polroles) and p.polpermissive
         and (p.polcmd = '*' or (t.cmd = 'select' and p.polcmd = 'r'))) then
      gaps := gaps || format('%s has no %s policy on %s', r.rolname, t.cmd, t.tname);
    end if;
    if exists (select 1 from unnest(string_to_array(t.privs, ', ')) need where not has_table_privilege(r.oid, ('public.' || t.tname)::regclass, need)) then
      gaps := gaps || format('%s lacks %s on %s', r.rolname, t.privs, t.tname);
    end if;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'GROUP_OPERATOR_ACCESS_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end $access$;

notify pgrst, 'reload schema';
commit;

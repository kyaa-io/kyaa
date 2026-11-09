-- B8 1단계 (plan.md 3판 3.2 회원 DB, 3.6 2번). 20261219080000 다음.
-- groups_dispatch('operator-members' | 'operator-members-export')가 부르는 group_operator_members_dispatch.
--   회원 집합은 group_operator_member_rows 하나(하트는 셀럽 단위 집계 조인).
--   목록: owner·manager, 행위자 x 페이지 member_list 예산(기존 members와 공유), search 1~16자, limit 1~50(기본 30), joined_at·app_user_id 커서.
--   응답 키: total·jjinfanTotal·items[profileId,nickname,avatarUrl,role,joinedAt,jjinfan,hearts,missionCount,lastActiveAt]·nextCursor.
--   계정 실명·전화·이메일과 가입 답변은 읽지도 내보내지도 않는다(공개 닉네임은 예외).
--   내려받기: owner만, 페이지당 10분 1회, 최대 20,000행. 한 트랜잭션에서 판정 -> 잠금 -> 회원 집합 1회 확정(가벼운 열, 20,001행까지)
--   -> group_member_exports + audit_logs(초과여도 기록, 10분 제한 유지) -> 초과면 {error} 값, 아니면 같은 집합으로 행 계산 -> 반환.
-- 롤백: supabase/rollback/20261219081000_group_operator_members.sql
begin;
set local lock_timeout = '5s';

create table public.group_member_exports (
  id uuid primary key default extensions.gen_random_uuid(),
  page_id uuid not null,
  actor_app_user_id uuid not null,
  filter jsonb not null,
  row_count integer not null check (row_count >= 0),
  created_at timestamptz not null default clock_timestamp()
);
create index group_member_exports_page on public.group_member_exports(page_id, created_at desc);
alter table public.group_member_exports enable row level security;
alter table public.group_member_exports force row level security;
revoke all on public.group_member_exports from public, anon, authenticated, service_role;
create trigger group_member_exports_no_update before update or delete on public.group_member_exports for each row execute function public.group_role_audit_immutable();
create trigger group_member_exports_no_truncate before truncate on public.group_member_exports for each statement execute function public.group_role_audit_immutable();

-- 페이지 활성 회원 + 공개 닉네임 + 하트(팬페이지만). 하트는 passport_hearts(20261210134000)와 같은 정의를
-- 회원마다 함수로 부르지 않고 셀럽 단위 집계 조인으로 계산한다(시험이 passport_hearts와 값이 같은지 본다).
create function public.group_operator_member_rows(p_page uuid, p_celebrity uuid, p_search text, p_jjinfan text)
returns table(app_user_id uuid, role text, joined_at timestamptz, nickname text, hearts integer)
language sql stable security definer set search_path = '' as $$
  with ledger as (
    select l.app_user_id, sum(l.amount) amount from public.creator_heart_ledger l
    where p_celebrity is not null and l.celebrity_id = p_celebrity and l.source_type = 'passport_page_claim' group by l.app_user_id
  ), members as (
    select m.app_user_id, m.role, m.joined_at, coalesce(up.nickname, '팬') nickname,
      case when p_celebrity is not null then (coalesce(l.amount, 0) + coalesce(c.hearts, 0))::integer end hearts
    from public.group_memberships m
    join public.app_users u on u.id = m.app_user_id and u.status = 'active'
    left join public.user_profiles up on up.app_user_id = m.app_user_id
    left join ledger l on l.app_user_id = m.app_user_id
    left join public.fan_heart_conversions c on p_celebrity is not null and c.app_user_id = m.app_user_id and c.celebrity_id = p_celebrity
    where m.page_id = p_page
  )
  select * from members x
  where (p_search = '' or position(lower(p_search) in lower(x.nickname)) > 0)
    and (p_jjinfan = 'all' or (p_jjinfan = 'yes') = (x.hearts > 0))
$$;

-- 한 회원의 응답 항목. 목록과 내려받기가 같은 정의를 쓴다.
create function public.group_operator_member_item(p_page uuid, p_user uuid, p_role text, p_joined timestamptz, p_nickname text, p_hearts integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profileId', p_user, 'nickname', p_nickname, 'avatarUrl', public.public_fan_avatar_url(p_user), 'role', p_role,
    'joinedAt', p_joined, 'jjinfan', case when p_hearts is not null then p_hearts > 0 end, 'hearts', p_hearts,
    'missionCount', (select count(*) from public.group_mission_submissions s join public.group_missions mi on mi.id = s.mission_id
                      where mi.page_id = p_page and s.app_user_id = p_user and s.status = 'completed'),
    'lastActiveAt', greatest(
      (select max(p.created_at) from public.group_posts p where p.page_id = p_page and p.author_id = p_user and p.removed_at is null and not p.anonymous),
      (select max(c.created_at) from public.group_comments c join public.group_posts p on p.id = c.post_id
        where p.page_id = p_page and c.author_id = p_user and c.removed_at is null and p.removed_at is null and not c.anonymous),
      (select max(r.created_at) from public.group_mission_submission_revisions r join public.group_mission_submissions s on s.id = r.submission_id
        join public.group_missions mi on mi.id = s.mission_id where mi.page_id = p_page and s.app_user_id = p_user)))
$$;

create function public.group_operator_members_dispatch(p_operation text, p_actor uuid, p_page uuid, p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_role text; g public.group_pages; v_search text; v_jj text; v_limit integer; v_cursor uuid; v_cursor_at timestamptz;
  v_input jsonb := coalesce(p_input, '{}'::jsonb); v_rows integer; v_total integer; v_jj_total integer; v_set jsonb; v_filter jsonb; result jsonb;
begin
  if p_operation not in ('operator-members','operator-members-export') then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  v_role := public.group_operator_require(p_actor, p_page);
  if p_operation = 'operator-members-export' and v_role <> 'owner' then raise exception 'GROUPS_FORBIDDEN'; end if;
  select * into strict g from public.group_pages where id = p_page;
  v_search := btrim(coalesce(v_input->>'search', ''));
  if length(v_search) > 16 or v_search ~ '[[:cntrl:]]' then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  v_jj := coalesce(nullif(v_input->>'jjinfan', ''), 'all');
  if v_jj not in ('all','yes','no') then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  if g.celebrity_id is null then v_jj := 'all'; end if;

  if p_operation = 'operator-members-export' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-export:' || p_page::text, 0));
    if exists (select 1 from public.group_member_exports e where e.page_id = p_page and e.created_at > clock_timestamp() - interval '10 minutes') then
      raise exception 'GROUPS_RATE_LIMITED';
    end if;
    -- 내보낼 회원 집합을 한 번만 정한다(가벼운 열만, 최대 20,001행). 상한 판정·행 생성·기록·감사가 모두 이 집합 하나를 쓴다.
    select coalesce(jsonb_agg(jsonb_build_object('u', x.app_user_id, 'r', x.role, 'j', x.joined_at, 'n', x.nickname, 'h', x.hearts) order by x.joined_at, x.app_user_id), '[]'::jsonb)
      into v_set
      from (select * from public.group_operator_member_rows(p_page, g.celebrity_id, v_search, v_jj) m order by m.joined_at, m.app_user_id limit 20001) x;
    v_rows := jsonb_array_length(v_set);
    v_filter := jsonb_build_object('search', v_search, 'jjinfan', v_jj);
    -- 상한을 넘어도 시도는 기록한다(10분 제한이 그대로 걸린다). 그때 row_count 20,001은 '2만 초과'를 뜻한다.
    insert into public.group_member_exports(page_id, actor_app_user_id, filter, row_count)
      values (p_page, p_actor, v_filter || jsonb_build_object('outcome', case when v_rows > 20000 then 'too_large' else 'exported' end), v_rows);
    insert into public.audit_logs(actor_app_user_id, action, entity_type, entity_id, before_after_summary)
      values (p_actor, 'group_members.export', 'group_page', p_page::text, jsonb_build_object('rowCount', v_rows, 'tooLarge', v_rows > 20000, 'filter', v_filter));
    -- 예외로 끝내면 위 기록이 롤백되므로 거절은 값으로 돌려준다(라우트가 413으로 바꾼다).
    if v_rows > 20000 then return jsonb_build_object('error', 'GROUPS_EXPORT_TOO_LARGE'); end if;
    return jsonb_build_object('fan', g.celebrity_id is not null, 'rowCount', v_rows, 'items', coalesce((
      select jsonb_agg(public.group_operator_member_item(p_page, (e.v->>'u')::uuid, e.v->>'r', (e.v->>'j')::timestamptz, e.v->>'n', (e.v->>'h')::integer) order by e.ord)
      from jsonb_array_elements(v_set) with ordinality e(v, ord)), '[]'::jsonb));
  end if;

  perform public.group_operator_consume_read(p_actor, p_page, 'member_list');
  v_limit := least(greatest(coalesce((v_input->>'limit')::integer, 30), 1), 50);
  v_cursor := nullif(v_input->>'cursor', '')::uuid;
  if v_cursor is not null then
    select m.joined_at into v_cursor_at from public.group_memberships m where m.page_id = p_page and m.app_user_id = v_cursor;
    if not found then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  end if;
  select count(*), count(*) filter (where x.hearts > 0) into v_total, v_jj_total from public.group_operator_member_rows(p_page, g.celebrity_id, '', 'all') x;
  with selected as (
    select * from public.group_operator_member_rows(p_page, g.celebrity_id, v_search, v_jj) x
    where v_cursor is null or (x.joined_at, x.app_user_id) > (v_cursor_at, v_cursor)
    order by x.joined_at, x.app_user_id
    limit v_limit + 1
  ), shown as (
    select * from selected order by joined_at, app_user_id limit v_limit
  )
  select jsonb_build_object(
    'total', v_total, 'jjinfanTotal', case when g.celebrity_id is not null then v_jj_total end,
    'items', coalesce((select jsonb_agg(public.group_operator_member_item(p_page, x.app_user_id, x.role, x.joined_at, x.nickname, x.hearts) order by x.joined_at, x.app_user_id) from shown x), '[]'::jsonb),
    'nextCursor', case when (select count(*) from selected) > v_limit then (select app_user_id from shown order by joined_at desc, app_user_id desc limit 1) end)
  into result;
  return result;
end $$;

do $$
declare owner_name text := (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
begin
  begin
    execute format('alter function public.group_operator_members_dispatch(text,uuid,uuid,jsonb) owner to %I', owner_name);
    execute format('alter function public.group_operator_member_rows(uuid,uuid,text,text) owner to %I', owner_name);
    execute format('alter function public.group_operator_member_item(uuid,uuid,text,timestamptz,text,integer) owner to %I', owner_name);
    execute format('alter table public.group_member_exports owner to %I', owner_name);
  exception when insufficient_privilege then raise exception 'GROUP_OPERATOR_MEMBERS_OWNER_GAP: applier cannot act as %', owner_name;
  end;
  revoke all on function public.group_operator_members_dispatch(text,uuid,uuid,jsonb) from public, anon, authenticated, service_role;
  revoke all on function public.group_operator_member_rows(uuid,uuid,text,text) from public, anon, authenticated, service_role;
  revoke all on function public.group_operator_member_item(uuid,uuid,text,timestamptz,text,integer) from public, anon, authenticated, service_role;
end $$;

do $access$
declare r record; t record; gaps text[] := '{}';
begin
  select o.oid, o.rolname, o.rolsuper, o.rolbypassrls into r from pg_proc f join pg_roles o on o.oid = f.proowner
    where f.oid = 'public.group_operator_members_dispatch(text,uuid,uuid,jsonb)'::regprocedure;
  -- BYPASSRLS는 권한을 주지 않으므로 grant는 늘 하고, 정책만 BYPASSRLS가 없을 때 만든다. grant 실패는 아래 권한 확인이 잡는다.
  if r.rolsuper then return; end if;
  for t in select * from (values
      ('group_member_exports','select, insert','all'), ('audit_logs','insert','all'), ('user_profiles','select','select'),
      ('group_mission_submissions','select','select'), ('group_missions','select','select'), ('group_posts','select','select'),
      ('group_comments','select','select'), ('group_mission_submission_revisions','select','select'),
      ('creator_heart_ledger','select','select'), ('fan_heart_conversions','select','select'), ('app_user_avatars','select','select'),
      ('group_memberships','select','select'), ('group_pages','select','select'), ('app_users','select','select')) v(tname, privs, cmd) loop
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
  if cardinality(gaps) > 0 then raise exception 'GROUP_OPERATOR_MEMBERS_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end $access$;

notify pgrst, 'reload schema';
commit;

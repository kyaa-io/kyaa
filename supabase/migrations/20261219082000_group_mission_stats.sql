-- B8 1단계 (plan.md 3판 3.3 미션 현황, 3.6 3번). 20261219080000 다음.
-- group_activities_dispatch('mission-stats'): owner·manager, 행위자 x 페이지 mission_stats 예산, 기간 KST from~to(기본 최근 7일, 최대 92일).
--   행 = 그 페이지의 published·closed 미션. 참여 = 기간 안에 처음 제출된 행, 인증 대기 = 지금 pending, 승인·반려 = 기간 안의 검토 이력.
--   팬페이지는 attendance = 기간 안에 출석한 (활성) 페이지 회원 고유 수, 모임 페이지는 null.
-- 롤백: supabase/rollback/20261219082000_group_mission_stats.sql
begin;
set local lock_timeout = '5s';

create index group_mission_submissions_mission_created on public.group_mission_submissions(mission_id, created_at);
create index group_mission_submission_reviews_submission_created on public.group_mission_submission_reviews(submission_id, created_at);

create function public.group_mission_stats_read(p_actor uuid, p_page uuid, p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  g public.group_pages; v_today date := (clock_timestamp() at time zone 'Asia/Seoul')::date; v_from date; v_to date;
  v_start timestamptz; v_end timestamptz; v_input jsonb := coalesce(p_input, '{}'::jsonb);
begin
  perform public.group_operator_require(p_actor, p_page);
  begin
    v_to := coalesce(nullif(v_input->>'to', '')::date, v_today);
    v_from := coalesce(nullif(v_input->>'from', '')::date, v_to - 6);
  exception when others then raise exception 'GROUPS_INVALID_REQUEST';
  end;
  if v_from > v_to or v_to - v_from > 91 then raise exception 'GROUPS_INVALID_REQUEST'; end if;
  perform public.group_operator_consume_read(p_actor, p_page, 'mission_stats');
  select * into strict g from public.group_pages where id = p_page;
  v_start := v_from::timestamp at time zone 'Asia/Seoul';
  v_end := (v_to + 1)::timestamp at time zone 'Asia/Seoul';
  return jsonb_build_object(
    'from', v_from, 'to', v_to,
    'attendance', case when g.celebrity_id is not null then jsonb_build_object('participants', (
      select count(distinct a.app_user_id) from public.group_creator_attendance a
      join public.group_memberships m on m.page_id = p_page and m.app_user_id = a.app_user_id
      join public.app_users u on u.id = a.app_user_id and u.status = 'active'
      where a.celebrity_id = g.celebrity_id and a.attendance_date between v_from and v_to)) end,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'missionId', mi.id, 'title', mi.title, 'state', mi.state, 'submissionKind', mi.submission_kind,
        'participants', (select count(*) from public.group_mission_submissions s where s.mission_id = mi.id and s.created_at >= v_start and s.created_at < v_end),
        'pending', (select count(*) from public.group_mission_submissions s where s.mission_id = mi.id and s.status = 'pending'),
        'approved', (select count(*) from public.group_mission_submission_reviews r join public.group_mission_submissions s on s.id = r.submission_id
                     where s.mission_id = mi.id and r.action = 'approve' and r.created_at >= v_start and r.created_at < v_end),
        'rejected', (select count(*) from public.group_mission_submission_reviews r join public.group_mission_submissions s on s.id = r.submission_id
                     where s.mission_id = mi.id and r.action = 'reject' and r.created_at >= v_start and r.created_at < v_end)
      ) order by mi.created_at desc, mi.id) from public.group_missions mi where mi.page_id = p_page and mi.state in ('published','closed')), '[]'::jsonb));
end $$;

alter function public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid) rename to group_activities_dispatch_before_mission_stats;
create function public.group_activities_dispatch(p_operation text, p_actor uuid default null, p_page_id uuid default null, p_item_id uuid default null, p_sub_id uuid default null, p_input jsonb default '{}', p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_operation = 'mission-stats' then return public.group_mission_stats_read(p_actor, p_page_id, p_input); end if;
  return public.group_activities_dispatch_before_mission_stats(p_operation, p_actor, p_page_id, p_item_id, p_sub_id, p_input, p_admin_id);
end $$;

do $$
declare
  old_sig constant regprocedure := 'public.group_activities_dispatch_before_mission_stats(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure;
  new_sig constant regprocedure := 'public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure;
  owner_name text; g record;
begin
  select pg_get_userbyid(proowner) into owner_name from pg_proc where oid = old_sig;
  if owner_name in ('anon','authenticated','service_role') then raise exception 'GROUP_MISSION_STATS_OWNER_GAP: % may not own the dispatcher', owner_name; end if;
  begin
    execute format('alter function %s owner to %I', new_sig, owner_name);
    execute format('alter function public.group_mission_stats_read(uuid,uuid,jsonb) owner to %I', owner_name);
  exception when insufficient_privilege then raise exception 'GROUP_MISSION_STATS_OWNER_GAP: applier cannot act as %', owner_name;
  end;
  revoke all on function public.group_mission_stats_read(uuid,uuid,jsonb) from public, anon, authenticated, service_role;
  execute format('revoke all on function %s from public, anon, authenticated, service_role', new_sig);
  for g in select distinct pg_get_userbyid(a.grantee) rolname from pg_proc p, aclexplode(p.proacl) a
      where p.oid = old_sig and a.privilege_type = 'EXECUTE' and a.grantee <> 0 loop
    execute format('grant execute on function %s to %I', new_sig, g.rolname);
  end loop;
  execute format('revoke all on function %s from public, anon, authenticated, service_role', old_sig);
end $$;

do $access$
declare r record; t text; gaps text[] := '{}';
begin
  select o.oid, o.rolname, o.rolsuper, o.rolbypassrls into r from pg_proc f join pg_roles o on o.oid = f.proowner
    where f.oid = 'public.group_mission_stats_read(uuid,uuid,jsonb)'::regprocedure;
  -- BYPASSRLS는 권한을 주지 않으므로 grant는 늘 하고, 정책만 BYPASSRLS가 없을 때 만든다.
  if r.rolsuper then return; end if;
  foreach t in array array['group_missions','group_mission_submissions','group_mission_submission_reviews','group_creator_attendance','group_memberships','group_pages','app_users'] loop
    begin execute format('grant select on table public.%I to %I', t, r.rolname); exception when insufficient_privilege then null; end;
    if not r.rolbypassrls and exists (select 1 from pg_class c where c.oid = ('public.' || t)::regclass and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.oid))
       and not exists (select 1 from pg_policy p where p.polrelid = ('public.' || t)::regclass and r.oid = any(p.polroles) and p.polpermissive and p.polcmd in ('r','*')) then
      begin execute format('create policy %I on public.%I for select to %I using (true)', 'b8_owner_' || r.rolname, t, r.rolname);
      exception when insufficient_privilege then null; end;
    end if;
    if not r.rolbypassrls and exists (select 1 from pg_class c where c.oid = ('public.' || t)::regclass and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.oid))
       and not exists (select 1 from pg_policy p where p.polrelid = ('public.' || t)::regclass and r.oid = any(p.polroles) and p.polpermissive and p.polcmd in ('r','*')) then
      gaps := gaps || format('%s has no read policy on %s', r.rolname, t);
    end if;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'GROUP_MISSION_STATS_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end $access$;

notify pgrst, 'reload schema';
commit;

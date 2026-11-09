-- B8 1단계 (plan.md 3판 3.4 공지 + 회원 전체 알림, 3.6 4b). 20261219083000(enum)·20261219080000 다음.
-- 흐름: 공지 쓰기(category notice, notifyMembers=true) -> 같은 트랜잭션에서 글 + group_notice_broadcasts 1행(queued) + audit_logs 1행.
--   요청 안에서는 알림을 1건도 넣지 않는다. 페이지당 KST 하루 1회(PK page_id, kst_date). 두 번째는 GROUPS_RATE_LIMITED:notice_broadcast, 글도 없음.
--   발송 스위치 group_notice_broadcast_control.sending_enabled(기본 꺼짐)가 꺼져 있으면 notifyMembers는 무시(행·몫 없음).
-- 작업자: enqueue_due_notification_maintenance가 매 틱 run_group_notice_broadcasts(2000)를 부른다.
--   방송 1건당 틱마다 배치 1개(후보 최대 1,000명, app_user_id 순 커서). 행은 for update skip locked로 잡고, 커밋이 곧 해제.
--   후보 = 활성 회원 - 작성자. insert 직전에 group_post_visible + group_notification_allowed('group_notice','group_post')로 다시 판정.
--   배치 예외는 그 배치만 되돌리고 attempts+1, 3회 연속이면 failed(그날 몫 소진). 공지가 지워지면 cancelled. 스위치를 끄면 paused.
-- 알림: fan_notifications 직접 insert, source_key group_notice:<post>, payload targetType group_post, web_only(앱 푸시 없음).
--   fan_web_notification_kind·source_shape·fan_web_notification_path를 함께 넓힌다(K2·K3). 공지가 지워지면 그 알림을 supersede.
-- 롤백(순서 중요, plan 3.6): supabase/rollback/20261219084000_group_notice_broadcast.sql
begin;
set local lock_timeout = '5s';

create table public.group_notice_broadcast_control (
  id boolean primary key default true check (id),
  sending_enabled boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.group_notice_broadcast_control(id) values (true);

create table public.group_notice_broadcasts (
  page_id uuid not null,
  kst_date date not null,
  post_id uuid not null unique,
  actor_id uuid not null,
  status text not null default 'queued' check (status in ('queued','sending','done','failed','cancelled','paused')),
  cursor_app_user_id uuid null,
  attempts integer not null default 0,
  last_error text null,
  candidate_count integer null,
  delivered_count integer not null default 0,
  skipped_count integer not null default 0,
  last_worker text null,
  last_batch_at timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz null,
  primary key (page_id, kst_date)
);
create index group_notice_broadcasts_open on public.group_notice_broadcasts(created_at) where status in ('queued','sending','paused');

do $$ declare t text; begin
  foreach t in array array['group_notice_broadcast_control','group_notice_broadcasts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;

create function public.group_notice_broadcast_enabled() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select sending_enabled from public.group_notice_broadcast_control where id), false)
$$;

-- K2: 웹 전용 kind(웹 받은편지함만, 앱 푸시 없음). source_shape도 같은 모양을 받는다.
do $$
declare previous text; was_valid boolean;
begin
  select pg_get_expr(conbin, conrelid), convalidated into strict previous, was_valid from pg_constraint where conrelid = 'public.fan_notifications'::regclass and conname = 'fan_notifications_source_shape';
  alter table public.fan_notifications drop constraint fan_notifications_source_shape;
  execute 'alter table public.fan_notifications add constraint fan_notifications_source_shape check ((' || previous
    || ') or (kind::text=''group_notice'' and live_event_id is null and benefit_id is null and web_only)) not valid';
  -- 이전과 같은 검증 상태로 둔다(dev는 검증됨, 로컬 일부는 not valid). 넓히기만 했으므로 기존 행은 그대로 통과한다.
  if was_valid then alter table public.fan_notifications validate constraint fan_notifications_source_shape; end if;
end $$;
alter function public.fan_web_notification_kind(text) rename to fan_web_notification_kind_before_group_notice;
create function public.fan_web_notification_kind(p_kind text) returns boolean language sql immutable security definer set search_path = '' as $$
  select p_kind = 'group_notice' or public.fan_web_notification_kind_before_group_notice(p_kind)
$$;

-- K3: 받는 화면과 같은 판정. 지금 그 공지를 볼 수 있을 때만 공지 상세 경로, 아니면 null(받은편지함 목록·안 읽음 수에서 빠짐).
alter function public.fan_web_notification_path(uuid,uuid) rename to fan_web_notification_path_before_group_notice;
create function public.fan_web_notification_path(p_owner uuid, p_notification uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare n public.fan_notifications; v_post uuid; v_path text;
begin
  select * into n from public.fan_notifications where id = p_notification and app_user_id = p_owner and superseded_at is null and scheduled_for <= now();
  if not found or n.kind::text <> 'group_notice' then return public.fan_web_notification_path_before_group_notice(p_owner, p_notification); end if;
  if coalesce(n.payload->>'targetId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  v_post := (n.payload->>'targetId')::uuid;
  if not exists (select 1 from public.app_users u where u.id = p_owner and u.status = 'active') or not public.group_post_visible(p_owner, v_post) then return null; end if;
  select '/pages/groups/' || p.page_id::text || '?tab=board&postId=' || p.id::text into v_path from public.group_posts p where p.id = v_post;
  return v_path;
end $$;

-- 배치 하나. 호출자가 방송 행을 잠근 상태로 부른다. 넣은 수를 돌려준다.
create function public.group_notice_broadcast_batch(p_post uuid, p_limit integer, p_worker text) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare b public.group_notice_broadcasts; post public.group_posts; v_page public.group_pages; cands uuid[]; eligible uuid[]; added integer := 0;
begin
  select * into strict b from public.group_notice_broadcasts where post_id = p_post;
  select * into post from public.group_posts where id = p_post;
  if not found or post.removed_at is not null then
    update public.group_notice_broadcasts set status = 'cancelled', finished_at = clock_timestamp(), last_worker = p_worker, last_batch_at = clock_timestamp() where post_id = p_post;
    return 0;
  end if;
  -- 예약한 운영자가 그 뒤 역할을 잃었거나 계정이 정지되면 남은 발송을 멈춘다(이미 나간 알림은 그대로).
  if public.group_operator_role(b.actor_id, b.page_id) is null then
    update public.group_notice_broadcasts set status = 'cancelled', last_error = 'author_not_operator', finished_at = clock_timestamp(), last_worker = p_worker, last_batch_at = clock_timestamp() where post_id = p_post;
    return 0;
  end if;
  select * into strict v_page from public.group_pages where id = b.page_id;
  if b.candidate_count is null then
    update public.group_notice_broadcasts set candidate_count = (select count(*) from public.group_memberships m join public.app_users u on u.id = m.app_user_id and u.status = 'active'
      where m.page_id = b.page_id and m.app_user_id <> b.actor_id) where post_id = p_post;
  end if;
  select coalesce(array_agg(app_user_id order by app_user_id), '{}') into cands from (
    select m.app_user_id from public.group_memberships m join public.app_users u on u.id = m.app_user_id and u.status = 'active'
    where m.page_id = b.page_id and m.app_user_id <> post.author_id and (b.cursor_app_user_id is null or m.app_user_id > b.cursor_app_user_id)
    order by m.app_user_id limit least(1000, greatest(p_limit, 1))) x;
  if cardinality(cands) = 0 then
    update public.group_notice_broadcasts set status = 'done', finished_at = clock_timestamp(), attempts = 0, last_error = null, last_worker = p_worker, last_batch_at = clock_timestamp() where post_id = p_post;
    return 0;
  end if;
  select coalesce(array_agg(r order by r), '{}') into eligible from unnest(cands) r
    where public.group_post_visible(r, p_post) and public.group_notification_allowed(r, 'group_notice', 'group_post', p_post);
  insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for, deep_link, payload, web_only)
  select r, 'group_notice', 'group_notice:' || p_post::text, now(), '/pages/groups/' || b.page_id::text,
    jsonb_build_object('schemaVersion', 1, 'targetType', 'group_post', 'targetId', p_post, 'pageId', b.page_id, 'pageName', left(v_page.name, 60), 'postTitle', left(post.title, 100)),
    true
  from unnest(eligible) r
  on conflict (app_user_id, source_key) do nothing;
  get diagnostics added = row_count;
  update public.group_notice_broadcasts set
    cursor_app_user_id = cands[cardinality(cands)],
    delivered_count = delivered_count + added,
    skipped_count = skipped_count + (cardinality(cands) - cardinality(eligible)),
    status = case when cardinality(cands) < least(1000, greatest(p_limit, 1)) then 'done' else 'sending' end,
    finished_at = case when cardinality(cands) < least(1000, greatest(p_limit, 1)) then clock_timestamp() end,
    attempts = 0, last_error = null, last_worker = p_worker, last_batch_at = clock_timestamp()
  where post_id = p_post;
  return added;
end $$;

-- 한 틱. 방송마다 배치 1개, 합계 p_limit(알림 행 기준)까지.
create function public.run_group_notice_broadcasts(p_limit integer default 2000, p_worker text default null) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_worker text := coalesce(p_worker, 'pid-' || pg_backend_pid()::text); total integer := 0; added integer; v_post uuid; done_posts uuid[] := '{}'; v_attempts integer;
begin
  if not public.group_notice_broadcast_enabled() then
    update public.group_notice_broadcasts set status = 'paused', last_worker = v_worker
      where post_id in (select post_id from public.group_notice_broadcasts where status in ('queued','sending') for update skip locked);
    return 0;
  end if;
  loop
    exit when total >= p_limit;
    select post_id into v_post from public.group_notice_broadcasts
      where status in ('queued','sending','paused') and not (post_id = any(done_posts))
      order by created_at, post_id for update skip locked limit 1;
    exit when not found;
    done_posts := done_posts || v_post;
    begin
      added := public.group_notice_broadcast_batch(v_post, p_limit - total, v_worker);
      total := total + added;
    exception when others then
      update public.group_notice_broadcasts set attempts = attempts + 1, last_error = left(sqlstate || ' ' || sqlerrm, 500), last_worker = v_worker, last_batch_at = clock_timestamp()
        where post_id = v_post returning attempts into v_attempts;
      if v_attempts >= 3 then update public.group_notice_broadcasts set status = 'failed', finished_at = clock_timestamp() where post_id = v_post; end if;
    end;
  end loop;
  return total;
end $$;

alter function public.enqueue_due_notification_maintenance(timestamptz) rename to enqueue_due_notification_maintenance_before_group_notice;
create function public.enqueue_due_notification_maintenance(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; sent integer := 0;
begin
  result := public.enqueue_due_notification_maintenance_before_group_notice(p_now);
  begin
    sent := public.run_group_notice_broadcasts(2000, null);
  exception when others then raise warning 'GROUP_NOTICE_BROADCASTS_FAILED %', sqlstate;
  end;
  return result || jsonb_build_object('groupNoticeNotifications', sent);
end $$;

-- 공지를 지우면 이미 나간 알림을 supersede(행은 남김). 받은편지함은 경로가 null인 행을 뺀다.
create function public.group_notice_broadcast_post_removed() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.removed_at is not null and old.removed_at is null and exists (select 1 from public.group_notice_broadcasts b where b.post_id = new.id) then
    update public.fan_notifications set superseded_at = clock_timestamp()
      where source_key = 'group_notice:' || new.id::text and kind::text = 'group_notice' and superseded_at is null;
  end if;
  return null;
end $$;
create trigger group_notice_broadcast_post_removed after update of removed_at on public.group_posts
  for each row execute function public.group_notice_broadcast_post_removed();

-- 공지 쓰기 감싸기 + 오늘 남은 횟수 읽기.
alter function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch_before_notice_broadcast;
create function public.groups_content_dispatch(p_operation text, p_actor uuid default null, p_page_id uuid default null, p_item_id uuid default null, p_input jsonb default '{}'::jsonb, p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_today date := (clock_timestamp() at time zone 'Asia/Seoul')::date; v_notify boolean; v_replay boolean := false; v_enabled boolean; result jsonb; v_post uuid;
begin
  if p_operation = 'notice-broadcast-status' then
    perform public.group_operator_require(p_actor, p_page_id);
    return jsonb_build_object('noticeBroadcastEnabled', public.group_notice_broadcast_enabled(),
      'noticeBroadcastRemainingToday', case when exists (select 1 from public.group_notice_broadcasts b where b.page_id = p_page_id and b.kst_date = v_today) then 0 else 1 end);
  end if;
  if p_operation <> 'post' or coalesce(p_input->>'category', '') <> 'notice' then
    return public.groups_content_dispatch_before_notice_broadcast(p_operation, p_actor, p_page_id, p_item_id, p_input, p_admin_id);
  end if;
  v_notify := coalesce((p_input->>'notifyMembers')::boolean, false);
  if p_actor is not null and p_input->>'requestId' is not null then
    v_replay := exists (select 1 from public.group_action_receipts r where r.actor_id = p_actor and r.request_id = (p_input->>'requestId')::uuid);
  end if;
  v_enabled := public.group_notice_broadcast_enabled();
  if v_notify and not v_replay then
    perform public.group_operator_require(p_actor, p_page_id);
    if v_enabled then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-notice-broadcast:' || p_page_id::text, 0));
      -- 같은 requestId 요청이 겹쳐 앞 요청이 잠금을 쥐고 있었다면, 그 요청이 커밋한 영수증이 이제 보인다. 그러면 재생이다.
      v_replay := exists (select 1 from public.group_action_receipts r where r.actor_id = p_actor and r.request_id = (p_input->>'requestId')::uuid);
      if not v_replay and exists (select 1 from public.group_notice_broadcasts b where b.page_id = p_page_id and b.kst_date = v_today) then raise exception 'GROUPS_RATE_LIMITED:notice_broadcast'; end if;
    end if;
  end if;
  result := public.groups_content_dispatch_before_notice_broadcast(p_operation, p_actor, p_page_id, p_item_id, p_input, p_admin_id);
  if v_notify and not v_replay and v_enabled and jsonb_typeof(result) = 'object' and result ? 'id' then
    v_post := (result->>'id')::uuid;
    insert into public.group_notice_broadcasts(page_id, kst_date, post_id, actor_id) values (p_page_id, v_today, v_post, p_actor);
    insert into public.audit_logs(actor_app_user_id, action, entity_type, entity_id, before_after_summary)
      values (p_actor, 'group_notice.broadcast_queued', 'group_post', v_post::text, jsonb_build_object('pageId', p_page_id, 'kstDate', v_today, 'queuedAt', clock_timestamp()));
  end if;
  if jsonb_typeof(result) = 'object' and public.group_operator_role(p_actor, p_page_id) is not null then
    result := result || jsonb_build_object('noticeBroadcastRemainingToday',
      case when exists (select 1 from public.group_notice_broadcasts b where b.page_id = p_page_id and b.kst_date = v_today) then 0 else 1 end);
  end if;
  return result;
end $$;

-- 소유자·실행 권한. 감싼 진입 함수는 원래 소유자·권한을 그대로 받고, 원래 함수는 내부 전용.
do $$
declare
  pairs text[][] := array[
    array['public.groups_content_dispatch_before_notice_broadcast(text,uuid,uuid,uuid,jsonb,uuid)', 'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'],
    array['public.fan_web_notification_kind_before_group_notice(text)', 'public.fan_web_notification_kind(text)'],
    array['public.fan_web_notification_path_before_group_notice(uuid,uuid)', 'public.fan_web_notification_path(uuid,uuid)'],
    array['public.enqueue_due_notification_maintenance_before_group_notice(timestamp with time zone)', 'public.enqueue_due_notification_maintenance(timestamp with time zone)']];
  i integer; old_sig regprocedure; new_sig regprocedure; owner_name text; g record; f text; helper_owner text;
begin
  for i in 1 .. array_length(pairs, 1) loop
    old_sig := pairs[i][1]::regprocedure; new_sig := pairs[i][2]::regprocedure;
    select pg_get_userbyid(proowner) into owner_name from pg_proc where oid = old_sig;
    if owner_name in ('anon','authenticated','service_role') then raise exception 'GROUP_NOTICE_BROADCAST_OWNER_GAP: % may not own %', owner_name, new_sig; end if;
    begin execute format('alter function %s owner to %I', new_sig, owner_name);
    exception when insufficient_privilege then raise exception 'GROUP_NOTICE_BROADCAST_OWNER_GAP: applier cannot act as %', owner_name; end;
    execute format('revoke all on function %s from public, anon, authenticated, service_role', new_sig);
    for g in select distinct pg_get_userbyid(a.grantee) rolname from pg_proc p, aclexplode(p.proacl) a
        where p.oid = old_sig and a.privilege_type = 'EXECUTE' and a.grantee <> 0 loop
      execute format('grant execute on function %s to %I', new_sig, g.rolname);
    end loop;
    -- 이전 함수는 새 함수의 소유자가 부른다.
    execute format('grant execute on function %s to %I', old_sig, owner_name);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', old_sig);
  end loop;
  -- 새 헬퍼·작업자·표는 fan_notifications 소유자(dev: postgres) 소유. 부르는 함수의 소유자에게만 실행 권한.
  select pg_get_userbyid(relowner) into helper_owner from pg_class where oid = 'public.fan_notifications'::regclass;
  if helper_owner in ('anon','authenticated','service_role') then raise exception 'GROUP_NOTICE_BROADCAST_OWNER_GAP: untrusted owner %', helper_owner; end if;
  begin
    foreach f in array array['group_notice_broadcast_enabled()','group_notice_broadcast_batch(uuid,integer,text)','run_group_notice_broadcasts(integer,text)','group_notice_broadcast_post_removed()'] loop
      execute format('alter function public.%s owner to %I', f, helper_owner);
      execute format('revoke all on function public.%s from public, anon, authenticated, service_role', f);
    end loop;
    execute format('alter table public.group_notice_broadcast_control owner to %I', helper_owner);
    execute format('alter table public.group_notice_broadcasts owner to %I', helper_owner);
  exception when insufficient_privilege then raise exception 'GROUP_NOTICE_BROADCAST_OWNER_GAP: applier cannot act as %', helper_owner;
  end;
  for g in select distinct pg_get_userbyid(p.proowner) rolname from pg_proc p
      where p.oid in ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure, 'public.enqueue_due_notification_maintenance(timestamp with time zone)'::regprocedure) loop
    execute format('grant execute on function public.group_notice_broadcast_enabled(), public.run_group_notice_broadcasts(integer,text) to %I', g.rolname);
  end loop;
  -- 작업자는 받는 화면과 같은 판정 함수 둘과 운영자 판정을 부른다(그룹 함수 소유자 소유, 공개 실행 권한 없음).
  execute format('grant execute on function public.group_post_visible(uuid,uuid), public.group_notification_allowed(uuid,text,text,uuid), public.group_operator_role(uuid,uuid) to %I', helper_owner);
  if not has_function_privilege(helper_owner, 'public.group_post_visible(uuid,uuid)', 'execute')
     or not has_function_privilege(helper_owner, 'public.group_notification_allowed(uuid,text,text,uuid)', 'execute')
     or not has_function_privilege(helper_owner, 'public.group_operator_role(uuid,uuid)', 'execute') then
    raise exception 'GROUP_NOTICE_BROADCAST_OWNER_GAP: % cannot run the recipient checks', helper_owner;
  end if;
  -- 감싼 공지 쓰기는 방송 표를 직접 읽고 쓴다.
  select pg_get_userbyid(proowner) into owner_name from pg_proc where oid = 'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure;
  execute format('grant select, insert on table public.group_notice_broadcasts to %I', owner_name);
  execute format('grant select on table public.group_notice_broadcast_control to %I', owner_name);
end $$;

do $access$
declare r record; t record; gaps text[] := '{}';
begin
  for r in select distinct o.oid, o.rolname, o.rolsuper, o.rolbypassrls, x.tables from (values
      ('public.run_group_notice_broadcasts(integer,text)'::regprocedure, array['group_notice_broadcasts:all','group_notice_broadcast_control:select','fan_notifications:all',
        'group_posts:select','group_pages:select','group_memberships:select','app_users:select','group_notification_settings:select','user_blocks:select','celebrities:select']),
      ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure, array['group_notice_broadcasts:all','group_notice_broadcast_control:select','group_action_receipts:select','audit_logs:all']),
      ('public.fan_web_notification_path(uuid,uuid)'::regprocedure, array['fan_notifications:select','group_posts:select','app_users:select'])) x(sig, tables)
      join pg_proc f on f.oid = x.sig join pg_roles o on o.oid = f.proowner loop
    -- BYPASSRLS는 권한을 주지 않으므로 grant는 늘 하고, 정책만 BYPASSRLS가 없을 때 만든다. grant 실패는 아래 권한 확인이 잡는다.
    if r.rolsuper then continue; end if;
    for t in select split_part(v, ':', 1) tname, split_part(v, ':', 2) cmd from unnest(r.tables) v loop
      begin execute format('grant %s on table public.%I to %I', case when t.tname = 'audit_logs' then 'insert' when t.cmd = 'all' then 'select, insert, update' else 'select' end, t.tname, r.rolname);
      exception when insufficient_privilege then null; end;
      if not r.rolbypassrls and exists (select 1 from pg_class c where c.oid = ('public.' || t.tname)::regclass and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.oid))
         and not exists (select 1 from pg_policy p where p.polrelid = ('public.' || t.tname)::regclass and r.oid = any(p.polroles) and p.polpermissive
           and (p.polcmd = '*' or (t.cmd = 'select' and p.polcmd = 'r'))) then
        begin execute format('create policy %I on public.%I for %s to %I using (true)%s', 'b8_owner_' || r.rolname, t.tname, t.cmd, r.rolname,
            case when t.cmd = 'select' then '' else ' with check (true)' end);
        exception when insufficient_privilege or duplicate_object then null; end;
      end if;
      if not r.rolbypassrls and exists (select 1 from pg_class c where c.oid = ('public.' || t.tname)::regclass and c.relrowsecurity and (c.relforcerowsecurity or c.relowner <> r.oid))
         and not exists (select 1 from pg_policy p where p.polrelid = ('public.' || t.tname)::regclass and r.oid = any(p.polroles) and p.polpermissive
           and (p.polcmd = '*' or (t.cmd = 'select' and p.polcmd = 'r'))) then
        gaps := gaps || format('%s has no %s policy on %s', r.rolname, t.cmd, t.tname);
      end if;
      if exists (select 1 from unnest(case when t.tname = 'audit_logs' then array['insert'] when t.cmd = 'all' then array['select','insert','update'] else array['select'] end) need
          where not has_table_privilege(r.oid, ('public.' || t.tname)::regclass, need)) then
        gaps := gaps || format('%s lacks %s on %s', r.rolname, case when t.tname = 'audit_logs' then 'insert' when t.cmd = 'all' then 'select/insert/update' else 'select' end, t.tname);
      end if;
    end loop;
  end loop;
  if cardinality(gaps) > 0 then raise exception 'GROUP_NOTICE_BROADCAST_OWNER_GAP: %', array_to_string(gaps, '; '); end if;
end $access$;

notify pgrst, 'reload schema';
commit;

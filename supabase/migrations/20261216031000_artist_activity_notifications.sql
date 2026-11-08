-- 261107-2 E6: artist activity notices for fans of a group page.
--   artist_comment: a bound artist comments on a post of the page -> every active member (not the artist), one notice per
--                   artist and fan per hour; further comments in that hour raise its count instead of adding a row.
--   artist_online:  a bound artist with presence sharing on opens a page -> its members, once per artist per KST day
--                   (an artist bound to several pages notifies the page opened first that day; intended, one alert a day).
-- The inbox always gets the row. Push (web push and the mobile app) only goes out when artist_activity_push_allowed says so:
--   not between 23:00 and 08:00 KST (the row stays in the inbox, nothing is sent later), the fan's setting is on, and
--   artist_activity_push_control allows it. The control starts in 'test' with no fans listed, so nothing is sent anywhere
--   until an operator lists dev test accounts. 'enabled' (everyone) needs a separate operator statement after the user approves.
--   The same check runs again when web push is claimed and when a mobile push is prepared. Email and Kakao never carry these kinds.
-- Size: a page with up to 500 members is written in the comment's own transaction; a bigger page gets one row in
--   artist_activity_jobs and enqueue_due_notification_maintenance (run by the notification worker) writes it 1,000 members at a time.
-- Failures never block the comment or heartbeat and never vanish: they land in artist_activity_failures.
-- Roles (review r5 H1/H2): every new function and table belongs to the owner of fan_notifications (dev/production: postgres,
--   BYPASSRLS), not to whoever applies the file. The owners of the existing functions that now call the new ones get EXECUTE,
--   found at apply time. If the new owner has neither superuser nor BYPASSRLS, it gets the table rights and one policy per
--   FORCE row-security table it reads or writes (artist_activity_owner_<role>), as 20261210100000 did. Probe:
--   supabase/tests/artist_activity_nonsuper_apply.sh.
-- Depends on 20261216030000 (enum values). Rollback: supabase/rollback/20261216031000_artist_activity_notifications.sql.
begin;
set local lock_timeout = '5s';

alter table public.notification_preferences
  add column artist_activity_notifications boolean not null default true,
  add column artist_online_notifications boolean not null default true;

create table public.artist_activity_push_control(
  id boolean primary key default true check (id),
  mode text not null default 'test' check (mode in ('disabled','test','enabled')),
  test_user_ids uuid[] not null default '{}' check (array_ndims(test_user_ids) is null or (array_ndims(test_user_ids) = 1 and cardinality(test_user_ids) <= 20 and array_position(test_user_ids, null) is null)),
  enabled_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (mode <> 'enabled' or enabled_at is not null)
);
insert into public.artist_activity_push_control(id) values (true);

create table public.artist_online_daily(
  artist_app_user_id uuid not null references public.app_users(id),
  day date not null,
  page_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (artist_app_user_id, day)
);

-- Pages too big for the comment's transaction. cursor = last member written (members are walked in app_user_id order).
create table public.artist_activity_jobs(
  id uuid primary key default extensions.gen_random_uuid(),
  kind text not null check (kind in ('artist_comment', 'artist_online')),
  target_id uuid not null,
  page_id uuid not null,
  artist_app_user_id uuid not null,
  at timestamptz not null,
  cursor uuid,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  finished_at timestamptz,
  gave_up_at timestamptz
);
create index artist_activity_jobs_open on public.artist_activity_jobs(created_at) where finished_at is null and gave_up_at is null;

create table public.artist_activity_failures(
  id uuid primary key default extensions.gen_random_uuid(),
  kind text not null,
  target_id uuid,
  page_id uuid,
  artist_app_user_id uuid,
  at timestamptz,
  error_state text not null,
  error_message text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  resolved_at timestamptz
);

alter table public.artist_activity_push_control enable row level security;
alter table public.artist_activity_push_control force row level security;
alter table public.artist_online_daily enable row level security;
alter table public.artist_online_daily force row level security;
alter table public.artist_activity_jobs enable row level security;
alter table public.artist_activity_jobs force row level security;
alter table public.artist_activity_failures enable row level security;
alter table public.artist_activity_failures force row level security;
revoke all on public.artist_activity_push_control, public.artist_online_daily, public.artist_activity_jobs, public.artist_activity_failures
  from public, anon, authenticated, service_role;

do $$
declare previous text;
begin
  select pg_get_expr(conbin, conrelid) into strict previous from pg_constraint
    where conrelid = 'public.fan_notifications'::regclass and conname = 'fan_notifications_source_shape';
  alter table public.fan_notifications drop constraint fan_notifications_source_shape;
  execute 'alter table public.fan_notifications add constraint fan_notifications_source_shape check ((' || previous
    || ') or (kind::text in (''artist_comment'',''artist_online'') and live_event_id is null and benefit_id is null)) not valid';
  -- not valid: every existing row already passes the old expression, which this only widens. Validating would re-run the old
  -- expression's helper (fan_web_notification_kind_before_group_raffle) as the applying role, which may not be allowed to call it.
  -- The rollback rebuilds the constraint from this text.
  execute format('comment on constraint fan_notifications_source_shape on public.fan_notifications is %L', 'before_artist_activity:' || previous);
end $$;

-- Keep the current definitions under *_before_artist_activity with their current owner; the public names then add the artist rule
-- (create or replace keeps each public function's owner and ACL).
do $$
declare signature text; source text; fname text; backup text; owner_name name;
begin
  foreach signature in array array['fan_web_notification_path(uuid,uuid)', 'notification_delivery_is_eligible(uuid,timestamp with time zone)',
      'create_external_notification_plan(uuid,timestamp with time zone)', 'mobile_prepare_push_delivery(uuid,text)',
      'enqueue_due_notification_maintenance(timestamp with time zone)'] loop
    fname := split_part(signature, '(', 1); backup := fname || '_before_artist_activity';
    source := pg_get_functiondef(('public.' || signature)::regprocedure);
    select pg_get_userbyid(proowner) into owner_name from pg_proc where oid = ('public.' || signature)::regprocedure;
    if position('CREATE OR REPLACE FUNCTION public.' || fname || '(' in source) <> 1 then raise exception 'ARTIST_ACTIVITY_FUNCTION_DECLARATION_CHANGED'; end if;
    execute overlay(source placing 'CREATE OR REPLACE FUNCTION public.' || backup || '(' from 1 for length('CREATE OR REPLACE FUNCTION public.' || fname || '('));
    execute format('alter function public.%s owner to %I', replace(signature, fname, backup), owner_name);
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', replace(signature, fname, backup));
  end loop;
end $$;

-- Push gate. Quiet hours are 23:00-07:59 KST.
create function public.artist_activity_push_allowed(p_recipient uuid, p_kind text, p_at timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_kind in ('artist_comment', 'artist_online')
    and extract(hour from (p_at at time zone 'Asia/Seoul')) between 8 and 22
    and coalesce((select case c.mode when 'enabled' then true when 'test' then p_recipient = any(c.test_user_ids) else false end
      from public.artist_activity_push_control c where c.id), false)
    and coalesce((select case p_kind when 'artist_comment' then p.artist_activity_notifications else p.artist_online_notifications end
      from public.notification_preferences p where p.app_user_id = p_recipient), true)
$$;

create function public.artist_activity_display_name(p_artist uuid, p_fallback text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(pg_catalog.btrim(nickname), '') from public.user_profiles where app_user_id = p_artist), p_fallback)
$$;

create function public.artist_activity_record_failure(p_kind text, p_target uuid, p_page uuid, p_artist uuid, p_at timestamptz, p_state text, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.artist_activity_failures(kind, target_id, page_id, artist_app_user_id, at, error_state, error_message)
    values (left(coalesce(p_kind, 'unknown'), 40), p_target, p_page, p_artist, p_at, left(coalesce(p_state, '?'), 8), left(coalesce(p_message, 'unknown'), 800));
end $$;

-- Members who should get an artist notice of this kind from this page, in app_user_id order after p_after.
create function public.artist_activity_recipients(p_page uuid, p_artist uuid, p_kind text, p_after uuid, p_limit integer)
returns table(app_user_id uuid) language sql stable security definer set search_path = '' as $$
  select m.app_user_id from public.group_memberships m
    join public.app_users u on u.id = m.app_user_id and u.status = 'active'
    left join public.notification_preferences p on p.app_user_id = m.app_user_id
    left join public.group_notification_settings s on s.page_id = m.page_id and s.app_user_id = m.app_user_id
  where m.page_id = p_page and m.app_user_id <> p_artist and (p_after is null or m.app_user_id > p_after)
    and coalesce(case p_kind when 'artist_comment' then p.artist_activity_notifications else p.artist_online_notifications end, true)
    and coalesce(s.enabled, true)
    and not exists (select 1 from public.user_blocks k where (k.app_user_id = m.app_user_id and k.blocked_app_user_id = p_artist)
      or (k.app_user_id = p_artist and k.blocked_app_user_id = m.app_user_id))
  order by m.app_user_id
  limit p_limit
$$;

-- One slice of a comment notice. Returns {"written": n, "last": uuid|null, "done": bool}.
create function public.artist_activity_comment_batch(p_comment uuid, p_at timestamptz, p_after uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c record; artist_name text; bumped integer; added integer; seen integer; last_id uuid; ids uuid[];
begin
  select gc.id, gc.post_id, gc.author_id, gc.anonymous, gc.removed_at, gp.page_id, gp.title, gp.removed_at post_removed, g.name page_name
    into c from public.group_comments gc join public.group_posts gp on gp.id = gc.post_id join public.group_pages g on g.id = gp.page_id and g.status = 'published'
    where gc.id = p_comment;
  if not found or c.anonymous or c.removed_at is not null or c.post_removed is not null then return jsonb_build_object('written', 0, 'last', null, 'done', true); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('artist-activity:' || c.author_id::text, 0));
  artist_name := public.artist_activity_display_name(c.author_id, c.page_name);
  select coalesce(array_agg(r.app_user_id order by r.app_user_id), '{}') into ids
    from public.artist_activity_recipients(c.page_id, c.author_id, 'artist_comment', p_after, p_limit) r;
  seen := cardinality(ids); last_id := ids[seen];
  update public.fan_notifications n set read_at = null,
    payload = n.payload || jsonb_build_object('count', coalesce((n.payload ->> 'count')::integer, 1) + 1, 'targetId', c.id, 'postId', c.post_id,
      'pageId', c.page_id, 'postTitle', left(c.title, 60), 'artistName', artist_name)
  where n.app_user_id = any(ids) and n.kind::text = 'artist_comment' and n.superseded_at is null
    and n.payload ->> 'artistId' = c.author_id::text and n.scheduled_for > p_at - interval '1 hour' and n.scheduled_for <= p_at;
  get diagnostics bumped = row_count;
  insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for, payload, web_only)
  select r, 'artist_comment', 'artist-comment:' || c.author_id::text || ':' || floor(extract(epoch from p_at))::bigint::text, p_at,
    jsonb_build_object('schemaVersion', 1, 'targetType', 'group_comment', 'targetId', c.id, 'postId', c.post_id, 'pageId', c.page_id,
      'artistId', c.author_id, 'artistName', artist_name, 'postTitle', left(c.title, 60), 'count', 1),
    not public.artist_activity_push_allowed(r, 'artist_comment', p_at)
  from unnest(ids) r
  where not exists (select 1 from public.fan_notifications n where n.app_user_id = r and n.kind::text = 'artist_comment'
    and n.superseded_at is null and n.payload ->> 'artistId' = c.author_id::text and n.scheduled_for > p_at - interval '1 hour' and n.scheduled_for <= p_at)
  on conflict (app_user_id, source_key) do nothing;
  get diagnostics added = row_count;
  return jsonb_build_object('written', bumped + added, 'last', last_id, 'done', p_limit is null or seen < p_limit);
end $$;

create function public.artist_activity_online_batch(p_page uuid, p_artist uuid, p_at timestamptz, p_after uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g record; artist_name text; kst_day date := (p_at at time zone 'Asia/Seoul')::date; added integer; seen integer; ids uuid[];
begin
  select id, name into g from public.group_pages where id = p_page and status = 'published';
  if not found then return jsonb_build_object('written', 0, 'last', null, 'done', true); end if;
  artist_name := public.artist_activity_display_name(p_artist, g.name);
  select coalesce(array_agg(r.app_user_id order by r.app_user_id), '{}') into ids
    from public.artist_activity_recipients(p_page, p_artist, 'artist_online', p_after, p_limit) r;
  seen := cardinality(ids);
  insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for, payload, web_only)
  select r, 'artist_online', 'artist-online:' || p_artist::text || ':' || to_char(kst_day, 'YYYYMMDD'), p_at,
    jsonb_build_object('schemaVersion', 1, 'pageId', p_page, 'artistId', p_artist, 'artistName', artist_name, 'pageName', left(g.name, 60)),
    not public.artist_activity_push_allowed(r, 'artist_online', p_at)
  from unnest(ids) r
  on conflict (app_user_id, source_key) do nothing;
  get diagnostics added = row_count;
  return jsonb_build_object('written', added, 'last', ids[seen], 'done', p_limit is null or seen < p_limit);
end $$;

-- Entry points. Up to 500 members: written now. More: one job row, written by run_artist_activity_jobs.
create function public.artist_activity_notify_comment(p_comment uuid, p_at timestamptz default pg_catalog.clock_timestamp())
returns integer language plpgsql security definer set search_path = '' as $$
declare c record; members integer;
begin
  select gc.id, gc.author_id, gc.anonymous, gc.removed_at, gp.page_id, gp.removed_at post_removed
    into c from public.group_comments gc join public.group_posts gp on gp.id = gc.post_id join public.group_pages g on g.id = gp.page_id and g.status = 'published'
    where gc.id = p_comment;
  if not found or c.anonymous or c.removed_at is not null or c.post_removed is not null then return 0; end if;
  if not exists (select 1 from public.group_artist_bindings b join public.app_users u on u.id = b.app_user_id and u.status = 'active'
      where b.page_id = c.page_id and b.app_user_id = c.author_id) then return 0; end if;
  select count(*) into members from (select 1 from public.group_memberships where page_id = c.page_id limit 501) x;
  if members > 500 then
    insert into public.artist_activity_jobs(kind, target_id, page_id, artist_app_user_id, at) values ('artist_comment', c.id, c.page_id, c.author_id, p_at);
    return 0;
  end if;
  return (public.artist_activity_comment_batch(p_comment, p_at, null, null) ->> 'written')::integer;
end $$;

create function public.artist_activity_notify_online(p_page uuid, p_artist uuid, p_at timestamptz default pg_catalog.clock_timestamp())
returns integer language plpgsql security definer set search_path = '' as $$
declare members integer;
begin
  if not exists (select 1 from public.group_pages where id = p_page and status = 'published') then return 0; end if;
  if not exists (select 1 from public.group_artist_bindings b
      join public.group_artist_presence_settings s on s.app_user_id = b.app_user_id and s.enabled
      join public.app_users u on u.id = b.app_user_id and u.status = 'active'
      where b.page_id = p_page and b.app_user_id = p_artist) then return 0; end if;
  insert into public.artist_online_daily(artist_app_user_id, day, page_id) values (p_artist, (p_at at time zone 'Asia/Seoul')::date, p_page) on conflict do nothing;
  if not found then return 0; end if;
  select count(*) into members from (select 1 from public.group_memberships where page_id = p_page limit 501) x;
  if members > 500 then
    insert into public.artist_activity_jobs(kind, target_id, page_id, artist_app_user_id, at) values ('artist_online', p_page, p_page, p_artist, p_at);
    return 0;
  end if;
  return (public.artist_activity_online_batch(p_page, p_artist, p_at, null, null) ->> 'written')::integer;
end $$;

-- Writes queued pages, at most p_budget members per call; a failing job is retried up to 5 times, then recorded and left.
create function public.run_artist_activity_jobs(p_budget integer default 2000)
returns integer language plpgsql security definer set search_path = '' as $$
declare j public.artist_activity_jobs; r jsonb; written integer := 0; left_budget integer := greatest(least(coalesce(p_budget, 2000), 10000), 1); slice integer;
begin
  for j in select * from public.artist_activity_jobs where finished_at is null and gave_up_at is null order by created_at for update skip locked loop
    exit when left_budget <= 0;
    slice := least(1000, left_budget);
    begin
      r := case j.kind when 'artist_comment' then public.artist_activity_comment_batch(j.target_id, j.at, j.cursor, slice)
        else public.artist_activity_online_batch(j.page_id, j.artist_app_user_id, j.at, j.cursor, slice) end;
      written := written + (r ->> 'written')::integer;
      left_budget := left_budget - slice;
      update public.artist_activity_jobs set cursor = coalesce((r ->> 'last')::uuid, cursor),
        finished_at = case when (r ->> 'done')::boolean then pg_catalog.clock_timestamp() end where id = j.id;
    exception when others then
      update public.artist_activity_jobs set attempts = attempts + 1, last_error = left(sqlstate || ' ' || sqlerrm, 400),
        gave_up_at = case when attempts + 1 >= 5 then pg_catalog.clock_timestamp() end where id = j.id;
      perform public.artist_activity_record_failure(j.kind || ':job', j.target_id, j.page_id, j.artist_app_user_id, j.at, sqlstate, sqlerrm);
    end;
  end loop;
  return written;
end $$;

-- A notice failure never blocks the comment or the heartbeat; it is recorded instead. (A statement timeout is not caught by
-- "others": that is why big pages go through jobs.)
create function public.artist_activity_comment_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.anonymous then return null; end if;
  begin
    perform public.artist_activity_notify_comment(new.id, pg_catalog.now());
  exception when others then
    begin
      perform public.artist_activity_record_failure('artist_comment', new.id, null, new.author_id, pg_catalog.now(), sqlstate, sqlerrm);
    exception when others then raise warning 'ARTIST_ACTIVITY_NOTIFY_FAILED %', sqlstate;
    end;
  end;
  return null;
end $$;
create function public.artist_activity_presence_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.group_artist_bindings where page_id = new.page_id and app_user_id = new.app_user_id) then return null; end if;
  begin
    perform public.artist_activity_notify_online(new.page_id, new.app_user_id, new.seen_at);
  exception when others then
    begin
      perform public.artist_activity_record_failure('artist_online', new.page_id, new.page_id, new.app_user_id, new.seen_at, sqlstate, sqlerrm);
    exception when others then raise warning 'ARTIST_ACTIVITY_NOTIFY_FAILED %', sqlstate;
    end;
  end;
  return null;
end $$;
create trigger artist_activity_comment after insert on public.group_comments for each row execute function public.artist_activity_comment_trigger();
create trigger artist_activity_presence after insert or update of seen_at on public.group_presence for each row execute function public.artist_activity_presence_trigger();

-- The mobile app queue: no row unless push was allowed when the notice was written.
create function public.artist_activity_mobile_push_gate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.fan_notifications n where n.id = new.notification_id
      and n.kind::text in ('artist_comment', 'artist_online') and n.web_only) then return null; end if;
  return new;
end $$;
create trigger artist_activity_mobile_push_gate before insert on public.mobile_push_delivery_outbox for each row execute function public.artist_activity_mobile_push_gate();

-- Helpers the wrapped public functions call, so that their table reads run as the new owner whatever owns the caller.
-- Inbox link: null = not an artist notice (the caller goes on as before), '' = artist notice not shown, else the path.
-- Membership, blocks and the page mute are checked again when read (review r5 L5).
create function public.artist_activity_notification_path(p_owner uuid, p_notification uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare n public.fan_notifications; path text; page uuid; artist uuid;
begin
  select * into n from public.fan_notifications where id = p_notification and app_user_id = p_owner;
  if not found or n.kind::text not in ('artist_comment', 'artist_online') then return null; end if;
  if n.superseded_at is not null or n.scheduled_for > now() then return ''; end if;
  page := (n.payload ->> 'pageId')::uuid; artist := (n.payload ->> 'artistId')::uuid;
  if not exists (select 1 from public.app_users where id = p_owner and status = 'active')
    or not exists (select 1 from public.group_memberships where page_id = page and app_user_id = p_owner)
    or exists (select 1 from public.user_blocks k where (k.app_user_id = p_owner and k.blocked_app_user_id = artist)
      or (k.app_user_id = artist and k.blocked_app_user_id = p_owner))
    or exists (select 1 from public.group_notification_settings s where s.page_id = page and s.app_user_id = p_owner and not s.enabled)
  then return ''; end if;
  if n.kind::text = 'artist_comment' then
    select '/pages/groups/' || p.page_id || '?tab=board&post=' || p.id || case when c.id is not null and c.removed_at is null then '#comment-' || c.id else '' end
      into path from public.group_posts p
      join public.group_pages g on g.id = p.page_id and g.status = 'published'
      left join public.group_comments c on c.id = (n.payload ->> 'targetId')::uuid and c.post_id = p.id
      where p.id = (n.payload ->> 'postId')::uuid and p.removed_at is null;
  else
    select '/pages/groups/' || g.id into path from public.group_pages g where g.id = page and g.status = 'published';
  end if;
  return coalesce(path, '');
end $$;

-- Push at send time: true for any other kind; for artist kinds the gate again at p_at.
create function public.artist_activity_delivery_allowed(p_notification uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select n.kind::text not in ('artist_comment', 'artist_online')
      or (not n.web_only and public.artist_activity_push_allowed(n.app_user_id, n.kind::text, p_at))
    from public.fan_notifications n where n.id = p_notification), false)
$$;

create function public.artist_activity_is_artist_notice(p_notification uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fan_notifications n where n.id = p_notification and n.kind::text in ('artist_comment', 'artist_online'))
$$;

-- Mobile push at prepare time (review r5 M2): an artist notice the gate now refuses is closed like any other ineligible delivery.
create function public.artist_activity_mobile_delivery_refused(p_delivery_id uuid, p_worker_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n record;
begin
  select f.app_user_id, f.kind::text kind into n from public.mobile_push_delivery_outbox d join public.fan_notifications f on f.id = d.notification_id
    where d.id = p_delivery_id and d.status = 'processing' and d.lease_owner = p_worker_id;
  if not found or n.kind not in ('artist_comment', 'artist_online') then return false; end if;
  if public.artist_activity_push_allowed(n.app_user_id, n.kind, pg_catalog.clock_timestamp()) then return false; end if;
  update public.mobile_push_delivery_outbox set status = 'failed', available_at = 'infinity'::timestamptz, last_error_code = 'CURRENT_STATE_INELIGIBLE',
    lease_owner = null, lease_expires_at = null where id = p_delivery_id;
  return true;
end $$;

create or replace function public.fan_web_notification_path(p_owner uuid, p_notification uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare artist_path text;
begin
  artist_path := public.artist_activity_notification_path(p_owner, p_notification);
  if artist_path is not null then return nullif(artist_path, ''); end if;
  return public.fan_web_notification_path_before_artist_activity(p_owner, p_notification);
end $$;

create or replace function public.notification_delivery_is_eligible(p_notification_id uuid, p_at timestamptz default pg_catalog.now())
returns boolean language sql stable security definer set search_path = '' as $$
  select public.notification_delivery_is_eligible_before_artist_activity(p_notification_id, p_at)
    and public.artist_activity_delivery_allowed(p_notification_id, p_at)
$$;

create or replace function public.create_external_notification_plan(p_notification_id uuid, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if public.artist_activity_is_artist_notice(p_notification_id) then return null; end if;
  return public.create_external_notification_plan_before_artist_activity(p_notification_id, p_now);
end $$;

create or replace function public.mobile_prepare_push_delivery(p_delivery_id uuid, p_worker_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.artist_activity_mobile_delivery_refused(p_delivery_id, p_worker_id) then return null; end if;
  return public.mobile_prepare_push_delivery_before_artist_activity(p_delivery_id, p_worker_id);
end $$;

-- The notification worker calls this every run; it now also writes queued big-page notices. A failure there is recorded and
-- never stops the existing maintenance.
create or replace function public.enqueue_due_notification_maintenance(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; jobs integer := 0;
begin
  result := public.enqueue_due_notification_maintenance_before_artist_activity(p_now);
  begin
    jobs := public.run_artist_activity_jobs(2000);
  exception when others then
    begin
      perform public.artist_activity_record_failure('jobs', null, null, null, p_now, sqlstate, sqlerrm);
    exception when others then raise warning 'ARTIST_ACTIVITY_JOBS_FAILED %', sqlstate;
    end;
  end;
  return result || jsonb_build_object('artistActivityNotifications', jobs);
end $$;

create or replace function public.fan_web_patch_notification_preferences(p_app_user_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if jsonb_typeof(p_patch) <> 'object' or exists (select 1 from jsonb_each(p_patch) x
    where x.key not in ('live_reminders','survey_reminders','benefit_notifications','reply_notifications','official_post_notifications','schedule_notifications','artist_activity_notifications','artist_online_notifications')
      or jsonb_typeof(x.value) <> 'boolean') then
    raise exception 'INVALID_NOTIFICATION_PREFERENCES' using errcode = '22023'; end if;
  insert into public.notification_preferences(app_user_id) values (p_app_user_id) on conflict do nothing;
  update public.notification_preferences set
    live_reminders = coalesce((p_patch ->> 'live_reminders')::boolean, live_reminders),
    survey_reminders = coalesce((p_patch ->> 'survey_reminders')::boolean, survey_reminders),
    benefit_notifications = coalesce((p_patch ->> 'benefit_notifications')::boolean, benefit_notifications),
    reply_notifications = coalesce((p_patch ->> 'reply_notifications')::boolean, reply_notifications),
    official_post_notifications = coalesce((p_patch ->> 'official_post_notifications')::boolean, official_post_notifications),
    schedule_notifications = coalesce((p_patch ->> 'schedule_notifications')::boolean, schedule_notifications),
    artist_activity_notifications = coalesce((p_patch ->> 'artist_activity_notifications')::boolean, artist_activity_notifications),
    artist_online_notifications = coalesce((p_patch ->> 'artist_online_notifications')::boolean, artist_online_notifications)
    where app_user_id = p_app_user_id;
end $$;

-- Owners, EXECUTE and row security (review r5 H1/H2).
do $$
declare
  me record; caller record; t record; f text;
  new_fns text[] := array['artist_activity_push_allowed(uuid,text,timestamp with time zone)', 'artist_activity_display_name(uuid,text)',
    'artist_activity_record_failure(text,uuid,uuid,uuid,timestamp with time zone,text,text)', 'artist_activity_recipients(uuid,uuid,text,uuid,integer)',
    'artist_activity_comment_batch(uuid,timestamp with time zone,uuid,integer)', 'artist_activity_online_batch(uuid,uuid,timestamp with time zone,uuid,integer)',
    'artist_activity_notify_comment(uuid,timestamp with time zone)', 'artist_activity_notify_online(uuid,uuid,timestamp with time zone)',
    'run_artist_activity_jobs(integer)', 'artist_activity_comment_trigger()', 'artist_activity_presence_trigger()', 'artist_activity_mobile_push_gate()',
    'artist_activity_notification_path(uuid,uuid)', 'artist_activity_delivery_allowed(uuid,timestamp with time zone)',
    'artist_activity_is_artist_notice(uuid)', 'artist_activity_mobile_delivery_refused(uuid,text)'];
  -- Called from the wrapped public functions, whose owners stay as they are.
  called text[] := array['artist_activity_notification_path(uuid,uuid)', 'artist_activity_delivery_allowed(uuid,timestamp with time zone)',
    'artist_activity_is_artist_notice(uuid)', 'artist_activity_mobile_delivery_refused(uuid,text)', 'run_artist_activity_jobs(integer)',
    'artist_activity_record_failure(text,uuid,uuid,uuid,timestamp with time zone,text,text)'];
begin
  select r.oid, r.rolname, r.rolsuper, r.rolbypassrls into me from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.fan_notifications'::regclass;
  if me.rolname in ('anon', 'authenticated', 'service_role') then raise exception 'ARTIST_ACTIVITY_UNTRUSTED_OWNER %', me.rolname; end if;
  begin
    foreach f in array new_fns loop
      execute format('alter function public.%s owner to %I', f, me.rolname);
      execute format('revoke all on function public.%s from public, anon, authenticated, service_role', f);
    end loop;
    foreach f in array array['artist_activity_push_control', 'artist_online_daily', 'artist_activity_jobs', 'artist_activity_failures'] loop
      execute format('alter table public.%I owner to %I', f, me.rolname);
    end loop;
  exception when insufficient_privilege then
    raise exception 'ARTIST_ACTIVITY_OWNER: the applying role must be able to act as % (owner of fan_notifications)', me.rolname;
  end;
  for caller in select distinct r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner
      where p.oid in ('public.fan_web_notification_path(uuid,uuid)'::regprocedure, 'public.notification_delivery_is_eligible(uuid,timestamp with time zone)'::regprocedure,
        'public.create_external_notification_plan(uuid,timestamp with time zone)'::regprocedure, 'public.mobile_prepare_push_delivery(uuid,text)'::regprocedure,
        'public.enqueue_due_notification_maintenance(timestamp with time zone)'::regprocedure) loop
    if caller.rolname in ('anon', 'authenticated', 'service_role') then raise exception 'ARTIST_ACTIVITY_UNTRUSTED_CALLER %', caller.rolname; end if;
    foreach f in array called loop execute format('grant execute on function public.%s to %I', f, caller.rolname); end loop;
  end loop;
  -- Table rights the new functions need (BYPASSRLS does not grant privileges), and a policy for that role alone where FORCE or
  -- foreign-owned row security would otherwise apply to it. A superuser or BYPASSRLS owner needs no policy.
  for t in select * from (values
      ('fan_notifications', 'select, insert, update', 'all'), ('mobile_push_delivery_outbox', 'select, update', 'all'),
      ('artist_activity_push_control', 'select', 'select'), ('artist_online_daily', 'select, insert', 'all'),
      ('artist_activity_jobs', 'select, insert, update', 'all'), ('artist_activity_failures', 'select, insert', 'all'),
      ('group_comments', 'select', 'select'), ('group_posts', 'select', 'select'), ('group_pages', 'select', 'select'),
      ('group_memberships', 'select', 'select'), ('group_artist_bindings', 'select', 'select'), ('group_artist_presence_settings', 'select', 'select'),
      ('group_notification_settings', 'select', 'select'), ('user_blocks', 'select', 'select'), ('user_profiles', 'select', 'select'),
      ('app_users', 'select', 'select'), ('notification_preferences', 'select', 'select')) v(tname, privs, cmd) loop
    execute format('grant %s on table public.%I to %I', t.privs, t.tname, me.rolname);
    if not me.rolsuper and not me.rolbypassrls
      and exists (select 1 from pg_class c where c.oid = ('public.' || t.tname)::regclass and c.relrowsecurity
        and (c.relforcerowsecurity or c.relowner <> me.oid))
      and not exists (select 1 from pg_policy pol where pol.polrelid = ('public.' || t.tname)::regclass and pol.polname = 'artist_activity_owner_' || me.rolname) then
      execute format('create policy %I on public.%I for %s to %I using (true)%s', 'artist_activity_owner_' || me.rolname, t.tname, t.cmd, me.rolname,
        case when t.cmd = 'select' then '' else ' with check (true)' end);
    end if;
  end loop;
end $$;
commit;
notify pgrst, 'reload schema';

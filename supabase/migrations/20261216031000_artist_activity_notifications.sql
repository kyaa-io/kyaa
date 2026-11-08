-- 261107-2 E6: artist activity notices for fans of a group page.
--   artist_comment: a bound artist comments on a post of the page -> every active member (not the artist), one notice per
--                   artist and fan per hour; further comments in that hour raise its count instead of adding a row.
--   artist_online:  a bound artist with presence sharing on opens the page -> every member, once per artist per KST day.
-- The inbox always gets the row. Push (web push and the mobile app) only goes out when artist_activity_push_allowed says so:
--   not between 23:00 and 08:00 KST (the row stays in the inbox, nothing is sent later), the fan's setting is on, and
--   artist_activity_push_control allows it. The control starts in 'test' with no fans listed, so nothing is sent anywhere
--   until an operator lists dev test accounts. 'enabled' (everyone) needs a separate operator statement after the user approves.
-- Email and Kakao never carry these kinds.
-- Depends on 20261216030000 (enum values) and on the current fan_web_notification_path, notification_delivery_is_eligible,
-- create_external_notification_plan and fan_web_patch_notification_preferences. Rollback: supabase/rollback/20261216031000_artist_activity_notifications.sql.
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
  page_id uuid not null references public.group_pages(id),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (artist_app_user_id, day)
);
alter table public.artist_activity_push_control enable row level security;
alter table public.artist_activity_push_control force row level security;
alter table public.artist_online_daily enable row level security;
alter table public.artist_online_daily force row level security;
revoke all on public.artist_activity_push_control, public.artist_online_daily from public, anon, authenticated, service_role;

do $$
declare previous text;
begin
  select pg_get_expr(conbin, conrelid) into strict previous from pg_constraint
    where conrelid = 'public.fan_notifications'::regclass and conname = 'fan_notifications_source_shape';
  alter table public.fan_notifications drop constraint fan_notifications_source_shape;
  execute 'alter table public.fan_notifications add constraint fan_notifications_source_shape check ((' || previous
    || ') or (kind::text in (''artist_comment'',''artist_online'') and live_event_id is null and benefit_id is null))';
  -- The rollback rebuilds the constraint from this text.
  execute format('comment on constraint fan_notifications_source_shape on public.fan_notifications is %L', 'before_artist_activity:' || previous);
end $$;

-- Keep the current definitions under *_before_artist_activity with their current owner; the public names then add the artist rule.
do $$
declare signature text; source text; fname text; backup text; owner_name name;
begin
  foreach signature in array array['fan_web_notification_path(uuid,uuid)', 'notification_delivery_is_eligible(uuid,timestamp with time zone)', 'create_external_notification_plan(uuid,timestamp with time zone)'] loop
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

create function public.artist_activity_notify_comment(p_comment uuid, p_at timestamptz default pg_catalog.clock_timestamp())
returns integer language plpgsql security definer set search_path = '' as $$
declare c record; artist_name text; bumped integer; added integer;
begin
  select gc.id, gc.post_id, gc.author_id, gc.anonymous, gc.removed_at, gp.page_id, gp.title, gp.removed_at post_removed, g.name page_name
    into c from public.group_comments gc join public.group_posts gp on gp.id = gc.post_id join public.group_pages g on g.id = gp.page_id and g.status = 'published'
    where gc.id = p_comment;
  if not found or c.anonymous or c.removed_at is not null or c.post_removed is not null then return 0; end if;
  if not exists (select 1 from public.group_artist_bindings b join public.app_users u on u.id = b.app_user_id and u.status = 'active'
      where b.page_id = c.page_id and b.app_user_id = c.author_id) then return 0; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('artist-activity:' || c.author_id::text, 0));
  artist_name := public.artist_activity_display_name(c.author_id, c.page_name);
  with recipients as (
    select m.app_user_id from public.group_memberships m
      join public.app_users u on u.id = m.app_user_id and u.status = 'active'
      left join public.notification_preferences p on p.app_user_id = m.app_user_id
      left join public.group_notification_settings s on s.page_id = m.page_id and s.app_user_id = m.app_user_id
    where m.page_id = c.page_id and m.app_user_id <> c.author_id
      and coalesce(p.artist_activity_notifications, true) and coalesce(s.enabled, true)
      and not exists (select 1 from public.user_blocks k where (k.app_user_id = m.app_user_id and k.blocked_app_user_id = c.author_id)
        or (k.app_user_id = c.author_id and k.blocked_app_user_id = m.app_user_id))
  ), bumped_rows as (
    update public.fan_notifications n set read_at = null,
      payload = n.payload || jsonb_build_object('count', coalesce((n.payload ->> 'count')::integer, 1) + 1, 'targetId', c.id, 'postId', c.post_id,
        'pageId', c.page_id, 'postTitle', left(c.title, 60), 'artistName', artist_name)
    from recipients r
    where n.app_user_id = r.app_user_id and n.kind::text = 'artist_comment' and n.superseded_at is null
      and n.payload ->> 'artistId' = c.author_id::text and n.scheduled_for > p_at - interval '1 hour' and n.scheduled_for <= p_at
    returning n.app_user_id
  ), inserted as (
    insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for, payload, web_only)
    select r.app_user_id, 'artist_comment', 'artist-comment:' || c.author_id::text || ':' || floor(extract(epoch from p_at))::bigint::text, p_at,
      jsonb_build_object('schemaVersion', 1, 'targetType', 'group_comment', 'targetId', c.id, 'postId', c.post_id, 'pageId', c.page_id,
        'artistId', c.author_id, 'artistName', artist_name, 'postTitle', left(c.title, 60), 'count', 1),
      not public.artist_activity_push_allowed(r.app_user_id, 'artist_comment', p_at)
    from recipients r where not exists (select 1 from bumped_rows b where b.app_user_id = r.app_user_id)
    on conflict (app_user_id, source_key) do nothing
    returning 1
  )
  select (select count(*) from bumped_rows), (select count(*) from inserted) into bumped, added;
  return bumped + added;
end $$;

create function public.artist_activity_notify_online(p_page uuid, p_artist uuid, p_at timestamptz default pg_catalog.clock_timestamp())
returns integer language plpgsql security definer set search_path = '' as $$
declare g record; artist_name text; kst_day date := (p_at at time zone 'Asia/Seoul')::date; added integer;
begin
  select id, name into g from public.group_pages where id = p_page and status = 'published';
  if not found then return 0; end if;
  if not exists (select 1 from public.group_artist_bindings b
      join public.group_artist_presence_settings s on s.app_user_id = b.app_user_id and s.enabled
      join public.app_users u on u.id = b.app_user_id and u.status = 'active'
      where b.page_id = p_page and b.app_user_id = p_artist) then return 0; end if;
  insert into public.artist_online_daily(artist_app_user_id, day, page_id) values (p_artist, kst_day, p_page) on conflict do nothing;
  if not found then return 0; end if;
  artist_name := public.artist_activity_display_name(p_artist, g.name);
  insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for, payload, web_only)
  select m.app_user_id, 'artist_online', 'artist-online:' || p_artist::text || ':' || to_char(kst_day, 'YYYYMMDD'), p_at,
    jsonb_build_object('schemaVersion', 1, 'pageId', p_page, 'artistId', p_artist, 'artistName', artist_name, 'pageName', left(g.name, 60)),
    not public.artist_activity_push_allowed(m.app_user_id, 'artist_online', p_at)
  from public.group_memberships m
    join public.app_users u on u.id = m.app_user_id and u.status = 'active'
    left join public.notification_preferences p on p.app_user_id = m.app_user_id
    left join public.group_notification_settings s on s.page_id = m.page_id and s.app_user_id = m.app_user_id
  where m.page_id = p_page and m.app_user_id <> p_artist
    and coalesce(p.artist_online_notifications, true) and coalesce(s.enabled, true)
    and not exists (select 1 from public.user_blocks k where (k.app_user_id = m.app_user_id and k.blocked_app_user_id = p_artist)
      or (k.app_user_id = p_artist and k.blocked_app_user_id = m.app_user_id))
  on conflict (app_user_id, source_key) do nothing;
  get diagnostics added = row_count;
  return added;
end $$;

-- A notice failure never blocks the comment or the heartbeat.
create function public.artist_activity_comment_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.anonymous then return null; end if;
  begin
    perform public.artist_activity_notify_comment(new.id, pg_catalog.now());
  exception when others then
    raise warning 'ARTIST_ACTIVITY_NOTIFY_FAILED %', sqlstate;
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
    raise warning 'ARTIST_ACTIVITY_NOTIFY_FAILED %', sqlstate;
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

create or replace function public.fan_web_notification_path(p_owner uuid, p_notification uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare n public.fan_notifications; path text;
begin
  select * into n from public.fan_notifications where id = p_notification and app_user_id = p_owner and superseded_at is null and scheduled_for <= now();
  if n.kind::text = 'artist_comment' then
    if not public.group_notification_row_allowed(n) then return null; end if;
    select '/pages/groups/' || p.page_id || '?tab=board&post=' || p.id || case when c.id is not null and c.removed_at is null then '#comment-' || c.id else '' end
      into path from public.group_posts p
      join public.group_pages g on g.id = p.page_id and g.status = 'published'
      join public.app_users u on u.id = p_owner and u.status = 'active'
      left join public.group_comments c on c.id = (n.payload ->> 'targetId')::uuid and c.post_id = p.id
      where p.id = (n.payload ->> 'postId')::uuid and p.removed_at is null;
    return path;
  elsif n.kind::text = 'artist_online' then
    select '/pages/groups/' || g.id into path from public.group_pages g join public.app_users u on u.id = p_owner and u.status = 'active'
      where g.id = (n.payload ->> 'pageId')::uuid and g.status = 'published';
    return path;
  end if;
  return public.fan_web_notification_path_before_artist_activity(p_owner, p_notification);
end $$;

-- Claim-time check for web push: the same gate again at the moment of sending (a notice written at 22:59 is not sent at 23:00).
create or replace function public.notification_delivery_is_eligible(p_notification_id uuid, p_at timestamptz default pg_catalog.now())
returns boolean language sql stable security definer set search_path = '' as $$
  select public.notification_delivery_is_eligible_before_artist_activity(p_notification_id, p_at)
    and coalesce((select n.kind::text not in ('artist_comment', 'artist_online')
      or (not n.web_only and public.artist_activity_push_allowed(n.app_user_id, n.kind::text, p_at))
      from public.fan_notifications n where n.id = p_notification_id), false)
$$;

create or replace function public.create_external_notification_plan(p_notification_id uuid, p_now timestamptz default now())
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.fan_notifications n where n.id = p_notification_id and n.kind::text in ('artist_comment', 'artist_online')) then return null; end if;
  return public.create_external_notification_plan_before_artist_activity(p_notification_id, p_now);
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

-- New objects belong to the owner of group_emit_notification(), the existing comment trigger that already reads the group tables
-- and writes fan_notifications in every environment, not to whoever applies the file. Stops if the applier cannot hand them over.
do $$
declare owner_name name := pg_get_userbyid((select proowner from pg_proc where oid = 'public.group_emit_notification()'::regprocedure)); f text;
begin
  foreach f in array array['artist_activity_push_allowed(uuid,text,timestamp with time zone)', 'artist_activity_display_name(uuid,text)',
      'artist_activity_notify_comment(uuid,timestamp with time zone)', 'artist_activity_notify_online(uuid,uuid,timestamp with time zone)',
      'artist_activity_comment_trigger()', 'artist_activity_presence_trigger()', 'artist_activity_mobile_push_gate()'] loop
    execute format('alter function public.%s owner to %I', f, owner_name);
    execute format('revoke all on function public.%s from public, anon, authenticated, service_role', f);
  end loop;
  execute format('alter table public.artist_activity_push_control owner to %I', owner_name);
  execute format('alter table public.artist_online_daily owner to %I', owner_name);
end $$;
commit;
notify pgrst, 'reload schema';

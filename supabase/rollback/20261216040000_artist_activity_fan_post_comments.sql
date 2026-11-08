-- Rollback of 20261216040000_artist_activity_fan_post_comments. Roll the web back first if it depends on fan-post notices.
-- Order: run this before the rollback of 20261216031000 (that one does not know the fan-post trigger it would leave behind).
-- A group-post notice that a later fan-post comment in the same hour re-pointed is a fan-post notice now and is deleted with them.
-- Removes the fan-post comment trigger and functions, deletes the artist notices that point at fan-post comments (and their
-- queued push rows) and the queued fan-post jobs, and restores the three replaced functions as 20261216031000 wrote them.
begin;
set local lock_timeout = '5s';
drop trigger if exists artist_activity_fan_post_comment on public.fan_post_comments;

-- Every table that keeps fan_notifications rows with ON DELETE RESTRICT (artist notices get no external plan today; cleared anyway).
delete from public.external_notification_delivery_outbox where notification_id in (select id from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'targetType' = 'fan_post_comment');
delete from public.notification_delivery_plans where notification_id in (select id from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'targetType' = 'fan_post_comment');
delete from public.notification_delivery_outbox where notification_id in (select id from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'targetType' = 'fan_post_comment');
delete from public.mobile_push_delivery_outbox where notification_id in (select id from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'targetType' = 'fan_post_comment');
delete from public.fan_notifications where kind::text = 'artist_comment' and payload ->> 'targetType' = 'fan_post_comment';
delete from public.artist_activity_jobs where kind = 'artist_fan_post_comment';

create or replace function public.artist_activity_comment_batch(p_comment uuid, p_at timestamptz, p_after uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c record; artist_name text; bumped integer; added integer; seen integer; last_id uuid; ids uuid[];
begin
  if not public.artist_activity_inbox_enabled() then return jsonb_build_object('written', 0, 'last', p_after, 'done', false); end if;
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

create or replace function public.artist_activity_notification_path(p_owner uuid, p_notification uuid)
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

create or replace function public.run_artist_activity_jobs(p_budget integer default 2000)
returns integer language plpgsql security definer set search_path = '' as $$
declare j public.artist_activity_jobs; r jsonb; written integer := 0; left_budget integer := greatest(least(coalesce(p_budget, 2000), 10000), 1); slice integer;
begin
  if not public.artist_activity_inbox_enabled() then return 0; end if;
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

drop function if exists public.artist_activity_fan_post_comment_trigger();
drop function if exists public.artist_activity_notify_fan_post_comment(uuid, timestamptz);
drop function if exists public.artist_activity_fan_post_comment_batch(uuid, timestamptz, uuid, integer);
drop function if exists public.artist_activity_fan_post_comment_source(uuid);

alter table public.artist_activity_jobs drop constraint artist_activity_jobs_kind_check;
alter table public.artist_activity_jobs add constraint artist_activity_jobs_kind_check check (kind in ('artist_comment', 'artist_online'));
-- The select grants and artist_activity_owner_<role> policies on fan_post_comments, fan_posts and celebrities stay: they only let
-- the notice owner read, and other files may rely on the same policy names.
commit;
notify pgrst, 'reload schema';

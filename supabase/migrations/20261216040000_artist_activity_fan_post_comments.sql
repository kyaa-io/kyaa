-- 261107-2 E6 (round-05 M5-1): artist_comment notices for comments on fan community posts (fan_posts), by the same rule as
--   group posts (20261216031000): a bound artist of the creator's fan page (group_pages kind 'fan', same celebrity) comments ->
--   every active member of that page except the artist, one notice per artist and fan per hour shared with group-post comments
--   (a further comment in that hour, on either kind of post, raises the count and points the notice at the newest comment).
-- Reused unchanged: the inbox switch (artist_activity_inbox_enabled), recipients, push gate, display name, failures, the 500-member
--   split into artist_activity_jobs. Push and settings behave exactly as for group-post comments.
-- Changed: artist_activity_comment_batch also stores targetType 'group_comment' when it raises a notice (a notice may now have
--   been opened by a fan-post comment); artist_activity_notification_path links a fan-post notice to /c/{slug}/community/{post}
--   (#comment-{id} while the comment is visible); run_artist_activity_jobs runs the new job kind.
-- Roles as in 20261216031000: the new functions belong to the owner of fan_notifications; replaced functions keep their owner.
--   If that owner has neither superuser nor BYPASSRLS it gets select on fan_post_comments, fan_posts and celebrities and one
--   policy per row-security table it reads. Probe: supabase/tests/artist_activity_fan_post_nonsuper_apply.sh.
-- Depends on 20261216031000. Rollback: supabase/rollback/20261216040000_artist_activity_fan_post_comments.sql.
begin;
set local lock_timeout = '5s';

alter table public.artist_activity_jobs drop constraint artist_activity_jobs_kind_check;
alter table public.artist_activity_jobs add constraint artist_activity_jobs_kind_check
  check (kind in ('artist_comment', 'artist_online', 'artist_fan_post_comment'));

-- The fan page a fan post belongs to, and the visible comment. Null when the comment, the post or the page is gone or hidden.
create function public.artist_activity_fan_post_comment_source(p_comment uuid)
returns table(comment_id uuid, post_id uuid, author_id uuid, page_id uuid, page_name text, slug text, post_text text)
language sql stable security definer set search_path = '' as $$
  select c.id, p.id, c.app_user_id, g.id, g.name, ce.slug,
    left(pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p.body, ''), '\s+', ' ', 'g')), 60)
  from public.fan_post_comments c
  join public.fan_posts p on p.id = c.post_id and p.deleted_at is null and p.hidden_at is null
  join public.celebrities ce on ce.id = p.celebrity_id
  join public.group_pages g on g.celebrity_id = p.celebrity_id and g.kind = 'fan' and g.status = 'published'
  where c.id = p_comment and c.deleted_at is null and c.hidden_at is null
  order by g.created_at
  limit 1
$$;

-- One slice of a fan-post comment notice. Same shape and bundling as artist_activity_comment_batch.
create function public.artist_activity_fan_post_comment_batch(p_comment uuid, p_at timestamptz, p_after uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c record; artist_name text; bumped integer; added integer; seen integer; last_id uuid; ids uuid[]; title text;
begin
  if not public.artist_activity_inbox_enabled() then return jsonb_build_object('written', 0, 'last', p_after, 'done', false); end if;
  select * into c from public.artist_activity_fan_post_comment_source(p_comment);
  if not found then return jsonb_build_object('written', 0, 'last', null, 'done', true); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('artist-activity:' || c.author_id::text, 0));
  artist_name := public.artist_activity_display_name(c.author_id, c.page_name);
  title := coalesce(nullif(c.post_text, ''), c.page_name);
  select coalesce(array_agg(r.app_user_id order by r.app_user_id), '{}') into ids
    from public.artist_activity_recipients(c.page_id, c.author_id, 'artist_comment', p_after, p_limit) r;
  seen := cardinality(ids); last_id := ids[seen];
  update public.fan_notifications n set read_at = null,
    payload = n.payload || jsonb_build_object('count', coalesce((n.payload ->> 'count')::integer, 1) + 1, 'targetType', 'fan_post_comment',
      'targetId', c.comment_id, 'postId', c.post_id, 'pageId', c.page_id, 'slug', c.slug, 'postTitle', title, 'artistName', artist_name)
  where n.app_user_id = any(ids) and n.kind::text = 'artist_comment' and n.superseded_at is null
    and n.payload ->> 'artistId' = c.author_id::text and n.scheduled_for > p_at - interval '1 hour' and n.scheduled_for <= p_at;
  get diagnostics bumped = row_count;
  insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for, payload, web_only)
  select r, 'artist_comment', 'artist-comment:' || c.author_id::text || ':' || floor(extract(epoch from p_at))::bigint::text, p_at,
    jsonb_build_object('schemaVersion', 1, 'targetType', 'fan_post_comment', 'targetId', c.comment_id, 'postId', c.post_id, 'pageId', c.page_id,
      'slug', c.slug, 'artistId', c.author_id, 'artistName', artist_name, 'postTitle', title, 'count', 1),
    not public.artist_activity_push_allowed(r, 'artist_comment', p_at)
  from unnest(ids) r
  where not exists (select 1 from public.fan_notifications n where n.app_user_id = r and n.kind::text = 'artist_comment'
    and n.superseded_at is null and n.payload ->> 'artistId' = c.author_id::text and n.scheduled_for > p_at - interval '1 hour' and n.scheduled_for <= p_at)
  on conflict (app_user_id, source_key) do nothing;
  get diagnostics added = row_count;
  return jsonb_build_object('written', bumped + added, 'last', last_id, 'done', p_limit is null or seen < p_limit);
end $$;

-- Entry point. Only a bound, active artist of the post's fan page. Up to 500 members: written now; more: one job row.
create function public.artist_activity_notify_fan_post_comment(p_comment uuid, p_at timestamptz default pg_catalog.clock_timestamp())
returns integer language plpgsql security definer set search_path = '' as $$
declare c record; members integer;
begin
  if not public.artist_activity_inbox_enabled() then return 0; end if;
  select * into c from public.artist_activity_fan_post_comment_source(p_comment);
  if not found then return 0; end if;
  if not exists (select 1 from public.group_artist_bindings b join public.app_users u on u.id = b.app_user_id and u.status = 'active'
      where b.page_id = c.page_id and b.app_user_id = c.author_id) then return 0; end if;
  select count(*) into members from (select 1 from public.group_memberships where page_id = c.page_id limit 501) x;
  if members > 500 then
    insert into public.artist_activity_jobs(kind, target_id, page_id, artist_app_user_id, at) values ('artist_fan_post_comment', c.comment_id, c.page_id, c.author_id, p_at);
    return 0;
  end if;
  return (public.artist_activity_fan_post_comment_batch(p_comment, p_at, null, null) ->> 'written')::integer;
end $$;

-- A notice failure never blocks the comment; it is recorded instead.
create function public.artist_activity_fan_post_comment_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.artist_activity_notify_fan_post_comment(new.id, pg_catalog.now());
  exception when others then
    begin
      perform public.artist_activity_record_failure('artist_fan_post_comment', new.id, null, new.app_user_id, pg_catalog.now(), sqlstate, sqlerrm);
    exception when others then raise warning 'ARTIST_ACTIVITY_NOTIFY_FAILED %', sqlstate;
    end;
  end;
  return null;
end $$;

create trigger artist_activity_fan_post_comment after insert on public.fan_post_comments
  for each row execute function public.artist_activity_fan_post_comment_trigger();

-- Group-post batch: unchanged except that a raised notice says again which kind of comment it now points at.
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
    payload = n.payload || jsonb_build_object('count', coalesce((n.payload ->> 'count')::integer, 1) + 1, 'targetType', 'group_comment', 'targetId', c.id,
      'postId', c.post_id, 'pageId', c.page_id, 'postTitle', left(c.title, 60), 'artistName', artist_name)
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

-- Inbox link: a fan-post notice opens the post on the creator's page (the comment while it is visible). Membership, blocks and
-- the page mute are checked as before.
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
  if n.kind::text = 'artist_comment' and n.payload ->> 'targetType' = 'fan_post_comment' then
    select '/c/' || ce.slug || '/community/' || p.id || case when c.id is not null and c.deleted_at is null and c.hidden_at is null then '#comment-' || c.id else '' end
      into path from public.fan_posts p
      join public.celebrities ce on ce.id = p.celebrity_id
      left join public.fan_post_comments c on c.id = (n.payload ->> 'targetId')::uuid and c.post_id = p.id
      where p.id = (n.payload ->> 'postId')::uuid and p.deleted_at is null and p.hidden_at is null;
  elsif n.kind::text = 'artist_comment' then
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
        when 'artist_fan_post_comment' then public.artist_activity_fan_post_comment_batch(j.target_id, j.at, j.cursor, slice)
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

-- Owners, EXECUTE and row security, as 20261216031000.
do $$
declare
  me record; t record; f text;
  new_fns text[] := array['artist_activity_fan_post_comment_source(uuid)', 'artist_activity_fan_post_comment_batch(uuid,timestamp with time zone,uuid,integer)',
    'artist_activity_notify_fan_post_comment(uuid,timestamp with time zone)', 'artist_activity_fan_post_comment_trigger()'];
begin
  select r.oid, r.rolname, r.rolsuper, r.rolbypassrls into me from pg_class c join pg_roles r on r.oid = c.relowner where c.oid = 'public.fan_notifications'::regclass;
  if me.rolname in ('anon', 'authenticated', 'service_role') then raise exception 'ARTIST_ACTIVITY_UNTRUSTED_OWNER %', me.rolname; end if;
  begin
    foreach f in array new_fns loop
      execute format('alter function public.%s owner to %I', f, me.rolname);
      execute format('revoke all on function public.%s from public, anon, authenticated, service_role', f);
    end loop;
  exception when insufficient_privilege then
    raise exception 'ARTIST_ACTIVITY_OWNER: the applying role must be able to act as % (owner of fan_notifications)', me.rolname;
  end;
  for t in select * from (values ('fan_post_comments'), ('fan_posts'), ('celebrities')) v(tname) loop
    execute format('grant select on table public.%I to %I', t.tname, me.rolname);
    if not me.rolsuper and not me.rolbypassrls
      and exists (select 1 from pg_class c where c.oid = ('public.' || t.tname)::regclass and c.relrowsecurity
        and (c.relforcerowsecurity or c.relowner <> me.oid))
      and not exists (select 1 from pg_policy pol where pol.polrelid = ('public.' || t.tname)::regclass and pol.polname = 'artist_activity_owner_' || me.rolname) then
      execute format('create policy %I on public.%I for select to %I using (true)', 'artist_activity_owner_' || me.rolname, t.tname, me.rolname);
    end if;
  end loop;
end $$;
commit;
notify pgrst, 'reload schema';

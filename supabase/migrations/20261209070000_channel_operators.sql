-- Channel operators: a per-creator (channel) write permission that is separate
-- from the admin allowlist and from group owner/manager roles. A full admin
-- grants it; the existing notice and official-schedule RPCs keep their storage,
-- validation and idempotency logic and only swap the permission assertion.
--
-- Rollback: see supabase/rollback/20261209070000_channel_operators.sql.

create table public.channel_operators (
  id uuid primary key default extensions.gen_random_uuid(),
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by_admin_allowlist_id uuid not null references public.admin_allowlist(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by_admin_allowlist_id uuid references public.admin_allowlist(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_operators_revocation_shape check (
    (status = 'active' and revoked_at is null and revoked_by_admin_allowlist_id is null)
    or (status = 'revoked' and revoked_at is not null and revoked_by_admin_allowlist_id is not null)
  )
);
create unique index channel_operators_active_pair
  on public.channel_operators (celebrity_id, app_user_id) where status = 'active';
create index channel_operators_user_idx
  on public.channel_operators (app_user_id) where status = 'active';

alter table public.channel_operators enable row level security;
revoke all on public.channel_operators from public, anon, authenticated;
grant select, insert, update on public.channel_operators to service_role;

-- True only for an active app user holding an active grant on that channel.
create function public.assert_channel_operator(p_app_user_id uuid, p_celebrity_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_app_user_id is null or p_celebrity_id is null or not exists (
    select 1 from public.channel_operators o
    join public.app_users u on u.id = o.app_user_id and u.status = 'active'
    where o.app_user_id = p_app_user_id and o.celebrity_id = p_celebrity_id and o.status = 'active'
  ) then
    raise exception 'active channel operator required';
  end if;
end $$;

-- Admin path (allowlist id present) keeps the existing assertion for any channel.
-- Operator path (allowlist id null) is limited to the channels granted to that user.
create function public.assert_channel_writer(p_app_user_id uuid, p_allowlist_id uuid, p_celebrity_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_allowlist_id is not null then
    perform public.assert_active_admin(p_app_user_id, p_allowlist_id, true);
  else
    perform public.assert_channel_operator(p_app_user_id, p_celebrity_id);
  end if;
end $$;

create function public.assert_channel_reader(p_app_user_id uuid, p_allowlist_id uuid, p_celebrity_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_allowlist_id is not null then
    perform public.assert_active_admin(p_app_user_id, p_allowlist_id, false);
  else
    perform public.assert_channel_operator(p_app_user_id, p_celebrity_id);
  end if;
end $$;

revoke all on function public.assert_channel_operator(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.assert_channel_writer(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.assert_channel_reader(uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- Notice archive may now be recorded by an operator (no allowlist row).
alter table public.celebrity_notices
  add column archived_by_app_user_id uuid references public.app_users(id) on delete restrict;
alter table public.celebrity_notices drop constraint celebrity_notices_archive_shape;
alter table public.celebrity_notices add constraint celebrity_notices_archive_shape check (
  (archived_at is null and archived_by_admin_allowlist_id is null and archived_by_app_user_id is null and archive_reason is null)
  or (archived_at is not null and (archived_by_admin_allowlist_id is not null or archived_by_app_user_id is not null) and length(trim(archive_reason)) >= 10)
);

-- Base notice save: unchanged except the assertion is channel-scoped and an
-- existing notice must belong to a channel the actor may write (no moving a
-- notice out of another channel).
create or replace function public.fan_web_save_notice_base(
  p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_correlation_id uuid, p_notice_id uuid,
  p_expected_revision integer, p_celebrity_id uuid, p_slug text, p_pinned boolean,
  p_title_ko text, p_body_ko jsonb, p_title_en text, p_body_en jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce(p_notice_id, extensions.gen_random_uuid()); v_before jsonb; v_revision integer;
begin
  perform public.assert_channel_writer(p_actor_app_user_id, p_actor_admin_allowlist_id, p_celebrity_id);
  if p_notice_id is not null then
    select to_jsonb(n), n.revision into v_before, v_revision
    from public.celebrity_notices n where n.id = p_notice_id for update;
    if not found then raise exception 'notice not found'; end if;
    perform public.assert_channel_writer(p_actor_app_user_id, p_actor_admin_allowlist_id, (v_before->>'celebrity_id')::uuid);
    if v_before->>'archived_at' is not null or v_before->>'publication_status' <> 'draft' then
      raise exception 'notice is immutable';
    end if;
    if p_expected_revision is null or v_revision <> p_expected_revision then raise exception 'notice revision conflict'; end if;
    update public.celebrity_notices
      set celebrity_id = p_celebrity_id, slug = p_slug, pinned = p_pinned, revision = revision + 1
      where id = v_id;
  else
    insert into public.celebrity_notices(id, celebrity_id, slug, pinned)
    values (v_id, p_celebrity_id, p_slug, p_pinned);
  end if;
  insert into public.celebrity_notice_localizations(notice_id, locale, title, body_json) values
    (v_id, 'ko', trim(p_title_ko), p_body_ko),
    (v_id, 'en', trim(p_title_en), p_body_en)
  on conflict (notice_id, locale) do update
    set title = excluded.title, body_json = excluded.body_json;
  insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
  values (p_actor_app_user_id, p_actor_admin_allowlist_id,
    case when p_notice_id is null then 'notice.created' else 'notice.updated' end,
    'celebrity_notice', v_id::text, p_correlation_id,
    jsonb_build_object('beforeStatus', v_before->>'publication_status', 'slug', p_slug, 'celebrityId', p_celebrity_id,
      'pinned', p_pinned, 'viaChannelOperator', p_actor_admin_allowlist_id is null));
  return v_id;
end $$;

create or replace function public.fan_web_notice_state_base(
  p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_correlation_id uuid, p_notice_id uuid,
  p_expected_revision integer, p_action text, p_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_revision integer;
begin
  select to_jsonb(n), n.revision into v_before, v_revision from public.celebrity_notices n where n.id = p_notice_id for update;
  if not found then raise exception 'notice not found'; end if;
  perform public.assert_channel_writer(p_actor_app_user_id, p_actor_admin_allowlist_id, (v_before->>'celebrity_id')::uuid);
  if p_expected_revision is null or v_revision <> p_expected_revision then raise exception 'notice revision conflict'; end if;
  if v_before->>'archived_at' is not null then raise exception 'notice archived'; end if;
  if p_action = 'publish' then
    update public.celebrity_notices set publication_status = 'published', published_at = now(),
      ever_published_at = coalesce(ever_published_at, now()), revision = revision + 1 where id = p_notice_id;
  elsif p_action = 'unpublish' then
    update public.celebrity_notices set publication_status = 'draft', published_at = null, revision = revision + 1 where id = p_notice_id;
  elsif p_action = 'archive' then
    if length(trim(coalesce(p_reason, ''))) < 10 then raise exception 'archive reason required'; end if;
    update public.celebrity_notices set publication_status = 'draft', published_at = null, archived_at = now(),
      archived_by_admin_allowlist_id = p_actor_admin_allowlist_id,
      archived_by_app_user_id = case when p_actor_admin_allowlist_id is null then p_actor_app_user_id end,
      archive_reason = trim(p_reason), revision = revision + 1
      where id = p_notice_id;
  else raise exception 'invalid notice action'; end if;
  insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
  values (p_actor_app_user_id, p_actor_admin_allowlist_id, 'notice.' || p_action, 'celebrity_notice', p_notice_id::text, p_correlation_id,
    jsonb_build_object('from', v_before->>'publication_status', 'reason', p_reason, 'viaChannelOperator', p_actor_admin_allowlist_id is null));
end $$;

-- Outer notice wrappers: the lock stays, the admin-only assertion becomes channel-scoped.
create or replace function public.save_admin_celebrity_notice(
  p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_correlation_id uuid, p_notice_id uuid,
  p_expected_revision integer, p_celebrity_id uuid, p_slug text, p_pinned boolean,
  p_title_ko text, p_body_ko jsonb, p_title_en text, p_body_en jsonb, p_post_type text, p_visibility text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_asset_ids uuid[]; v_src text;
begin
  perform public.fan_web_lock_active_user(p_actor_app_user_id);
  perform public.assert_channel_writer(p_actor_app_user_id, p_actor_admin_allowlist_id, p_celebrity_id);
  if p_post_type is null or p_post_type not in ('notice','artist_post') or p_visibility is null or p_visibility not in ('public','members') then raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023'; end if;
  v_asset_ids := '{}'::uuid[];
  for v_src in select value#>>'{}' from jsonb_path_query(jsonb_build_array(p_body_ko,p_body_en),'strict $.**.attrs.src') x(value) loop
    if v_src ~ '^/api/content-assets/[0-9a-fA-F-]{36}$' then v_asset_ids := array_append(v_asset_ids, substring(v_src from '[0-9a-fA-F-]{36}$')::uuid);
    elsif p_visibility = 'members' then raise exception 'FAN_WEB_PRIVATE_ASSET_REQUIRED' using errcode='22023'; end if;
  end loop;
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_asset_ids from unnest(v_asset_ids) x;
  perform 1 from public.content_assets where id = any(v_asset_ids) order by id for update;
  if (select count(*) from public.content_assets where id = any(v_asset_ids) and celebrity_id = p_celebrity_id and uploaded_at is not null and deleted_at is null and cleanup_requested_at is null and post_id is null
    and (notice_id = p_notice_id or (notice_id is null and app_user_id = p_actor_app_user_id and expires_at > clock_timestamp()))) <> cardinality(v_asset_ids) then raise exception 'FAN_WEB_INVALID_ASSET' using errcode='22023'; end if;
  v_id := public.fan_web_save_notice_base(p_actor_app_user_id, p_actor_admin_allowlist_id, p_correlation_id, p_notice_id, p_expected_revision, p_celebrity_id, p_slug, p_pinned, p_title_ko, p_body_ko, p_title_en, p_body_en);
  update public.content_assets set deleted_at = clock_timestamp(), cleanup_requested_at = clock_timestamp(), cleanup_retry_at = clock_timestamp() where notice_id = v_id and deleted_at is null and not (id = any(v_asset_ids));
  update public.content_assets set notice_id = v_id where id = any(v_asset_ids);
  update public.celebrity_notices set post_type = p_post_type, visibility = p_visibility where id = v_id;
  return v_id;
end $$;

create or replace function public.reserve_admin_content_asset(
  p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_celebrity_id uuid,
  p_byte_size integer, p_width integer, p_height integer, p_sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := extensions.gen_random_uuid(); v_path text;
begin
  perform public.fan_web_lock_active_user(p_actor_app_user_id);
  perform public.assert_channel_writer(p_actor_app_user_id, p_actor_admin_allowlist_id, p_celebrity_id);
  if not exists(select 1 from public.celebrities where id = p_celebrity_id and archived_at is null) then raise exception 'FAN_WEB_NOT_FOUND' using errcode='P0002'; end if;
  if (select count(*) from public.content_assets where app_user_id = p_actor_app_user_id and created_at > clock_timestamp() - interval '1 minute') >= 10 then raise exception 'FAN_WEB_RATE_LIMITED'; end if;
  v_path := p_actor_app_user_id::text || '/' || v_id::text || '.webp';
  insert into public.content_assets(id, app_user_id, celebrity_id, storage_path, byte_size, width, height, sha256)
    values (v_id, p_actor_app_user_id, p_celebrity_id, v_path, p_byte_size, p_width, p_height, p_sha256);
  return jsonb_build_object('id', v_id, 'storagePath', v_path);
end $$;

-- Official schedule save: same body, channel-scoped assertion on the payload channel.
create or replace function public.fan_web_admin_save_schedule(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_schedule_id uuid,p_expected_revision integer,p_idempotency_key uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.celebrity_schedules%rowtype; v_id uuid; v_hash text:=encode(extensions.digest(p_payload::text,'sha256'),'hex');
begin
  perform public.fan_web_lock_active_user(p_actor_app_user_id);
  perform public.assert_channel_writer(p_actor_app_user_id,p_actor_admin_allowlist_id,(p_payload->>'celebrityId')::uuid);
  if p_correlation_id is null or p_idempotency_key is null then raise exception 'FAN_WEB_INVALID_REQUEST'; end if;
  if p_schedule_id is null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-schedule:'||p_idempotency_key::text,0));
    select * into r from public.celebrity_schedules where idempotency_key=p_idempotency_key;
    if found then
      if r.request_hash<>v_hash then raise exception 'FAN_WEB_IDEMPOTENCY_CONFLICT'; end if;
      return jsonb_build_object('item',public.fan_web_schedule_json(r.id,null,'ko',true),'replayed',true);
    end if;
    if p_expected_revision<>0 then raise exception 'FAN_WEB_REVISION_CONFLICT'; end if;
  else
    select * into r from public.celebrity_schedules where id=p_schedule_id for update;
    if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
    perform public.assert_channel_writer(p_actor_app_user_id,p_actor_admin_allowlist_id,r.celebrity_id);
    if r.revision<>p_expected_revision or r.status='cancelled' then raise exception 'FAN_WEB_REVISION_CONFLICT'; end if;
    if r.celebrity_id<>(p_payload->>'celebrityId')::uuid or (r.status='published' and p_payload->>'status'='draft') then raise exception 'FAN_WEB_INVALID_REQUEST'; end if;
  end if;
  if not exists(select 1 from public.celebrities where id=(p_payload->>'celebrityId')::uuid and archived_at is null) then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  if p_schedule_id is null then
    insert into public.celebrity_schedules(celebrity_id,kind,title_ko,title_en,description_ko,description_en,starts_at,ends_at,time_zone,location,participation_instructions,official_source_url,status,idempotency_key,request_hash)
    values((p_payload->>'celebrityId')::uuid,p_payload->>'kind',btrim(p_payload#>>'{title,ko}'),btrim(p_payload#>>'{title,en}'),coalesce(p_payload#>>'{description,ko}',''),coalesce(p_payload#>>'{description,en}',''),(p_payload->>'startsAt')::timestamptz,(p_payload->>'endsAt')::timestamptz,p_payload->>'timeZone',coalesce(p_payload->>'location',''),coalesce(p_payload->>'participationInstructions',''),p_payload->>'officialSourceUrl',p_payload->>'status',p_idempotency_key,v_hash) returning id into v_id;
  else
    v_id:=r.id;
    if (public.fan_web_schedule_json(r.id,null,'ko',true)-array['id','celebritySlug','revision','createdAt','updatedAt'])=(p_payload||jsonb_build_object('startsAt',(p_payload->>'startsAt')::timestamptz,'endsAt',(p_payload->>'endsAt')::timestamptz)) then
      return jsonb_build_object('item',public.fan_web_schedule_json(r.id,null,'ko',true),'replayed',true);
    end if;
    update public.celebrity_schedules set kind=p_payload->>'kind',title_ko=btrim(p_payload#>>'{title,ko}'),title_en=btrim(p_payload#>>'{title,en}'),description_ko=coalesce(p_payload#>>'{description,ko}',''),description_en=coalesce(p_payload#>>'{description,en}',''),starts_at=(p_payload->>'startsAt')::timestamptz,ends_at=(p_payload->>'endsAt')::timestamptz,time_zone=p_payload->>'timeZone',location=coalesce(p_payload->>'location',''),participation_instructions=coalesce(p_payload->>'participationInstructions',''),official_source_url=p_payload->>'officialSourceUrl',status=p_payload->>'status',revision=revision+1,updated_at=clock_timestamp() where id=v_id;
  end if;
  perform public.fan_web_participation_audit(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,'schedule.saved','celebrity_schedule',v_id,jsonb_build_object('revision',r.revision,'status',r.status),jsonb_build_object('revision',coalesce(r.revision,0)+1,'status',p_payload->>'status'));
  return jsonb_build_object('item',public.fan_web_schedule_json(v_id,null,'ko',true),'replayed',false);
end $$;

-- Schedule list gains an optional channel filter. An operator (allowlist id null)
-- must pass a channel and only ever sees that channel.
drop function public.fan_web_admin_list_schedules(uuid,uuid,uuid,text,timestamptz,uuid,integer);
create function public.fan_web_admin_list_schedules(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_status text,p_before_at timestamptz,p_before_id uuid,p_limit integer,p_celebrity_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
begin
  perform public.assert_channel_reader(p_actor_app_user_id,p_actor_admin_allowlist_id,p_celebrity_id);
  with rows as materialized(select id,created_at,row_number() over(order by created_at desc,id desc) rn from public.celebrity_schedules
    where (p_celebrity_id is null or celebrity_id=p_celebrity_id) and (p_status is null or status=p_status) and (p_before_at is null or (created_at,id)<(p_before_at,p_before_id)) order by created_at desc,id desc limit v_limit+1)
  select jsonb_build_object('items',coalesce(jsonb_agg(public.fan_web_schedule_json(id,null,'ko',true) order by created_at desc,id desc) filter(where rn<=v_limit),'[]'::jsonb),
    'nextCursor',case when count(*)>v_limit then (select jsonb_build_object('at',created_at,'id',id) from rows where rn=v_limit) end) into v_result from rows;
  return v_result;
end $$;
revoke all on function public.fan_web_admin_list_schedules(uuid,uuid,uuid,text,timestamptz,uuid,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.fan_web_admin_list_schedules(uuid,uuid,uuid,text,timestamptz,uuid,integer,uuid) to service_role;

-- Grant, revoke and list are full-admin only: a writable admin session whose
-- allowlist role is exactly 'admin' (operator and viewer allowlist roles are refused).
create function public.assert_channel_grant_admin(p_app_user_id uuid, p_allowlist_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_allowlist_id is null or public.assert_active_admin(p_app_user_id, p_allowlist_id, true) is distinct from 'admin' then
    raise exception 'full admin required';
  end if;
end $$;

create function public.grant_channel_operator(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_correlation_id uuid, p_celebrity_id uuid, p_target_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_matches integer; v_row public.channel_operators%rowtype; v_replayed boolean := false;
begin
  perform public.assert_channel_grant_admin(p_actor_app_user_id, p_actor_admin_allowlist_id);
  if p_correlation_id is null then raise exception 'correlation id is required'; end if;
  if not exists (select 1 from public.celebrities where id = p_celebrity_id) then raise exception 'channel not found'; end if;
  -- Exactly one active account may match the email; the candidates are never listed.
  select count(*), min(id::text)::uuid into v_matches, v_user from public.app_users where status = 'active' and verified_email = lower(btrim(p_target_email));
  if v_matches = 0 then raise exception 'operator candidate not found'; end if;
  if v_matches > 1 then raise exception 'operator candidate ambiguous'; end if;
  insert into public.channel_operators(celebrity_id, app_user_id, granted_by_admin_allowlist_id)
  values (p_celebrity_id, v_user, p_actor_admin_allowlist_id)
  on conflict (celebrity_id, app_user_id) where status = 'active' do nothing
  returning * into v_row;
  if v_row.id is null then
    v_replayed := true;
    select * into v_row from public.channel_operators where celebrity_id = p_celebrity_id and app_user_id = v_user and status = 'active';
  else
    insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
    values (p_actor_app_user_id, p_actor_admin_allowlist_id, 'channel_operator.granted', 'channel_operator', v_row.id::text, p_correlation_id,
      jsonb_build_object('celebrityId', p_celebrity_id, 'targetAppUserId', v_user, 'afterStatus', 'active'));
  end if;
  return jsonb_build_object('id', v_row.id, 'celebrityId', v_row.celebrity_id, 'appUserId', v_row.app_user_id, 'status', v_row.status, 'grantedAt', v_row.granted_at, 'replayed', v_replayed);
end $$;

create function public.revoke_channel_operator(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_correlation_id uuid, p_celebrity_id uuid, p_grant_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.channel_operators%rowtype; v_replayed boolean := false;
begin
  perform public.assert_channel_grant_admin(p_actor_app_user_id, p_actor_admin_allowlist_id);
  if p_correlation_id is null then raise exception 'correlation id is required'; end if;
  -- A grant of another channel is indistinguishable from a missing one.
  select * into v_row from public.channel_operators where id = p_grant_id and celebrity_id = p_celebrity_id for update;
  if not found then raise exception 'channel operator grant not found'; end if;
  if v_row.status = 'revoked' then
    v_replayed := true;
  else
    update public.channel_operators set status = 'revoked', revoked_at = now(), revoked_by_admin_allowlist_id = p_actor_admin_allowlist_id, updated_at = now()
    where id = p_grant_id returning * into v_row;
    insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
    values (p_actor_app_user_id, p_actor_admin_allowlist_id, 'channel_operator.revoked', 'channel_operator', v_row.id::text, p_correlation_id,
      jsonb_build_object('celebrityId', v_row.celebrity_id, 'targetAppUserId', v_row.app_user_id, 'beforeStatus', 'active', 'afterStatus', 'revoked'));
  end if;
  return jsonb_build_object('id', v_row.id, 'celebrityId', v_row.celebrity_id, 'appUserId', v_row.app_user_id, 'status', v_row.status, 'revokedAt', v_row.revoked_at, 'replayed', v_replayed);
end $$;

create function public.list_channel_operators(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_celebrity_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, false);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'appUserId', o.app_user_id, 'email', u.verified_email, 'status', o.status,
      'grantedAt', o.granted_at, 'revokedAt', o.revoked_at) order by (o.status = 'active') desc, o.granted_at desc, o.id)
    from public.channel_operators o join public.app_users u on u.id = o.app_user_id
    where o.celebrity_id = p_celebrity_id), '[]'::jsonb));
end $$;

-- Operator-safe asset read: the asset must belong to the authenticated channel and be
-- either linked to one of its notices or an unlinked upload by the caller. Fan post
-- assets and other members' unlinked uploads return null.
-- read_admin_content_asset stays admin-only and is not reused for operators.
create function public.read_channel_content_asset(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_celebrity_id uuid, p_asset_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.assert_channel_reader(p_actor_app_user_id, p_actor_admin_allowlist_id, p_celebrity_id);
  select jsonb_build_object('storagePath', storage_path, 'mimeType', mime_type) into v_result from public.content_assets
    where id = p_asset_id and celebrity_id = p_celebrity_id and uploaded_at is not null and deleted_at is null
      and cleanup_requested_at is null and storage_deleted_at is null
      and (notice_id is not null or (post_id is null and app_user_id = p_actor_app_user_id));
  return v_result;
end $$;

-- Draft deletion: an active operator grant blocks with a guidance error; revoked
-- rows are cleaned up with the draft. The grant history stays in append-only audit_logs.
create or replace function public.hard_delete_admin_content(
  p_entity_type text,
  p_entity_id uuid,
  p_actor_admin_allowlist_id uuid,
  p_reason text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_row jsonb;
  normalized_reason text := trim(p_reason);
begin
  perform public.require_content_lifecycle_actor(p_actor_admin_allowlist_id, true);
  if p_correlation_id is null then raise exception 'correlation id is required'; end if;
  if normalized_reason is null or length(normalized_reason) not between 10 and 1000 then
    raise exception 'deletion reason must be between 10 and 1000 characters';
  end if;

  case p_entity_type
    when 'celebrity' then
      select to_jsonb(row) into target_row from public.celebrities row where id = p_entity_id for update;
      if target_row is not null and exists (select 1 from public.channel_operators where celebrity_id = p_entity_id and status = 'active') then
        raise exception 'active channel operators must be revoked before deleting this channel';
      end if;
      if target_row is not null and (
        target_row->>'status' <> 'draft' or target_row->>'ever_published_at' is not null
        or exists (select 1 from public.celebrity_quizzes where celebrity_id = p_entity_id)
        or exists (select 1 from public.fan_passports where celebrity_id = p_entity_id)
        or exists (select 1 from public.live_events where celebrity_id = p_entity_id)
        or exists (select 1 from public.benefits where celebrity_id = p_entity_id)
      ) then raise exception 'published or referenced content must be archived'; end if;
      delete from public.channel_operators where celebrity_id = p_entity_id and status = 'revoked';
      delete from public.celebrities where id = p_entity_id;
    when 'brand' then
      select to_jsonb(row) into target_row from public.brands row where id = p_entity_id for update;
      if target_row is not null and (
        target_row->>'status' <> 'draft' or target_row->>'ever_published_at' is not null
        or exists (select 1 from public.live_events where brand_id = p_entity_id)
      ) then raise exception 'published or referenced content must be archived'; end if;
      delete from public.brands where id = p_entity_id;
    when 'live_event' then
      select to_jsonb(row) into target_row from public.live_events row where id = p_entity_id for update;
      if target_row is not null and (
        target_row->>'publication_status' <> 'draft' or target_row->>'ever_published_at' is not null
        or exists (select 1 from public.live_status_overrides where live_event_id = p_entity_id)
        or exists (select 1 from public.live_reservations where live_event_id = p_entity_id)
        or exists (select 1 from public.live_attendances where live_event_id = p_entity_id)
      ) then raise exception 'published or referenced content must be archived'; end if;
      delete from public.live_events where id = p_entity_id;
    when 'benefit' then
      select to_jsonb(row) into target_row from public.benefits row where id = p_entity_id for update;
      if target_row is not null and (
        target_row->>'publication_status' <> 'draft' or target_row->>'ever_published_at' is not null
        or exists (select 1 from public.benefit_claims where benefit_id = p_entity_id)
        or exists (select 1 from public.benefit_delivery_vault where benefit_id = p_entity_id)
        or exists (select 1 from public.benefit_unique_codes where benefit_id = p_entity_id)
      ) then raise exception 'published or referenced content must be archived'; end if;
      delete from public.benefits where id = p_entity_id;
    else raise exception 'unsupported lifecycle entity type';
  end case;

  if target_row is null then raise exception 'content not found'; end if;
  insert into public.audit_logs (
    actor_admin_allowlist_id, action, entity_type, entity_id,
    before_after_summary, correlation_id
  ) values (
    p_actor_admin_allowlist_id, 'content.draft_deleted', p_entity_type, p_entity_id::text,
    jsonb_build_object('beforeStatus', 'draft', 'reason', normalized_reason),
    p_correlation_id
  );
  return jsonb_build_object('id', p_entity_id, 'entityType', p_entity_type, 'deleted', true);
exception
  when foreign_key_violation then
    raise exception 'published or referenced content must be archived';
end;
$$;

revoke all on function public.assert_channel_grant_admin(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.grant_channel_operator(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_channel_operator(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_channel_operators(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.read_channel_content_asset(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_channel_operator(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.revoke_channel_operator(uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.list_channel_operators(uuid, uuid, uuid) to service_role;
grant execute on function public.read_channel_content_asset(uuid, uuid, uuid, uuid) to service_role;

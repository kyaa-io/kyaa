-- POST-DELETE-CORRECTION: take back the points of a post or comment when it is deleted by its author or hidden by an operator.
-- Plan v2 (docs/plans/2026-11-05-dukjil-passport-renewal-v2.md): line 126 (post: "삭제·신고 시 회수"), line 150 item 5, line 585, line 622.
-- Before this, only void_passport_stamp (admin stamp void) corrected points, and only for grants that carry a stamp.
-- A STAMP_CAP grant (points > 0, stamp_id null) had no path at all, and the author DELETE / report-hide paths never called a correction.
--
-- Design (one owner for both paths):
--   dukjil_correct_content_grant(...)  the single place that corrects one grant, once.
--   remove_fan_post / remove_fan_post_comment / resolve_admin_content_report  keep their behavior, and now correct after the base function.
-- Lock order: group wallet lock (barrier shared -> owner -> fan-web-user) is taken BEFORE the base function, because the base takes the
-- fan-web-user lock and a correction taken afterwards would invert the order. The advisory locks are re-entrant inside one transaction.
-- A disabled or write-fenced wallet never blocks a delete or hide: the correction is queued in dukjil_pending_content_corrections
-- (retry_dukjil_content_corrections applies it later) and the stamp stays valid until then.
-- Idempotence and concurrency: dukjil_point_corrections.action_log_id is unique and is checked under the owner lock; void_passport_stamp is
-- idempotent through passport_stamp_voids. Points already spent (a later negative ledger row, or a balance below the grant) go to
-- status 'review' / reason 'rights_spent', the same rule as the stamp void, and show in read_passport_point_reviews.
-- No retroactive correction of posts deleted before this migration (see tasks/POST-DELETE-CORRECTION/ro-count-uncorrected.sql).
-- Reaction (like) grants are not corrected on purpose: the plan only excludes re-clicks after cancel (line 128) and gives no recall rule.

-- True while a grant of this content still needs a correction: a paid grant (points > 0, ledger row) without a correction row, or a
-- stamp-only grant (points = 0, no ledger: the daily point cap was reached but the stamp was still given) whose stamp is not revoked.
create function public.dukjil_content_grant_open(p_owner uuid, p_action text, p_source_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.dukjil_action_log l
     where l.app_user_id = p_owner and l.action_key = p_action and l.source_key = p_source_key
       and ((l.points > 0 and l.ledger_id is not null
             and not exists(select 1 from public.dukjil_point_corrections c where c.action_log_id = l.id))
         or (l.points = 0 and l.ledger_id is null and l.stamp_id is not null
             and exists(select 1 from public.community_stamps s where s.id = l.stamp_id and s.revoked_at is null))))
$$;

create function public.dukjil_correct_content_grant(p_actor uuid, p_owner uuid, p_action text, p_source_key text, p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  l public.dukjil_action_log; st public.community_stamps; voided jsonb; cid uuid; entry uuid; gseq bigint; spent boolean;
  correction text; review text;
begin
  if p_actor is null or p_owner is null or p_action is null or p_action not in ('post', 'comment')
     or p_reason is null or p_reason not in ('content_deleted', 'content_hidden') or p_source_key is null then
    raise exception 'DUKJIL_CORRECTION_INVALID' using errcode = 'P0001'; end if;
  select * into l from public.dukjil_action_log
   where app_user_id = p_owner and action_key = p_action and source_key = p_source_key
     and ((points > 0 and ledger_id is not null) or (points = 0 and ledger_id is null and stamp_id is not null))
   order by created_at limit 1;
  if l.id is null then return 'none'; end if;
  if exists(select 1 from public.dukjil_point_corrections c where c.action_log_id = l.id) then return 'replayed'; end if;

  -- stamp-only grant (daily point cap reached, 0 points): there is nothing to take back, only the stamp is voided
  if l.points = 0 then
    select * into st from public.community_stamps where id = l.stamp_id;
    if st.id is null or st.revoked_at is not null then return 'replayed'; end if;
    perform public.void_passport_stamp(p_actor, st.id, p_reason, false, 'content:' || l.id::text);
    return 'stamp_voided';
  end if;

  -- stamped grant: the stamp void owns the stamp, the page slot and the point correction (and is idempotent)
  if l.stamp_id is not null then
    select * into st from public.community_stamps where id = l.stamp_id;
    if st.id is not null and st.revoked_at is null then
      voided := public.void_passport_stamp(p_actor, st.id, p_reason, false, 'content:' || l.id::text);
      if exists(select 1 from public.dukjil_point_corrections c where c.action_log_id = l.id) then
        return coalesce(voided ->> 'pointCorrection', 'corrected');
      end if;
    end if;
  end if;

  -- unstamped grant (STAMP_CAP) or a stamp that was already revoked without a correction: correct the grant itself
  cid := extensions.gen_random_uuid();
  select e.owner_sequence into gseq from public.mobile_fan_economy_ledger e where e.id = l.ledger_id;
  select exists(select 1 from public.mobile_fan_economy_ledger e
                 where e.app_user_id = p_owner and e.celebrity_id is null and e.asset = 'fan_point' and e.amount < 0
                   and e.source_type <> 'dukjil_correction' and e.owner_sequence > gseq) into spent;
  if not spent and public.group_wallet_balance(p_owner, 'fan_point') >= l.points then
    entry := public.group_wallet_post_correction(p_owner, 'fan_point', -l.points::bigint, 'dukjil_correction', cid);
    correction := 'corrected';
  else
    correction := 'review'; review := 'rights_spent';
  end if;
  insert into public.dukjil_point_corrections(id, action_log_id, stamp_id, app_user_id, amount, reason, ledger_id, status, void_reason)
    values (cid, l.id, null, p_owner, l.points, coalesce(review, p_reason), entry, correction, p_reason);
  return correction;
end $$;

-- A wallet that is disabled or write-fenced must never block a delete or hide. The correction is queued here and
-- retried by retry_dukjil_content_corrections once the wallet accepts writes (also listed by ro-count-uncorrected.sql).
create table public.dukjil_pending_content_corrections (
  action_log_id uuid primary key references public.dukjil_action_log(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  actor_app_user_id uuid not null references public.app_users(id) on delete restrict,
  action_key text not null check (action_key in ('post', 'comment')),
  source_key text not null,
  reason text not null check (reason in ('content_deleted', 'content_hidden')),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  resolved_at timestamptz,
  resolution text,
  attempts integer not null default 0,
  last_error text,
  last_attempt_at timestamptz
);
alter table public.dukjil_pending_content_corrections enable row level security;
revoke all on public.dukjil_pending_content_corrections from public, anon, authenticated, service_role;

create function public.dukjil_queue_content_correction(p_actor uuid, p_owner uuid, p_action text, p_source_key text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.dukjil_pending_content_corrections(action_log_id, app_user_id, actor_app_user_id, action_key, source_key, reason)
    select l.id, p_owner, p_actor, p_action, p_source_key, p_reason
      from public.dukjil_action_log l
     where l.app_user_id = p_owner and l.action_key = p_action and l.source_key = p_source_key
       and ((l.points > 0 and l.ledger_id is not null) or (l.points = 0 and l.ledger_id is null and l.stamp_id is not null))
       and not exists(select 1 from public.dukjil_point_corrections c where c.action_log_id = l.id)
     order by l.created_at limit 1
    on conflict (action_log_id) do nothing;
end $$;

-- Per row: any error is recorded on that row (attempts, last_error, last_attempt_at) and the loop moves on, so one row that cannot be
-- processed (sanctioned owner, admin who lost the role, fenced wallet) never blocks the rest. Rows tried longest ago go first.
create function public.retry_dukjil_content_corrections(p_limit integer default 50) returns integer
language plpgsql security definer set search_path = '' as $$
declare q public.dukjil_pending_content_corrections; done integer := 0; res text; msg text;
begin
  for q in select * from public.dukjil_pending_content_corrections where resolved_at is null
            order by last_attempt_at nulls first, created_at, action_log_id limit least(greatest(coalesce(p_limit, 50), 1), 500) loop
    begin
      perform public.group_wallet_lock_target(q.app_user_id);
      res := public.dukjil_correct_content_grant(q.actor_app_user_id, q.app_user_id, q.action_key, q.source_key, q.reason);
      update public.dukjil_pending_content_corrections set resolved_at = pg_catalog.clock_timestamp(), resolution = res,
             attempts = attempts + 1, last_attempt_at = pg_catalog.clock_timestamp(), last_error = null
       where action_log_id = q.action_log_id;
      done := done + 1;
    exception when others then
      get stacked diagnostics msg = message_text;
      update public.dukjil_pending_content_corrections set attempts = attempts + 1, last_error = left(msg, 500),
             last_attempt_at = pg_catalog.clock_timestamp()
       where action_log_id = q.action_log_id;
    end;
  end loop;
  return done;
end $$;

-- Periodic run: the same pg_cron pattern as dukjil-wire-retry (20261210070000). No AWS schedule is involved.
select cron.schedule('dukjil-content-correction-retry', '*/5 * * * *', 'select public.retry_dukjil_content_corrections()');

-- Retry payout guard: a failed award is paid again later, but never for a post or comment that was deleted or hidden in the meantime.
-- Same body as 20261210070000 plus the check before record_dukjil_action; such a row is closed as resolved (the grant must not exist).
create or replace function public.retry_dukjil_wire_failures(p_limit integer default 50) returns integer
language plpgsql security definer set search_path = '' as $$
declare f public.dukjil_wire_failures; n integer := 0; msg text; gone boolean;
begin
  if not public.dukjil_policy_replaces_earning(pg_catalog.clock_timestamp()) then return 0; end if;
  for f in select * from public.dukjil_wire_failures where resolved_at is null and gave_up_at is null
      order by created_at limit greatest(1, least(p_limit, 500)) for update skip locked loop
    begin
      if not (pg_catalog.pg_try_advisory_xact_lock_shared(pg_catalog.hashtextextended('group-wallet:campaign-barrier', 0))
          and pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:' || f.app_user_id::text, 0))
          and pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('group-wallet:owner:' || f.app_user_id::text, 0))) then
        continue;
      end if;
      gone := false;
      if f.action_key = 'post' then
        gone := not exists(select 1 from public.fan_posts p where p.id::text = f.source_key and p.deleted_at is null and p.hidden_at is null);
      elsif f.action_key = 'comment' then
        gone := not exists(select 1 from public.fan_post_comments k where k.id::text = f.source_key and k.deleted_at is null and k.hidden_at is null);
      end if;
      if gone then
        update public.dukjil_wire_failures set resolved_at = pg_catalog.clock_timestamp(), attempts = attempts + 1 where id = f.id;
        continue;
      end if;
      perform public.record_dukjil_action(f.app_user_id, f.celebrity_id, f.action_key, f.source_key,
        pg_catalog.md5('dukjil-wire:' || f.app_user_id::text || ':' || f.action_key || ':' || f.source_key)::uuid, f.params);
      update public.dukjil_wire_failures set resolved_at = pg_catalog.clock_timestamp(), attempts = attempts + 1 where id = f.id;
      n := n + 1;
    exception when others then
      get stacked diagnostics msg = message_text;
      if public.dukjil_wire_is_normal_rejection(msg) then
        update public.dukjil_wire_failures set resolved_at = pg_catalog.clock_timestamp(), attempts = attempts + 1 where id = f.id;
      else
        update public.dukjil_wire_failures set attempts = attempts + 1, error_message = left(msg, 500),
          gave_up_at = case when attempts + 1 >= 5 then pg_catalog.clock_timestamp() end where id = f.id;
      end if;
    end;
  end loop;
  return n;
end $$;

-- Author delete of a post
alter function public.remove_fan_post(uuid, uuid) rename to remove_fan_post_before_grant_correction;
create function public.remove_fan_post(p_app_user_id uuid, p_post_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid; locked boolean;
begin
  select p.app_user_id into owner from public.fan_posts p where p.id = p_post_id and p.app_user_id = p_app_user_id;
  if owner is not null and public.dukjil_content_grant_open(owner, 'post', p_post_id::text) then
    begin
      perform public.group_wallet_lock(owner, true);
      locked := true;
    exception when others then
      if sqlerrm not like '%GROUP_WALLET_%' then raise; end if;
      locked := false;
    end;
    perform public.remove_fan_post_before_grant_correction(p_app_user_id, p_post_id);
    if locked then
      perform public.dukjil_correct_content_grant(owner, owner, 'post', p_post_id::text, 'content_deleted');
    else
      perform public.dukjil_queue_content_correction(owner, owner, 'post', p_post_id::text, 'content_deleted');
    end if;
  else
    perform public.remove_fan_post_before_grant_correction(p_app_user_id, p_post_id);
  end if;
end $$;

-- Author delete of a comment
alter function public.remove_fan_post_comment(uuid, uuid) rename to remove_fan_post_comment_before_grant_correction;
create function public.remove_fan_post_comment(p_app_user_id uuid, p_comment_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid; locked boolean;
begin
  select c.app_user_id into owner from public.fan_post_comments c where c.id = p_comment_id and c.app_user_id = p_app_user_id;
  if owner is not null and public.dukjil_content_grant_open(owner, 'comment', p_comment_id::text) then
    begin
      perform public.group_wallet_lock(owner, true);
      locked := true;
    exception when others then
      if sqlerrm not like '%GROUP_WALLET_%' then raise; end if;
      locked := false;
    end;
    perform public.remove_fan_post_comment_before_grant_correction(p_app_user_id, p_comment_id);
    if locked then
      perform public.dukjil_correct_content_grant(owner, owner, 'comment', p_comment_id::text, 'content_deleted');
    else
      perform public.dukjil_queue_content_correction(owner, owner, 'comment', p_comment_id::text, 'content_deleted');
    end if;
  else
    perform public.remove_fan_post_comment_before_grant_correction(p_app_user_id, p_comment_id);
  end if;
end $$;

-- Operator / report hide of a post or comment
alter function public.resolve_admin_content_report(uuid, uuid, uuid, uuid, text, boolean, text, boolean) rename to resolve_admin_content_report_before_grant_correction;
create function public.resolve_admin_content_report(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_correlation_id uuid, p_report_id uuid,
  p_resolution text, p_hide_target boolean, p_reason text, p_restrict_author boolean default false) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.content_reports%rowtype; owner uuid; act text; result jsonb; locked boolean;
begin
  select * into r from public.content_reports where id = p_report_id;
  if r.id is not null and r.status = 'open' and coalesce(p_hide_target, false) and p_resolution = 'resolved' and r.target_type in ('fan_post', 'fan_post_comment') then
    if r.target_type = 'fan_post' then
      act := 'post'; select p.app_user_id into owner from public.fan_posts p where p.id = r.target_id and p.hidden_at is null;
    else
      act := 'comment'; select c.app_user_id into owner from public.fan_post_comments c where c.id = r.target_id and c.hidden_at is null;
    end if;
    if owner is not null and public.dukjil_content_grant_open(owner, act, r.target_id::text) then
      begin
        perform public.group_wallet_lock_target(owner);
        locked := true;
      exception when others then
        if sqlerrm not like '%GROUP_WALLET_%' then raise; end if;
        locked := false;
      end;
      result := public.resolve_admin_content_report_before_grant_correction(p_actor_app_user_id, p_actor_admin_allowlist_id, p_correlation_id, p_report_id,
        p_resolution, p_hide_target, p_reason, p_restrict_author);
      if locked then
        perform public.dukjil_correct_content_grant(p_actor_app_user_id, owner, act, r.target_id::text, 'content_hidden');
      else
        perform public.dukjil_queue_content_correction(p_actor_app_user_id, owner, act, r.target_id::text, 'content_hidden');
      end if;
      return result;
    end if;
  end if;
  return public.resolve_admin_content_report_before_grant_correction(p_actor_app_user_id, p_actor_admin_allowlist_id, p_correlation_id, p_report_id,
    p_resolution, p_hide_target, p_reason, p_restrict_author);
end $$;

-- Review list: unstamped corrections (STAMP_CAP grants) have no stamp, so the join to community_stamps becomes a left join
-- and the creator comes from the action log. stampId is null for those rows.
create or replace function public.read_passport_point_reviews(p_actor uuid, p_limit integer default 50, p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare is_admin boolean;
begin
  if p_actor is null then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end if;
  select exists(select 1 from public.admin_allowlist a join public.app_users u on u.verified_email = a.email
                 where u.id = p_actor and u.status = 'active' and a.active and a.role <> 'viewer') into is_admin;
  if not is_admin then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'stampId', x.stamp_id, 'appUserId', x.app_user_id, 'celebrityId', x.celebrity_id, 'amount', x.amount,
      'reason', x.reason, 'voidReason', x.void_reason, 'source', case when x.attendance_id is not null then 'attendance' else 'action' end,
      'createdAt', x.created_at) order by x.created_at desc, x.id desc)
    from (select c.*, coalesce(s.celebrity_id, al.celebrity_id) as celebrity_id
            from public.dukjil_point_corrections c
            left join public.community_stamps s on s.id = c.stamp_id
            left join public.dukjil_action_log al on al.id = c.action_log_id
           where c.status = 'review' and (p_before is null or c.created_at < p_before)
           order by c.created_at desc, c.id desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) x), '[]'::jsonb);
end $$;

-- ACL: only the server role calls the entry points; the renamed base functions and the helper stay private.
revoke all on function public.dukjil_correct_content_grant(uuid, uuid, text, text, text), public.dukjil_queue_content_correction(uuid, uuid, text, text, text),
  public.dukjil_content_grant_open(uuid, text, text), public.retry_dukjil_content_corrections(integer) from public, anon, authenticated, service_role;
grant execute on function public.retry_dukjil_content_corrections(integer) to service_role;
revoke all on function public.retry_dukjil_wire_failures(integer) from public, anon, authenticated, service_role;
grant execute on function public.retry_dukjil_wire_failures(integer) to service_role;
revoke all on function public.remove_fan_post_before_grant_correction(uuid, uuid), public.remove_fan_post_comment_before_grant_correction(uuid, uuid),
  public.resolve_admin_content_report_before_grant_correction(uuid, uuid, uuid, uuid, text, boolean, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.remove_fan_post(uuid, uuid), public.remove_fan_post_comment(uuid, uuid),
  public.resolve_admin_content_report(uuid, uuid, uuid, uuid, text, boolean, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.remove_fan_post(uuid, uuid), public.remove_fan_post_comment(uuid, uuid),
  public.resolve_admin_content_report(uuid, uuid, uuid, uuid, text, boolean, text, boolean) to service_role;
revoke all on function public.read_passport_point_reviews(uuid, integer, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.read_passport_point_reviews(uuid, integer, timestamptz) to service_role;

-- Function owner rights (P1/P2 42501 lesson): when an internal owner role differs from the owner of a callee, it needs EXECUTE.
do $owner$
declare r record;
begin
  for r in
    select distinct o.rolname, c.oid::regprocedure::text as sig
      from pg_catalog.pg_proc f
      join pg_catalog.pg_roles o on o.oid = f.proowner
      join pg_catalog.pg_proc c on c.pronamespace = 'public'::regnamespace
     where f.pronamespace = 'public'::regnamespace
       and f.proname in ('remove_fan_post', 'remove_fan_post_comment', 'resolve_admin_content_report', 'dukjil_correct_content_grant', 'retry_dukjil_content_corrections', 'retry_dukjil_wire_failures')
       and c.proname in ('remove_fan_post_before_grant_correction', 'remove_fan_post_comment_before_grant_correction',
                         'resolve_admin_content_report_before_grant_correction', 'dukjil_correct_content_grant', 'dukjil_queue_content_correction', 'dukjil_content_grant_open', 'void_passport_stamp',
                         'group_wallet_lock', 'group_wallet_lock_target', 'group_wallet_balance', 'group_wallet_post_correction')
       and not o.rolsuper and o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
       and not pg_catalog.has_function_privilege(o.oid, c.oid, 'EXECUTE')
  loop
    execute format('grant execute on function %s to %I', r.sig, r.rolname);
  end loop;
end $owner$;

notify pgrst, 'reload schema';

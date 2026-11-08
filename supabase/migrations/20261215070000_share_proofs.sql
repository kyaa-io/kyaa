-- 261107-2 D12 (with review r4 H2, supervisor decisions 2026-11-08 10:10): the share mission is proven by the fan's own post.
--
-- 1. Opening a share link no longer pays. visit_community_stamp_share_link_before_fan_web wrote a community_stamp_share_visits row,
--    whose three triggers paid (tickets, dukjil 'share', mobile points), and issued a 'share' community stamp. Behind the setting
--    fan_share_settings.visit_payouts (off), the visit function now keeps the opening in fan_share_link_opens and returns before that
--    row and stamp. Opening the link, its destination and the measurement stay. Turning the setting on restores the old payout with
--    no other change. Only objects the applying role owns are changed: the visit table, its triggers and the trigger functions
--    (owned by postgres on dev) are left as they are.
--
-- 2. Proof: the web server accepts only a post address on Instagram, TikTok, X, Threads or YouTube and reduces it to the network's
--    post id (features/share-proof/domain/share-proof.ts); url_key is "platform:id" with the id's letter case kept. The fan must
--    confirm the post is their own (own_post_confirmed). One member, one post: unique (app_user_id, url_key). Another member may
--    submit the same post (the author is not blocked by whoever pasted it first); the admin list marks it as a duplicate.
--    The payout is unchanged: record_dukjil_action('share', source 'share-proof:<id>') under the share rule (points, daily cap shared
--    with every other share payout, stamp per creator per day). Whether a post exists is not checked (no new outside requests).
--
-- 3. Operators cancel a proof from the admin proof screen (revoke_fan_share_proof, checked with assert_active_admin). The cancel
--    takes the grant back the way content corrections do (void_passport_stamp for a stamped grant, group_wallet_post_correction for
--    points, one dukjil_point_corrections row per grant) and runs once: a second cancel replays the first result. Points already
--    spent go to the existing point review list ('review'), as content corrections do. There is no fan notification for corrections
--    in the existing system; the fan's own list shows the proof as cancelled.
--
-- 4. Account deletion keeps the row and its key (the address is cleared), so the post stays counted for the duplicate mark.
--
-- Rollback: supabase/rollback/20261215070000_share_proofs.sql (roll the web back first). It restores the visit payout.
begin;
set local lock_timeout = '5s';

create table public.fan_share_settings (
  singleton boolean primary key default true check (singleton),
  visit_payouts boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.fan_share_settings default values;

create table public.fan_share_link_opens (
  share_link_id uuid not null references public.community_stamp_share_links(id) on delete cascade,
  visitor_app_user_id uuid not null references public.app_users(id) on delete cascade,
  opened_at timestamptz not null default clock_timestamp(),
  primary key (share_link_id, visitor_app_user_id)
);

create table public.fan_share_proofs (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  celebrity_id uuid not null references public.celebrities(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'tiktok', 'x', 'threads', 'youtube')),
  url text check (url is null or (url ~ '^https://' and length(url) <= 600)),
  url_key text not null check (url_key ~ '^(instagram|tiktok|x|threads|youtube):[A-Za-z0-9_-]{6,40}$'),
  own_post_confirmed boolean not null check (own_post_confirmed),
  status text not null default 'accepted' check (status in ('accepted', 'revoked')),
  points integer check (points is null or points >= 0),
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  revoked_by uuid references public.app_users(id),
  revoke_reason text check (revoke_reason is null or length(revoke_reason) between 3 and 300),
  revoke_result text,
  scrubbed_at timestamptz,
  constraint fan_share_proofs_one_per_member unique (app_user_id, url_key),
  constraint fan_share_proofs_revoked check ((status = 'revoked') = (revoked_at is not null))
);
create index fan_share_proofs_owner on public.fan_share_proofs (app_user_id, celebrity_id, created_at desc);
create index fan_share_proofs_key on public.fan_share_proofs (url_key);
create index fan_share_proofs_recent on public.fan_share_proofs (created_at desc, id desc);

do $$ declare t text; owner_role record; begin
  select rolname, rolsuper, rolbypassrls into owner_role from pg_roles where rolname = current_user;
  foreach t in array array['fan_share_settings', 'fan_share_link_opens', 'fan_share_proofs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    if not owner_role.rolsuper and not owner_role.rolbypassrls then
      execute format('create policy %I on public.%I for all to %I using (true) with check (true)', t || '_owner', t, owner_role.rolname);
    end if;
  end loop;
end $$;

create function public.share_visit_payouts_enabled() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select visit_payouts from public.fan_share_settings where singleton), false)
$$;

-- Records an opening without paying. Called by the visit function only.
create function public.record_fan_share_link_open(p_share_link_id uuid, p_visitor uuid) returns void language sql security definer set search_path = '' as $$
  insert into public.fan_share_link_opens (share_link_id, visitor_app_user_id) values (p_share_link_id, p_visitor) on conflict do nothing
$$;

-- The gate inside the visit function, just before the row whose triggers pay. Applied once; the anchor must exist.
do $$
declare d text; begin
  d := pg_get_functiondef('public.visit_community_stamp_share_link_before_fan_web(uuid,text)'::regprocedure);
  if position('share-visit-payout-gate' in d) > 0 then return; end if;
  if position('insert into public.community_stamp_share_visits(' in d) = 0 then raise exception 'visit function changed: payout gate anchor missing'; end if;
  execute replace(d, 'insert into public.community_stamp_share_visits(', $g$-- share-visit-payout-gate (20261215070000): opening a share link pays only while fan_share_settings.visit_payouts is on.
  if not public.share_visit_payouts_enabled() then
    perform public.record_fan_share_link_open(v_link_id, p_app_user_id);
    return jsonb_build_object('creator', v_creator_slug);
  end if;
  insert into public.community_stamp_share_visits($g$);
end $$;

-- Writes one proof (one per member and post). Returns { id, replayed, points, status }; on a replay points is null when the payout never
-- ran, so the server runs it again (its request key is fixed per proof, so a payout that did happen replays).
create function public.submit_fan_share_proof(p_app_user_id uuid, p_celebrity_id uuid, p_platform text, p_url text, p_url_key text, p_own_post boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.fan_share_proofs%rowtype;
begin
  if not exists (select 1 from public.app_users u where u.id = p_app_user_id and u.status = 'active') then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED'; end if;
  if p_own_post is not true then raise exception 'SHARE_PROOF_OWN_POST_REQUIRED'; end if;
  if not exists (select 1 from public.fan_passports p where p.app_user_id = p_app_user_id and p.celebrity_id = p_celebrity_id) then raise exception 'PASSPORT_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-share-proof:' || p_app_user_id::text || ':' || p_url_key, 0));
  select * into v_row from public.fan_share_proofs where app_user_id = p_app_user_id and url_key = p_url_key;
  if found then
    return jsonb_build_object('id', v_row.id, 'replayed', true, 'points', v_row.points, 'status', v_row.status);
  end if;
  insert into public.fan_share_proofs (app_user_id, celebrity_id, platform, url, url_key, own_post_confirmed)
  values (p_app_user_id, p_celebrity_id, p_platform, p_url, p_url_key, true) returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'replayed', false, 'points', null, 'status', v_row.status);
end $$;

create function public.set_fan_share_proof_points(p_app_user_id uuid, p_id uuid, p_points integer)
returns void language sql security definer set search_path = '' as $$
  update public.fan_share_proofs set points = greatest(coalesce(p_points, 0), 0) where id = p_id and app_user_id = p_app_user_id
$$;

-- The fan's own proofs for one creator, newest first (cancelled ones included, marked).
create function public.list_fan_share_proofs(p_app_user_id uuid, p_celebrity_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'platform', s.platform, 'url', s.url, 'points', s.points, 'createdAt', s.created_at, 'status', s.status) order by s.created_at desc, s.id desc)
    from (select * from public.fan_share_proofs where app_user_id = p_app_user_id and celebrity_id = p_celebrity_id and url is not null order by created_at desc limit 50) s), '[]'::jsonb))
$$;

-- Takes one share grant back, once. The same steps as dukjil_correct_content_grant (20261211090000) for the 'share' action.
-- Review r4b H1: a step whose rows it cannot read (row security) or whose result it cannot see raises instead of answering
-- 'replayed' or 'review', so the cancel stops and the proof stays open for another try.
create function public.dukjil_correct_share_grant(p_actor uuid, p_owner uuid, p_source_key text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  l public.dukjil_action_log; st public.community_stamps; cid uuid; entry uuid; gseq bigint; spent boolean; correction text; review text;
begin
  select * into l from public.dukjil_action_log
   where app_user_id = p_owner and action_key = 'share' and source_key = p_source_key
     and ((points > 0 and ledger_id is not null) or (points = 0 and ledger_id is null and stamp_id is not null))
   order by created_at limit 1;
  if l.id is null then return 'none'; end if;
  if exists (select 1 from public.dukjil_point_corrections c where c.action_log_id = l.id) then return 'replayed'; end if;
  if l.stamp_id is not null then
    select * into st from public.community_stamps where id = l.stamp_id;
    if st.id is null then raise exception 'SHARE_GRANT_UNREADABLE: stamp %', l.stamp_id using errcode = 'P0001'; end if;
    if st.revoked_at is null then
      perform public.void_passport_stamp(p_actor, st.id, 'share_proof_revoked', false, 'share-proof:' || l.id::text);
      if not exists (select 1 from public.community_stamps s where s.id = st.id and s.revoked_at is not null) then
        raise exception 'SHARE_GRANT_NOT_REVERTED: stamp %', st.id using errcode = 'P0001';
      end if;
    end if;
    if l.points = 0 then return 'stamp_voided'; end if;
    if exists (select 1 from public.dukjil_point_corrections c where c.action_log_id = l.id) then
      return (select status from public.dukjil_point_corrections c where c.action_log_id = l.id limit 1);
    end if;
  end if;
  cid := extensions.gen_random_uuid();
  select e.owner_sequence into gseq from public.mobile_fan_economy_ledger e where e.id = l.ledger_id;
  if gseq is null then raise exception 'SHARE_GRANT_UNREADABLE: ledger %', l.ledger_id using errcode = 'P0001'; end if;
  select exists (select 1 from public.mobile_fan_economy_ledger e
                 where e.app_user_id = p_owner and e.celebrity_id is null and e.asset = 'fan_point' and e.amount < 0
                   and e.source_type <> 'dukjil_correction' and e.owner_sequence > gseq) into spent;
  if not spent and public.group_wallet_balance(p_owner, 'fan_point') >= l.points then
    entry := public.group_wallet_post_correction(p_owner, 'fan_point', -l.points::bigint, 'dukjil_correction', cid);
    if entry is null then raise exception 'SHARE_GRANT_NOT_REVERTED: points' using errcode = 'P0001'; end if;
    correction := 'corrected';
  else
    correction := 'review'; review := 'rights_spent';
  end if;
  insert into public.dukjil_point_corrections (id, action_log_id, stamp_id, app_user_id, amount, reason, ledger_id, status, void_reason)
    values (cid, l.id, null, p_owner, l.points, coalesce(review, 'share_proof_revoked'), entry, correction, 'share_proof_revoked');
  return correction;
end $$;

-- Pays one proof under the proof's row lock, so a cancel and a payout never interleave (review r4b M1), with the proof's own creator
-- (M2), and keeps what the payout answered, replays included (L1). Refuses a cancelled proof.
create function public.pay_fan_share_proof(p_app_user_id uuid, p_proof_id uuid, p_request_key uuid, p_params jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.fan_share_proofs%rowtype; v_result jsonb;
begin
  select * into v_row from public.fan_share_proofs where id = p_proof_id and app_user_id = p_app_user_id for update;
  if not found then raise exception 'SHARE_PROOF_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_row.status <> 'accepted' then raise exception 'SHARE_PROOF_REVOKED' using errcode = 'P0001'; end if;
  v_result := public.record_dukjil_action(p_app_user_id, v_row.celebrity_id, 'share', 'share-proof:' || v_row.id::text, p_request_key, coalesce(p_params, '{}'::jsonb));
  update public.fan_share_proofs set points = greatest(coalesce((v_result ->> 'points')::integer, 0), 0) where id = v_row.id;
  return v_result;
end $$;

-- Review r4b M1: the five-minute retry of failed payouts skips a share proof that is no longer accepted (cancelled by an operator).
do $$
declare d text; anchor text := 'elsif f.action_key in (''event_checkin'', ''event_review'') then'; begin
  d := pg_get_functiondef('public.retry_dukjil_wire_failures(integer)'::regprocedure);
  if position('share-proof-retry-gate' in d) > 0 then return; end if;
  if position(anchor in d) = 0 then raise exception 'retry function changed: share proof gate anchor missing'; end if;
  execute replace(d, anchor, $g$elsif f.action_key = 'share' and f.source_key like 'share-proof:%' then -- share-proof-retry-gate (20261215070000)
        gone := not exists(select 1 from public.fan_share_proofs s where s.id::text = substr(f.source_key, 13) and s.status = 'accepted');
      $g$ || anchor);
end $$;

-- An operator cancels a proof and takes its grant back. A second cancel replays the first result.
create function public.revoke_fan_share_proof(p_actor uuid, p_allowlist uuid, p_proof_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.fan_share_proofs%rowtype; v_result text;
begin
  begin perform public.assert_active_admin(p_actor, p_allowlist, true);
  exception when others then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 300 then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  select * into v_row from public.fan_share_proofs where id = p_proof_id for update;
  if not found then raise exception 'SHARE_PROOF_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_row.status = 'revoked' then
    return jsonb_build_object('id', v_row.id, 'replayed', true, 'result', coalesce(v_row.revoke_result, 'none'));
  end if;
  v_result := public.dukjil_correct_share_grant(p_actor, v_row.app_user_id, 'share-proof:' || v_row.id::text);
  -- A proof that recorded a payout must find it; 'none' then means the grant could not be read, not that nothing was paid.
  if v_result = 'none' and coalesce(v_row.points, 0) > 0 then raise exception 'SHARE_GRANT_UNREADABLE: grant of %', v_row.id using errcode = 'P0001'; end if;
  update public.fan_share_proofs set status = 'revoked', revoked_at = clock_timestamp(), revoked_by = p_actor, revoke_reason = btrim(p_reason), revoke_result = v_result
   where id = v_row.id;
  return jsonb_build_object('id', v_row.id, 'replayed', false, 'result', v_result);
end $$;

-- The admin list, newest first, with the number of other members who submitted the same post.
create function public.read_admin_share_proofs(p_actor uuid, p_allowlist uuid, p_status text, p_before timestamptz, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  begin perform public.assert_active_admin(p_actor, p_allowlist, false);
  exception when others then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'createdAt', s.created_at, 'status', s.status, 'platform', s.platform, 'url', s.url,
      'postId', split_part(s.url_key, ':', 2), 'points', s.points,
      'creator', jsonb_build_object('slug', c.slug, 'name', coalesce(l.name, c.slug)),
      'member', jsonb_build_object('id', s.app_user_id, 'nickname', p.nickname),
      'duplicateCount', (select count(*) from public.fan_share_proofs o where o.url_key = s.url_key and o.app_user_id <> s.app_user_id),
      'revokedAt', s.revoked_at, 'revokeResult', s.revoke_result) order by s.created_at desc, s.id desc)
    from (select * from public.fan_share_proofs f
          where (p_status is null or p_status = 'all' or f.status = p_status) and (p_before is null or f.created_at < p_before)
          order by f.created_at desc, f.id desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) s
    join public.celebrities c on c.id = s.celebrity_id
    left join public.celebrity_localizations l on l.celebrity_id = c.id and l.locale = 'ko'
    left join public.user_profiles p on p.app_user_id = s.app_user_id), '[]'::jsonb));
end $$;

-- Account deletion: the address goes, the key stays (the post remains counted for the duplicate mark; a member is never paid twice).
create function public.scrub_fan_share_proofs_on_deletion() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'active' and new.status = 'disabled' and exists (select 1 from public.account_deletion_requests d where d.app_user_id = new.id and d.status = 'pending') then
    update public.fan_share_proofs set url = null, scrubbed_at = clock_timestamp() where app_user_id = new.id and scrubbed_at is null;
  end if;
  return new;
end $$;
create trigger app_users_scrub_fan_share_proofs after update of status on public.app_users for each row execute function public.scrub_fan_share_proofs_on_deletion();

revoke all on function public.share_visit_payouts_enabled(), public.record_fan_share_link_open(uuid, uuid),
  public.submit_fan_share_proof(uuid, uuid, text, text, text, boolean), public.set_fan_share_proof_points(uuid, uuid, integer),
  public.list_fan_share_proofs(uuid, uuid), public.dukjil_correct_share_grant(uuid, uuid, text), public.revoke_fan_share_proof(uuid, uuid, uuid, text),
  public.pay_fan_share_proof(uuid, uuid, uuid, jsonb),
  public.read_admin_share_proofs(uuid, uuid, text, timestamptz, integer), public.scrub_fan_share_proofs_on_deletion() from public, anon, authenticated, service_role;
grant execute on function public.submit_fan_share_proof(uuid, uuid, text, text, text, boolean), public.set_fan_share_proof_points(uuid, uuid, integer),
  public.pay_fan_share_proof(uuid, uuid, uuid, jsonb),
  public.list_fan_share_proofs(uuid, uuid), public.revoke_fan_share_proof(uuid, uuid, uuid, text),
  public.read_admin_share_proofs(uuid, uuid, text, timestamptz, integer) to service_role;

-- owner-policy-begin (review r4b H1)
-- The deletion scrub reads account_deletion_requests; the cancel reads the grant, its stamp and the wallet ledger and writes the correction row; the admin list reads names.
-- In dev the applying role (byus_admin) owns these functions but is not a superuser, and some tables they read are owned by
-- postgres with FORCE row security and no policy for it: reads answer 0 rows without an error. Same remedy as 20261215030000 and
-- 20261210240000 (p3_fn_owner_<role>): the privilege the functions need and a policy for that role alone, only where row security
-- would otherwise apply to it. A superuser or BYPASSRLS applier (local) needs nothing. Probe: supabase/tests/f_nonsuper_apply.sh.
do $$
declare me record; t record;
begin
  select oid, rolname, rolsuper, rolbypassrls into me from pg_roles where rolname = current_user;
  if me.rolsuper or me.rolbypassrls then return; end if;
  for t in select * from (values ('account_deletion_requests','select'),('app_users','select'),('fan_passports','select'),('community_stamps','select'),('mobile_fan_economy_ledger','select'),('dukjil_action_log','select'),('dukjil_point_corrections','select, insert'),('dukjil_wire_failures','select'),('celebrities','select'),('celebrity_localizations','select'),('user_profiles','select')) v(tname, privs) loop
    execute format('grant %s on table public.%I to %I', t.privs, t.tname, me.rolname);
    if exists (select 1 from pg_class c where c.oid = ('public.' || t.tname)::regclass and c.relrowsecurity
        and (c.relforcerowsecurity or not pg_has_role(me.oid, c.relowner, 'USAGE')))
      and not exists (select 1 from pg_policy pol where pol.polrelid = ('public.' || t.tname)::regclass and me.oid = any(pol.polroles)) then
      execute format('create policy %I on public.%I for all to %I using (true) with check (true)', 'p3_fn_owner_' || me.rolname, t.tname, me.rolname);
    end if;
  end loop;
end $$;
-- owner-policy-end

-- The visit function and the cancel may belong to another owner than the functions they call (same cause as 20261212030000).
do $$ declare pair record; caller_owner name; target_owner name; begin
  for pair in select * from (values
    ('public.visit_community_stamp_share_link_before_fan_web(uuid,text)', 'public.share_visit_payouts_enabled()'),
    ('public.visit_community_stamp_share_link_before_fan_web(uuid,text)', 'public.record_fan_share_link_open(uuid,uuid)'),
    ('public.revoke_fan_share_proof(uuid,uuid,uuid,text)', 'public.assert_active_admin(uuid,uuid,boolean)'),
    ('public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)', 'public.assert_active_admin(uuid,uuid,boolean)'),
    ('public.revoke_fan_share_proof(uuid,uuid,uuid,text)', 'public.dukjil_correct_share_grant(uuid,uuid,text)'),
    ('public.dukjil_correct_share_grant(uuid,uuid,text)', 'public.void_passport_stamp(uuid,uuid,text,boolean,text)'),
    ('public.dukjil_correct_share_grant(uuid,uuid,text)', 'public.group_wallet_post_correction(uuid,text,bigint,text,uuid)'),
    ('public.dukjil_correct_share_grant(uuid,uuid,text)', 'public.group_wallet_balance(uuid,text)'),
    ('public.pay_fan_share_proof(uuid,uuid,uuid,jsonb)', 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)')) v(caller, target) loop
    select pg_get_userbyid(proowner) into caller_owner from pg_proc where oid = pair.caller::regprocedure;
    select pg_get_userbyid(proowner) into target_owner from pg_proc where oid = pair.target::regprocedure;
    if caller_owner in ('anon', 'authenticated', 'service_role') then raise exception 'Unexpected definer owner % for %', caller_owner, pair.caller; end if;
    if caller_owner <> target_owner then execute format('grant execute on function %s to %I', pair.target, caller_owner); end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

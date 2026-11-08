-- 261107-2 D12: the share mission is proven by the post the fan put on a social network, not by opening the share sheet.
--
-- The fan shares the creator page, posts it on Instagram, X, TikTok, YouTube, Threads, Facebook, Weverse, Naver blog or cafe,
-- then submits the address of that post. The web server checks the address (https, a known network, a post path, not a profile)
-- and normalises it into url_key; this file keeps one row per post address. One address counts once for everyone: a second fan
-- submitting the same post is refused (SHARE_PROOF_URL_USED); the same fan submitting it again replays the first answer.
--
-- Payment does not change: after the row is written the server calls record_dukjil_action('share', source = proof id), so the
-- active policy's share rule (points, daily cap, stamp per creator per day) decides as before. The proof row keeps the points the
-- server reported so the fan's list can show them. There is no manual review step; operators can hide a row (status 'hidden'),
-- which removes it from the fan's list but does not claw the points back (the existing fraud clawback path does that).
--
-- The older path that pays the share owner when someone opens the share link (dukjil_wire on community_stamp_share_visits) is left
-- as it is; both paths share the same daily cap.
--
-- Rollback: supabase/rollback/20261215070000_share_proofs.sql (roll the web back first; submitted proofs are deleted, points stay).
begin;
set local lock_timeout = '5s';

create table public.fan_share_proofs (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  celebrity_id uuid not null references public.celebrities(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'x', 'tiktok', 'youtube', 'threads', 'facebook', 'weverse', 'naver_blog', 'naver_cafe', 'daum_cafe', 'bluesky')),
  url text not null check (url ~ '^https://' and length(url) <= 600),
  url_key text not null unique check (length(url_key) between 8 and 400),
  status text not null default 'accepted' check (status in ('accepted', 'hidden')),
  points integer check (points is null or points >= 0),
  created_at timestamptz not null default clock_timestamp()
);
create index fan_share_proofs_owner on public.fan_share_proofs (app_user_id, celebrity_id, created_at desc);

do $$ declare owner_role record; begin
  select rolname, rolsuper, rolbypassrls into owner_role from pg_roles where rolname = current_user;
  alter table public.fan_share_proofs enable row level security;
  alter table public.fan_share_proofs force row level security;
  revoke all on public.fan_share_proofs from public, anon, authenticated, service_role;
  if not owner_role.rolsuper and not owner_role.rolbypassrls then
    execute format('create policy fan_share_proofs_owner on public.fan_share_proofs for all to %I using (true) with check (true)', owner_role.rolname);
  end if;
end $$;

-- Writes one proof for a fan who holds this creator's passport. Returns { id, replayed } and, on a replay, the points recorded
-- (null when the payout never ran, so the server can run it again).
create function public.submit_fan_share_proof(p_app_user_id uuid, p_celebrity_id uuid, p_platform text, p_url text, p_url_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.fan_share_proofs%rowtype;
begin
  if not exists (select 1 from public.app_users u where u.id = p_app_user_id and u.status = 'active') then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED'; end if;
  if not exists (select 1 from public.fan_passports p where p.app_user_id = p_app_user_id and p.celebrity_id = p_celebrity_id) then raise exception 'PASSPORT_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-share-proof:' || p_url_key, 0));
  select * into v_row from public.fan_share_proofs where url_key = p_url_key;
  if found then
    if v_row.app_user_id = p_app_user_id and v_row.celebrity_id = p_celebrity_id then
      return jsonb_build_object('id', v_row.id, 'replayed', true, 'points', v_row.points);
    end if;
    raise exception 'SHARE_PROOF_URL_USED';
  end if;
  insert into public.fan_share_proofs (app_user_id, celebrity_id, platform, url, url_key)
  values (p_app_user_id, p_celebrity_id, p_platform, p_url, p_url_key) returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'replayed', false);
end $$;

-- Keeps the points the payout reported for the fan's list. Only the owner's own row.
create function public.set_fan_share_proof_points(p_app_user_id uuid, p_id uuid, p_points integer)
returns void language sql security definer set search_path = '' as $$
  update public.fan_share_proofs set points = greatest(coalesce(p_points, 0), 0) where id = p_id and app_user_id = p_app_user_id
$$;

-- The fan's own proofs for one creator, newest first (hidden rows left out).
create function public.list_fan_share_proofs(p_app_user_id uuid, p_celebrity_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'platform', s.platform, 'url', s.url, 'points', s.points, 'createdAt', s.created_at) order by s.created_at desc, s.id desc)
    from (select * from public.fan_share_proofs where app_user_id = p_app_user_id and celebrity_id = p_celebrity_id and status = 'accepted' order by created_at desc limit 50) s), '[]'::jsonb))
$$;

-- Account deletion: same moment as the other owned rows (scrub on the pending deletion's disable).
create function public.scrub_fan_share_proofs_on_deletion() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'active' and new.status = 'disabled' and exists (select 1 from public.account_deletion_requests d where d.app_user_id = new.id and d.status = 'pending') then
    delete from public.fan_share_proofs where app_user_id = new.id;
  end if;
  return new;
end $$;
create trigger app_users_scrub_fan_share_proofs after update of status on public.app_users for each row execute function public.scrub_fan_share_proofs_on_deletion();

revoke all on function public.submit_fan_share_proof(uuid, uuid, text, text, text), public.set_fan_share_proof_points(uuid, uuid, integer),
  public.list_fan_share_proofs(uuid, uuid), public.scrub_fan_share_proofs_on_deletion() from public, anon, authenticated;
revoke all on function public.scrub_fan_share_proofs_on_deletion() from service_role;
grant execute on function public.submit_fan_share_proof(uuid, uuid, text, text, text), public.set_fan_share_proof_points(uuid, uuid, integer),
  public.list_fan_share_proofs(uuid, uuid) to service_role;

commit;

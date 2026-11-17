-- Rollback (stop) for 20261231120000_dukjil_stamps_native_onchain.sql.
-- Restoring the pre-migration issuer would write new stamps to the retired legacy queue again (the 11/11 backlog), so this
-- stops the chain side instead: every new dukjil stamp is saved and held (ROUTE_DISABLED), nothing new is enqueued, the
-- registration trigger no longer releases, and backlog recovery stops. Points, stamps and slots behave as before.
-- Already enqueued outboxes and chain records stay (a DB rollback cannot undo a chain record). Held stamps and manifest rows
-- are kept; after a fix, re-apply the forward definitions and run release_held_community_stamps / run_community_stamp_recovery,
-- which reuse the same stamp ids and keys.
begin;
set local lock_timeout = '5s';

drop trigger if exists fan_action_verified_creators_release_held_stamps on public.fan_action_verified_creators;

create or replace function public.dukjil_issue_stamp_base(
  p_user uuid, p_celebrity uuid, p_kind public.community_stamp_kind, p_source_key text, p_policy integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_recipient text; v_slug text; v_id uuid := extensions.gen_random_uuid(); v_existing uuid;
begin
  if p_user is null or p_kind is null or p_source_key is null then
    raise exception 'COMMUNITY_STAMP_INVALID_REQUEST' using errcode = 'P0001'; end if;
  select id into v_existing from public.community_stamps
    where app_user_id = p_user and kind = p_kind and source_key = p_source_key;
  if v_existing is not null then return v_existing; end if;
  select wallet.address into v_recipient from public.user_wallets wallet
    where wallet.app_user_id = p_user and wallet.chain_id = 91342 and wallet.provider = 'privy'
      and wallet.wallet_type = 'embedded' for key share;
  if v_recipient is null then raise exception 'COMMUNITY_STAMP_WALLET_NOT_READY' using errcode = 'P0001'; end if;
  if p_celebrity is not null then
    select celebrity.slug into v_slug from public.celebrities celebrity
      where celebrity.id = p_celebrity and celebrity.status = 'published' and celebrity.archived_at is null for key share;
    if v_slug is null then raise exception 'COMMUNITY_STAMP_NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  insert into public.community_stamps(id, app_user_id, celebrity_id, kind, source_key, policy_version, onchain_hold_reason, onchain_held_at)
    values (v_id, p_user, p_celebrity, p_kind, p_source_key, p_policy,
      case when public.community_stamp_onchain_code(p_kind, p_celebrity) is null then 'UNSUPPORTED_KIND' else 'ROUTE_DISABLED' end,
      pg_catalog.clock_timestamp());
  return v_id;
exception when unique_violation then
  select id into v_existing from public.community_stamps
    where app_user_id = p_user and kind = p_kind
      and (source_key = p_source_key
        or (p_celebrity is null and celebrity_id is null)
        or (p_celebrity is not null and celebrity_id = p_celebrity and p_kind in ('first_comment','support')))
    order by issued_at limit 1;
  if v_existing is null then raise; end if;
  return v_existing;
end $$;

create or replace function public.run_community_stamp_recovery(p_manifest_hash text, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'COMMUNITY_STAMP_RECOVERY_STOPPED';
end $$;
create or replace function public.release_held_community_stamps(p_creator uuid default null, p_limit integer default 200)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'COMMUNITY_STAMP_RELEASE_STOPPED';
end $$;
revoke all on function public.run_community_stamp_recovery(text, integer), public.release_held_community_stamps(uuid, integer)
  from public, anon, authenticated, service_role;
commit;

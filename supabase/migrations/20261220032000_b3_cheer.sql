-- B3 §5.1: today's cheer for the member's favorite creator (3P + one cheer stamp, under policy v2).
--
-- cheer_dukjil_favorite(user) reads the favorite (fan_profile_public_fields.favorite_celebrity_id) and records the 'cheer' action for it.
-- record_dukjil_action keys a cheer on the member and the KST day (20261220031000 P2), so a second tap the same day, also after the
-- favorite changed, replays the first: no new ledger row, no new stamp, earned 0.
-- Answer: { earned, stamped, replayed, at, celebrityId, celebritySlug }. earned is what this call paid (0 on a replay), so a screen never shows a past
-- 3P as a new one. The day's first passport Claim already stamps a cheer (claim_passport_page); a tap after it still pays 3P and gets
-- no second stamp (one cheer stamp per creator per day, plan §11-1 (a)).
-- Errors: DUKJIL_FAVORITE_REQUIRED (no favorite), ACCOUNT_INACTIVE (inactive or restricted account), and the record's own codes
-- (POLICY_INACTIVE, PASSPORT_REQUIRED, COMMUNITY_STAMP_NOT_FOUND).
--
-- Rollback: supabase/rollback/20261220032000_b3_cheer.sql
begin;
set local lock_timeout = '5s';

create function public.cheer_dukjil_favorite(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare fav uuid; r jsonb;
begin
  if p_user is null then raise exception 'GROUP_WALLET_INVALID' using errcode = 'P0001'; end if;
  select f.favorite_celebrity_id into fav from public.fan_profile_public_fields f where f.app_user_id = p_user;
  if fav is null then raise exception 'DUKJIL_FAVORITE_REQUIRED' using errcode = 'P0001'; end if;
  -- source and request key are replaced inside record_dukjil_action by the member's day key
  r := public.record_dukjil_action(p_user, fav, 'cheer', 'cheer:auto', extensions.gen_random_uuid(), '{}'::jsonb);
  if r ->> 'reason' = 'ACCOUNT_INACTIVE' then raise exception 'ACCOUNT_INACTIVE' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'earned', case when (r ->> 'replayed')::boolean then 0 else coalesce((r ->> 'points')::integer, 0) end,
    'stamped', r ->> 'stampId' is not null,
    'replayed', coalesce((r ->> 'replayed')::boolean, false),
    'at', r -> 'at',
    'celebrityId', fav,
    'celebritySlug', (select c.slug from public.celebrities c where c.id = fav));
end $$;

revoke all on function public.cheer_dukjil_favorite(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cheer_dukjil_favorite(uuid) to service_role;

do $$ begin
  perform public.b3_owner_execute('public.cheer_dukjil_favorite(uuid)', array['public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)']);
  perform public.b3_owner_access('public.cheer_dukjil_favorite(uuid)', array['fan_profile_public_fields:select', 'celebrities:select']);
end $$;

notify pgrst, 'reload schema';
commit;

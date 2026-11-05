-- Display-only: how many ad-gated exchanges the signed-in account has left today (KST).
-- Deploy order: app first, then this migration once earlier page bundles are gone. App first is safe: the route treats a
-- missing function as "unknown" and omits exchangesRemainingToday. Database first is not free of risk: the previous
-- bundle's walletSchema is strict, so a tab still running it fails to parse a wallet response carrying the new key
-- (only when this function and the new app are both live and the rewarded-ad gate is open). The existing
-- read_owned_group_wallet payload is untouched; the key is added by the app route after this function answers.
-- The file is re-runnable (create or replace; grants are repeatable).
-- The exchange and issue functions keep their own daily-cap checks; this value never authorizes anything.
-- Same owner rule as 20261209150000: group_wallet_ad_consumed_today and group_wallet_ad_need are revoked from every API role, so they are
-- called only by this definer function. Execute is granted to this function's owner when that owner differs from
-- each helper's owner, and the helper's ACL is not widened for any API role. service_role gets only the new reader.
begin;
create or replace function public.read_owned_group_wallet_exchanges_remaining(p_app_user_id uuid,p_daily_cap integer)returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.group_wallet_ad_need(array[p_daily_cap]);
 return jsonb_build_object('exchangesRemainingToday',greatest(0,p_daily_cap-public.group_wallet_ad_consumed_today(p_app_user_id)));
end $$;
do $$declare target regprocedure;fn_owner name;target_owner name;begin
 select pg_get_userbyid(proowner) into fn_owner from pg_proc where oid='public.read_owned_group_wallet_exchanges_remaining(uuid,integer)'::regprocedure;
 if fn_owner in('anon','authenticated','service_role')then raise exception 'Unexpected definer owner %',fn_owner;end if;
 foreach target in array array['public.group_wallet_ad_consumed_today(uuid)'::regprocedure,'public.group_wallet_ad_need(integer[])'::regprocedure] loop
  select pg_get_userbyid(proowner) into target_owner from pg_proc where oid=target;
  if fn_owner<>target_owner then execute format('grant execute on function %s to %I',target,fn_owner);end if;
 end loop;
end$$;
revoke all on function public.read_owned_group_wallet_exchanges_remaining(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_group_wallet_exchanges_remaining(uuid,integer) to service_role;
commit;

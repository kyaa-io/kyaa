-- Rollback of 20261220034000_b3_tier_bonus.sql (plan §12 ③): the retry cron, the triggers and the sync go; pending grants are closed as
-- void/rolled_back so none is left unpaid without a payer. fan_tier_bonus_grants and the history rows the triggers wrote stay (paid
-- grants point at their ledger rows); the table keeps its guard. observe_fan_tiers loses bonusPoints (pairs reverted, md5 checked).
begin;
set local lock_timeout = '5s';

do $cron$
begin
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'fan-tier-bonus-retry';
  end if;
end $cron$;
drop trigger zzz_fan_tier_sync on public.creator_heart_ledger;
drop trigger zzz_fan_tier_sync on public.fan_heart_conversions;
drop trigger zzz_fan_tier_sync on public.passport_page_slots;
drop trigger zzz_fan_tier_sync_insert on public.passport_page_slots;
drop trigger zzz_fan_tier_start on public.fan_passports;
update public.fan_tier_bonus_grants set status = 'void', void_reason = 'rolled_back' where status = 'pending';

do $$ begin perform public.b3_patch_function('public.observe_fan_tiers(uuid,public.content_locale)', true); end $$;
delete from public.b3_function_patches where fn = 'public.observe_fan_tiers(uuid,public.content_locale)';
delete from public.b3_function_patch_bases where fn = 'public.observe_fan_tiers(uuid,public.content_locale)';

drop function public.retry_fan_tier_bonus_grants(integer);
drop function public.dukjil_tier_history_catch_up();
drop function public.zzz_fan_tier_sync_row();
drop function public.zzz_fan_tier_start_row();
drop function public.dukjil_sync_fan_tier(uuid, uuid, boolean);
drop function public.pay_fan_tier_bonus_grant(uuid);
drop function public.dukjil_tier_lock(uuid);

notify pgrst, 'reload schema';
commit;

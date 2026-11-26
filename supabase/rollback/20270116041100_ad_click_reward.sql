-- Rollback of 20270116041100_ad_click_reward.sql (web first: /api/me/dukjil/ad-reward calls these functions). Rows already paid stay.
begin;
drop view public.ad_reward_click_daily;
drop function public.read_ad_click_rewards_today(uuid);
drop function public.record_ad_click_reward(uuid, uuid);
notify pgrst, 'reload schema';
commit;

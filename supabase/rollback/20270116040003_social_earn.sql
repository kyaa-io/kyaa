-- Rollback of 20270116040003_social_earn.sql (web first: four routes call this function). Rows already paid stay.
begin;
drop function public.record_social_earn(uuid, text, uuid);
drop index public.dukjil_action_log_friend_pair_idx;
notify pgrst, 'reload schema';
commit;

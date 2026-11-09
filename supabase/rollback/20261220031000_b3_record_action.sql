-- Rollback of 20261220031000_b3_record_action.sql. Order (plan §12): web first; if v2 is already in effect, schedule a version with
-- v1's values through replace_dukjil_policy and run this only after that midnight, so the old record never reads v2's rules.
-- Reverts the record_dukjil_action pairs (md5 of the restored body checked), drops dukjil_now and dukjil_b3_payable, deletes the v2
-- row while it is still a draft. Log rows written meanwhile stay.
begin;
set local lock_timeout = '5s';

do $$ begin
  if exists (select 1 from public.dukjil_active_policy(clock_timestamp()) p
             where p.rules #> '{actions,insta_repost}' is not null or p.rules #> '{actions,tier_bonus}' is not null) then
    raise exception 'B3_ROLLBACK_BLOCKED: the policy in effect still has the B3 actions; replace it with v1 values first';
  end if;
  perform public.b3_patch_function('public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', true);
end $$;
do $$ begin perform public.b3_patch_function('public.passport_stamp_action(public.community_stamp_kind)', true); end $$;
delete from public.b3_function_patches where fn = 'public.passport_stamp_action(public.community_stamp_kind)';
delete from public.b3_function_patch_bases where fn = 'public.passport_stamp_action(public.community_stamp_kind)';
delete from public.b3_function_patches where fn = 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)';
delete from public.b3_function_patch_bases where fn = 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)';
delete from public.dukjil_policy_versions where version = 2 and status = 'draft' and created_by = 'b3-migration';
drop function public.dukjil_b3_payable(uuid);
drop function public.dukjil_now();

notify pgrst, 'reload schema';
commit;

-- Rollback of 20261220035000_b3_reads.sql (web first): the two reads lose the B3 keys (pairs reverted, md5 checked).
begin;
set local lock_timeout = '5s';
do $$ declare f text; begin
  foreach f in array array['public.read_dukjil_today(uuid,uuid)', 'public.read_owned_group_wallet_history(uuid,integer)'] loop
    perform public.b3_patch_function(f, true);
    delete from public.b3_function_patches where fn = f;
    delete from public.b3_function_patch_bases where fn = f;
  end loop;
end $$;
drop function public.read_dukjil_b3_today(uuid, uuid, public.dukjil_policy_versions);
notify pgrst, 'reload schema';
commit;

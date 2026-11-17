-- BYUS_CLEAN_DB_UPGRADE_AFTER_FILE for 20261231100000: the clean chain has the Fan Action lane, so the issuer must be native.
do $$
begin
  if position('community_stamp_enqueue_native' in pg_get_functiondef(
      'public.dukjil_issue_stamp_base(uuid,uuid,public.community_stamp_kind,text,integer)'::regprocedure)) = 0
    or position('assert_dukjil_stamp_occurrence' in pg_get_functiondef(
      'public.enqueue_fan_action_source(text,text,uuid,uuid,uuid,timestamptz,integer,jsonb)'::regprocedure)) = 0
    or position('record_and_issue' in pg_get_functiondef('public.claim_blockchain_jobs(text,integer,integer,text[])'::regprocedure)) = 0 then
    raise exception 'DUKJIL_NATIVE_TEST: clean chain did not take the native path';
  end if;
  raise notice 'CLEAN_CHAIN_NATIVE_OK';
end $$;

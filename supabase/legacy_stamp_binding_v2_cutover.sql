-- Owner-only legacy retirement and new-direct HOLD; release requires separate finalized role/deployment evidence.
-- Does not update existing jobs. Exact function fingerprints reject drift.
begin;
do $cutover$
declare definition text; patched text; target regprocedure;
begin
  perform 1 from public.mint_dispatch_policy where singleton
    and not legacy_credential_issuance_retired and not direct_stamp_dispatch_enabled for update;
  if not found then
    raise exception 'LEGACY_STAMP_CUTOVER_POLICY_STATE';
  end if;
  if md5(pg_get_functiondef('public.claim_blockchain_jobs(text,integer,integer,text[])'::regprocedure)) <> '1cd2691473482df68eb187a936b3ba51' then raise exception 'LEGACY_STAMP_CUTOVER_CLAIM_DRIFT'; end if;
  if md5(pg_get_functiondef('public.admit_mint_dispatch(uuid,text)'::regprocedure)) <> '5ce8605a209476bcffab9407d721c65c' then raise exception 'LEGACY_STAMP_CUTOVER_ADMIT_DRIFT'; end if;
  if md5(pg_get_functiondef('public.assert_stamp_blockchain_job_link_v2(uuid,uuid,uuid,text,public.credential_mint_status,uuid,text,numeric)'::regprocedure)) <> '061b57555828acde3fd740dc9c860445' then raise exception 'LEGACY_STAMP_CUTOVER_VALIDATOR_DRIFT'; end if;
  target := 'public.award_owned_mobile_participation_qr_stamp(uuid,uuid)'::regprocedure;
  definition := pg_get_functiondef(target);
  if md5(definition) <> '5935de3042a152d8dafceee0f6e039fc' then
    raise exception 'LEGACY_STAMP_CUTOVER_FUNCTION_DRIFT: %',target;
  end if;
  if (length(definition)-length(replace(definition,$site$'stampType','Attendance'$site$,'')))/length($site$'stampType','Attendance'$site$) <> 1 then
    raise exception 'LEGACY_STAMP_CUTOVER_PAYLOAD_SITE_DRIFT: %',target;
  end if;
  patched := replace(definition,$site$'stampType','Attendance'$site$,$site$'stampType','Attendance','bindingVersion',2$site$);
  execute patched;
  target := 'public.finalize_certification_review_internal(uuid,bigint,public.certification_submission_status,text,public.certification_review_source,uuid,uuid,bigint,text,text,uuid)'::regprocedure;
  definition := pg_get_functiondef(target);
  if md5(definition) <> 'c42157541cab8affa483e0cadd939f50' then
    raise exception 'LEGACY_STAMP_CUTOVER_FUNCTION_DRIFT: %',target;
  end if;
  if (length(definition)-length(replace(definition,$site$'stampType','Membership'$site$,'')))/length($site$'stampType','Membership'$site$) <> 2 then
    raise exception 'LEGACY_STAMP_CUTOVER_PAYLOAD_SITE_DRIFT: %',target;
  end if;
  patched := replace(definition,$site$'stampType','Membership'$site$,$site$'stampType','Membership','bindingVersion',2$site$);
  execute patched;
  update public.mint_dispatch_policy set legacy_credential_issuance_retired=true,direct_stamp_dispatch_enabled=false,updated_at=clock_timestamp() where singleton;
end $cutover$;
commit;

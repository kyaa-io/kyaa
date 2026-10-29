-- Owner-only activation after finalized new-Stamp MINTER grant and compatible worker deployment.
-- Does not update existing jobs. Exact function fingerprints reject drift.
begin;
do $cutover$
declare definition text; patched text; target regprocedure;
begin
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
end $cutover$;
commit;

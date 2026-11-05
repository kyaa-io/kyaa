-- PASSPORT-RENEWAL P1-4b: community_stamps_validate_source (assert_community_stamp_source) rejects every kind that has no
-- legacy evidence check (share/invite/subscription are 'UNAVAILABLE'; new dukjil kinds are unknown). While an active dukjil
-- policy is in force, those kinds are accepted: the only writers are dukjil_issue_stamp (service_role-only RPCs), which
-- decide eligibility from the policy rules. Before activation nothing changes.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.assert_community_stamp_source(uuid,uuid,public.community_stamp_kind,text)'::regprocedure);
  if position('dukjil_policy_replaces_earning' in definition) > 0 then return; end if;
  execute regexp_replace(definition, '\mbegin\M',
    $g$begin
  if p_kind::text = any(array['share','invite','subscription','post','comment','reaction','live_reserve','live_attend','survey','mission','event_checkin','event_review','cheer','proof','quiz','steady_checkin','wave_mission','first_clip'])
     and public.dukjil_policy_replaces_earning(pg_catalog.clock_timestamp()) then return; end if;$g$, 'i');
end $$;

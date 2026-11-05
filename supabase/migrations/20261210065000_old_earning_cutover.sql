-- PASSPORT-RENEWAL P1-8: once an active dukjil policy has taken over (§11-B, §1 #13):
--  * every legacy fan_point earning path funnels through award_mobile_fan_activity and is switched off;
--    ticket (응모권) awards use award_fan_ticket_activity and are untouched.
--  * the old common attendance RPC is rejected (attendance moved to attend_creator).
-- Both guards are no-ops while no policy is active, so draft state changes nothing.
do $$
declare f record; definition text; guard text;
begin
  -- Kept on purpose (user decision 2026-11-05): the live participation keys and journey_completion / first_clip keep their
  -- old payout. live_reservation / live_attendance are covered by live_reserve / live_attend and stay switched off.
  guard := $g$begin if public.dukjil_policy_replaces_earning(pg_catalog.clock_timestamp())
    and not (p_action in ('journey_completion','first_clip')
      or (p_action not in ('live_reservation','live_attendance') and public.live_participation_source_mission(p_creator,p_action,p_scope) is not null))
    then return jsonb_build_object('status','not_eligible','asset','fan_point','amount',0,'policyVersion',null,'sourceId',null,'ledgerId',null); end if;$g$;
  select oid into strict f from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'award_mobile_fan_activity'
      and pg_get_function_identity_arguments(oid) = 'p_owner uuid, p_creator uuid, p_action text, p_scope text';
  definition := pg_get_functiondef(f.oid);
  execute regexp_replace(definition, '\mbegin\M', guard, 'i');

  select oid into strict f from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'check_in_owned_group_wallet';
  definition := pg_get_functiondef(f.oid);
  execute regexp_replace(definition, '\mbegin\M',
    $g$begin if public.dukjil_policy_replaces_earning(pg_catalog.clock_timestamp()) then raise exception 'DUKJIL_ATTENDANCE_MOVED' using errcode = 'P0001'; end if;$g$, 'i');

  -- attendance / early / first pay only the highest of live_attend and the key value: the old path also deducts what the
  -- dukjil live_attend action paid for the round, so the total is max(live_attend, key) in either order.
  select oid into strict f from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'live_participation_award';
  definition := pg_get_functiondef(f.oid);
  if position($o$and mission_key in('attendance','early','first')),0));end if;$o$ in definition) = 0 then
    raise exception 'LIVE_KEEP_PATCH_MISSING'; end if;
  execute replace(definition, $o$and mission_key in('attendance','early','first')),0));end if;$o$,
    $n$and mission_key in('attendance','early','first')),0)-coalesce((select sum(points)from public.dukjil_action_log where app_user_id=p_owner and action_key='live_attend' and source_key=l.id::text),0));end if;$n$);
end $$;

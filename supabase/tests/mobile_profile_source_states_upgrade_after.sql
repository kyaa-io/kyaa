do $$ declare
  snapshot record;
  presentation jsonb;
begin
  select * into strict snapshot from public.mobile_profile_source_states_upgrade_snapshot;

  if (select to_jsonb(activity) from public.fan_activities activity
      where activity.id=snapshot.activity_id) is distinct from snapshot.activity_row
    or (select to_jsonb(stamp) from public.stamps stamp
      where stamp.id=snapshot.stamp_id) is distinct from snapshot.stamp_row
    or (select to_jsonb(score) from public.fan_score_ledger score
      where score.activity_id=snapshot.activity_id) is distinct from snapshot.score_row then
    raise exception 'source-state upgrade changed an existing activity, stamp, or score row';
  end if;

  presentation:=public.read_owned_mobile_stamp_presentation(
    snapshot.owner_id,snapshot.stamp_id,'ko'
  );
  if presentation-'sourceState'-'liveSlug'-'eventId'-'favoriteSlug'
      is distinct from snapshot.presentation
    or presentation->>'sourceState'<>'available'
    or presentation->>'liveSlug'<>'profile-source-upgrade-live'
    or presentation->>'eventId'<>snapshot.live_id::text
    or presentation->>'favoriteSlug'<>'profile-source-upgrade' then
    raise exception 'source-state presentation upgrade mismatch: before %, after %',
      snapshot.presentation,presentation;
  end if;
end $$;

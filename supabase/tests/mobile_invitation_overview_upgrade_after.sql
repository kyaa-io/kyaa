do $$ declare snapshot record;overview jsonb;other_overview jsonb;entry jsonb; begin
  select * into strict snapshot from public.invitation_overview_upgrade_snapshot;
  overview:=public.get_community_stamp_invitation_overview(snapshot.inviter_id);
  if overview->>'registeredCount'<>'2'
    or overview->>'pendingCount'<>'1'
    or overview->>'qualifiedCount'<>'1'
    or jsonb_array_length(overview->'history')<>2 then
    raise exception 'invitation overview lost pending or qualified relationships: %',overview;
  end if;
  if not exists(select 1 from jsonb_array_elements(overview->'history') item
      where item->>'state'='pending_fan_verification')
    or not exists(select 1 from jsonb_array_elements(overview->'history') item
      where item->>'state'='qualified_reward_issued') then
    raise exception 'invitation overview states are incomplete: %',overview;
  end if;
  for entry in select value from jsonb_array_elements(overview->'history') loop
    if entry ?| array['inviteeAppUserId','nickname','email','phone','contact'] then
      raise exception 'invitation overview exposed private invitee data: %',entry;
    end if;
  end loop;
  if (select count(*) from public.community_stamps
      where app_user_id in(
        snapshot.inviter_id,
        '79000000-0000-4000-8000-000000000003'::uuid
      ) and kind='invite')<>snapshot.paid_stamp_count
    or (select count(*) from public.community_stamp_invitation_relations
      where inviter_app_user_id=snapshot.inviter_id)<>snapshot.relation_count then
    raise exception 'existing invitation relationships or paid Stamps changed during upgrade';
  end if;

  other_overview:=public.get_community_stamp_invitation_overview(snapshot.other_id);
  if other_overview->>'registeredCount'<>'0'
    or jsonb_array_length(other_overview->'history')<>0 then
    raise exception 'another owner received invitation history: %',other_overview;
  end if;
  if has_function_privilege('authenticated',
      'public.get_community_stamp_invitation_overview(uuid)','execute')
    or not has_function_privilege('service_role',
      'public.get_community_stamp_invitation_overview(uuid)','execute') then
    raise exception 'invitation overview RPC grant boundary is wrong';
  end if;
end $$;

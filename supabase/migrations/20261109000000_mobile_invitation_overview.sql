-- Owner-only invitation progress. History deliberately excludes invitee identity
-- and contact data; clients receive only relationship state and timestamps.
create function public.get_community_stamp_invitation_overview(p_app_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.app_users where id=p_app_user_id and status='active') then
    raise exception 'COMMUNITY_STAMP_NOT_FOUND' using errcode='P0002';
  end if;
  select jsonb_build_object(
    'registeredCount',count(*),
    'pendingCount',count(*) filter(where relation.status='pending'),
    'qualifiedCount',count(*) filter(where relation.status='qualified'),
    'history',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',recent.redemption_id,
        'state',case recent.status
          when 'pending' then 'pending_fan_verification'
          when 'qualified' then 'qualified_reward_issued'
          else 'registration_cancelled'
        end,
        'registeredAt',recent.registered_at,
        'resolvedAt',coalesce(recent.qualified_at,recent.cancelled_at)
      ) order by recent.registered_at desc,recent.redemption_id desc)
      from (
        select relation_row.*
        from public.community_stamp_invitation_relations relation_row
        where relation_row.inviter_app_user_id=p_app_user_id
        order by relation_row.registered_at desc,relation_row.redemption_id desc
        limit 100
      ) recent
    ),'[]'::jsonb)
  ) into result
  from public.community_stamp_invitation_relations relation
  where relation.inviter_app_user_id=p_app_user_id;
  return result;
end $$;

revoke all on function public.get_community_stamp_invitation_overview(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_community_stamp_invitation_overview(uuid)
  to service_role;

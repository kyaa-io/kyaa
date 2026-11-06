-- The wallet history named every 덕질 row "활동 참여" and left a point correction (-20 P after a deleted post) unnamed, because the row only
-- carried source_type/source_id. Read-only change: the history reader now also returns
--   actionKey         the dukjil activity of a 'dukjil_action' row (dukjil_action_log.action_key; 'checkin' when its source_id is the owner's
--                     group_creator_attendance row, which is how attend_creator posts a check-in grant), 'proof' for 'dukjil_proof',
--                     and for a 'dukjil_correction' row the activity it took points back from ('checkin' when the correction is
--                     linked to an attendance row instead of an action log)
--   correctionReason  'content_deleted' | 'content_hidden' for a content correction, 'other' for any other correction (stamp void text is never exposed)
-- Both are null for every other row (older rows keep their current name). No ledger row, amount or posting logic changes.
create or replace function public.read_owned_group_wallet_history(p_app_user_id uuid, p_limit integer default 30) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.group_wallet_lock(p_app_user_id, false);
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'GROUP_WALLET_INVALID'; end if;
  select jsonb_build_object('entries', coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id, 'asset', x.asset, 'amount', x.amount, 'sourceType', x.source_type, 'sourceId', x.source_id,
      'celebrityId', x.celebrity_id, 'createdAt', x.created_at,
      'actionKey', x.action_key, 'correctionReason', x.correction_reason) order by x.created_at desc, x.id), '[]')) into result
  from (
    select e.id, e.asset, e.amount, e.source_type, e.source_id, e.celebrity_id, e.created_at,
      case e.source_type
        when 'dukjil_action' then coalesce(l.action_key, case when a.id is not null then 'checkin' end)
        when 'dukjil_proof' then 'proof'
        when 'dukjil_correction' then case when c.attendance_id is not null then 'checkin' else cl.action_key end
      end as action_key,
      case when e.source_type = 'dukjil_correction'
        then case when c.void_reason in ('content_deleted', 'content_hidden') then c.void_reason else 'other' end
      end as correction_reason
    from (
      select * from (
        select id, asset, amount, source_type, source_id, celebrity_id, created_at from public.mobile_fan_economy_ledger
          where app_user_id = p_app_user_id and asset in ('fan_point', 'support_voucher')
        union all
        select id, 'ticket', amount, source_type, source_id, celebrity_id, created_at from public.fan_ticket_ledger where app_user_id = p_app_user_id
      ) all_entries order by created_at desc, id limit p_limit
    ) e
    left join public.dukjil_action_log l on e.source_type = 'dukjil_action' and l.id = e.source_id and l.app_user_id = p_app_user_id
    left join public.group_creator_attendance a on e.source_type = 'dukjil_action' and l.id is null and a.id = e.source_id and a.app_user_id = p_app_user_id
    left join public.dukjil_point_corrections c on e.source_type = 'dukjil_correction' and c.id = e.source_id and c.app_user_id = p_app_user_id
    left join public.dukjil_action_log cl on cl.id = c.action_log_id and cl.app_user_id = p_app_user_id
  ) x;
  return result;
end $$;
-- create or replace keeps the owner and the service_role-only grant from 20261201020000_group_wallet.sql; state it again so a fresh chain cannot drift.
revoke all on function public.read_owned_group_wallet_history(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.read_owned_group_wallet_history(uuid, integer) to service_role;

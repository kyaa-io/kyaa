-- Owner-scoped read of the point result for one just-created fan post or comment.
-- Read-only: one new service_role RPC plus one lookup index. It writes no ledger, decision or receipt row.
-- The award is made by the existing capture trigger inside the content transaction (posts: deferred constraint
-- trigger), so the route calls this after the write RPC returned. The v2 path and the v1 path (first post of a
-- creator that only has activity conversion) both record a receipt with the content id as source_id and the
-- ledger entry as point_ledger_id; the v1 path writes no decisions row, so receipts are the common source.
begin;
create index mobile_fan_economy_activity_receipts_owner_source_idx
  on public.mobile_fan_economy_activity_receipts(app_user_id,source_id);
create function public.read_owned_fan_post_reward(p_app_user_id uuid,p_source_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('amount',coalesce((
  select l.amount from public.mobile_fan_economy_activity_receipts r
  join public.mobile_fan_economy_ledger l on l.id=r.point_ledger_id
  where r.app_user_id=p_app_user_id and r.source_id=p_source_id and r.action_key='comment'
   and l.app_user_id=p_app_user_id and l.asset='fan_point' and l.amount>0
  limit 1),0));
$$;
revoke all on function public.read_owned_fan_post_reward(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_fan_post_reward(uuid,uuid) to service_role;
commit;

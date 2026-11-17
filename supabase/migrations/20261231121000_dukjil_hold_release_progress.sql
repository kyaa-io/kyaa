set local lock_timeout = '5s';
alter table public.community_stamps add column onchain_retry_after timestamptz;
create or replace function public.release_held_community_stamps(p_creator uuid default null, p_limit integer default 200)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid; v_celebrity uuid; v_kind public.community_stamp_kind; v_reason text; v_released integer := 0;
  v_msg text; v_state text;
begin
  if p_limit not between 1 and 2000 then raise exception 'COMMUNITY_STAMP_RELEASE_LIMIT'; end if;
  for v_id, v_user, v_celebrity, v_kind in
    select stamp.id, stamp.app_user_id, stamp.celebrity_id, stamp.kind from public.community_stamps stamp
      where stamp.onchain_hold_reason in ('CREATOR_NOT_VERIFIED','ROUTE_DISABLED','ENQUEUE_FAILED')
        and (p_creator is null or stamp.celebrity_id = p_creator)
        and public.community_stamp_onchain_hold_reason(stamp.app_user_id, stamp.celebrity_id, stamp.kind) is null
        and (stamp.onchain_retry_after is null or stamp.onchain_retry_after <= pg_catalog.clock_timestamp())
      -- wait instead of skip locked: a sweep that started before a registration committed must not hide a row from the
      -- registration's own release (found by the concurrency suite). Both paths lock in the same order.
      order by stamp.issued_at, stamp.id limit p_limit for update
  loop
    v_reason := public.community_stamp_onchain_hold_reason(v_user, v_celebrity, v_kind);
    if v_reason is not null then
      update public.community_stamps set onchain_hold_reason = v_reason where id = v_id and onchain_hold_reason is distinct from v_reason;
      continue;
    end if;
    begin
      perform public.community_stamp_enqueue_native(v_id);
      v_released := v_released + 1;
    exception when others then
      get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
      update public.community_stamps set onchain_retry_after = pg_catalog.clock_timestamp() + interval '5 minutes', onchain_hold_reason = 'ENQUEUE_FAILED', onchain_hold_detail = left(v_state || ' ' || v_msg, 300)
        where id = v_id;
    end;
  end loop;
  return v_released;
end $$;

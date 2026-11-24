-- Keep the first operator's evidence with the durable job through anonymization.
alter table public.account_deletion_requests
  add column requested_by_admin uuid,
  add column request_received_at timestamptz,
  add column request_channel text,
  add constraint account_deletion_admin_evidence check (
    (requested_by_admin is null and request_received_at is null and request_channel is null)
    or (requested_by_admin is not null and request_received_at is not null and request_channel is not null and request_channel = 'email')
  );

create function public.admin_member_withdrawal(
  p_actor uuid, p_allowlist uuid, p_member uuid, p_confirmation uuid,
  p_received_at timestamptz, p_channel text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  subject text;
  started jsonb;
  result jsonb;
begin
  perform public.assert_active_admin(p_actor,p_allowlist,true);
  if p_confirmation is not null then
    if p_member is distinct from p_confirmation or p_channel is distinct from 'email'
      or p_received_at is null or not isfinite(p_received_at) or p_received_at > now() then
      raise exception 'INVALID_REQUEST';
    end if;
    -- Acquire the shared entry point's first lock before checking for an existing job.
    perform 1 from public.runmusic_campaign for update;
    if not exists(select 1 from public.account_deletion_requests where app_user_id=p_member) then
      select privy_user_id into strict subject from public.app_users where id=p_member;
      started := public.chemi_begin_account_deletion(subject);
      if (started->>'appUserId')::uuid is distinct from p_member then
        raise exception 'TARGET_UNAVAILABLE';
      end if;
      update public.account_deletion_requests set requested_by_admin=p_actor,
        request_received_at=p_received_at, request_channel=p_channel where app_user_id=p_member;
    end if;
  end if;
  select jsonb_build_object('status',status,'completedAt',completed_at) into result
    from public.account_deletion_requests where app_user_id=p_member;
  return result;
end $$;
revoke all on function public.admin_member_withdrawal(uuid,uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.admin_member_withdrawal(uuid,uuid,uuid,uuid,timestamptz,text) to service_role;

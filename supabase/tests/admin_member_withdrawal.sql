begin;
do $$
declare
  member uuid := gen_random_uuid();
  actor uuid := gen_random_uuid();
  allow_id uuid := gen_random_uuid();
  subject text := 'did:privy:test-' || member;
  req jsonb;
  job jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email)
    values(member,subject,member||'@example.invalid'),(actor,'did:privy:test-'||actor,actor||'@example.invalid');
  insert into public.admin_allowlist(id,email,active,role) values(allow_id,actor||'@example.invalid',true,'viewer');
  begin
    perform public.admin_member_withdrawal(actor,allow_id,member,member,now(),'email');
    raise exception 'viewer accepted';
  exception when raise_exception then
    if sqlerrm <> 'viewer is read-only' then raise; end if;
  end;
  update public.admin_allowlist set role='admin' where id=allow_id;
  req := public.admin_member_withdrawal(actor,allow_id,member,member,now(),'email');
  if req->>'status' is distinct from 'pending' or
    public.admin_member_withdrawal(actor,allow_id,member,member,now()-interval '1 hour','email') is distinct from req
    then raise exception 'pending retry failed'; end if;
  if not exists(select 1 from public.account_deletion_requests where app_user_id=member and requested_by_admin=actor
    and request_channel='email' and request_received_at=now()) then raise exception 'missing original evidence'; end if;
  job := public.claim_account_deletion(member);
  perform public.finish_account_deletion_provider(member,(job->>'leaseToken')::uuid,'privy');
  if public.chemi_complete_account_deletion(member,(job->>'leaseToken')::uuid) is not true then raise exception 'completion failed'; end if;
  req := public.admin_member_withdrawal(actor,allow_id,member,member,now(),'email');
  if req->>'completedAt' is null or req->>'status' is distinct from 'completed' then raise exception 'completion lookup failed'; end if;
  begin
    perform public.sync_privy_identity(subject,member||'@example.invalid',1,null);
    raise exception 'login accepted';
  exception when insufficient_privilege then
    if sqlerrm <> 'ACCOUNT_DELETED' then raise; end if;
  end;
end $$;
rollback;

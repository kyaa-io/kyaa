-- Durable remote-revoke work also tombstones logged-out session keys until their original expiry.
create table public.cognito_remote_revocations (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  client_id text not null,
  encrypted_refresh_token text,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  completed_at timestamptz
);
alter table public.cognito_remote_revocations enable row level security;
revoke all on public.cognito_remote_revocations from public, anon, authenticated;

create function public.logout_cognito_browser_session(p_token_hash text, p_token_ids text[], p_client_id text, p_encrypted_refresh_token text, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('cognito-session:' || p_token_hash, 0));
  if not exists(select 1 from public.cognito_browser_sessions where token_hash=p_token_hash) then return; end if;
  if p_expires_at is null or p_expires_at <= now() or p_client_id is null or p_encrypted_refresh_token is null or length(p_client_id) not between 1 and 256
     or length(p_encrypted_refresh_token) not between 1 and 65536 then raise exception 'INVALID_LOGOUT'; end if;
  perform public.revoke_cognito_token_family(p_token_ids, p_expires_at + interval '1 day');
  insert into public.cognito_remote_revocations(token_hash,client_id,encrypted_refresh_token,expires_at)
    values(p_token_hash,p_client_id,p_encrypted_refresh_token,p_expires_at);
  delete from public.cognito_browser_sessions where token_hash=p_token_hash;
end;
$$;

create or replace function public.write_cognito_browser_session(p_token_hash text,p_encrypted_session text,p_expires_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('cognito-session:' || p_token_hash, 0));
  if exists(select 1 from public.cognito_remote_revocations where token_hash=p_token_hash) then
    raise exception 'COGNITO_SESSION_REVOKED' using errcode='55000';
  end if;
  insert into public.cognito_browser_sessions(token_hash,encrypted_session,expires_at) values(p_token_hash,p_encrypted_session,p_expires_at)
  on conflict(token_hash) do update set encrypted_session=excluded.encrypted_session,expires_at=excluded.expires_at
  where public.cognito_browser_sessions.expires_at>clock_timestamp();
  if not found then raise exception 'COGNITO_SESSION_REVOKED' using errcode='55000'; end if;
end;
$$;

create function public.pending_cognito_remote_revocations(p_client_id text)
returns table(token_hash text,encrypted_refresh_token text) language plpgsql security definer set search_path='' as $$
begin
  -- Expired refresh credentials no longer need a remote call; retain the key tombstone.
  update public.cognito_remote_revocations r set encrypted_refresh_token=null, last_error='expired'
    where r.expires_at<=now() and r.encrypted_refresh_token is not null;
  delete from public.cognito_remote_revocations r where r.expires_at < now() - interval '1 day';
  return query
    with picked as (
      select r.token_hash from public.cognito_remote_revocations r
      where r.client_id=p_client_id and r.encrypted_refresh_token is not null and r.next_attempt_at<=now()
      order by r.attempts,r.expires_at for update skip locked limit 5
    )
    update public.cognito_remote_revocations r set next_attempt_at=now()+interval '1 minute'
      from picked where r.token_hash=picked.token_hash
      returning r.token_hash,r.encrypted_refresh_token;
end;
$$;
create function public.finish_cognito_remote_revocation(p_token_hash text,p_error text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_error is not null and p_error !~ '^(http_[0-9]{3}|unavailable)$' then raise exception 'INVALID_REVOCATION_STATUS'; end if;
  update public.cognito_remote_revocations set attempts=attempts+1,last_error=p_error,
    encrypted_refresh_token=case when p_error is null then null else encrypted_refresh_token end,
    completed_at=case when p_error is null then now() else completed_at end
    where token_hash=p_token_hash and completed_at is null;
end;
$$;
revoke all on function public.logout_cognito_browser_session(text,text[],text,text,timestamptz),public.pending_cognito_remote_revocations(text),public.finish_cognito_remote_revocation(text,text) from public,anon,authenticated;
grant execute on function public.logout_cognito_browser_session(text,text[],text,text,timestamptz),public.pending_cognito_remote_revocations(text),public.finish_cognito_remote_revocation(text,text) to service_role;

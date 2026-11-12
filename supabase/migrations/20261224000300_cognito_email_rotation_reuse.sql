-- Reuse the committed encrypted response for overlapping requests holding the same refresh handle.
create table public.cognito_email_rotation_results (
  previous_refresh_hash text primary key,
  session_id uuid not null references public.cognito_email_sessions(id) on delete cascade,
  encrypted_result text not null,
  expires_at timestamptz not null default clock_timestamp()+interval '60 seconds'
);
alter table public.cognito_email_rotation_results enable row level security;
revoke all on public.cognito_email_rotation_results from public,anon,authenticated,service_role;
create function public.read_cognito_email_rotation(p_previous_refresh_hash text)
returns text language sql security definer set search_path='' as $$
  select r.encrypted_result from public.cognito_email_rotation_results r
  join public.cognito_email_sessions s on s.id=r.session_id
  where r.previous_refresh_hash=p_previous_refresh_hash and r.expires_at>clock_timestamp()
    and s.revoked_at is null and s.expires_at>clock_timestamp();
$$;
create function public.rotate_cognito_email_session(p_session_id uuid,p_legacy_user_id uuid,p_encrypted_session text,p_refresh_hash text,p_expires_at timestamptz,p_previous_refresh_hash text,p_encrypted_result text)
returns text language plpgsql security definer set search_path='' as $$
declare cached text;
begin
  if p_previous_refresh_hash is null then raise exception 'INVALID_EMAIL_REFRESH'; end if;
  perform pg_advisory_xact_lock(hashtextextended('email-refresh:'||p_previous_refresh_hash,0));
  cached:=public.read_cognito_email_rotation(p_previous_refresh_hash);
  if cached is not null then return cached; end if;
  perform public.write_cognito_email_session(p_session_id,p_legacy_user_id,p_encrypted_session,p_refresh_hash,p_expires_at,p_previous_refresh_hash);
  delete from public.cognito_email_rotation_results where expires_at<=clock_timestamp();
  insert into public.cognito_email_rotation_results(previous_refresh_hash,session_id,encrypted_result)
    values(p_previous_refresh_hash,p_session_id,p_encrypted_result);
  return p_encrypted_result;
end;
$$;
revoke all on function public.read_cognito_email_rotation(text),public.rotate_cognito_email_session(uuid,uuid,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.read_cognito_email_rotation(text),public.rotate_cognito_email_session(uuid,uuid,text,text,timestamptz,text,text) to service_role;

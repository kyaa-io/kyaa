-- Headless OAuth requires explicit wallet creation, only for a verified new enrollment.
create function public.cognito_initial_wallet_allowed(p_token_hash text,p_issuer text,p_subject text,p_provider_issuer text,p_provider_subject text,p_verified_email text,p_privy_user_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_privy_user_id like 'did:privy:%'
  and exists(select 1 from public.cognito_enrollment_permits p where p.token_hash=p_token_hash
    and p.issuer=p_issuer and p.subject=p_subject and p.provider_issuer=p_provider_issuer and p.provider_subject=p_provider_subject
    and p.verified_email=lower(trim(p_verified_email)) and p.expires_at>now() and p.consumed_at is null
    and p.reserved_privy_user_id is null and p.reserved_wallet_address is null and p.reserved_chain_id is null)
  and public.classify_cognito_enrollment(p_provider_issuer,p_provider_subject,p_verified_email)->>'mode'='new'
  and not exists(select 1 from public.app_users where privy_user_id=p_privy_user_id)
  and not exists(select 1 from public.legacy_auth_inventory_unowned where privy_user_id=p_privy_user_id)
  and not exists(select 1 from public.external_auth_identities where issuer=p_issuer and subject=p_subject)
  and not exists(select 1 from public.external_auth_pending where issuer=p_issuer and subject=p_subject)
  and not exists(select 1 from public.cognito_enrollment_permits where (issuer=p_issuer and subject=p_subject or reserved_privy_user_id=p_privy_user_id) and reserved_wallet_address is not null);
$$;
revoke all on function public.cognito_initial_wallet_allowed(text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.cognito_initial_wallet_allowed(text,text,text,text,text,text,text) to service_role;
notify pgrst,'reload schema';

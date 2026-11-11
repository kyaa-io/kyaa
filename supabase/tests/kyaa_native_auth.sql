-- PRIVY-EXIT-0005: Cognito sign-in without Privy. Runs in one transaction and rolls back.
begin;
create function pg_temp.kyaa_assert(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
do $$
declare
  suffix text:=extensions.gen_random_uuid()::text;
  issuer text:='https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_kyaafixture';
  google text:='https://accounts.google.com';
  legacy_wallet text:='0x'||substr(md5(suffix)||md5(suffix||'w'),1,40);
  new_wallet text:='0x'||substr(md5(suffix||'n')||md5(suffix||'m'),1,40);
  legacy_id uuid; result jsonb; member jsonb; synced uuid;
begin
  -- Existing Privy member whose Google subject was recorded by a Privy session sync.
  select app_user_id into legacy_id from public.sync_privy_identity_with_provider_accounts('did:privy:legacy-'||suffix,'legacy-'||suffix||'@example.test',91342,legacy_wallet,
    jsonb_build_array(jsonb_build_object('issuer',google,'subject','g-legacy-'||suffix)));

  result:=public.kyaa_sign_in(issuer,'c-legacy-'||suffix,google,'g-legacy-'||suffix,'legacy-'||suffix||'@example.test',91342);
  perform pg_temp.kyaa_assert(result->>'mode'='linked' and (result->>'appUserId')::uuid=legacy_id,'existing member links by provider subject');
  member:=public.resolve_kyaa_identity(issuer,'c-legacy-'||suffix,91342);
  perform pg_temp.kyaa_assert(member->>'identityKey'='did:privy:legacy-'||suffix and member->>'walletAddress'=legacy_wallet,'existing DID and Privy wallet are kept');

  -- Same email, different Google subject: never merged.
  result:=public.kyaa_sign_in(issuer,'c-other-'||suffix,google,'g-other-'||suffix,'legacy-'||suffix||'@example.test',91342);
  perform pg_temp.kyaa_assert(result->>'mode'='blocked' and result->>'reason'='email_in_use','email alone never links');

  -- New member with a server-issued wallet.
  result:=public.kyaa_sign_in(issuer,'c-new-'||suffix,google,'g-new-'||suffix,'new-'||suffix||'@example.test',91342);
  perform pg_temp.kyaa_assert(result->>'mode'='new' and (result->>'derivationIndex')::bigint>=0,'unknown member is new');
  member:=public.create_kyaa_member(issuer,'c-new-'||suffix,google,'g-new-'||suffix,'new-'||suffix||'@example.test',91342,(result->>'derivationIndex')::bigint,new_wallet);
  perform pg_temp.kyaa_assert(member->>'identityKey' like 'kyaa:%' and member->>'walletAddress'=new_wallet,'new member gets kyaa key and issued address');
  perform pg_temp.kyaa_assert(exists(select 1 from public.kyaa_wallet_derivations where address=new_wallet and app_user_id=(member->>'appUserId')::uuid),'issued wallet is recorded with its derivation index');
  perform pg_temp.kyaa_assert(public.kyaa_sign_in(issuer,'c-new-'||suffix,google,'g-new-'||suffix,'new-'||suffix||'@example.test',91342)->>'mode'='linked','returning new member links');
  -- Session sync accepts the kyaa key and keeps the same member and wallet.
  select app_user_id into synced from public.sync_privy_identity_with_provider_accounts(member->>'identityKey','new-'||suffix||'@example.test',91342,new_wallet,
    jsonb_build_array(jsonb_build_object('issuer',google,'subject','g-new-'||suffix)));
  perform pg_temp.kyaa_assert(synced=(member->>'appUserId')::uuid,'session sync keeps the kyaa member');

  -- Kakao (Cognito OIDC) creates a member and links again by its subject.
  result:=public.kyaa_sign_in(issuer,'c-kakao-'||suffix,'https://kauth.kakao.com','k-'||suffix,'kakao-'||suffix||'@example.test',91342);
  perform pg_temp.kyaa_assert(result->>'mode'='new','unknown Kakao member is new');
  member:=public.create_kyaa_member(issuer,'c-kakao-'||suffix,'https://kauth.kakao.com','k-'||suffix,'kakao-'||suffix||'@example.test',91342,(result->>'derivationIndex')::bigint,'0x'||substr(md5(suffix||'k')||md5(suffix||'l'),1,40));
  perform pg_temp.kyaa_assert(member->'providerAccounts'@>jsonb_build_array(jsonb_build_object('issuer','https://kauth.kakao.com','subject','k-'||suffix)),'Kakao subject recorded');
  perform pg_temp.kyaa_assert(public.kyaa_sign_in(issuer,'c-kakao-'||suffix,'https://kauth.kakao.com','k-'||suffix,'kakao-'||suffix||'@example.test',91342)->>'mode'='linked','Kakao member links again');

  -- Rollback to a Privy build: the kyaa: member signs in through Privy with the same Google subject and email and keeps
  -- the same member, records and wallet; the new DID is adopted once and logged.
  select app_user_id into synced from public.sync_privy_identity_with_provider_accounts('did:privy:rollback-'||suffix,'new-'||suffix||'@example.test',91342,
    '0x'||substr(md5(suffix||'p')||md5(suffix||'q'),1,40),jsonb_build_array(jsonb_build_object('issuer',google,'subject','g-new-'||suffix)));
  perform pg_temp.kyaa_assert(synced=(select id from public.app_users where verified_email='new-'||suffix||'@example.test'),'rollback Privy sign-in keeps the same member');
  perform pg_temp.kyaa_assert((select privy_user_id from public.app_users where id=synced)='did:privy:rollback-'||suffix,'identity key adopted');
  perform pg_temp.kyaa_assert((select address from public.user_wallets where app_user_id=synced and chain_id=91342)=new_wallet,'current wallet kept, Privy wallet not attached');
  perform pg_temp.kyaa_assert(exists(select 1 from public.kyaa_member_privy_adoptions where app_user_id=synced and from_identity_key like 'kyaa:%'),'adoption logged');
  perform pg_temp.kyaa_assert(public.resolve_kyaa_identity(issuer,'c-new-'||suffix,91342)->>'identityKey'='did:privy:rollback-'||suffix,'Cognito sign-in still resolves the same member after adoption');
  -- A second Privy DID for the same (now did:privy) member is not adopted again.
  begin
    perform public.sync_privy_identity_with_provider_accounts('did:privy:second-'||suffix,'new-'||suffix||'@example.test',91342,
      '0x'||substr(md5(suffix||'r')||md5(suffix||'s'),1,40),jsonb_build_array(jsonb_build_object('issuer',google,'subject','g-new-'||suffix)));
    raise exception 'second DID adopted';
  exception when others then if sqlerrm not in ('VERIFIED_PROVIDER_OWNER_CONFLICT','wallet already linked') then raise; end if; end;
  -- Same Google subject but a different verified email: never adopted.
  result:=public.kyaa_sign_in(issuer,'c-third-'||suffix,google,'g-third-'||suffix,'third-'||suffix||'@example.test',91342);
  perform public.create_kyaa_member(issuer,'c-third-'||suffix,google,'g-third-'||suffix,'third-'||suffix||'@example.test',91342,(result->>'derivationIndex')::bigint,'0x'||substr(md5(suffix||'v')||md5(suffix||'w'),1,40));
  begin
    perform public.sync_privy_identity_with_provider_accounts('did:privy:third-'||suffix,'other-'||suffix||'@example.test',91342,
      '0x'||substr(md5(suffix||'x')||md5(suffix||'y'),1,40),jsonb_build_array(jsonb_build_object('issuer',google,'subject','g-third-'||suffix)));
    raise exception 'different email adopted';
  exception when others then if sqlerrm<>'VERIFIED_PROVIDER_OWNER_CONFLICT' then raise; end if; end;
  perform pg_temp.kyaa_assert((select privy_user_id from public.app_users where verified_email='third-'||suffix||'@example.test') like 'kyaa:%','different email keeps the kyaa key');

  -- Logout revokes the token family: an access token issued before logout no longer resolves; another sign-in does.
  perform pg_temp.kyaa_assert(public.resolve_kyaa_identity(issuer,'c-new-'||suffix,91342,array['origin-'||suffix,'jti-'||suffix]) is not null,'live token family resolves');
  perform public.revoke_cognito_token_family(array['origin-'||suffix,'jti-'||suffix], now()+interval '1 day');
  perform pg_temp.kyaa_assert(public.resolve_kyaa_identity(issuer,'c-new-'||suffix,91342,array['origin-'||suffix,'jti-later-'||suffix]) is null,'refreshed token of a logged-out family is refused');
  perform pg_temp.kyaa_assert(public.resolve_kyaa_identity(issuer,'c-new-'||suffix,91342,array['jti-'||suffix]) is null,'the exact logged-out token is refused');
  perform pg_temp.kyaa_assert(public.resolve_kyaa_identity(issuer,'c-new-'||suffix,91342,array['origin-other-'||suffix,'jti-other-'||suffix]) is not null,'a new sign-in of the same member still works');

  -- Kakao kyaa: member: a Privy sign-in with a matching email but no matching Google/Apple subject is not adopted.
  begin
    perform public.sync_privy_identity_with_provider_accounts('did:privy:kakao-'||suffix,'kakao-'||suffix||'@example.test',91342,
      '0x'||substr(md5(suffix||'t')||md5(suffix||'u'),1,40),jsonb_build_array(jsonb_build_object('issuer',google,'subject','g-unrelated-'||suffix)));
  exception when others then null; end;
  perform pg_temp.kyaa_assert((select u.privy_user_id from public.external_auth_identities i join public.app_users u on u.id=i.app_user_id where i.subject='c-kakao-'||suffix) like 'kyaa:%','email alone never adopts');

  -- Inactive member is refused.
  update public.app_users set status='disabled' where id=legacy_id;
  perform pg_temp.kyaa_assert(public.kyaa_sign_in(issuer,'c-legacy-'||suffix,google,'g-legacy-'||suffix,'legacy-'||suffix||'@example.test',91342)->>'reason'='inactive','disabled member is blocked');
  perform pg_temp.kyaa_assert(public.resolve_kyaa_identity(issuer,'c-legacy-'||suffix,91342) is null,'disabled member does not resolve');

  -- A provider subject already owned cannot create a second member.
  begin
    perform public.create_kyaa_member(issuer,'c-dup-'||suffix,google,'g-new-'||suffix,'dup-'||suffix||'@example.test',91342,2147483000,'0x'||substr(md5(suffix||'d')||md5(suffix||'e'),1,40));
    raise exception 'duplicate provider subject created a member';
  exception when others then
    if sqlerrm<>'IDENTITY_LINK_CONFLICT' then raise; end if;
  end;
end $$;
rollback;

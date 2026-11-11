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

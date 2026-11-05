-- PASSPORT-RENEWAL P1-4: dukjil wallet sources, stamp revocation columns, stamp index (§11-A, R12).
-- group_wallet_post: only the source whitelist grows (patched from the live definition); asset whitelist and body are unchanged.
do $$declare definition text;begin
 -- Patch the live definition (like 20261201040000 did) so every source added earlier in the chain stays allowed.
 select pg_get_functiondef(oid)into strict definition from pg_proc where pronamespace='public'::regnamespace and proname='group_wallet_post';
 if position('''group_support'''in definition)=0 or position('''group_mission'''in definition)=0 then raise exception 'DUKJIL_WALLET_CONTRACT_CHANGED';end if;
 execute replace(definition,'''group_support''','''group_support'',''dukjil_action'',''dukjil_streak'',''dukjil_proof'',''dukjil_correction''');
end $$;

alter table public.community_stamps
  add column revoked_at timestamptz,
  add column revoked_reason text,
  add column policy_version integer;
alter table public.community_stamps add constraint community_stamps_revoked_pair
  check ((revoked_at is null) = (revoked_reason is null));

-- share and subscription become repeatable per day / per platform; source_once keeps them unique per key.
-- FIX3 item 4: a policy invite stamp records the creator (page where the friend passed the screening) so mission-book slot 6
-- can link to it. Legacy invite stamps (policy_version null) and welcome stamps stay creator-less.
alter table public.community_stamps drop constraint community_stamps_scope;
alter table public.community_stamps add constraint community_stamps_scope
  check ((kind = 'welcome' and celebrity_id is null)
    or (kind = 'invite' and (celebrity_id is null or policy_version is not null))
    or (kind not in ('welcome','invite') and celebrity_id is not null));

drop index public.community_stamps_creator_kind_once;
create unique index community_stamps_creator_kind_once
  on public.community_stamps(app_user_id,celebrity_id,kind)
  where kind in ('first_comment','support') or (kind in ('subscription','share') and policy_version is null);
create index community_stamps_creator_day_idx
  on public.community_stamps(app_user_id,celebrity_id,kind,issued_at);

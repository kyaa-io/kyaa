-- DUKJIL-POLICY ④ x B3: how the Instagram repost path (kind 'insta_repost', its own mission) meets the share path's "one post, one member".
-- The original decision is about the share slot, so this file records what the database does today and asserts it; it changes nothing.
--   share held by A  -> repost of the same post by B: ACCEPTED as a pending repost (not blocked; the review queue shows duplicateCount 1)
--   repost held by A -> share of the same post by B: refused with SHARE_PROOF_URL_REUSED
--   same member, either direction: answered as a closed duplicate (B3, unchanged)
-- Disposable clean-chain DB only; everything rolls back.
\set ON_ERROR_STOP on
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required'; end if; end $$;
begin;
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('b',64),rewards_start_on=current_date;
update public.reward_policy_activation set policy_version = 3 where singleton;
update public.dukjil_policy_versions set status='active',effective_from=now()-interval '2 hours',activated_at=now() where version=1 and status='draft';
update public.dukjil_policy_versions set status='active',effective_from=now()-interval '1 hour',activated_at=now() where version=2 and status='draft';
do $$
declare
  c uuid := 'b3f00000-0000-4000-8000-000000000001'; adm uuid := 'b3f00000-0000-4000-8000-000000000010'; al uuid := 'b3f00000-0000-4000-8000-000000000020';
  ua uuid := 'b3f00000-0000-4000-8000-000000000011'; ub uuid := 'b3f00000-0000-4000-8000-000000000012'; u uuid; j uuid; p uuid; r jsonb; q jsonb;
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c,'b3-cross','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c,'ko','b3','b3','b3'),(c,'en','b3','b3','b3');
  update public.celebrities set status='published' where id=c;
  insert into public.app_users(id,privy_user_id,verified_email,status) values(adm,'did:privy:b3f-adm','b3f-adm@byus.test','active');
  insert into public.admin_allowlist(id,email,role,active) values(al,'b3f-adm@byus.test','admin',true);
  foreach u in array array[ua, ub] loop
    insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:b3f-'||u,'b3f-'||u||'@byus.test','active');
    insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(u,91342,'0xbfbfbfbfbfbfbfbfbfbfbfbfbfbfbfbfbfbf00'||right(u::text,2),'privy','embedded');
    j := gen_random_uuid(); p := gen_random_uuid();
    set local session_replication_role = replica;
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'passport',p,'b3f-pass-'||p,1,jsonb_build_object('recipient','0xbfbfbfbfbfbfbfbfbfbfbfbfbfbfbfbfbfbf0010','celebritySlug','b3-cross','passportId','0x'||repeat('1',64)));
    insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,gen_random_uuid(),j);
    set local session_replication_role = origin;
  end loop;

  -- share held by A, repost by B
  r := public.submit_fan_share_proof(ua, c, 'instagram', 'https://www.instagram.com/p/CrossPath01/', 'instagram:CrossPath01', true);
  q := public.submit_fan_insta_repost(ub, c, 'feed', 'https://www.instagram.com/p/CrossPath01/', 'instagram:CrossPath01', null, true);
  if q->>'status' <> 'pending' or (q->>'duplicate')::boolean then raise exception 'repost of a held share post: %', q; end if;
  if (select (x->>'duplicateCount')::int from jsonb_array_elements(public.read_insta_repost_review_queue(adm, al, c, 'pending', null, 50)->'items') x where x->>'id' = q->>'id') <> 1 then
    raise exception 'review queue does not mark the held post';
  end if;
  -- same member, other direction: closed duplicate
  q := public.submit_fan_insta_repost(ua, c, 'feed', 'https://www.instagram.com/p/CrossPath01/', 'instagram:CrossPath01', null, true);
  if not (q->>'duplicate')::boolean then raise exception 'same member repost of own share: %', q; end if;

  -- repost held by A, share by B
  q := public.submit_fan_insta_repost(ua, c, 'feed', 'https://www.instagram.com/p/CrossPath02/', 'instagram:CrossPath02', null, true);
  begin perform public.submit_fan_share_proof(ub, c, 'instagram', 'https://www.instagram.com/p/CrossPath02/', 'instagram:CrossPath02', true); raise exception 'share of a held repost accepted';
  exception when others then if sqlerrm <> 'SHARE_PROOF_URL_REUSED' then raise; end if; end;
  r := public.submit_fan_share_proof(ua, c, 'instagram', 'https://www.instagram.com/p/CrossPath02/', 'instagram:CrossPath02', true);
  if not (r->>'duplicate')::boolean then raise exception 'same member share of own repost: %', r; end if;
  raise notice 'share_tag_cross_path ok (repost of a held share post is not blocked)';
end $$;
rollback;

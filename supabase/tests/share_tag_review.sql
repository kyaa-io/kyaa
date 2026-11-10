-- Local disposable-database contract test for 20261221140000_share_tag_review. Every change rolls back.
-- Needs two active passport holders of one creator, an active non-viewer admin, and the active dukjil policy with a 'share' rule.
\set ON_ERROR_STOP on
begin;

do $$
declare
  fp record; other record; adm record; r jsonb; v_id uuid; legacy uuid; award jsonb; before_log integer; k text := 'x:1850000000000000777';
begin
  select p.app_user_id, p.celebrity_id into fp from public.fan_passports p join public.app_users u on u.id = p.app_user_id and u.status = 'active'
    where exists (select 1 from public.user_wallets w where w.app_user_id = p.app_user_id)
      and not exists (select 1 from public.dukjil_action_log d where d.app_user_id = p.app_user_id and d.action_key = 'share' and d.created_at > now() - interval '1 day')
    order by p.issued_at desc limit 1;
  select u.id into other from public.app_users u join public.fan_passports p on p.app_user_id = u.id
    where u.status = 'active' and u.id <> fp.app_user_id and p.celebrity_id = fp.celebrity_id limit 1;
  select a.id allowlist, u.id actor into adm from public.admin_allowlist a join public.app_users u on u.verified_email = a.email and u.status = 'active'
    where a.active and a.role <> 'viewer' limit 1;
  if fp.app_user_id is null or other.id is null or adm.actor is null then raise exception 'Fixture: two passport holders of one creator and an admin'; end if;

  -- 1. A submission is pending and pays nothing.
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/fan/status/1850000000000000777', k, true);
  v_id := (r->>'id')::uuid;
  if r->>'status' <> 'pending' or (r->>'replayed')::boolean or r->'points' <> 'null'::jsonb then raise exception 'First submit: %', r; end if;
  if exists (select 1 from public.dukjil_action_log where source_key = 'share-proof:' || v_id::text) then raise exception 'Submit paid before the review'; end if;
  begin perform public.pay_fan_share_proof(fp.app_user_id, v_id, extensions.gen_random_uuid(), '{}'::jsonb); raise exception 'Pending proof paid';
  exception when others then if sqlerrm <> 'SHARE_PROOF_REVOKED' then raise; end if; end;
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/fan/status/1850000000000000777', k, true);
  if not (r->>'replayed')::boolean or r->>'status' <> 'pending' or (r->>'id')::uuid <> v_id then raise exception 'Same member, same post: %', r; end if;
  if (select x->>'status' from jsonb_array_elements(public.list_fan_share_proofs(fp.app_user_id, fp.celebrity_id)->'items') x where x->>'id' = v_id::text) <> 'pending' then raise exception 'Pending proof not listed'; end if;

  -- 2. Another member cannot reuse the address, however it was written; another post is fine.
  begin perform public.submit_fan_share_proof(other.id, fp.celebrity_id, 'x', 'https://twitter.com/Other/status/1850000000000000777', k, true); raise exception 'Reused post accepted';
  exception when others then if sqlerrm <> 'SHARE_PROOF_URL_REUSED' then raise; end if; end;
  perform public.submit_fan_share_proof(other.id, fp.celebrity_id, 'x', 'https://x.com/fan/status/1850000000000000778', 'x:1850000000000000778', true);

  -- 3. Only an operator reviews; a stale revision and a missing reject code are refused.
  begin perform public.review_fan_share_proof(other.id, adm.allowlist, v_id, 0, 'accept', null, array['instagram','x']); raise exception 'Non-operator reviewed';
  exception when others then if sqlerrm <> 'ADMIN_REQUIRED' then raise; end if; end;
  begin perform public.review_fan_share_proof(adm.actor, adm.allowlist, v_id, 5, 'accept', null, array['instagram','x']); raise exception 'Stale revision reviewed';
  exception when others then if sqlerrm <> 'REVIEW_STALE' then raise; end if; end;
  begin perform public.review_fan_share_proof(adm.actor, adm.allowlist, v_id, 0, 'reject', null, array['instagram','x']); raise exception 'Rejected without a code';
  exception when others then if sqlerrm <> 'REVIEW_INVALID' then raise; end if; end;

  -- A post on a network whose official account is not known cannot be accepted and stays pending.
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'tiktok', 'https://www.tiktok.com/@fan/video/7430000000000000777', 'tiktok:7430000000000000777', true);
  begin perform public.review_fan_share_proof(adm.actor, adm.allowlist, (r->>'id')::uuid, 0, 'accept', null, array['instagram','x']); raise exception 'Unconfirmed network accepted';
  exception when others then if sqlerrm <> 'SHARE_TAG_HANDLE_UNCONFIRMED' then raise; end if; end;
  if (select status from public.fan_share_proofs where id = (r->>'id')::uuid) <> 'pending' then raise exception 'Unconfirmed network left pending state'; end if;

  -- 4. Rejected for the missing tag: nothing paid, the address is free for others, the member can fix the post and send it again.
  r := public.review_fan_share_proof(adm.actor, adm.allowlist, v_id, 0, 'reject', 'no_hashtag', array['instagram','x']);
  if r->>'status' <> 'rejected' then raise exception 'Reject: %', r; end if;
  if exists (select 1 from public.dukjil_action_log where source_key = 'share-proof:' || v_id::text) then raise exception 'Reject paid'; end if;
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/fan/status/1850000000000000777', k, true);
  if r->>'status' <> 'pending' or (r->>'id')::uuid <> v_id or (r->>'replayed')::boolean then raise exception 'Fixed post not reopened: %', r; end if;
  if (select review_revision from public.fan_share_proofs where id = v_id) <> 1 then raise exception 'Revision not advanced'; end if;
  -- a duplicate rejection is final for that member
  r := public.review_fan_share_proof(adm.actor, adm.allowlist, v_id, 1, 'reject', 'duplicate', array['instagram','x']);
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/fan/status/1850000000000000777', k, true);
  if r->>'status' <> 'rejected' or not (r->>'replayed')::boolean then raise exception 'Duplicate rejection reopened: %', r; end if;
  -- after a rejection another member may hold the address
  r := public.submit_fan_share_proof(other.id, fp.celebrity_id, 'x', 'https://x.com/fan/status/1850000000000000777', k, true);
  if r->>'status' <> 'pending' then raise exception 'Another member could not take the freed address: %', r; end if;
  legacy := (r->>'id')::uuid;

  -- 5. Accept: the proof is accepted but nothing is paid until the locked payout runs; accepting again answers a replay while unpaid.
  r := public.review_fan_share_proof(adm.actor, adm.allowlist, legacy, 0, 'accept', null, array['instagram','x']);
  if r->>'status' <> 'accepted' or (r->>'replayed')::boolean or r->>'appUserId' <> other.id::text or r->>'platform' <> 'x' or coalesce(r->>'creatorSlug', '') = '' then raise exception 'Accept: %', r; end if;
  select count(*) into before_log from public.dukjil_action_log where source_key = 'share-proof:' || legacy::text;
  if before_log <> 0 then raise exception 'Accept paid by itself'; end if;
  r := public.review_fan_share_proof(adm.actor, adm.allowlist, legacy, 0, 'accept', null, array['instagram','x']);
  if not (r->>'replayed')::boolean then raise exception 'Unpaid accept not replayed: %', r; end if;
  begin award := public.pay_fan_share_proof(other.id, legacy, extensions.gen_random_uuid(), '{}'::jsonb);
    if (select points from public.fan_share_proofs where id = legacy) is distinct from coalesce((award->>'points')::int, 0) then raise exception 'Payout did not keep the amount'; end if;
  exception when others then if sqlerrm !~ 'DUKJIL_DAILY_LIMIT' then raise; end if; end;

  -- 6. A proof written before this migration (accepted, paid) keeps its shape; the admin list answers the review fields.
  insert into public.fan_share_proofs (app_user_id, celebrity_id, platform, url, url_key, own_post_confirmed, status, points)
    values (fp.app_user_id, fp.celebrity_id, 'youtube', 'https://youtu.be/dQw4w9WgXcQ', 'youtube:dQw4w9WgXcQ', true, 'accepted', 10);
  r := public.read_admin_share_proofs(adm.actor, adm.allowlist, 'pending', null, 100);
  if exists (select 1 from jsonb_array_elements(r->'items') x where x->>'status' <> 'pending') or not (r->'items'->0 ? 'revision') or not (r->'items'->0 ? 'rejectCode') then
    raise exception 'Admin list: %', r;
  end if;
  raise notice 'share_tag_review contract ok';
end $$;

rollback;

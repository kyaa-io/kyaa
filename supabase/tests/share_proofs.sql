-- Local disposable-database contract test for 20261215070000_share_proofs. Every change rolls back.
-- Needs two active passport holders of one creator, an active non-viewer admin, and the active dukjil policy with a 'share' rule.
\set ON_ERROR_STOP on
begin;

do $$
declare
  fp record; other record; adm record; r jsonb; v_id uuid; v_other uuid; link record; before_opens integer; before_visits integer;
  award jsonb; bal_before bigint; bal_paid bigint; bal_after bigint; corrections integer;
begin
  -- Nothing outside the functions reaches the tables; the server reaches only its five functions.
  if has_table_privilege('service_role', 'public.fan_share_proofs', 'SELECT') or has_table_privilege('authenticated', 'public.fan_share_link_opens', 'SELECT')
   or has_table_privilege('anon', 'public.fan_share_settings', 'SELECT')
   or has_function_privilege('anon', 'public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 'EXECUTE')
   or has_function_privilege('authenticated', 'public.revoke_fan_share_proof(uuid,uuid,uuid,text)', 'EXECUTE')
   or has_function_privilege('service_role', 'public.dukjil_correct_share_grant(uuid,uuid,text)', 'EXECUTE')
   or has_function_privilege('service_role', 'public.share_visit_payouts_enabled()', 'EXECUTE')
   or not has_function_privilege('service_role', 'public.revoke_fan_share_proof(uuid,uuid,uuid,text)', 'EXECUTE') then
    raise exception 'Share proofs exposed or not callable by the server';
  end if;

  select p.app_user_id, p.celebrity_id into fp from public.fan_passports p join public.app_users u on u.id = p.app_user_id and u.status = 'active'
    where exists (select 1 from public.user_wallets w where w.app_user_id = p.app_user_id)
      -- today's share cap still open, so the fixture payout lands
      and not exists (select 1 from public.dukjil_action_log d where d.app_user_id = p.app_user_id and d.action_key = 'share' and d.created_at > now() - interval '1 day')
    order by p.issued_at desc limit 1;
  select u.id into other from public.app_users u join public.fan_passports p on p.app_user_id = u.id
    where u.status = 'active' and u.id <> fp.app_user_id and p.celebrity_id = fp.celebrity_id limit 1;
  select a.id allowlist, u.id actor into adm from public.admin_allowlist a join public.app_users u on u.verified_email = a.email and u.status = 'active'
    where a.active and a.role <> 'viewer' limit 1;
  if fp.app_user_id is null or other.id is null or adm.actor is null then raise exception 'Fixture: two passport holders of one creator and an admin'; end if;

  -- 1. Opening a share link does not pay: the opening is kept, the paying visit row is not written.
  select l.* into link from public.community_stamp_share_links l join public.fan_passports p on p.id = l.fan_passport_id
    where l.owner_app_user_id <> other.id and p.celebrity_id = l.celebrity_id limit 1;
  if link.id is not null and not exists (select 1 from public.fan_share_link_opens o where o.share_link_id = link.id and o.visitor_app_user_id = other.id) then
    select count(*) into before_visits from public.community_stamp_share_visits;
    select count(*) into before_opens from public.fan_share_link_opens;
    perform public.visit_community_stamp_share_link(other.id, link.token);
    if (select count(*) from public.community_stamp_share_visits) <> before_visits then raise exception 'Opening wrote a paying visit row'; end if;
    -- The sender may lack a wallet or passport, in which case the visit function returns before either table; only count when it recorded.
    if (select count(*) from public.fan_share_link_opens) not in (before_opens, before_opens + 1) then raise exception 'Opening recorded twice'; end if;
  else
    raise notice 'no share link fixture for the visit check';
  end if;
  if public.share_visit_payouts_enabled() then raise exception 'Visit payouts are on by default'; end if;

  -- 2. One member, one post; the own-post confirmation is required; another member may submit the same post.
  begin
    perform public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/fan/status/1850000000000000099', 'x:1850000000000000099', false);
    raise exception 'Accepted without the own-post confirmation';
  exception when others then if sqlerrm <> 'SHARE_PROOF_OWN_POST_REQUIRED' then raise; end if; end;
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/fan/status/1850000000000000099', 'x:1850000000000000099', true);
  v_id := (r->>'id')::uuid;
  if (r->>'replayed')::boolean then raise exception 'First proof replayed'; end if;
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://twitter.com/Other/status/1850000000000000099', 'x:1850000000000000099', true);
  if not (r->>'replayed')::boolean or (r->>'id')::uuid <> v_id then raise exception 'Same member, same post written twice: %', r; end if;
  r := public.submit_fan_share_proof(other.id, fp.celebrity_id, 'x', 'https://x.com/fan/status/1850000000000000099', 'x:1850000000000000099', true);
  v_other := (r->>'id')::uuid;
  if (r->>'replayed')::boolean or v_other = v_id then raise exception 'Another member could not submit the same post: %', r; end if;
  -- Ids keep their letter case: these are two posts.
  perform public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'youtube', 'https://youtu.be/dQw4w9WgXcQ', 'youtube:dQw4w9WgXcQ', true);
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'youtube', 'https://youtu.be/dqw4w9wgxcq', 'youtube:dqw4w9wgxcq', true);
  if (r->>'replayed')::boolean then raise exception 'Case-different ids merged'; end if;
  -- A key outside the five networks or the id shape never lands.
  begin
    perform public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/a/status/1', 'facebook:123456789', true);
    raise exception 'Foreign key stored';
  exception when check_violation then null; end;

  -- The admin list marks the duplicate on both rows.
  r := public.read_admin_share_proofs(adm.actor, adm.allowlist, 'all', null, 100);
  if (select (x->>'duplicateCount')::int from jsonb_array_elements(r->'items') x where x->>'id' = v_id::text) <> 1
     or (select (x->>'duplicateCount')::int from jsonb_array_elements(r->'items') x where x->>'id' = v_other::text) <> 1 then
    raise exception 'Duplicate mark missing: %', r;
  end if;

  -- 3. Pay the proof the way the server does, then cancel it: points and stamp come back once.
  bal_before := public.group_wallet_balance(fp.app_user_id, 'fan_point');
  award := public.record_dukjil_action(fp.app_user_id, fp.celebrity_id, 'share', 'share-proof:' || v_id::text, extensions.gen_random_uuid(), '{}'::jsonb);
  bal_paid := public.group_wallet_balance(fp.app_user_id, 'fan_point');
  if coalesce((award->>'points')::int, 0) <= 0 or bal_paid - bal_before <> (award->>'points')::int then raise exception 'Fixture payout did not land: % (% -> %)', award, bal_before, bal_paid; end if;

  -- A member who is not an operator cannot cancel.
  begin
    perform public.revoke_fan_share_proof(other.id, adm.allowlist, v_id, '본인 게시물 아님');
    raise exception 'Non-operator cancelled';
  exception when others then if sqlerrm <> 'ADMIN_REQUIRED' then raise; end if; end;
  begin
    perform public.read_admin_share_proofs(other.id, adm.allowlist, 'all', null, 10);
    raise exception 'Non-operator listed';
  exception when others then if sqlerrm <> 'ADMIN_REQUIRED' then raise; end if; end;
  begin
    perform public.revoke_fan_share_proof(adm.actor, adm.allowlist, v_id, 'x');
    raise exception 'Cancelled without a reason';
  exception when others then if sqlerrm <> 'REASON_REQUIRED' then raise; end if; end;

  r := public.revoke_fan_share_proof(adm.actor, adm.allowlist, v_id, '본인 게시물 아님');
  bal_after := public.group_wallet_balance(fp.app_user_id, 'fan_point');
  if (r->>'replayed')::boolean or r->>'result' not in ('corrected', 'review') then raise exception 'Cancel result: %', r; end if;
  if r->>'result' = 'corrected' and bal_after <> bal_before then raise exception 'Points not taken back: % -> % -> %', bal_before, bal_paid, bal_after; end if;
  if (award->>'stampId') is not null and not exists (select 1 from public.community_stamps s where s.id = (award->>'stampId')::uuid and s.revoked_at is not null) then
    raise exception 'Stamp not voided';
  end if;
  select count(*) into corrections from public.dukjil_point_corrections c join public.dukjil_action_log l on l.id = c.action_log_id
    where l.app_user_id = fp.app_user_id and l.source_key = 'share-proof:' || v_id::text;
  if corrections <> 1 then raise exception 'Expected one correction row, got %', corrections; end if;

  -- Once only: a second cancel replays, and even a direct second correction finds nothing new.
  r := public.revoke_fan_share_proof(adm.actor, adm.allowlist, v_id, '다시 누름');
  if not (r->>'replayed')::boolean then raise exception 'Second cancel ran again: %', r; end if;
  if public.dukjil_correct_share_grant(adm.actor, fp.app_user_id, 'share-proof:' || v_id::text) <> 'replayed' then raise exception 'Second correction ran'; end if;
  if public.group_wallet_balance(fp.app_user_id, 'fan_point') <> bal_after then raise exception 'Balance moved on the replay'; end if;
  -- The fan sees the cancelled proof, and resubmitting it does not reopen it.
  if (select x->>'status' from jsonb_array_elements(public.list_fan_share_proofs(fp.app_user_id, fp.celebrity_id)->'items') x where x->>'id' = v_id::text) <> 'revoked' then raise exception 'Cancelled proof not shown as cancelled'; end if;
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/fan/status/1850000000000000099', 'x:1850000000000000099', true);
  if not (r->>'replayed')::boolean or r->>'status' <> 'revoked' then raise exception 'Cancelled proof reopened: %', r; end if;

  -- 4. Account deletion keeps the key: the address is cleared, the row stays counted, and the member still cannot add the post again.
  -- (The full account deletion also runs other owners' cleanups that refuse inside a test, so the scrub's own update is applied here
  -- and its body is checked to update, never delete.)
  if (select prosrc from pg_proc where proname = 'scrub_fan_share_proofs_on_deletion') !~ 'update public.fan_share_proofs set url = null'
     or (select prosrc from pg_proc where proname = 'scrub_fan_share_proofs_on_deletion') ~* 'delete from' then raise exception 'Scrub deletes rows'; end if;
  update public.fan_share_proofs set url = null, scrubbed_at = clock_timestamp() where app_user_id = other.id and scrubbed_at is null;
  if (select url from public.fan_share_proofs where id = v_other) is not null or not exists (select 1 from public.fan_share_proofs where id = v_other and url_key = 'x:1850000000000000099') then
    raise exception 'Deletion did not keep the key and clear the address';
  end if;
  if (select (x->>'duplicateCount')::int from jsonb_array_elements(public.read_admin_share_proofs(adm.actor, adm.allowlist, 'all', null, 100)->'items') x where x->>'id' = v_id::text) <> 1 then
    raise exception 'Deleted member no longer counted for the duplicate mark';
  end if;
  r := public.submit_fan_share_proof(other.id, fp.celebrity_id, 'x', 'https://x.com/fan/status/1850000000000000099', 'x:1850000000000000099', true);
  if not (r->>'replayed')::boolean or (r->>'id')::uuid <> v_other then raise exception 'Kept key allowed a second row for the same member: %', r; end if;


  -- 5. Review r4b M1: a cancelled proof is never paid afterwards, by the five-minute retry or by the locked payout.
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'tiktok', 'https://www.tiktok.com/@fan/video/7430000000000000555', 'tiktok:7430000000000000555', true);
  v_other := (r->>'id')::uuid;
  update public.fan_share_proofs set status = 'revoked', revoked_at = clock_timestamp(), revoked_by = adm.actor, revoke_reason = '지급 전 취소', revoke_result = 'none' where id = v_other;
  insert into public.dukjil_wire_failures (wire, app_user_id, celebrity_id, action_key, source_key, error_message)
    values ('server', fp.app_user_id, fp.celebrity_id, 'share', 'share-proof:' || v_other::text, 'probe: payout failed before the cancel');
  perform public.retry_dukjil_wire_failures(500);
  if (select resolution from public.dukjil_wire_failures where source_key = 'share-proof:' || v_other::text) is distinct from 'content_gone' then
    raise exception 'Retry did not skip the cancelled proof: %', (select row_to_json(f) from public.dukjil_wire_failures f where source_key = 'share-proof:' || v_other::text);
  end if;
  if exists (select 1 from public.dukjil_action_log where app_user_id = fp.app_user_id and source_key = 'share-proof:' || v_other::text) then raise exception 'Retry paid a cancelled proof'; end if;
  begin
    perform public.pay_fan_share_proof(fp.app_user_id, v_other, extensions.gen_random_uuid(), '{}'::jsonb);
    raise exception 'Locked payout paid a cancelled proof';
  exception when others then if sqlerrm <> 'SHARE_PROOF_REVOKED' then raise; end if; end;
  -- The locked payout pays with the proof's own creator and keeps the amount, replays included.
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'threads', 'https://www.threads.net/@fan/post/DAbC12xYz9', 'threads:DAbC12xYz9', true);
  begin
    award := public.pay_fan_share_proof(fp.app_user_id, (r->>'id')::uuid, extensions.gen_random_uuid(), '{}'::jsonb);
    if (select points from public.fan_share_proofs where id = (r->>'id')::uuid) is distinct from coalesce((award->>'points')::int, 0) then raise exception 'Locked payout did not keep the amount'; end if;
    if (select celebrity_id from public.dukjil_action_log where source_key = 'share-proof:' || (r->>'id')) is distinct from fp.celebrity_id then raise exception 'Paid another creator'; end if;
  exception when others then if sqlerrm !~ 'DUKJIL_DAILY_LIMIT' then raise; end if; end;

  raise notice 'share_proofs contract ok (cancel result %, correction rows %)', (select revoke_result from public.fan_share_proofs where id = v_id), corrections;
end $$;

rollback;

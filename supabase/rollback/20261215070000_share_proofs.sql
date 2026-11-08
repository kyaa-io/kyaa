-- Rollback of 20261215070000_share_proofs. Roll the web back first. Opening a share link pays again (the visit gate is removed);
-- submitted proofs and recorded openings are deleted; points and stamps already paid or taken back stay as they are.
begin;
set local lock_timeout = '5s';
do $$
declare d text; g_start integer; g_end integer; begin
  d := pg_get_functiondef('public.visit_community_stamp_share_link_before_fan_web(uuid,text)'::regprocedure);
  g_start := position('-- share-visit-payout-gate' in d);
  if g_start = 0 then return; end if;
  g_end := position('insert into public.community_stamp_share_visits(' in d);
  execute substr(d, 1, g_start - 1) || substr(d, g_end);
end $$;
do $$
declare d text; g_start integer; g_end integer; anchor text := 'elsif f.action_key in (''event_checkin'', ''event_review'') then'; begin
  d := pg_get_functiondef('public.retry_dukjil_wire_failures(integer)'::regprocedure);
  g_start := position('elsif f.action_key = ''share'' and f.source_key like ''share-proof:%'' then -- share-proof-retry-gate' in d);
  if g_start = 0 then return; end if;
  g_end := position(anchor in d);
  execute substr(d, 1, g_start - 1) || substr(d, g_end);
end $$;
-- The p3_fn_owner_<role> policies and grants the files added for the applying role stay: other files use the same policies.
drop function if exists public.pay_fan_share_proof(uuid, uuid, uuid, jsonb);
drop trigger if exists app_users_scrub_fan_share_proofs on public.app_users;
drop function if exists public.scrub_fan_share_proofs_on_deletion();
drop function if exists public.read_admin_share_proofs(uuid, uuid, text, timestamptz, integer);
drop function if exists public.revoke_fan_share_proof(uuid, uuid, uuid, text);
drop function if exists public.dukjil_correct_share_grant(uuid, uuid, text);
drop function if exists public.list_fan_share_proofs(uuid, uuid);
drop function if exists public.set_fan_share_proof_points(uuid, uuid, integer);
drop function if exists public.submit_fan_share_proof(uuid, uuid, text, text, text, boolean);
drop function if exists public.record_fan_share_link_open(uuid, uuid);
drop function if exists public.share_visit_payouts_enabled();
drop table if exists public.fan_share_proofs;
drop table if exists public.fan_share_link_opens;
drop table if exists public.fan_share_settings;
notify pgrst, 'reload schema';
commit;

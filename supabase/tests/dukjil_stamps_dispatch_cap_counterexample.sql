-- ONCHAIN-STAMPS-IMPL-1117 (20261229000000): dukjil stamps on the native lane, held stamps, backlog recovery manifest.
-- Disposable clean-chain DB only; everything rolls back.
do $$ begin if inet_server_addr() is not null then raise exception 'Disposable Unix-socket database required'; end if; end $$;
begin;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'DUKJIL_NATIVE_TEST: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
declare caught boolean := false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm) = 0 then raise exception 'unexpected error %, wanted %', sqlerrm, expected; end if;
    caught := true;
  end;
  if not caught then raise exception 'missing error %', expected; end if;
end $$;

update public.dukjil_policy_versions set status = 'active', effective_from = now() - interval '1 hour', activated_at = now()
  where version = (select max(version) from public.dukjil_policy_versions);
update public.mint_dispatch_policy set legacy_credential_issuance_retired = true;

insert into public.fan_action_bindings(id, chain_id, environment_id, hub_proxy, relayer, schema_uid, schema_version, binding_version, asset_base_uri, assets)
values ('0c5f0000-0000-4000-8000-000000000001', 91342, '0x' || repeat('1', 64), '0x' || repeat('2', 40), '0x' || repeat('3', 40),
  '0x' || repeat('4', 64), 1, 2, 'ipfs://bafydukjilnative', jsonb_build_object('1', '0x' || repeat('5', 40)));
insert into public.fan_action_producer_routes(action_code, binding_id, enabled, enabled_at, policy_version)
select code, '0c5f0000-0000-4000-8000-000000000001', code <> 12, case when code <> 12 then now() end, 1 from unnest(array[8, 10, 12]) code;

create function pg_temp.mkuser(n integer) returns uuid language plpgsql as $$
declare u uuid := ('0c500000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
begin
  insert into public.app_users(id, privy_user_id, verified_email, status) values (u, 'did:privy:ocs-' || n, 'ocs-' || n || '@byus.test', 'active');
  insert into public.user_wallets(app_user_id, chain_id, address, provider, wallet_type) values (u, 91342, '0x' || lpad(n::text, 40, 'c'), 'privy', 'embedded');
  return u;
end $$;
create function pg_temp.mkcel(n integer, verified boolean) returns uuid language plpgsql as $$
declare c uuid := ('0c510000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
begin
  insert into public.celebrities(id, slug, status, image_url, roles, primary_role) values (c, 'ocs-cel-' || n, 'draft', '/d.webp', '{artist}', 'idol');
  insert into public.celebrity_localizations(celebrity_id, locale, name, summary, image_alt) values (c, 'ko', '가' || n, '가', '가'), (c, 'en', 'A' || n, 'A', 'A');
  update public.celebrities set status = 'published', published_at = now() where id = c;
  if verified then
    insert into public.fan_action_verified_creators(binding_id, creator_id, verified_block_number, verified_block_hash, verified_at)
      values ('0c5f0000-0000-4000-8000-000000000001', c, 1, '0x' || repeat('6', 64), now());
  end if;
  return c;
end $$;
-- The pre-migration issuer, kept to build realistic backlog rows (legacy job + stamp, validated by the insert trigger).
create function pg_temp.legacy_stamp(u uuid, c uuid, k public.community_stamp_kind, key text, at timestamptz) returns uuid language plpgsql as $$
declare v_id uuid := extensions.gen_random_uuid(); v_job uuid := extensions.gen_random_uuid(); v_op text := 'byus:community-stamp:v1:' || v_id::text;
begin
  insert into public.blockchain_jobs(id, entity_type, entity_id, operation_key, payload_version, payload)
    values (v_job, 'community_stamp', v_id, v_op, 1, jsonb_build_object(
      'recipient', (select address from public.user_wallets where app_user_id = u), 'issuanceId', '0x' || encode(extensions.digest(v_op, 'sha256'), 'hex'),
      'stampKind', k::text, 'celebritySlug', (select slug from public.celebrities where id = c)));
  insert into public.community_stamps(id, app_user_id, celebrity_id, kind, source_key, blockchain_job_id, policy_version, issued_at)
    values (v_id, u, c, k, key, v_job, 2, at);
  return v_id;
end $$;

select pg_temp.mkuser(1), pg_temp.mkuser(2), pg_temp.mkuser(3), pg_temp.mkcel(1, true), pg_temp.mkcel(2, false), pg_temp.mkcel(3, false);
create temporary table legacy_before as select count(*) n from public.blockchain_jobs where entity_type = 'community_stamp';

update public.fan_action_producer_routes set enabled=true,enabled_at=now();
do $$
declare i integer; h text; r record; admitted integer:=0;
begin
 for i in 1..501 loop
 perform pg_temp.legacy_stamp('0c500000-0000-4000-8000-000000000001','0c510000-0000-4000-8000-000000000001','post','cap:'||i,now()-interval '2 days');
 end loop;
 h:=public.build_community_stamp_recovery_manifest(now()-interval '3 days',now(),500)->>'manifestHash';
 perform public.run_community_stamp_recovery(h,500);
 update public.community_stamp_recovery_items set enqueued_day=(now() at time zone 'UTC')::date-1 where outbox_id is not null;
 perform public.run_community_stamp_recovery(h,1);
 update public.fan_action_outbox set status='PROCESSING',lease_owner='xreview',lease_expires_at=now()+interval '1 hour' where id in(select outbox_id from public.community_stamp_recovery_items);
 for r in select outbox_id from public.community_stamp_recovery_items loop
 if public.admit_fan_action_dispatch(r.outbox_id,'xreview') then admitted:=admitted+1; end if;
 end loop;
 perform pg_temp.assert(admitted=501,'reproduces dispatch cap violation: 501 recovery reservations');
 raise notice 'CAP_VIOLATION_REPRODUCED: % recovery reservations; only 499 of 1000 remain',admitted;
end $$;
rollback;

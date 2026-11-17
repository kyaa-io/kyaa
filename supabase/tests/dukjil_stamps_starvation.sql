-- ONCHAIN-STAMPS-IMPL-1117 (20261231100000): dukjil stamps on the native lane, held stamps, backlog recovery manifest.
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

do $$
declare i integer; good uuid;
begin
 for i in 1..200 loop
 insert into public.community_stamps(app_user_id,celebrity_id,kind,source_key,policy_version,onchain_hold_reason,onchain_held_at,issued_at) values('0c500000-0000-4000-8000-000000000001','0c510000-0000-4000-8000-000000000002','post','starve:'||i,2,'CREATOR_NOT_VERIFIED',now(),now()-interval '1 day');
 end loop;
 good:=public.dukjil_issue_stamp('0c500000-0000-4000-8000-000000000001','0c510000-0000-4000-8000-000000000001','post','starve:good',2);
 update public.fan_action_producer_routes set enabled=true, enabled_at=now() where action_code=12;
 perform public.release_held_community_stamps(null,200);
 perform public.release_held_community_stamps(null,200);
 perform pg_temp.assert((select fan_action_outbox_id is not null from public.community_stamps where id=good),'healthy stamp behind 200 held stamps');
end $$;
create function pg_temp.fail_poison() returns trigger language plpgsql as $$
begin
 if old.source_key like 'poison:%' and new.onchain_hold_reason is null then raise exception 'injected persistent enqueue failure'; end if;
 return new;
end $$;
create trigger xreview_poison before update on public.community_stamps for each row execute function pg_temp.fail_poison();
do $$
declare i integer; good uuid;
begin
 for i in 1..200 loop
 insert into public.community_stamps(app_user_id,celebrity_id,kind,source_key,policy_version,onchain_hold_reason,onchain_held_at,issued_at) values('0c500000-0000-4000-8000-000000000001','0c510000-0000-4000-8000-000000000001','post','poison:'||i,2,'ENQUEUE_FAILED',now(),now()-interval '1 day');
 end loop;
 update public.fan_action_producer_routes set enabled=false where action_code=12;
 good:=public.dukjil_issue_stamp('0c500000-0000-4000-8000-000000000001','0c510000-0000-4000-8000-000000000001','post','healthy:after-poison',2);
 update public.fan_action_producer_routes set enabled=true, enabled_at=now() where action_code=12;
 perform public.release_held_community_stamps(null,200);
 perform public.release_held_community_stamps(null,200);
 perform public.release_held_community_stamps(null,200);
 perform pg_temp.assert((select fan_action_outbox_id is not null from public.community_stamps where id=good),'healthy behind 200 persistent failures');
 perform pg_temp.assert((select count(*)=1 from public.fan_action_credentials where entity_id=good),'exactly one credential');
 perform pg_temp.assert((select count(*)=0 from public.fan_action_credentials c join public.community_stamps s on s.id=c.entity_id where s.source_key like 'poison:%'),'failed attempts roll back credentials');
end $$;
select 'STARVATION_OK';
rollback;

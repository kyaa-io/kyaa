-- B3 (plan 4th ed. §10): today's cheer, the Instagram repost and the tier bonus. Disposable clean-chain DB only; everything rolls back.
-- Time: record_dukjil_action, the repost functions and the tier sync read public.dukjil_now(); pg_temp.set_now swaps it inside this
-- transaction. Stamp issued_at and slot assigned_at keep their own clock_timestamp() (plan S17), so the stamp-cap checks run on the real
-- clock and the cap-window checks on set times after it.
do $$ begin if current_database() not like 'b3%' and current_database() <> 'byus_clean' or inet_server_addr() is not null then
  raise exception 'Disposable Unixsocket clean-chain database required'; end if; end $$;
begin;

create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
declare caught boolean := false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm) = 0 then raise exception 'Unexpected error %, wanted %', sqlerrm, expected; end if;
    caught := true;
  end;
  if not caught then raise exception 'Expected error was not raised: %', expected; end if;
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'B3 check failed: %', what; end if; end $$;
create function pg_temp.set_now(t timestamptz) returns void language plpgsql as $$
begin execute format('create or replace function public.dukjil_now() returns timestamptz language sql volatile set search_path = '''' as $f$ select %L::timestamptz $f$', t); end $$;
create function pg_temp.real_now() returns void language plpgsql as $$
begin execute 'create or replace function public.dukjil_now() returns timestamptz language sql volatile set search_path = '''' as $f$ select pg_catalog.clock_timestamp() $f$'; end $$;
create function pg_temp.mkuser(u uuid, n integer) returns void language plpgsql as $$
begin
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:b3-'||n,'b3-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'||lpad(n::text,4,'0'),'privy','embedded');
end $$;
create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  -- the blockchain job without its triggers; the passport row with them (zzz_fan_tier_start writes the start row)
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'b3-pass-'||p,1,jsonb_build_object('recipient','0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb0001','celebritySlug','b3','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  perform public.dukjil_sync_fan_tier(u, c, false);
  return p;
end $$;
create function pg_temp.mkcel(c uuid, slug text) returns void language plpgsql as $$
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c,slug,'draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c,'ko',slug,'b3','b3'),(c,'en',slug,'b3','b3');
  update public.celebrities set status='published' where id=c;
end $$;
create function pg_temp.fav(u uuid, c uuid) returns void language sql as $$
  insert into public.fan_profile_public_fields(app_user_id, favorite_celebrity_id, sns_links) values (u, c, '{}')
  on conflict (app_user_id) do update set favorite_celebrity_id = excluded.favorite_celebrity_id $$;
create function pg_temp.bal(u uuid) returns bigint language sql as $$ select public.group_wallet_balance(u, 'fan_point') $$;
-- one passport slot filled through the real stamp path (dukjil_issue_stamp -> passport_place_stamp -> slot trigger)
create function pg_temp.stamp(u uuid, c uuid, k text) returns uuid language sql as $$
  select public.dukjil_issue_stamp(u, c, k::public.community_stamp_kind, 'b3-' || k || ':' || extensions.gen_random_uuid(), 1) $$;
create function pg_temp.heart(u uuid, c uuid) returns void language sql as $$
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id) values (c, u, 1, 'passport_page_claim', extensions.gen_random_uuid()) $$;
create function pg_temp.tier(u uuid, c uuid) returns text language sql as $$ select public.get_fan_effective_tier(u, c) $$;
create function pg_temp.last_kind(u uuid, c uuid) returns text language sql as $$
  select kind || ':' || tier from public.fan_tier_history where app_user_id = u and celebrity_id = c order by occurred_at desc, id desc limit 1 $$;
create function pg_temp.grants(u uuid, c uuid) returns text language sql as $$
  select coalesce(string_agg(tier || '=' || points || '/' || status, ',' order by public.fan_tier_rank(tier)), '') from public.fan_tier_bonus_grants where app_user_id = u and celebrity_id = c $$;
-- repost helpers
create function pg_temp.repost(u uuid, c uuid, code text) returns uuid language sql as $$
  select (public.submit_fan_insta_repost(u, c, 'feed', 'https://www.instagram.com/p/' || code || '/', 'instagram:' || code, null, true) ->> 'id')::uuid $$;
create function pg_temp.review(actor uuid, al uuid, id uuid, decision text, code text default null) returns jsonb language sql as $$
  select public.review_fan_insta_repost(actor, al, id, (select review_revision from public.fan_share_proofs where fan_share_proofs.id = review.id), decision, code) $$;
create function pg_temp.capture(u uuid, sha text) returns uuid language plpgsql as $$
declare a uuid := extensions.gen_random_uuid();
begin
  insert into public.mobile_media_assets(id, app_user_id, kind, purpose, content_type, expected_byte_size, actual_byte_size, storage_path, thumbnail_path,
      state, request_id, request_hash, width, height, ready_at, source_sha256)
    values (a, u, 'image', 'share_proof', 'image/png', 1000, 1000, 'b3/' || a || '.png', 'b3/' || a || '.webp', 'ready', extensions.gen_random_uuid(), repeat('a', 64), 100, 100, now(), sha);
  return a;
end $$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;
update public.reward_policy_activation set policy_version = 3 where singleton;

create temp table ids(k text primary key, v uuid);
do $$
declare n integer := 0; k text;
begin
  foreach k in array array['c1','c2','c3','c4','adm','vw','op','op2','u1','u2','u3','u4','u5','u6','u7','u8','u9','u10','u11','u12','u13','u14','u15','u16','u17','u18','u19','u20','al','alv','pg1','pg2'] loop
    n := n + 1; insert into ids values (k, ('b3000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid);
  end loop;
end $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select v from ids where ids.k = id.k $$;

-- ===== fixtures =====
do $$
declare i integer; u text;
begin
  perform pg_temp.mkcel(pg_temp.id('c1'), 'b3-one'); perform pg_temp.mkcel(pg_temp.id('c2'), 'b3-two');
  perform pg_temp.mkcel(pg_temp.id('c3'), 'b3-three'); perform pg_temp.mkcel(pg_temp.id('c4'), 'b3-four');
  i := 0;
  foreach u in array array['adm','vw','op','op2','u1','u2','u3','u4','u5','u6','u7','u8','u9','u10','u11','u12','u13','u14','u15','u16','u17','u18','u19','u20'] loop
    i := i + 1; perform pg_temp.mkuser(pg_temp.id(u), i);
  end loop;
  insert into public.admin_allowlist(id,email,role,active) values (pg_temp.id('al'),'b3-1@byus.test','admin',true), (pg_temp.id('alv'),'b3-2@byus.test','viewer',true);
  set local session_replication_role = replica;
  insert into public.group_pages(id, kind, celebrity_id, name, description, status, anonymous) values
    (pg_temp.id('pg1'), 'fan', pg_temp.id('c1'), 'b3 page one', '', 'published', false), (pg_temp.id('pg2'), 'fan', pg_temp.id('c2'), 'b3 page two', '', 'published', false);
  insert into public.group_memberships(page_id, app_user_id, role) values (pg_temp.id('pg1'), pg_temp.id('op'), 'manager'), (pg_temp.id('pg2'), pg_temp.id('op2'), 'owner');
  set local session_replication_role = origin;
  foreach u in array array['op','u1','u2','u3','u4','u5','u6','u7','u8','u9','u10','u11','u12','u13','u14','u15','u16','u17','u18','u19'] loop
    perform pg_temp.mkpass(pg_temp.id(u), pg_temp.id('c1')); perform pg_temp.mkpass(pg_temp.id(u), pg_temp.id('c2'));
  end loop;
  perform pg_temp.mkpass(pg_temp.id('u8'), pg_temp.id('c3'));
  -- v1 active since two hours ago; v2 is the draft the migration wrote
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '2 hours', activated_at=now() where version=1;
  perform pg_temp.check((select status from public.dukjil_policy_versions where version = 2) = 'draft', 'v2 is a draft after the migration');
end $$;

-- ===== S14 policy replacement (scenario rolled back) =====
do $$
declare next_mid timestamptz := ((public.dukjil_kst_date() + 1)::timestamp at time zone 'Asia/Seoul'); r public.dukjil_policy_versions;
begin
  begin
    perform pg_temp.expect_error('select public.replace_dukjil_policy(2, now() - interval ''1 day'')', 'DUKJIL_EFFECTIVE_FROM_INVALID');
    perform pg_temp.expect_error(format('select public.replace_dukjil_policy(2, %L)', next_mid + interval '1 hour'), 'DUKJIL_EFFECTIVE_FROM_INVALID');
    perform pg_temp.expect_error('select public.activate_dukjil_policy(2)', 'DUKJIL_REPLACEMENT_UNSUPPORTED');
    r := public.replace_dukjil_policy(2);
    perform pg_temp.check(r.status = 'active' and r.effective_from = next_mid, 'S14 v2 scheduled at the next KST midnight');
    perform pg_temp.check((public.dukjil_active_policy(clock_timestamp())).version = 1, 'S14 v1 before midnight');
    perform pg_temp.check((public.dukjil_active_policy(next_mid - interval '1 microsecond')).version = 1, 'S14 v1 one microsecond before');
    perform pg_temp.check((public.dukjil_active_policy(next_mid)).version = 2, 'S14 v2 at midnight');
    perform pg_temp.check((public.passport_policy_row()).version = 1, 'S14 passport_policy_row keeps v1 before midnight');
    perform pg_temp.check(public.retire_superseded_dukjil_policies() = 0, 'S14 nothing to retire before midnight');
    perform pg_temp.expect_error(format('select public.replace_dukjil_policy(2, %L)', next_mid + interval '1 day'), 'DUKJIL_POLICY_NOT_DRAFT');
    raise exception 'B3_SCENARIO_DONE';
  exception when others then if sqlerrm <> 'B3_SCENARIO_DONE' then raise; end if;
  end;
  perform pg_temp.check((select status from public.dukjil_policy_versions where version = 2) = 'draft', 'S14 scenario rolled back');
end $$;

-- ===== S11 install catch-up and rises before the bonus starts (only v1 in effect) =====
do $$
declare u4 uuid := pg_temp.id('u4'); u5 uuid := pg_temp.id('u5'); u6 uuid := pg_temp.id('u6'); c1 uuid := pg_temp.id('c1'); p uuid; r jsonb; n integer;
begin
  -- (a) a Gold passport with no history: start + baseline
  p := (select id from public.fan_passports where app_user_id = u4 and celebrity_id = c1);
  delete from public.fan_tier_history where passport_id = p;
  set local session_replication_role = replica; perform pg_temp.heart(u4, c1); set local session_replication_role = origin;
  -- (b) last row Silver, now Gold: a seen correction
  p := (select id from public.fan_passports where app_user_id = u5 and celebrity_id = c1);
  insert into public.fan_tier_history(app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, seen_at) values (u5, c1, p, 'up', 'Bronze', 'Silver', now());
  set local session_replication_role = replica; perform pg_temp.heart(u5, c1); set local session_replication_role = origin;
  select count(*) into n from public.fan_tier_history;
  r := public.dukjil_tier_history_catch_up();
  raise notice 'S11 catch-up %', r;
  perform pg_temp.check(pg_temp.last_kind(u4, c1) = 'baseline:Gold' and exists(select 1 from public.fan_tier_history where app_user_id = u4 and celebrity_id = c1 and kind = 'start'), 'S11a start + baseline Gold');
  perform pg_temp.check(pg_temp.last_kind(u5, c1) = 'correction:Gold'
    and (select seen_at is not null from public.fan_tier_history where app_user_id = u5 and celebrity_id = c1 and kind = 'correction'), 'S11b seen correction Gold');
  -- (c) a second run adds nothing
  r := public.dukjil_tier_history_catch_up();
  perform pg_temp.check((r ->> 'start')::int = 0 and (r ->> 'correction')::int = 0, 'S11c catch-up again writes nothing');
  -- a rise after the install, before the bonus: recorded, no grant
  perform pg_temp.stamp(u6, c1, 'quiz'); perform pg_temp.stamp(u6, c1, 'post'); perform pg_temp.stamp(u6, c1, 'comment');
  perform pg_temp.check(pg_temp.last_kind(u6, c1) = 'up:Silver' and pg_temp.grants(u6, c1) = '', 'S11 rise before the bonus: up row, no grant');
end $$;

-- ===== v2 takes effect now =====
update public.dukjil_policy_versions set status = 'active', effective_from = clock_timestamp() where version = 2;
do $$ begin perform pg_temp.check((public.dukjil_active_policy(clock_timestamp())).version = 2, 'v2 in effect'); end $$;

-- ===== S11 after the bonus starts =====
do $$
declare u5 uuid := pg_temp.id('u5'); u6 uuid := pg_temp.id('u6'); c1 uuid := pg_temp.id('c1'); st uuid; i integer; b bigint;
begin
  b := pg_temp.bal(u5);
  for i in 2..14 loop perform pg_temp.heart(u5, c1); end loop;
  perform pg_temp.check(pg_temp.tier(u5, c1) = 'Platinum', 'S11 u5 Platinum');
  perform pg_temp.check(pg_temp.grants(u5, c1) = 'Platinum=300/paid', 'S11 Platinum 300 only, Gold reached before the bonus: ' || pg_temp.grants(u5, c1));
  perform pg_temp.check(pg_temp.bal(u5) = b + 300, 'S11 300P in the wallet');
  -- u6: Silver before the bonus, drops and comes back: 0P
  st := (select s.stamp_id from public.passport_page_slots s join public.fan_passports p on p.id = s.passport_id where p.app_user_id = u6 and p.celebrity_id = c1 and s.stamp_id is not null limit 1);
  perform public.void_passport_stamp(pg_temp.id('adm'), st, 'b3 test', false, 'b3-void-' || st);
  perform pg_temp.check(pg_temp.last_kind(u6, c1) = 'down:Bronze', 'S11 u6 down');
  perform pg_temp.stamp(u6, c1, 'subscription');
  perform pg_temp.check(pg_temp.last_kind(u6, c1) = 'up:Silver' and pg_temp.grants(u6, c1) = '', 'S11 Silver again after the bonus starts, reached before: no grant');
end $$;

-- observe records a change no write announced (here: hearts written without triggers), without a grant
do $$
declare u7 uuid := pg_temp.id('u7'); c1 uuid := pg_temp.id('c1'); r jsonb;
begin
  set local session_replication_role = replica; perform pg_temp.heart(u7, c1); set local session_replication_role = origin;
  r := public.observe_fan_tiers(u7);
  perform pg_temp.check(pg_temp.last_kind(u7, c1) = 'up:Gold' and pg_temp.grants(u7, c1) = '', 'S11 observe: up row, no grant');
  perform pg_temp.check(not exists(select 1 from jsonb_array_elements(r -> 'changes') x where x ? 'bonusPoints'), 'S11 observe: no bonusPoints without grants');
end $$;

-- ===== S9 / S10 tier bonus on the write =====
do $$
declare u9 uuid := pg_temp.id('u9'); u10 uuid := pg_temp.id('u10'); c1 uuid := pg_temp.id('c1'); c2 uuid := pg_temp.id('c2');
  b bigint; r jsonb; st uuid; up_id uuid;
begin
  b := pg_temp.bal(u9);
  perform pg_temp.stamp(u9, c1, 'quiz'); perform pg_temp.stamp(u9, c1, 'post');
  perform pg_temp.check(pg_temp.grants(u9, c1) = '', 'S9 two slots: nothing yet');
  perform pg_temp.stamp(u9, c1, 'comment');
  perform pg_temp.check(pg_temp.last_kind(u9, c1) = 'up:Silver' and pg_temp.grants(u9, c1) = 'Silver=30/paid', 'S9 third slot: Silver 30 in the same transaction');
  perform pg_temp.check(exists(select 1 from public.dukjil_action_log l join public.fan_tier_bonus_grants g on g.action_log_id = l.id
    where l.app_user_id = u9 and l.action_key = 'tier_bonus' and l.points = 30 and l.ledger_id is not null and l.policy_version = 2), 'S9 log + ledger for the Silver bonus');
  perform pg_temp.heart(u9, c1);
  perform pg_temp.check(pg_temp.grants(u9, c1) = 'Silver=30/paid,Gold=100/paid', 'S9 one heart: Gold 100');
  perform pg_temp.check(pg_temp.bal(u9) = b + 130, 'S9 wallet +130');
  -- Silver -> Platinum in one write: Gold 100 + Platinum 300
  perform pg_temp.stamp(u10, c1, 'quiz'); perform pg_temp.stamp(u10, c1, 'post'); perform pg_temp.stamp(u10, c1, 'comment');
  insert into public.fan_heart_conversions(app_user_id, celebrity_id, stamps_counted, hearts, remainder, cutoff_at) values (u10, c1, 140, 14, 0, now());
  perform pg_temp.check(pg_temp.grants(u10, c1) = 'Silver=30/paid,Gold=100/paid,Platinum=300/paid', 'S9 Silver to Platinum: ' || pg_temp.grants(u10, c1));
  r := public.observe_fan_tiers(u10);
  select h.id into up_id from public.fan_tier_history h where h.app_user_id = u10 and h.celebrity_id = c1 and h.tier = 'Platinum';
  perform pg_temp.check((select (x ->> 'bonusPoints')::int from jsonb_array_elements(r -> 'changes') x where (x ->> 'id')::uuid = up_id) = 400, 'S9 observe bonusPoints = 400');
  -- S10: Silver (30) -> a slot voided -> Bronze -> Silver again: no grant; another creator still pays
  st := (select s.stamp_id from public.passport_page_slots s join public.fan_passports p on p.id = s.passport_id where p.app_user_id = u9 and p.celebrity_id = c2 and s.stamp_id is not null limit 1);
  perform pg_temp.check(st is null, 'S10 u9 has no c2 slots yet');
  perform pg_temp.stamp(u9, c2, 'quiz'); perform pg_temp.stamp(u9, c2, 'post'); st := pg_temp.stamp(u9, c2, 'comment');
  perform pg_temp.check(pg_temp.grants(u9, c2) = 'Silver=30/paid', 'S10 other creator Silver 30');
  perform public.void_passport_stamp(pg_temp.id('adm'), st, 'b3 test', false, 'b3-void-' || st);
  perform pg_temp.check(pg_temp.last_kind(u9, c2) = 'down:Bronze', 'S10 drop to Bronze');
  perform pg_temp.stamp(u9, c2, 'subscription');
  perform pg_temp.check(pg_temp.last_kind(u9, c2) = 'up:Silver' and pg_temp.grants(u9, c2) = 'Silver=30/paid', 'S10 back to Silver: no second grant');
  r := public.observe_fan_tiers(u9);
  perform pg_temp.check(not exists(select 1 from jsonb_array_elements(r -> 'changes') x where x ->> 'slug' = 'b3-two' and (x ->> 'bonusPoints')::int > 0
    and (x ->> 'id')::uuid = (select id from public.fan_tier_history where app_user_id = u9 and celebrity_id = c2 order by occurred_at desc, id desc limit 1)), 'S10 re-rise shows no bonus');
end $$;

-- ===== F2 under reward policy 2 a rise is recorded but pays no bonus (scenario rolled back) =====
do $$
declare u uuid := pg_temp.id('u7'); c2 uuid := pg_temp.id('c2'); b bigint;
begin
  begin
    update public.reward_policy_activation set policy_version = 2 where singleton;
    perform public.observe_fan_tiers(u);
    b := pg_temp.bal(u);
    set local session_replication_role = replica;
    insert into public.fan_score_ledger(app_user_id, celebrity_id, points, activity_id) values (u, c2, 300, extensions.gen_random_uuid());
    set local session_replication_role = origin;
    perform pg_temp.heart(u, c2);
    perform pg_temp.check(pg_temp.last_kind(u, c2) like 'up:%', 'F2 policy 2: the rise is recorded ' || coalesce(pg_temp.last_kind(u, c2), 'none'));
    perform pg_temp.check(pg_temp.grants(u, c2) = '' and pg_temp.bal(u) = b, 'F2 policy 2: no bonus grant, no points ' || pg_temp.grants(u, c2));
    perform pg_temp.check(public.read_dukjil_today(u, c2) -> 'nextTierBonus' = 'null'::jsonb, 'F2 policy 2: no next bonus shown');
    raise exception 'B3_SCENARIO_DONE';
  exception when others then if sqlerrm <> 'B3_SCENARIO_DONE' then raise; end if;
  end;
end $$;

-- ===== S12 / S20 retries and fixed grants =====
do $$
declare u8 uuid := pg_temp.id('u8'); u11 uuid := pg_temp.id('u11'); c3 uuid := pg_temp.id('c3'); c1 uuid := pg_temp.id('c1'); g uuid; b bigint; r jsonb; n integer;
begin
  b := pg_temp.bal(u8);
  set local session_replication_role = replica; update public.celebrities set status = 'draft', published_at = null where id = c3; set local session_replication_role = origin;
  perform pg_temp.heart(u8, c3);
  perform pg_temp.check(pg_temp.last_kind(u8, c3) = 'up:Gold', 'S12 the heart is written and the rise recorded while the creator is archived');
  select id into g from public.fan_tier_bonus_grants where app_user_id = u8 and celebrity_id = c3 and tier = 'Gold';
  perform pg_temp.check((select status = 'pending' and attempts = 1 and last_error like '%COMMUNITY_STAMP_NOT_FOUND%' from public.fan_tier_bonus_grants where id = g), 'S12 grant pending');
  update public.fan_tier_bonus_grants set next_retry_at = now() - interval '1 second' where id = g;
  r := public.retry_fan_tier_bonus_grants(10);
  perform pg_temp.check((select status = 'pending' and attempts = 2 from public.fan_tier_bonus_grants where id = g), 'S12 retry while archived: still pending, attempts 2');
  -- S20: v3 (Gold 200) takes over before the creator comes back
  insert into public.dukjil_policy_versions(version, status, rules, mission_book, note, created_by)
    select 3, 'draft', jsonb_set(rules, '{actions,tier_bonus,pointsByTier,Gold}', '200'), mission_book, 'b3 test v3', 'b3-test' from public.dukjil_policy_versions where version = 2;
  update public.dukjil_policy_versions set status = 'active', effective_from = clock_timestamp() where version = 3;
  perform pg_temp.check((public.dukjil_active_policy(clock_timestamp())).version = 3, 'S20 v3 in effect');
  set local session_replication_role = replica; update public.celebrities set status = 'published', published_at = now() where id = c3; set local session_replication_role = origin;
  update public.fan_tier_bonus_grants set next_retry_at = now() - interval '1 second' where id = g;
  r := public.retry_fan_tier_bonus_grants(10);
  perform pg_temp.check((select status = 'paid' and points = 100 from public.fan_tier_bonus_grants where id = g), 'S20 the v2 grant pays its own 100');
  perform pg_temp.check((select l.policy_version = 2 and l.points = 100 from public.dukjil_action_log l join public.fan_tier_bonus_grants x on x.action_log_id = l.id where x.id = g), 'S20 log policy_version 2');
  perform pg_temp.check(pg_temp.bal(u8) = b + 100, 'S12 paid once');
  r := public.retry_fan_tier_bonus_grants(10); perform public.pay_fan_tier_bonus_grant(g);
  perform pg_temp.check((select count(*) from public.dukjil_action_log where app_user_id = u8 and action_key = 'tier_bonus') = 1 and pg_temp.bal(u8) = b + 100, 'S12 retried twice: one payment');
  -- a new rise under v3 uses v3's value
  perform pg_temp.heart(u11, c1);
  perform pg_temp.check(pg_temp.grants(u11, c1) = 'Silver=30/paid,Gold=200/paid', 'S20 new grant under v3: ' || pg_temp.grants(u11, c1));
  -- back to v2 values for the rest of the file
  update public.dukjil_policy_versions set status = 'retired' where version = 3;
end $$;

-- ===== S13 / S22 account state =====
do $$
declare u12 uuid := pg_temp.id('u12'); u13 uuid := pg_temp.id('u13'); c1 uuid := pg_temp.id('c1'); c2 uuid := pg_temp.id('c2');
  r jsonb; n integer; st uuid; pid uuid;
begin
  perform pg_temp.fav(u12, c1); perform pg_temp.fav(u13, c1);
  update public.app_users set status = 'disabled' where id = u12;
  set local session_replication_role = replica;
  insert into public.app_user_moderation_restrictions(app_user_id, report_id, reason, actor_admin_id) values (u13, extensions.gen_random_uuid(), 'b3 test restriction', extensions.gen_random_uuid());
  set local session_replication_role = origin;
  select count(*) into n from public.dukjil_action_log where app_user_id in (u12, u13);
  perform pg_temp.expect_error(format('select public.cheer_dukjil_favorite(%L)', u12), 'ACCOUNT_INACTIVE');
  perform pg_temp.expect_error(format('select public.cheer_dukjil_favorite(%L)', u13), 'ACCOUNT_INACTIVE');
  r := public.record_dukjil_action(u13, c1, 'cheer', 'x', extensions.gen_random_uuid(), '{}');
  perform pg_temp.check(r ->> 'reason' = 'ACCOUNT_INACTIVE' and (r ->> 'points')::int = 0 and r ? 'at', 'S13 record answers ACCOUNT_INACTIVE');
  perform pg_temp.check((select count(*) from public.dukjil_action_log where app_user_id in (u12, u13)) = n, 'S13 no log rows');
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,''post'',''b3-post'',%L,''{}'')', u13, c1, extensions.gen_random_uuid()), 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,''post'',''b3-post'',%L,''{}'')', u12, c1, extensions.gen_random_uuid()), 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
  -- tier rise of a restricted member through hearts (written without the member's lock checks): up row, void grant
  perform pg_temp.heart(u13, c1);
  perform pg_temp.check(pg_temp.last_kind(u13, c1) = 'up:Gold' and pg_temp.grants(u13, c1) = 'Silver=30/void,Gold=100/void', 'S13 restricted: up row, void grant');
  set local session_replication_role = replica;
  update public.app_user_moderation_restrictions set revoked_at = now() where app_user_id = u13;
  set local session_replication_role = origin;
  perform pg_temp.heart(u13, c1);
  perform pg_temp.check(pg_temp.grants(u13, c1) = 'Silver=30/void,Gold=100/void', 'S13 lifted: that tier stays 0P');
  -- S22a an admin voids a stamp of a disabled member: works, slot cleared, down row
  update public.app_users set status = 'active' where id = u12;
  perform pg_temp.stamp(u12, c1, 'quiz'); perform pg_temp.stamp(u12, c1, 'post'); st := pg_temp.stamp(u12, c1, 'comment');
  perform pg_temp.check(pg_temp.grants(u12, c1) = 'Silver=30/paid', 'S22 setup Silver');
  update public.app_users set status = 'disabled' where id = u12;
  r := public.void_passport_stamp(pg_temp.id('adm'), st, 'b3 test', false, 'b3-void-' || st);
  perform pg_temp.check(pg_temp.last_kind(u12, c1) = 'down:Bronze', 'S22a admin void of a disabled member: down row');
  -- S22b catch-up with disabled and restricted passports
  set local session_replication_role = replica;
  update public.app_user_moderation_restrictions set revoked_at = null where app_user_id = u13;
  set local session_replication_role = origin;
  r := public.dukjil_tier_history_catch_up();
  perform pg_temp.check(r is not null, 'S22b catch-up runs with inactive members');
  -- S22c observe for a restricted member
  r := public.observe_fan_tiers(u13);
  perform pg_temp.check(r ? 'changes', 'S22c observe for a restricted member');
  -- S22e a multi-member conversion with one inactive member: one statement, all rows
  insert into public.fan_heart_conversions(app_user_id, celebrity_id, stamps_counted, hearts, remainder, cutoff_at)
    values (u12, c2, 10, 1, 0, now()), (pg_temp.id('u14'), c2, 10, 1, 0, now());
  perform pg_temp.check(pg_temp.grants(u12, c2) = 'Silver=30/void,Gold=100/void' and pg_temp.grants(pg_temp.id('u14'), c2) = 'Silver=30/paid,Gold=100/paid', 'S22e conversion: inactive void, active paid');
  -- S22d write-fenced wallet: the admin void fails as before (its own lock rule), not because of the sync
  update public.app_users set status = 'active' where id = u12;
  st := pg_temp.stamp(u12, c1, 'share');
  update public.group_wallet_release set write_fenced = true;
  perform pg_temp.expect_error(format('select public.void_passport_stamp(%L,%L,''b3'',false,%L)', pg_temp.id('adm'), st, 'b3-fenced'), 'GROUP_WALLET_WRITE_FENCED');
  update public.group_wallet_release set write_fenced = false;
  set local session_replication_role = replica;
  update public.app_user_moderation_restrictions set revoked_at = now() where app_user_id = u13;
  set local session_replication_role = origin;
end $$;

-- ===== S7 / S8 / S21 / S15 cheer =====
do $$
declare u1 uuid := pg_temp.id('u1'); u2 uuid := pg_temp.id('u2'); u3 uuid := pg_temp.id('u3'); c1 uuid := pg_temp.id('c1'); c2 uuid := pg_temp.id('c2');
  r jsonb; b bigint; n integer; s integer; t jsonb; d text := public.dukjil_kst_date()::text; def text;
begin
  perform pg_temp.fav(u1, c1);
  b := pg_temp.bal(u1); select count(*) into s from public.community_stamps where app_user_id = u1;
  r := public.cheer_dukjil_favorite(u1);
  perform pg_temp.check((r ->> 'earned')::int = 3 and (r ->> 'stamped')::boolean and not (r ->> 'replayed')::boolean and (r ->> 'celebrityId')::uuid = c1, 'S7 first cheer ' || r::text);
  perform pg_temp.check(pg_temp.bal(u1) = b + 3, 'S7 +3P');
  perform pg_temp.check(exists(select 1 from public.dukjil_action_log where app_user_id = u1 and action_key = 'cheer' and source_key = 'cheer:' || d
    and request_key = md5('cheer:' || u1 || ':' || d)::uuid), 'S7 key set by the function');
  r := public.cheer_dukjil_favorite(u1);
  perform pg_temp.check((r ->> 'earned')::int = 0 and (r ->> 'replayed')::boolean, 'S7 second cheer replays, earned 0');
  perform pg_temp.fav(u1, c2);
  r := public.cheer_dukjil_favorite(u1);
  perform pg_temp.check((r ->> 'earned')::int = 0 and (r ->> 'replayed')::boolean, 'S7 after a favorite change: replay');
  perform pg_temp.check(pg_temp.bal(u1) = b + 3 and (select count(*) from public.community_stamps where app_user_id = u1) = s + 1, 'S7 one ledger row, one stamp');
  perform pg_temp.fav(u2, c1);
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,''cheer'',''caller-key'',%L,''{}'')', u2, c2, extensions.gen_random_uuid()), 'DUKJIL_FAVORITE_REQUIRED');
  perform pg_temp.expect_error(format('select public.cheer_dukjil_favorite(%L)', pg_temp.id('u20')), 'DUKJIL_FAVORITE_REQUIRED');
  r := public.record_dukjil_action(u2, c1, 'cheer', 'caller-key', extensions.gen_random_uuid(), '{}');
  perform pg_temp.check(exists(select 1 from public.dukjil_action_log where app_user_id = u2 and action_key = 'cheer' and source_key = 'cheer:' || d), 'S7 caller source ignored');
  -- POLICY_INACTIVE before the key (scenario rolled back)
  begin
    update public.dukjil_policy_versions set status = 'retired' where status = 'active';
    perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,''cheer'',''x'',%L,''{}'')', u3, c1, extensions.gen_random_uuid()), 'POLICY_INACTIVE');
    raise exception 'B3_SCENARIO_DONE';
  exception when others then if sqlerrm <> 'B3_SCENARIO_DONE' then raise; end if;
  end;
  def := (select prosrc from pg_proc where oid = 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'::regprocedure);
  perform pg_temp.check(position('pol := public.dukjil_active_policy(v_now)' in def) < position('p_source_key := ''cheer:''' in def)
    and position('p_source_key := ''cheer:''' in def) < position('select * into prior from public.dukjil_action_log' in def), 'S7 static order: policy, key, prior');
  -- S8 check-in 2P and cheer 3P the same day
  perform pg_temp.fav(u3, c1); b := pg_temp.bal(u3);
  r := public.attend_creator(u3, c1, extensions.gen_random_uuid());
  r := public.cheer_dukjil_favorite(u3);
  perform pg_temp.check(pg_temp.bal(u3) = b + 5, 'S8 2P + 3P');
  -- S21 the day's Claim already stamped a cheer (its stamp, written the way claim_passport_page writes it)
  perform pg_temp.fav(pg_temp.id('u15'), c1);
  perform public.dukjil_issue_stamp_base(pg_temp.id('u15'), c1, 'cheer', 'page_claim_cheer:b3:' || d, 1);
  t := public.read_dukjil_today(pg_temp.id('u15'), c1);
  perform pg_temp.check(coalesce((t #>> '{actions,cheer,count}')::int, 0) = 0 and (t #>> '{actions,cheer,stamped}')::boolean, 'S21 after Claim: not done, stamp cap reached');
  r := public.cheer_dukjil_favorite(pg_temp.id('u15'));
  perform pg_temp.check((r ->> 'earned')::int = 3 and not (r ->> 'stamped')::boolean, 'S21 tap pays 3P without a second stamp');
  t := public.read_dukjil_today(pg_temp.id('u15'), c1);
  perform pg_temp.check((t #>> '{actions,cheer,count}')::int = 1, 'S21 done after the tap');
  -- S15 empty member: no passport, favorite, history
  r := public.observe_fan_tiers(pg_temp.id('u20'));
  perform pg_temp.check(r = '{"changes": []}'::jsonb, 'S15 observe empty');
  t := public.read_dukjil_today(pg_temp.id('u20'), null);
  perform pg_temp.check(t ? 'instaRepost' and t ? 'nextTierBonus' and t -> 'nextTierBonus' = 'null'::jsonb and (t #>> '{instaRepost,approvalsToday}')::int = 0, 'S15 today empty ' || t::text);
  perform pg_temp.check(public.list_fan_insta_reposts(pg_temp.id('u20'), c1) = '{"items": []}'::jsonb, 'S15 repost list empty');
  t := public.read_dukjil_today(pg_temp.id('u16'), c1);
  perform pg_temp.check(t #> '{nextTierBonus}' = '{"tier": "Silver", "points": 30, "progress": 0, "target": 3}'::jsonb, 'S15 next tier for a fresh passport ' || (t -> 'nextTierBonus')::text);
end $$;

-- ===== S1–S6 / S16 repost =====
do $$
declare u1 uuid := pg_temp.id('u1'); u2 uuid := pg_temp.id('u2'); u3 uuid := pg_temp.id('u3'); c1 uuid := pg_temp.id('c1'); c2 uuid := pg_temp.id('c2');
  adm uuid := pg_temp.id('adm'); al uuid := pg_temp.id('al'); op uuid := pg_temp.id('op'); op2 uuid := pg_temp.id('op2');
  r jsonb; p1 uuid; p2 uuid; p3 uuid; b bigint; n integer; sp jsonb; a uuid; sh text := repeat('ab', 32);
begin
  -- S1 the same post twice; a share proof of it too
  p1 := pg_temp.repost(u1, c1, 'B3postAAA1');
  r := public.submit_fan_insta_repost(u1, c1, 'reel', 'https://www.instagram.com/reel/B3postAAA1/', 'instagram:B3postAAA1', null, true);
  perform pg_temp.check((r ->> 'duplicate')::boolean and (r ->> 'id')::uuid = p1 and (select count(*) from public.fan_share_proofs where app_user_id = u1 and url_key = 'instagram:B3postAAA1') = 1, 'S1 duplicate');
  sp := public.submit_fan_share_proof(u2, c1, 'instagram', 'https://www.instagram.com/p/B3shareBB1/', 'instagram:B3shareBB1', true);
  r := public.submit_fan_insta_repost(u2, c1, 'feed', 'https://www.instagram.com/p/B3shareBB1/', 'instagram:B3shareBB1', null, true);
  perform pg_temp.check((r ->> 'duplicate')::boolean, 'S1/S16 a share proof key cannot be a repost');
  -- S2 pending 0P, approve 30P + share stamp
  b := pg_temp.bal(u1);
  perform pg_temp.check((select status = 'pending' and points is null from public.fan_share_proofs where id = p1) and pg_temp.bal(u1) = b, 'S2 pending, 0P');
  r := pg_temp.review(adm, al, p1, 'accept');
  perform pg_temp.check(r ->> 'payResult' = 'paid' and (r ->> 'points')::int = 30 and pg_temp.bal(u1) = b + 30, 'S2 approve 30P ' || r::text);
  perform pg_temp.check(exists(select 1 from public.dukjil_action_log l join public.fan_share_proofs s on s.action_log_id = l.id
    where s.id = p1 and l.action_key = 'insta_repost' and l.stamp_id is not null and l.created_at = s.approved_at), 'S2 log, stamp, approved_at = log time');
  -- S3 second approval the same KST day, other creator: 0P, share stamp of c2, no error; same creator: 0P, no stamp
  p2 := pg_temp.repost(u1, c2, 'B3postAAA2');
  r := pg_temp.review(adm, al, p2, 'accept');
  perform pg_temp.check(r ->> 'payResult' = 'point_cap' and (r ->> 'points')::int = 0, 'S3 second approval 0P ' || r::text);
  perform pg_temp.check((select l.points = 0 and l.stamp_id is not null and l.capped from public.dukjil_action_log l join public.fan_share_proofs s on s.action_log_id = l.id where s.id = p2), 'S3 other creator: stamp, capped log');
  p3 := pg_temp.repost(u1, c1, 'B3postAAA3');
  r := pg_temp.review(adm, al, p3, 'accept');
  perform pg_temp.check(r ->> 'payResult' = 'point_cap' and (select l.stamp_id is null and l.points = 0 from public.dukjil_action_log l join public.fan_share_proofs s on s.action_log_id = l.id where s.id = p3), 'S3 same creator: no stamp, no error');
  -- S6 reviewers
  p1 := pg_temp.repost(op, c1, 'B3postOP01');
  perform pg_temp.expect_error(format('select pg_temp.review(%L,null,%L,''accept'')', op, p1), 'SELF_REVIEW_FORBIDDEN');
  perform pg_temp.mkpass(adm, c1);
  p2 := pg_temp.repost(adm, c1, 'B3postADM1');
  perform pg_temp.expect_error(format('select pg_temp.review(%L,%L,%L,''accept'')', adm, al, p2), 'SELF_REVIEW_FORBIDDEN');
  p3 := pg_temp.repost(u2, c1, 'B3postU2a1');
  perform pg_temp.expect_error(format('select pg_temp.review(%L,null,%L,''accept'')', op2, p3), 'REVIEW_FORBIDDEN');
  perform pg_temp.expect_error(format('select pg_temp.review(%L,%L,%L,''accept'')', pg_temp.id('vw'), pg_temp.id('alv'), p3), 'REVIEW_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.review_fan_insta_repost(%L,%L,%L,7,''accept'',null)', adm, al, p3), 'REVIEW_STALE');
  b := pg_temp.bal(u2);
  r := pg_temp.review(op, null, p3, 'accept');
  perform pg_temp.check(r ->> 'payResult' = 'paid' and pg_temp.bal(u2) = b + 30
    and (select reviewer_role = 'page' and reviewed_by = op from public.fan_share_proofs where id = p3), 'S6 page operator approves 30P');
  perform pg_temp.check(exists(select 1 from public.audit_logs where entity_id = p3::text and action = 'insta_repost.accept' and actor_app_user_id = op and actor_admin_allowlist_id is null), 'S6 audit row for the page operator');
  -- reject, resubmit, reject as duplicate
  p1 := pg_temp.repost(u3, c1, 'B3postU3a1');
  r := pg_temp.review(adm, al, p1, 'reject', 'no_hashtag');
  perform pg_temp.check(r ->> 'status' = 'rejected', 'reject');
  perform pg_temp.expect_error(format('select pg_temp.review(%L,%L,%L,''reject'')', adm, al, p1), 'REVIEW_STALE');
  r := public.submit_fan_insta_repost(u3, c1, 'feed', 'https://www.instagram.com/p/B3postU3a1/', 'instagram:B3postU3a1', null, true);
  perform pg_temp.check(not (r ->> 'duplicate')::boolean and r ->> 'status' = 'pending' and (select review_revision = 1 from public.fan_share_proofs where id = p1), 'resubmit after a fixable reject');
  r := pg_temp.review(adm, al, p1, 'reject', 'duplicate');
  r := public.submit_fan_insta_repost(u3, c1, 'feed', 'https://www.instagram.com/p/B3postU3a1/', 'instagram:B3postU3a1', null, true);
  perform pg_temp.check((r ->> 'duplicate')::boolean, 'a duplicate reject cannot be resubmitted');
  -- S4 story
  perform pg_temp.expect_error(format('select public.submit_fan_insta_repost(%L,%L,''story'',null,null,null,true)', u3, c2), 'INSTA_REPOST_CAPTURE_REQUIRED');
  a := pg_temp.capture(u3, sh);
  r := public.submit_fan_insta_repost(u3, c2, 'story', null, null, a, true);
  perform pg_temp.check(not (r ->> 'duplicate')::boolean and (select url_key = 'image:' || left(sh, 40) and asset_id = a from public.fan_share_proofs where id = (r ->> 'id')::uuid)
    and (select attached_type = 'share_proof' and access_scope = 'share_proof' from public.mobile_media_assets where id = a), 'S4 story with a capture');
  p2 := (r ->> 'id')::uuid;
  perform pg_temp.check(public.authorize_share_proof_image_read(u3, null, p2, 'original') ->> 'storagePath' = 'b3/' || a || '.png', 'S4 owner reads the capture');
  perform pg_temp.check(public.authorize_share_proof_image_read(op, null, p2, 'original') is null, 'S4 a page operator of another creator does not');
  perform pg_temp.check(public.authorize_share_proof_image_read(adm, al, p2, 'original') is not null, 'S4 an admin reviewer does');
  perform pg_temp.check(public.authorize_share_proof_image_read(u1, null, p2, 'original') is null, 'S4 another member does not');
  r := public.submit_fan_insta_repost(u3, c2, 'story', null, null, a, true);
  perform pg_temp.check((r ->> 'duplicate')::boolean, 'S4 same capture again: duplicate');
  perform pg_temp.set_now(clock_timestamp() + interval '1 day');
  b := pg_temp.bal(u3);
  r := pg_temp.review(op2, null, p2, 'accept');
  perform pg_temp.check(r ->> 'payResult' = 'paid' and pg_temp.bal(u3) = b + 30, 'S4 story approved 30P');
  perform pg_temp.real_now();
  -- S16 the share API keeps to share rows
  p1 := pg_temp.repost(u3, c1, 'B3postX16a');
  sp := public.submit_fan_share_proof(u3, c1, 'instagram', 'https://www.instagram.com/p/B3postX16a/', 'instagram:B3postX16a', true);
  perform pg_temp.check((sp ->> 'duplicate')::boolean and (sp ->> 'replayed')::boolean and (sp ->> 'points')::int = 0 and sp ->> 'status' = 'accepted', 'S16 share submit of a repost key: closed replay');
  perform pg_temp.expect_error(format('select public.pay_fan_share_proof(%L,%L,%L,''{}'')', u3, p1, extensions.gen_random_uuid()), 'SHARE_PROOF_NOT_FOUND');
  perform pg_temp.check(not exists(select 1 from jsonb_array_elements(public.list_fan_share_proofs(u3, c1) -> 'items') x where (x ->> 'id')::uuid = p1), 'S16 share list leaves reposts out');
  perform pg_temp.check(not exists(select 1 from jsonb_array_elements(public.read_admin_share_proofs(adm, al, 'all', null, 100) -> 'items') x where (x ->> 'id')::uuid = p1), 'S16 admin share list leaves reposts out');
  -- the share flow: reviewed (20261221140000), then 10P, revocable
  b := pg_temp.bal(u2);
  sp := public.submit_fan_share_proof(u2, c2, 'instagram', 'https://www.instagram.com/p/B3shareBB2/', 'instagram:B3shareBB2', true);
  perform public.review_fan_share_proof(adm, al, (sp ->> 'id')::uuid, 0, 'accept', null, array['instagram','x']);
  r := public.pay_fan_share_proof(u2, (sp ->> 'id')::uuid, extensions.gen_random_uuid(), '{}');
  perform pg_temp.check((r ->> 'points')::int = 10 and pg_temp.bal(u2) = b + 10, 'S16 share proof still pays 10P ' || r::text);
  r := public.revoke_fan_share_proof(adm, al, (sp ->> 'id')::uuid, 'b3 test revoke');
  perform pg_temp.check(r ->> 'result' = 'corrected' and pg_temp.bal(u2) = b, 'S16 share revoke takes it back');
  -- queue
  r := public.read_insta_repost_review_queue(op, null, c1, 'pending', null, 50);
  perform pg_temp.check(jsonb_array_length(r -> 'items') >= 1 and not exists(select 1 from jsonb_array_elements(r -> 'items') x where x #>> '{creator,slug}' <> 'b3-one'), 'queue: page operator sees own creator only');
  perform pg_temp.expect_error(format('select public.read_insta_repost_review_queue(%L,null,%L,''pending'',null,50)', op, c2), 'REVIEW_FORBIDDEN');
  perform pg_temp.expect_error(format('select public.read_insta_repost_review_queue(%L,null,null,''pending'',null,50)', op), 'REVIEW_FORBIDDEN');
  perform pg_temp.check(public.read_page_insta_repost_queue(op, pg_temp.id('pg1'), 'pending', null, 50) = public.read_insta_repost_review_queue(op, null, c1, 'pending', null, 50), 'page queue = creator queue for its manager');
  perform pg_temp.expect_error(format('select public.read_page_insta_repost_queue(%L,%L,''pending'',null,50)', op, pg_temp.id('pg2')), 'REVIEW_FORBIDDEN');
end $$;

-- ===== S5 / S24 take-back =====
do $$
declare u4 uuid := pg_temp.id('u4'); u5 uuid := pg_temp.id('u5'); c1 uuid := pg_temp.id('c1'); c2 uuid := pg_temp.id('c2'); adm uuid := pg_temp.id('adm'); al uuid := pg_temp.id('al');
  p uuid; r jsonb; b bigint; t0 timestamptz := clock_timestamp() + interval '3 days'; st uuid;
begin
  perform pg_temp.set_now(t0);
  p := pg_temp.repost(u4, c2, 'B3postRV01');
  perform pg_temp.expect_error(format('select public.revoke_fan_share_proof(%L,%L,%L,''b3 revoke'')', adm, al, p), 'SHARE_PROOF_NOT_ACCEPTED');
  b := pg_temp.bal(u4);
  r := pg_temp.review(adm, al, p, 'accept');
  perform pg_temp.check(pg_temp.bal(u4) = b + 30, 'S5 paid');
  perform pg_temp.set_now(t0 + interval '6 days');
  perform pg_temp.expect_error(format('select public.revoke_fan_share_proof(%L,%L,%L,''b3 revoke'')', u4, al, p), 'ADMIN_REQUIRED');
  r := public.revoke_fan_share_proof(adm, al, p, 'b3 revoke');
  perform pg_temp.check(r ->> 'result' = 'corrected' and pg_temp.bal(u4) = b, 'S5 revoke after 6 days takes 30P back ' || r::text);
  r := public.revoke_fan_share_proof(adm, al, p, 'b3 revoke');
  perform pg_temp.check((r ->> 'replayed')::boolean and pg_temp.bal(u4) = b, 'S5 second revoke replays');
  perform pg_temp.check(exists(select 1 from public.dukjil_point_corrections k join public.fan_share_proofs s on s.action_log_id = k.action_log_id where s.id = p and k.void_reason = 'insta_repost_revoked'), 'S5 correction reason');
  -- after 7 days
  perform pg_temp.set_now(t0 + interval '1 day');
  p := pg_temp.repost(u4, c2, 'B3postRV02');
  r := pg_temp.review(adm, al, p, 'accept');
  perform pg_temp.set_now(t0 + interval '9 days');
  perform pg_temp.expect_error(format('select public.revoke_fan_share_proof(%L,%L,%L,''b3 revoke'')', adm, al, p), 'CLAWBACK_WINDOW_CLOSED');
  -- rejected: refused and stays rejected (can be submitted again)
  p := pg_temp.repost(u4, c2, 'B3postRV03');
  r := pg_temp.review(adm, al, p, 'reject', 'unrelated');
  perform pg_temp.expect_error(format('select public.revoke_fan_share_proof(%L,%L,%L,''b3 revoke'')', adm, al, p), 'SHARE_PROOF_NOT_ACCEPTED');
  perform pg_temp.check((select status from public.fan_share_proofs where id = p) = 'rejected', 'S5 rejected stays rejected');
  -- S24a void the share stamp first, then revoke: one correction
  perform pg_temp.set_now(t0 + interval '10 days');
  p := pg_temp.repost(u5, c2, 'B3postRV04');
  b := pg_temp.bal(u5);
  r := pg_temp.review(adm, al, p, 'accept');
  select l.stamp_id into st from public.dukjil_action_log l join public.fan_share_proofs s on s.action_log_id = l.id where s.id = p;
  perform pg_temp.check(st is not null, 'S24 share stamp issued');
  r := public.void_passport_stamp(adm, st, 'b3 fraud', false, 'b3-void-rv4');
  perform pg_temp.check(r ->> 'pointCorrection' = 'corrected' and pg_temp.bal(u5) = b, 'S24a stamp void takes the 30P back');
  r := public.revoke_fan_share_proof(adm, al, p, 'b3 revoke');
  perform pg_temp.check((select count(*) from public.dukjil_point_corrections k join public.fan_share_proofs s on s.action_log_id = k.action_log_id where s.id = p) = 1 and pg_temp.bal(u5) = b, 'S24a one correction ' || r::text);
  -- S24b/c eight days later: the stamp void still takes it back, the proof revoke is closed
  perform pg_temp.set_now(t0 + interval '11 days');
  p := pg_temp.repost(u5, c1, 'B3postRV05');
  b := pg_temp.bal(u5);
  r := pg_temp.review(adm, al, p, 'accept');
  perform pg_temp.set_now(t0 + interval '19 days');
  perform pg_temp.expect_error(format('select public.revoke_fan_share_proof(%L,%L,%L,''b3 revoke'')', adm, al, p), 'CLAWBACK_WINDOW_CLOSED');
  select l.stamp_id into st from public.dukjil_action_log l join public.fan_share_proofs s on s.action_log_id = l.id where s.id = p;
  if st is not null then
    r := public.void_passport_stamp(adm, st, 'b3 fraud', false, 'b3-void-rv5');
    perform pg_temp.check(pg_temp.bal(u5) = b and (select status from public.fan_share_proofs where id = p) = 'accepted', 'S24b void after 8 days takes 30P, proof stays accepted');
    perform pg_temp.check((select (x ->> 'clawedBack')::boolean from jsonb_array_elements(public.read_insta_repost_review_queue(adm, al, null, 'accepted', null, 100) -> 'items') x where (x ->> 'id')::uuid = p), 'S24b clawedBack in the admin list');
  else
    raise notice 'S24b: the share stamp of c1 was already used that real day; voided-path checked in S24a';
  end if;
  perform pg_temp.real_now();
end $$;

-- ===== S3 / S17 caps by approvals across days and the month, KST edges =====
do $$
declare u16 uuid := pg_temp.id('u16'); u17 uuid := pg_temp.id('u17'); u18 uuid := pg_temp.id('u18'); c1 uuid := pg_temp.id('c1'); adm uuid := pg_temp.id('adm'); al uuid := pg_temp.id('al');
  p uuid; r jsonb; d integer; m0 date := (date_trunc('month', public.dukjil_kst_date() + 31))::date; paid integer := 0; t timestamptz; l public.dukjil_action_log;
begin
  -- next month: 17 days with one approval each, three of those days with a second (0P): 20 approvals, 17 paid
  for d in 0..16 loop
    perform pg_temp.set_now(((m0 + d)::timestamp + time '12:00') at time zone 'Asia/Seoul');
    p := pg_temp.repost(u16, c1, 'B3m' || lpad(d::text, 2, '0') || 'aaaa');
    r := pg_temp.review(adm, al, p, 'accept');
    if r ->> 'payResult' = 'paid' then paid := paid + 1; end if;
    if d < 3 then
      p := pg_temp.repost(u16, c1, 'B3m' || lpad(d::text, 2, '0') || 'bbbb');
      r := pg_temp.review(adm, al, p, 'accept');
      perform pg_temp.check(r ->> 'payResult' = 'point_cap', 'S3 second approval of a day');
    end if;
  end loop;
  perform pg_temp.check(paid = 17 and (select count(*) from public.dukjil_action_log where app_user_id = u16 and action_key = 'insta_repost') = 20, 'S3 20 approvals, 17 paid');
  perform pg_temp.set_now(((m0 + 20)::timestamp + time '12:00') at time zone 'Asia/Seoul');
  p := pg_temp.repost(u16, c1, 'B3m21aaaaa');
  r := pg_temp.review(adm, al, p, 'accept');
  perform pg_temp.check(r ->> 'payResult' = 'month_cap' and (r ->> 'points')::int = 0, 'S3 21st approval of the month: 0P month_cap ' || r::text);
  -- S17 last instant of the month and the first of the next
  t := ((m0 + interval '1 month')::timestamp at time zone 'Asia/Seoul') - interval '1 millisecond';
  perform pg_temp.set_now(t);
  p := pg_temp.repost(u16, c1, 'B3edge0001');
  r := pg_temp.review(adm, al, p, 'accept');
  select * into l from public.dukjil_action_log where id = (select action_log_id from public.fan_share_proofs where id = p);
  perform pg_temp.check(r ->> 'payResult' = 'month_cap' and l.created_at = t and l.kst_date = (t at time zone 'Asia/Seoul')::date
    and (select approved_at from public.fan_share_proofs where id = p) = t, 'S17 23:59:59.999: month_cap, one time for log and approval');
  perform pg_temp.set_now(t + interval '1 millisecond');
  p := pg_temp.repost(u16, c1, 'B3edge0002');
  r := pg_temp.review(adm, al, p, 'accept');
  perform pg_temp.check(r ->> 'payResult' = 'paid', 'S17 00:00:00.000 of the next month: paid');
  -- cheer across midnight
  perform pg_temp.fav(u17, c1);
  perform pg_temp.set_now(t);
  r := public.cheer_dukjil_favorite(u17);
  perform pg_temp.set_now(t + interval '1 millisecond');
  r := public.cheer_dukjil_favorite(u17);
  perform pg_temp.check((select count(*) from public.dukjil_action_log where app_user_id = u17 and action_key = 'cheer' and points = 3
    and source_key in ('cheer:' || (t at time zone 'Asia/Seoul')::date, 'cheer:' || ((t + interval '1 millisecond') at time zone 'Asia/Seoul')::date)) = 2, 'S17 cheer on both sides of midnight');
  -- policy boundary: one microsecond before v4 vs at v4 (a copy with cheer 4P), via the record's own clock
  insert into public.dukjil_policy_versions(version, status, rules, mission_book, note, created_by)
    select 4, 'draft', jsonb_set(rules, '{actions,cheer,points}', '4'), mission_book, 'b3 test v4', 'b3-test' from public.dukjil_policy_versions where version = 2;
  update public.dukjil_policy_versions set status = 'active', effective_from = t + interval '1 millisecond' + interval '2 days' where version = 4;
  perform pg_temp.fav(u18, c1);
  perform pg_temp.set_now(t + interval '1 millisecond' + interval '2 days' - interval '1 microsecond');
  r := public.cheer_dukjil_favorite(u18);
  perform pg_temp.check((r ->> 'earned')::int = 3, 'S17 v2 one microsecond before v4');
  perform pg_temp.set_now(t + interval '1 millisecond' + interval '2 days');
  r := public.cheer_dukjil_favorite(u18);
  perform pg_temp.check((r ->> 'earned')::int = 4 and (select policy_version from public.dukjil_action_log where app_user_id = u18 and points = 4) = 4, 'S17 v4 at its instant');
  update public.dukjil_policy_versions set status = 'retired' where version = 4;
  perform pg_temp.real_now();
  perform pg_temp.check(position('public.dukjil_active_policy()' in (select prosrc from pg_proc where oid = 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'::regprocedure)) = 0
    and position('perform public.group_wallet_lock(p_user);' in (select prosrc from pg_proc where oid = 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'::regprocedure))
      < position('v_now := public.dukjil_now()' in (select prosrc from pg_proc where oid = 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'::regprocedure)), 'S17 static: clock after the lock, no bare active-policy call');
end $$;

-- ===== S13 repost approval of an inactive member =====
do $$
declare u19 uuid := pg_temp.id('u19'); c1 uuid := pg_temp.id('c1'); p uuid; r jsonb; n integer;
begin
  p := pg_temp.repost(u19, c1, 'B3postIN01');
  update public.app_users set status = 'disabled' where id = u19;
  select count(*) into n from public.dukjil_action_log where app_user_id = u19;
  r := pg_temp.review(pg_temp.id('adm'), pg_temp.id('al'), p, 'accept');
  perform pg_temp.check(r ->> 'status' = 'accepted' and r ->> 'payResult' = 'account_inactive' and (r ->> 'points')::int = 0
    and (select count(*) from public.dukjil_action_log where app_user_id = u19) = n, 'S13 inactive member: accepted 0P, no log');
  update public.app_users set status = 'active' where id = u19;
end $$;

-- ===== S23 nested payouts =====
do $$
declare u14 uuid := pg_temp.id('u14'); u15 uuid := pg_temp.id('u15'); c1 uuid := pg_temp.id('c1'); p uuid; r jsonb; b bigint; def text;
begin
  perform pg_temp.stamp(u14, c1, 'quiz'); perform pg_temp.stamp(u14, c1, 'post');
  b := pg_temp.bal(u14);
  p := pg_temp.repost(u14, c1, 'B3postNS01');
  r := pg_temp.review(pg_temp.id('adm'), pg_temp.id('al'), p, 'accept');
  perform pg_temp.check(pg_temp.grants(u14, c1) = 'Silver=30/paid' and pg_temp.bal(u14) = b + 60, 'S23 repost 30 + Silver 30 in one transaction ' || pg_temp.grants(u14, c1));
  -- a failing bonus payment does not fail the approval
  def := pg_get_functiondef('public.pay_fan_tier_bonus_grant(uuid)'::regprocedure);
  execute 'create or replace function public.pay_fan_tier_bonus_grant(p_grant uuid) returns text language plpgsql security definer set search_path = '''' as $f$ begin raise exception ''B3_TEST_PAY_FAILS''; end $f$';
  perform pg_temp.stamp(u15, c1, 'quiz'); perform pg_temp.stamp(u15, c1, 'post');
  b := pg_temp.bal(u15);
  p := pg_temp.repost(u15, c1, 'B3postNS02');
  r := pg_temp.review(pg_temp.id('adm'), pg_temp.id('al'), p, 'accept');
  perform pg_temp.check(r ->> 'payResult' in ('paid', 'point_cap') and (select status from public.fan_share_proofs where id = p) = 'accepted'
    and pg_temp.grants(u15, c1) = 'Silver=30/pending', 'S23 inner failure: approval stands, grant pending ' || pg_temp.grants(u15, c1));
  execute def;
end $$;

-- ===== S18 definer functions =====
do $$
declare f text; fns text[] := array['public.cheer_dukjil_favorite(uuid)', 'public.submit_fan_insta_repost(uuid,uuid,text,text,text,uuid,boolean)',
  'public.list_fan_insta_reposts(uuid,uuid)', 'public.can_review_insta_repost(uuid,uuid,uuid)', 'public.review_fan_insta_repost(uuid,uuid,uuid,integer,text,text)',
  'public.read_insta_repost_review_queue(uuid,uuid,uuid,text,timestamp with time zone,integer)', 'public.authorize_share_proof_image_read(uuid,uuid,uuid,text)',
  'public.read_page_insta_repost_queue(uuid,uuid,text,timestamp with time zone,integer)', 'public.dukjil_correct_proof_grant(uuid,uuid,text,text)', 'public.dukjil_sync_fan_tier(uuid,uuid,boolean)', 'public.dukjil_tier_lock(uuid)',
  'public.zzz_fan_tier_sync_row()', 'public.zzz_fan_tier_start_row()', 'public.dukjil_b3_payable(uuid)', 'public.pay_fan_tier_bonus_grant(uuid)',
  'public.retry_fan_tier_bonus_grants(integer)', 'public.replace_dukjil_policy(integer,timestamp with time zone)', 'public.retire_superseded_dukjil_policies()',
  'public.dukjil_tier_history_catch_up()', 'public.request_share_proof_capture_cleanup()', 'public.read_dukjil_b3_today(uuid,uuid,public.dukjil_policy_versions)',
  'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 'public.observe_fan_tiers(uuid,public.content_locale)', 'public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)',
  'public.pay_fan_share_proof(uuid,uuid,uuid,jsonb)', 'public.list_fan_share_proofs(uuid,uuid)', 'public.revoke_fan_share_proof(uuid,uuid,uuid,text)',
  'public.dukjil_correct_share_grant(uuid,uuid,text)', 'public.read_owned_group_wallet_history(uuid,integer)', 'public.read_dukjil_today(uuid,uuid)',
  'public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)', 'public.passport_stamp_action(public.community_stamp_kind)'];
  svc text[] := array['public.cheer_dukjil_favorite(uuid)', 'public.submit_fan_insta_repost(uuid,uuid,text,text,text,uuid,boolean)', 'public.list_fan_insta_reposts(uuid,uuid)',
  'public.review_fan_insta_repost(uuid,uuid,uuid,integer,text,text)', 'public.read_insta_repost_review_queue(uuid,uuid,uuid,text,timestamp with time zone,integer)',
  'public.authorize_share_proof_image_read(uuid,uuid,uuid,text)', 'public.read_page_insta_repost_queue(uuid,uuid,text,timestamp with time zone,integer)', 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 'public.observe_fan_tiers(uuid,public.content_locale)',
  'public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 'public.pay_fan_share_proof(uuid,uuid,uuid,jsonb)', 'public.list_fan_share_proofs(uuid,uuid)',
  'public.revoke_fan_share_proof(uuid,uuid,uuid,text)', 'public.read_owned_group_wallet_history(uuid,integer)', 'public.read_dukjil_today(uuid,uuid)',
  'public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)'];
  p record; caught boolean;
begin
  foreach f in array fns loop
    select prosecdef, proconfig into p from pg_proc where oid = f::regprocedure;
    perform pg_temp.check(p.prosecdef and p.proconfig @> array['search_path=""'], 'S18 definer + empty search_path: ' || f);
    perform pg_temp.check(not has_function_privilege('anon', f, 'execute') and not has_function_privilege('authenticated', f, 'execute'), 'S18 anon/authenticated cannot execute ' || f);
    perform pg_temp.check(has_function_privilege('service_role', f, 'execute') = (f = any(svc)), 'S18 service_role execute as listed: ' || f);
  end loop;
  perform pg_temp.check(not (select prosecdef from pg_proc where oid = 'public.dukjil_now()'::regprocedure) and (select provolatile from pg_proc where oid = 'public.dukjil_now()'::regprocedure) = 'v', 'S18 dukjil_now volatile invoker');
  caught := false;
  begin
    set local role anon;
    perform public.cheer_dukjil_favorite(pg_temp.id('u1'));
  exception when insufficient_privilege then caught := true;
  end;
  reset role;
  perform pg_temp.check(caught, 'S18 anon call refused');
  caught := false;
  begin
    set local role authenticated;
    perform public.review_fan_insta_repost(pg_temp.id('adm'), pg_temp.id('al'), extensions.gen_random_uuid(), 0, 'accept', null);
  exception when insufficient_privilege then caught := true;
  end;
  reset role;
  perform pg_temp.check(caught, 'S18 authenticated call refused');
  perform pg_temp.check(not has_table_privilege('service_role', 'public.fan_tier_bonus_grants', 'select') and not has_table_privilege('authenticated', 'public.fan_tier_bonus_grants', 'select')
    and (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.fan_tier_bonus_grants'::regclass), 'S18 grants table closed');
end $$;

-- ===== S19 patch bookkeeping =====
do $$
declare f text; md text; copy text; r text;
begin
  for f in select fn from public.b3_function_patch_bases loop
    perform pg_temp.check(public.b3_patch_function(f, false) = 'unchanged', 'S19 re-apply is a no-op: ' || f);
  end loop;
  f := 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)';
  perform pg_temp.check(public.b3_patch_function(f, true) = 'reverted', 'S19 revert');
  md := (select base_md5 from public.b3_function_patch_bases where fn = f);
  perform pg_temp.check((select md5(prosrc) from pg_proc where oid = f::regprocedure) = md, 'S19 reverted md5 = base');
  perform pg_temp.check(public.b3_patch_function(f, true) = 'unchanged', 'S19 revert again is a no-op');
  -- a copy whose original text moved: PARTIAL
  copy := replace(pg_get_functiondef(f::regprocedure), 'public.record_dukjil_action(', 'public.b3_probe_record(');
  execute replace(copy, '  if (rule -> ''pointsMin'') is not null then', '  if (rule -> ''pointsMin'') is not null  then');
  perform pg_temp.expect_error(format('select public.b3_patch_function(%L, false, %L::regprocedure)', f, 'public.b3_probe_record(uuid,uuid,text,text,uuid,jsonb)'), 'B3_PATCH_PARTIAL');
  drop function public.b3_probe_record(uuid,uuid,text,text,uuid,jsonb);
  perform pg_temp.check(public.b3_patch_function(f, false) = 'applied', 'S19 re-apply');
  -- a copy with one patched text removed: PARTIAL
  copy := replace(pg_get_functiondef(f::regprocedure), 'public.record_dukjil_action(', 'public.b3_probe_record(');
  execute replace(copy, ' /* b3-P7 */', '');
  perform pg_temp.expect_error(format('select public.b3_patch_function(%L, false, %L::regprocedure)', f, 'public.b3_probe_record(uuid,uuid,text,text,uuid,jsonb)'), 'B3_PATCH_PARTIAL');
  drop function public.b3_probe_record(uuid,uuid,text,text,uuid,jsonb);
end $$;

-- policy inactive: an old action replays exactly as before the patch (scenario rolled back)
do $$
declare u3 uuid := pg_temp.id('u3'); c1 uuid := pg_temp.id('c1'); k uuid := extensions.gen_random_uuid(); r1 jsonb; r2 jsonb;
begin
  r1 := public.record_dukjil_action(u3, c1, 'post', 'b3-old-post', k, '{}');
  begin
    update public.dukjil_policy_versions set status = 'retired' where status = 'active';
    r2 := public.record_dukjil_action(u3, c1, 'post', 'b3-old-post', k, '{}');
    perform pg_temp.check(r2 = r1 || '{"replayed": true}'::jsonb and not r2 ? 'at', 'S19 old action replay unchanged without a policy ' || r2::text);
    perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,''post'',''b3-old-post-2'',%L,''{}'')', u3, c1, extensions.gen_random_uuid()), 'POLICY_INACTIVE');
    raise exception 'B3_SCENARIO_DONE';
  exception when others then if sqlerrm <> 'B3_SCENARIO_DONE' then raise; end if;
  end;
end $$;

-- wallet history labels
do $$
declare r jsonb;
begin
  r := public.read_owned_group_wallet_history(pg_temp.id('u9'), 30);
  perform pg_temp.check(exists(select 1 from jsonb_array_elements(r -> 'entries') x where x ->> 'actionKey' = 'tier_bonus' and x ->> 'tier' = 'Gold'), 'history: tier bonus row carries tier');
  perform pg_temp.check(not exists(select 1 from jsonb_array_elements(r -> 'entries') x where x ->> 'actionKey' <> 'tier_bonus' and x ? 'tier'), 'history: other rows have no tier key');
  r := public.read_owned_group_wallet_history(pg_temp.id('u4'), 30);
  perform pg_temp.check(exists(select 1 from jsonb_array_elements(r -> 'entries') x where x ->> 'correctionReason' = 'insta_repost_revoked' and x ->> 'actionKey' = 'insta_repost'), 'history: repost take-back reason');
end $$;

select 'dukjil_b3 ok' as result;
rollback;

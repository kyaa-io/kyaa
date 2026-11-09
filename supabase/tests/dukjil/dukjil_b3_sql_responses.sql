\set ON_ERROR_STOP on
-- Real SQL answers of the B3 functions (cheer, today, reposts, review queue, tier changes, wallet history, the share duplicate),
-- including an empty member's. apps/web/server/insta-repost/b3-sql-responses.test.ts runs them through the route handlers' schemas.
-- Regenerate on a disposable clean-chain database with the B3 migrations:
--   psql -X -q -At -f supabase/tests/dukjil/dukjil_b3_sql_responses.sql > apps/web/server/insta-repost/b3-sql-responses.json
begin;
create temp table b3_answers(name text primary key, value jsonb) on commit drop;
do $$
declare c uuid := 'b3d00000-0000-4000-8000-000000000001'; adm uuid := 'b3d00000-0000-4000-8000-000000000010'; al uuid := 'b3d00000-0000-4000-8000-000000000020';
  fan uuid := 'b3d00000-0000-4000-8000-000000000011'; empty_fan uuid := 'b3d00000-0000-4000-8000-000000000012'; u uuid; j uuid; p uuid; r jsonb; pr uuid; pr2 uuid; i integer;
begin
  update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true, migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;
  update public.reward_policy_activation set policy_version = 3 where singleton;
  update public.dukjil_policy_versions set status = 'active', effective_from = now() - interval '2 hours', activated_at = now() where version = 1 and status = 'draft';
  update public.dukjil_policy_versions set status = 'active', effective_from = now() - interval '1 hour', activated_at = now() where version = 2 and status = 'draft';
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c,'b3-answer','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c,'ko','응답','b3','b3'),(c,'en','Answer','b3','b3');
  update public.celebrities set status='published' where id=c;
  insert into public.app_users(id,privy_user_id,verified_email,status) values(adm,'did:privy:b3d-adm','b3d-adm@byus.test','active');
  insert into public.admin_allowlist(id,email,role,active) values(al,'b3d-adm@byus.test','admin',true);
  foreach u in array array[fan, empty_fan] loop
    insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:b3d-'||u,'b3d-'||u||'@byus.test','active');
    insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(u,91342,'0xbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbd00'||right(u::text,2),'privy','embedded');
  end loop;
  j := extensions.gen_random_uuid(); p := extensions.gen_random_uuid();
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'passport',p,'b3d-pass-'||p,1,jsonb_build_object('recipient','0xbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbd0011','celebritySlug','b3-answer','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,fan,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  perform public.dukjil_sync_fan_tier(fan, c, false);
  insert into public.fan_profile_public_fields(app_user_id, favorite_celebrity_id, sns_links) values (fan, c, '{}');

  insert into b3_answers values ('cheer_first', public.cheer_dukjil_favorite(fan)), ('cheer_replay', public.cheer_dukjil_favorite(fan));
  insert into b3_answers values ('today_empty', public.read_dukjil_today(empty_fan, null)), ('today_empty_creator', public.read_dukjil_today(empty_fan, c));
  insert into b3_answers values ('reposts_empty', public.list_fan_insta_reposts(empty_fan, c)), ('tier_changes_empty', public.observe_fan_tiers(empty_fan, 'ko'));
  r := public.submit_fan_insta_repost(fan, c, 'feed', 'https://www.instagram.com/p/B3answer01/', 'instagram:B3answer01', null, true);
  insert into b3_answers values ('repost_submit', r);
  insert into b3_answers values ('repost_submit_duplicate', public.submit_fan_insta_repost(fan, c, 'reel', 'https://www.instagram.com/reel/B3answer01/', 'instagram:B3answer01', null, true));
  insert into b3_answers values ('share_submit_duplicate', public.submit_fan_share_proof(fan, c, 'instagram', 'https://www.instagram.com/p/B3answer01/', 'instagram:B3answer01', true));
  pr := (r ->> 'id')::uuid;
  insert into b3_answers values ('queue_pending', public.read_insta_repost_review_queue(adm, al, null, 'pending', null, 50));
  insert into b3_answers values ('review_accept', public.review_fan_insta_repost(adm, al, pr, 0, 'accept', null));
  pr2 := (public.submit_fan_insta_repost(fan, c, 'feed', 'https://www.instagram.com/p/B3answer02/', 'instagram:B3answer02', null, true) ->> 'id')::uuid;
  insert into b3_answers values ('review_reject', public.review_fan_insta_repost(adm, al, pr2, 0, 'reject', 'no_hashtag'));
  insert into b3_answers values ('queue_all', public.read_insta_repost_review_queue(adm, al, c, 'all', null, 50));
  insert into b3_answers values ('reposts_list', public.list_fan_insta_reposts(fan, c));
  -- tier bonus: two more slots after the repost's share stamp -> Silver, a heart -> Gold
  perform public.dukjil_issue_stamp(fan, c, 'quiz', 'b3d-quiz', 1);
  perform public.dukjil_issue_stamp(fan, c, 'post', 'b3d-post', 1);
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id) values (c, fan, 1, 'passport_page_claim', extensions.gen_random_uuid());
  insert into b3_answers values ('tier_changes_bonus', public.observe_fan_tiers(fan, 'ko'));
  insert into b3_answers values ('today_v2', public.read_dukjil_today(fan, c));
  insert into b3_answers values ('wallet_history', public.read_owned_group_wallet_history(fan, 30));
  insert into b3_answers values ('revoke_repost', public.revoke_fan_share_proof(adm, al, pr, 'b3 answer revoke'));
  insert into b3_answers values ('wallet_history_revoked', public.read_owned_group_wallet_history(fan, 30));
end $$;
select jsonb_pretty(jsonb_object_agg(name, value order by name)) from b3_answers;
rollback;

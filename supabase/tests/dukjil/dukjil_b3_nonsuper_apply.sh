#!/usr/bin/env bash
# B3 review F3: the B3 migrations applied by a role shaped like dev's applier (no superuser, no BYPASSRLS, a member of the role that
# owns the tables, owner of the functions it patches). Disposable clean-chain database with the B3 migrations applied; everything runs
# in transactions that roll back.
#  1. roll the B3 files back, re-apply them as b3_apply, then run the payouts as the functions' owner: cheer 3P, a repost approved
#     30P and revoked, a tier bonus paid on the write, today's read, the wallet history, observe, the retry and the catch-up.
#  2. the reverse: an applier that is not a member of the tables' owner cannot grant, and the first file that needs access stops
#     with B3_OWNER_GAP instead of leaving functions that read 0 rows.
# Uses the caller's PG* environment.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
P="psql -X -q -v ON_ERROR_STOP=1"
DB=$($P -At -c "select current_database()")
case "$DB" in byus_clean|b3*) ;; *) echo "disposable clean-chain database required (got $DB)"; exit 1;; esac
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
FILES=(20261220030000_b3_policy_replace 20261220031000_b3_record_action 20261220032000_b3_cheer 20261220033000_b3_insta_repost 20261220034000_b3_tier_bonus 20261220035000_b3_reads)
strip() { grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" "$1"; }
: > "$TMP/rollback.sql"; : > "$TMP/apply.sql"
# rollbacks newest first (a plain index loop: tail -r is BSD only)
for (( i = ${#FILES[@]} - 1; i >= 0; i-- )); do strip "$ROOT/supabase/rollback/${FILES[i]}.sql" >> "$TMP/rollback.sql"; done
for f in "${FILES[@]}"; do strip "$ROOT/supabase/migrations/$f.sql" >> "$TMP/apply.sql"; done
OWNER=$($P -At -c "select current_user")
setup() { # $1: 'member' or 'outsider'
cat <<SQL
begin;
\i $TMP/rollback.sql
create role b3_apply nologin nosuperuser nobypassrls;
grant create, usage on schema public to b3_apply;
grant usage on schema extensions, cron to b3_apply;
grant execute on function cron.schedule(text, text, text) to b3_apply;
grant select, insert on cron.job to b3_apply; -- the clean-chain shim of pg_cron (the real one checks its own rights)
do \$\$ declare s text := pg_get_serial_sequence('cron.job', 'jobid'); begin if s is not null then execute format('grant usage on sequence %s to b3_apply', s); end if; end \$\$;
$( [ "$1" = member ] && echo "grant \"$OWNER\" to b3_apply;" )
-- dev's applier owns the functions B3 patches
do \$\$ declare f text; begin
  foreach f in array array['public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)', 'public.passport_stamp_action(public.community_stamp_kind)',
    'public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 'public.pay_fan_share_proof(uuid,uuid,uuid,jsonb)', 'public.list_fan_share_proofs(uuid,uuid)',
    'public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)', 'public.revoke_fan_share_proof(uuid,uuid,uuid,text)',
    'public.scrub_fan_share_proofs_on_deletion()', 'public.reserve_owned_mobile_media(uuid,text,text,text,integer,uuid)', 'public.dukjil_correct_share_grant(uuid,uuid,text)',
    'public.observe_fan_tiers(uuid,public.content_locale)', 'public.read_dukjil_today(uuid,uuid)', 'public.read_owned_group_wallet_history(uuid,integer)',
    'public.dukjil_active_policy(timestamp with time zone)', 'public.passport_policy_row()'] loop
    execute format('alter function %s owner to b3_apply', f::regprocedure);
  end loop;
  alter table public.dukjil_policy_versions owner to b3_apply;
end \$\$;
set role b3_apply;
SQL
}

# 1. member applier: the files apply and the payouts work as b3_apply
{ setup member; cat <<SQL
\i $TMP/apply.sql
reset role;
do \$\$
declare
  c uuid := 'b3a00000-0000-4000-8000-000000000001'; adm uuid := 'b3a00000-0000-4000-8000-000000000010'; al uuid := 'b3a00000-0000-4000-8000-000000000020';
  u uuid := 'b3a00000-0000-4000-8000-000000000011'; j uuid := gen_random_uuid(); p uuid := gen_random_uuid(); r jsonb; pr uuid; i integer; owners text;
begin
  if (select rolsuper or rolbypassrls from pg_roles where rolname = 'b3_apply') then raise exception 'probe role is privileged'; end if;
  select string_agg(distinct pg_get_userbyid(proowner), ',') into owners from pg_proc
   where proname in ('record_dukjil_action','cheer_dukjil_favorite','review_fan_insta_repost','dukjil_sync_fan_tier','read_dukjil_b3_today','observe_fan_tiers');
  if owners <> 'b3_apply' then raise exception 'B3 functions not owned by the applier: %', owners; end if;
  raise notice 'b3_apply policies: %', (select string_agg(cl.relname, ',' order by cl.relname) from pg_policy po join pg_class cl on cl.oid = po.polrelid where 'b3_apply'::regrole = any(po.polroles));
  update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true, migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;
  update public.reward_policy_activation set policy_version = 3 where singleton;
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '2 hours', activated_at=now() where version=1;
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=2;
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c,'b3-nonsuper','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c,'ko','b3','b3','b3'),(c,'en','b3','b3','b3');
  update public.celebrities set status='published' where id=c;
  insert into public.app_users(id,privy_user_id,verified_email,status) values(adm,'did:privy:b3a-adm','b3a-adm@byus.test','active'),(u,'did:privy:b3a-u','b3a-u@byus.test','active');
  insert into public.admin_allowlist(id,email,role,active) values(al,'b3a-adm@byus.test','admin',true);
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(u,91342,'0xbabababababababababababababababababa0011','privy','embedded');
  insert into public.fan_profile_public_fields(app_user_id, favorite_celebrity_id, sns_links) values (u, c, '{}');
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'passport',p,'b3a-pass-'||p,1,jsonb_build_object('recipient','0xbabababababababababababababababababa0011','celebritySlug','b3-nonsuper','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,gen_random_uuid(),j);
  set local session_replication_role = origin;
  perform public.dukjil_sync_fan_tier(u, c, false);
  if (select count(*) from public.fan_tier_history where app_user_id = u) <> 1 then raise exception 'nonsuper: start row missing'; end if;
  r := public.cheer_dukjil_favorite(u);
  if (r ->> 'earned')::int <> 3 then raise exception 'nonsuper cheer %', r; end if;
  pr := (public.submit_fan_insta_repost(u, c, 'feed', 'https://www.instagram.com/p/B3nonsup01/', 'instagram:B3nonsup01', null, true) ->> 'id')::uuid;
  if jsonb_array_length(public.read_insta_repost_review_queue(adm, al, c, 'pending', null, 50) -> 'items') <> 1 then raise exception 'nonsuper queue empty'; end if;
  r := public.review_fan_insta_repost(adm, al, pr, 0, 'accept', null);
  if r ->> 'payResult' <> 'paid' then raise exception 'nonsuper review %', r; end if;
  perform public.dukjil_issue_stamp(u, c, 'quiz', 'b3a-quiz', 1);
  perform public.dukjil_issue_stamp(u, c, 'post', 'b3a-post', 1);
  if (select string_agg(tier || '/' || status, ',') from public.fan_tier_bonus_grants where app_user_id = u) <> 'Silver/paid' then
    raise exception 'nonsuper tier bonus %', (select string_agg(tier || '/' || status, ',') from public.fan_tier_bonus_grants where app_user_id = u); end if;
  if (select (x ->> 'bonusPoints')::int from jsonb_array_elements(public.observe_fan_tiers(u) -> 'changes') x limit 1) <> 30 then raise exception 'nonsuper observe bonusPoints'; end if;
  r := public.read_dukjil_today(u, c);
  if (r #>> '{instaRepost,paidMonth}')::int <> 1 or r #>> '{nextTierBonus,tier}' <> 'Gold' then raise exception 'nonsuper today %', r; end if;
  if not exists (select 1 from jsonb_array_elements(public.read_owned_group_wallet_history(u, 30) -> 'entries') x where x ->> 'tier' = 'Silver') then raise exception 'nonsuper wallet tier'; end if;
  r := public.revoke_fan_share_proof(adm, al, pr, 'b3 nonsuper revoke');
  if r ->> 'result' not in ('corrected', 'review') then raise exception 'nonsuper revoke %', r; end if;
  perform public.retry_fan_tier_bonus_grants(10);
  perform public.dukjil_tier_history_catch_up();
  perform public.request_share_proof_capture_cleanup();
  raise notice 'b3 nonsuper apply ok';
end \$\$;
rollback;
SQL
} > "$TMP/member.sql"
$P -f "$TMP/member.sql" 2>&1 | grep -e "b3 nonsuper apply ok" -e "b3_apply policies" -e ERROR | tee "$TMP/member.out"
grep -q "b3 nonsuper apply ok" "$TMP/member.out" || { echo "b3 nonsuper apply failed"; exit 1; }

# 2. reverse: an applier outside the tables' owner stops with B3_OWNER_GAP
{ setup outsider; echo "\\i $TMP/apply.sql"; echo "rollback;"; } > "$TMP/outsider.sql"
if out=$(psql -X -q -v ON_ERROR_STOP=1 -f "$TMP/outsider.sql" 2>&1); then echo "outsider applied without a gap"; exit 1; fi
echo "$out" | grep -q "B3_OWNER_GAP" || { echo "outsider failed for another reason:"; echo "$out" | grep -m3 ERROR; exit 1; }
echo "outsider: $(echo "$out" | grep -m1 -o 'B3_OWNER_GAP[^(]*' | cut -c1-160)"
echo "dukjil b3 nonsuper ok"

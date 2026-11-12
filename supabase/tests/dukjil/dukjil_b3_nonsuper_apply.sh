#!/usr/bin/env bash
# B3 review F3: the B3 migrations applied by a role shaped like dev's applier (no superuser, no BYPASSRLS, a member of the role that
# owns the tables, owner of the functions it patches). Disposable clean-chain database with the B3 migrations applied; everything runs
# in transactions that roll back.
#  1. roll the B3 files back, re-apply them as b3_apply, then run the payouts as the functions' owner: cheer 3P, a repost approved
#     30P and revoked, a tier bonus paid on the write, today's read, the wallet history, observe, the retry and the catch-up.
#     reserve_owned_mobile_media also carries the fan-board video limit (20261221170000) as B3 pair 3 (20261222130000), so those two
#     files roll back before the B3 files and apply after them (newest first, the documented order; 20261221171000 only touches the S3
#     reservation and stays): the 200 MiB fan-post video / 50 MiB other boundary, the pair bookkeeping and the owner and grants hold.
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
LATER=(20261221170000_fan_board_video_limit 20261222130000_fan_board_video_limit_b3_pair 20261224000400_dukjil_comment_any_length 20261224030000_dukjil_comment_any_length_b3_pair) # later files that change a B3-patched function
strip() { grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" "$1"; }
: > "$TMP/rollback.sql"; : > "$TMP/apply.sql"; : > "$TMP/later.sql"
for (( i = ${#LATER[@]} - 1; i >= 0; i-- )); do strip "$ROOT/supabase/rollback/${LATER[i]}.sql" >> "$TMP/rollback.sql"; done
for f in "${LATER[@]}"; do strip "$ROOT/supabase/migrations/$f.sql" >> "$TMP/later.sql"; done
strip "$ROOT/supabase/migrations/20261222130000_fan_board_video_limit_b3_pair.sql" > "$TMP/pair.sql"
strip "$ROOT/supabase/rollback/20261222130000_fan_board_video_limit_b3_pair.sql" > "$TMP/pair_rollback.sql"
strip "$ROOT/supabase/migrations/20261224030000_dukjil_comment_any_length_b3_pair.sql" > "$TMP/comment_pair.sql"
strip "$ROOT/supabase/rollback/20261224030000_dukjil_comment_any_length_b3_pair.sql" > "$TMP/comment_pair_rollback.sql"
RECORD="public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)"
RESERVE="public.reserve_owned_mobile_media(uuid,text,text,text,integer,uuid)"
RESERVE_ACL="select string_agg((a).grantee::regrole::text || ':' || (a).privilege_type, ',' order by (a).grantee::regrole::text, (a).privilege_type) from (select aclexplode(proacl) a, proowner o from pg_proc where oid = '$RESERVE'::regprocedure) x where (a).grantee <> o" # the owner itself changes in setup
# rollbacks newest first (a plain index loop: tail -r is BSD only)
for (( i = ${#FILES[@]} - 1; i >= 0; i-- )); do strip "$ROOT/supabase/rollback/${FILES[i]}.sql" >> "$TMP/rollback.sql"; done
for f in "${FILES[@]}"; do strip "$ROOT/supabase/migrations/$f.sql" >> "$TMP/apply.sql"; done
OWNER=$($P -At -c "select current_user")
setup() { # $1: 'member' or 'outsider'
cat <<SQL
begin;
create temp table reserve_acl_before as select ($RESERVE_ACL) as acl;
\i $TMP/rollback.sql
do \$\$ begin
  if pg_get_functiondef('$RESERVE'::regprocedure) ~ '209715200' then raise exception 'rollback kept the 200 MiB fan-post limit'; end if;
  if to_regclass('public.b3_function_patches') is not null then raise exception 'rollback kept the B3 bookkeeping'; end if;
end \$\$;
create role b3_apply nologin nosuperuser nobypassrls;
grant create, usage on schema public to b3_apply;
grant usage on schema extensions, cron to b3_apply;
grant execute on function cron.schedule(text, text, text), cron.unschedule(bigint) to b3_apply;
grant select, insert, delete on cron.job to b3_apply; -- the clean-chain shim of pg_cron (the real one checks its own rights)
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
\i $TMP/later.sql
reset role;
-- the fan-board video limit is B3 pair 3: the bookkeeping, the boundary (security definer, so it runs as the owner b3_apply), the grants
do \$\$
declare
  f text := '$RESERVE'; u uuid := 'b3a00000-0000-4000-8000-000000000031'; n integer := 0; t record; r text;
begin
  if (select count(*) from public.b3_function_patches where fn = f) <> 3 then raise exception 'reserve pairs %', (select count(*) from public.b3_function_patches where fn = f); end if;
  if pg_get_userbyid((select proowner from pg_proc where oid = f::regprocedure)) <> 'b3_apply' then raise exception 'reserve owner changed'; end if;
  if (select acl from reserve_acl_before) is distinct from ($RESERVE_ACL) then raise exception 'reserve grants changed: % -> %', (select acl from reserve_acl_before), ($RESERVE_ACL); end if;
  if public.b3_patch_function(f, false) <> 'unchanged' then raise exception 'reserve pairs not all applied'; end if;
  r := public.b3_patch_function(f, true);
  if r <> 'reverted' then raise exception 'reserve revert %', r; end if;
  if md5((select prosrc from pg_proc where oid = f::regprocedure)) <> (select base_md5 from public.b3_function_patch_bases where fn = f) then raise exception 'reserve revert md5 is not the base'; end if;
  if pg_get_functiondef(f::regprocedure) ~ '209715200' then raise exception 'reserve revert kept the 200 MiB limit'; end if;
  if public.b3_patch_function(f, false) <> 'applied' then raise exception 'reserve re-apply'; end if;
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:b3a-size','b3a-size@byus.test','active');
  for t in select * from (values ('video','fan_post','video/mp4',209715200,true), ('video','fan_post','video/mp4',209715201,false),
      ('video','fan_clip','video/mp4',52428800,true), ('video','fan_clip','video/mp4',52428801,false), ('video','dm','video/mp4',52428801,false),
      ('image','fan_post','image/jpeg',52428801,false)) v(kind,purpose,ct,size,ok) loop
    begin
      perform public.reserve_owned_mobile_media(u, t.kind, t.purpose, t.ct, t.size, gen_random_uuid());
      if not t.ok then raise exception 'size boundary: % % % accepted', t.purpose, t.kind, t.size; end if;
      n := n + 1;
    exception when raise_exception then
      if sqlerrm like 'size boundary:%' then raise; end if;
      if t.ok or sqlerrm <> 'MEDIA_INVALID_INPUT' then raise exception 'size boundary: % % % -> %', t.purpose, t.kind, t.size, sqlerrm; end if;
    end;
  end loop;
  if n <> 2 then raise exception 'size boundary accepted %', n; end if;
  raise notice 'b3 reserve pair 3 ok';
end \$\$;
-- the pair file is a no-op when pair 3 is applied, and restores the 200 MiB limit over a B3 body without it
\i $TMP/pair.sql
\i $TMP/pair_rollback.sql
do \$\$ declare f oid := '$RESERVE'::regprocedure; s text; begin
  if (select count(*) from public.b3_function_patches where fn = '$RESERVE') <> 2 or pg_get_functiondef(f) !~ 'then 209715200 else 52428800 end\)\n' then raise exception 'pair rollback is not 20261221170000''s state'; end if;
  s := (select prosrc from pg_proc where oid = f);
  execute replace(pg_get_functiondef(f), s, replace(s, 'p_byte_size not between 1 and (case when p_purpose=''fan_post'' and p_kind=''video'' then 209715200 else 52428800 end)', 'p_byte_size not between 1 and 52428800'));
end \$\$;
\i $TMP/pair.sql
do \$\$ begin
  if (select count(*) from public.b3_function_patches where fn = '$RESERVE') <> 3 or public.b3_patch_function('$RESERVE', false) <> 'unchanged'
    or pg_get_functiondef('$RESERVE'::regprocedure) !~ '209715200 else 52428800 end\) /\* b3-fan-video-limit \*/' then raise exception 'pair file did not restore pair 3'; end if;
  raise notice 'b3 reserve pair 3 replay ok';
end \$\$;
-- the comment-at-any-length rule (20261224000400) is B3 pair 11 of record_dukjil_action (20261224030000): a no-op when applied, undone
-- by its rollback to 20261224000400's own text, and put back over the base line
\i $TMP/comment_pair.sql
do \$\$ declare f text := '$RECORD'; begin
  if (select count(*) from public.b3_function_patches where fn = f) <> 11 or public.b3_patch_function(f, false) <> 'unchanged'
    or pg_get_functiondef(f::regprocedure) !~ '/\* b3-comment-any-length \*/ if p_action_key not in' then raise exception 'comment pair 11 is not applied'; end if;
  if pg_get_userbyid((select proowner from pg_proc where oid = f::regprocedure)) <> 'b3_apply' then raise exception 'record owner changed'; end if;
  raise notice 'b3 comment pair 11 ok';
end \$\$;
\i $TMP/comment_pair_rollback.sql
do \$\$ declare f text := '$RECORD'; s text; begin
  s := (select prosrc from pg_proc where oid = f::regprocedure);
  if (select count(*) from public.b3_function_patches where fn = f) <> 10 or public.b3_patch_function(f, false) <> 'unchanged'
    or public.b3_patch_count(s, '  -- 20261224000400: a comment pays at any length too.') <> 1 or s ~ 'b3-comment-any-length' then raise exception 'comment pair rollback is not 20261224000400''s state'; end if;
  -- back to the base line (a B3 rollback and re-apply after 20261224000400), the pair file puts the rule back
  execute replace(pg_get_functiondef(f::regprocedure), s, replace(s, E'  -- 20261224000400: a comment pays at any length too.\n  if p_action_key not in (''post'', ''comment'')', '  if p_action_key <> ''post'''));
end \$\$;
\i $TMP/comment_pair.sql
do \$\$ declare f text := '$RECORD'; begin
  if (select count(*) from public.b3_function_patches where fn = f) <> 11 or public.b3_patch_function(f, false) <> 'unchanged'
    or pg_get_functiondef(f::regprocedure) !~ '/\* b3-comment-any-length \*/ if p_action_key not in' then raise exception 'comment pair file did not restore pair 11'; end if;
  raise notice 'b3 comment pair 11 replay ok';
end \$\$;
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
$P -f "$TMP/member.sql" 2>&1 | grep -e "b3 nonsuper apply ok" -e "b3 reserve pair 3" -e "b3 comment pair 11" -e "b3_apply policies" -e ERROR | tee "$TMP/member.out"
grep -q "b3 nonsuper apply ok" "$TMP/member.out" && grep -q "b3 reserve pair 3 ok" "$TMP/member.out" && grep -q "b3 reserve pair 3 replay ok" "$TMP/member.out" && grep -q "b3 comment pair 11 ok" "$TMP/member.out" && grep -q "b3 comment pair 11 replay ok" "$TMP/member.out" || { echo "b3 nonsuper apply failed"; exit 1; }

# 2. reverse: an applier outside the tables' owner stops with B3_OWNER_GAP
{ setup outsider; echo "\\i $TMP/apply.sql"; echo "rollback;"; } > "$TMP/outsider.sql"
if out=$(psql -X -q -v ON_ERROR_STOP=1 -f "$TMP/outsider.sql" 2>&1); then echo "outsider applied without a gap"; exit 1; fi
echo "$out" | grep -q "B3_OWNER_GAP" || { echo "outsider failed for another reason:"; echo "$out" | grep -m3 ERROR; exit 1; }
echo "outsider: $(echo "$out" | grep -m1 -o 'B3_OWNER_GAP[^(]*' | cut -c1-160)"
echo "dukjil b3 nonsuper ok"

#!/usr/bin/env bash
# DUKJIL-POLICY ④: 20261221140000 and its rollback, owner / ACL / row-security safe. Disposable clean-chain database with the migration applied.
# Everything runs in transactions that roll back. Uses the caller's PG* environment.
#  1. rollback and re-apply as the owner: the review function goes and comes back, the old bodies return, the share status shape narrows and
#     widens again, and the ACL of every share function is the same before and after (server role only; never anon, authenticated, public).
#  2. the rollback refuses while a pending or rejected share proof exists.
#  3. a non-superuser applier that is a member of the tables' owner and owns the functions it replaces: apply works and the
#     submit -> review -> pay -> list -> admin list chain runs as that owner.
#  4. an applier outside the tables' owner stops with B3_OWNER_GAP instead of leaving functions that read 0 rows.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
P="psql -X -q -v ON_ERROR_STOP=1"
DB=$($P -At -c "select current_database()")
case "$DB" in byus_clean|b3*) ;; *) echo "disposable clean-chain database required (got $DB)"; exit 1;; esac
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
strip() { grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" "$1"; }
strip "$ROOT/supabase/migrations/20261221140000_share_tag_review.sql" > "$TMP/apply.sql"
# the isolated chain may hold committed pending or rejected proofs from other suites; the rollback guard has its own check (step 2)
{ echo "delete from public.fan_share_proofs where kind = 'share' and status in ('pending', 'rejected');"; strip "$ROOT/supabase/rollback/20261221140000_share_tag_review.sql"; } > "$TMP/rollback_clear.sql"
strip "$ROOT/supabase/rollback/20261221140000_share_tag_review.sql" > "$TMP/rollback.sql"
OWNER=$($P -At -c "select current_user")
ACL="select string_agg(p.oid::regprocedure::text || ' owner=' || pg_get_userbyid(p.proowner) || ' acl=' || coalesce((select string_agg(distinct (a).grantee::regrole::text || ':' || (a).privilege_type, ',' order by (a).grantee::regrole::text || ':' || (a).privilege_type) from aclexplode(p.proacl) a), 'none'), E'\n' order by p.oid::regprocedure::text) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('submit_fan_share_proof','read_admin_share_proofs','review_fan_share_proof','pay_fan_share_proof','list_fan_share_proofs','revoke_fan_share_proof')"

# 2. a pending proof blocks the rollback (the real rollback script, run past its first error)
{ cat <<SQL
begin;
do \$\$
declare u uuid := 'b3d10000-0000-4000-8000-000000000011'; c uuid := 'b3d10000-0000-4000-8000-000000000001'; j uuid := gen_random_uuid(); p uuid := gen_random_uuid();
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c,'b3-rb','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c,'ko','b3','b3','b3'),(c,'en','b3','b3','b3');
  update public.celebrities set status='published' where id=c;
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:b3d1-u','b3d1-u@byus.test','active');
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'passport',p,'b3d1-pass-'||p,1,jsonb_build_object('recipient','0xb3d1b3d1b3d1b3d1b3d1b3d1b3d1b3d1b3d10011','celebritySlug','b3-rb','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,gen_random_uuid(),j);
  set local session_replication_role = origin;
  perform public.submit_fan_share_proof(u, c, 'x', 'https://x.com/f/status/1870000000000000001', 'x:1870000000000000001', true);
end \$\$;
\\set ON_ERROR_STOP off
\\i $TMP/rollback.sql
rollback;
SQL
} > "$TMP/guard.sql"
out=$($P -f "$TMP/guard.sql" 2>&1 || true)
echo "$out" | grep -q "ERROR:  SHARE_PENDING_ROWS_EXIST" || { echo "rollback did not refuse while a pending share proof exists:"; echo "$out" | head -5; exit 1; }
echo "rollback guard ok"

# 1. rollback then re-apply, owner
cat > "$TMP/cycle.sql" <<SQL
begin;
create temp table acl_before as select ($ACL) as acl;
\\i $TMP/rollback_clear.sql
do \$\$ begin
  if to_regprocedure('public.review_fan_share_proof(uuid,uuid,uuid,integer,text,text,text[])') is not null then raise exception 'review function survived the rollback'; end if;
  if pg_get_functiondef('public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)'::regprocedure) ~ 'SHARE_PROOF_URL_REUSED' then raise exception 'old submit not restored'; end if;
  if pg_get_functiondef('public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)'::regprocedure) ~ 'rejectCode' then raise exception 'old admin list not restored'; end if;
  if (select count(*) from public.b3_function_patches where fn in ('public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 'public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)')) <> 2 then raise exception 'B3 pair rows not back to pair 1 only'; end if;
  if public.b3_patch_function('public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', false) <> 'unchanged' or public.b3_patch_function('public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)', false) <> 'unchanged' then raise exception 'B3 bookkeeping not intact after the rollback'; end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'fan_share_proofs_kind_shape') ~ 'pending' then raise exception 'old status shape not restored'; end if;
end \$\$;
create temp table acl_rolled as select ($ACL) as acl;
\\i $TMP/apply.sql
create temp table acl_after as select ($ACL) as acl;
do \$\$ declare a text := (select acl from acl_before); b text := (select acl from acl_after); r text := (select acl from acl_rolled); begin
  if r ~ '(anon|authenticated|public|=):' then raise exception 'rolled-back ACL exposes a function: %', r; end if;
  if r ~ 'review_fan_share_proof' then raise exception 'rolled-back ACL still lists the review function'; end if;
  if a is distinct from b then raise exception E'ACL changed over rollback and re-apply:\n%\n--\n%', a, b; end if;
end \$\$;
rollback;
SQL
$P -f "$TMP/cycle.sql"
echo "rollback and re-apply ok (ACL and owners unchanged)"

OUTSIDE_SETUP() { cat <<SQL
begin;
\\i $TMP/rollback_clear.sql
create role share_apply nologin nosuperuser nobypassrls;
grant create, usage on schema public to share_apply;
grant usage on schema extensions to share_apply;
$( [ "$1" = member ] && echo "grant \"$OWNER\" to share_apply;" )
do \$\$ declare f text; begin
  foreach f in array array['public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 'public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)'] loop
    execute format('alter function %s owner to share_apply', f::regprocedure);
  end loop;
  -- dev's applier created the B3 bookkeeping tables, so it owns them and row security has a policy for it
  alter table public.b3_function_patches owner to share_apply;
  alter table public.b3_function_patch_bases owner to share_apply;
  create policy share_apply_patches on public.b3_function_patches for all to share_apply using (true) with check (true);
  create policy share_apply_bases on public.b3_function_patch_bases for all to share_apply using (true) with check (true);
end \$\$;
set role share_apply;
\\i $TMP/apply.sql
SQL
}

# 3. member applier
{ OUTSIDE_SETUP member; cat <<SQL
reset role;
do \$\$
declare
  c uuid := 'b3d20000-0000-4000-8000-000000000001'; adm uuid := 'b3d20000-0000-4000-8000-000000000010'; al uuid := 'b3d20000-0000-4000-8000-000000000020';
  u uuid := 'b3d20000-0000-4000-8000-000000000011'; j uuid := gen_random_uuid(); p uuid := gen_random_uuid(); r jsonb; pid uuid;
begin
  if (select rolsuper or rolbypassrls from pg_roles where rolname = 'share_apply') then raise exception 'probe role is privileged'; end if;
  if pg_get_userbyid((select proowner from pg_proc where proname = 'review_fan_share_proof')) <> 'share_apply' then raise exception 'review function not owned by the applier'; end if;
  update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true, migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;
  update public.reward_policy_activation set policy_version = 3 where singleton;
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '2 hours', activated_at=now() where version=1 and status='draft';
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=2 and status='draft';
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c,'b3-sna','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c,'ko','b3','b3','b3'),(c,'en','b3','b3','b3');
  update public.celebrities set status='published' where id=c;
  insert into public.app_users(id,privy_user_id,verified_email,status) values(adm,'did:privy:b3d2-adm','b3d2-adm@byus.test','active'),(u,'did:privy:b3d2-u','b3d2-u@byus.test','active');
  insert into public.admin_allowlist(id,email,role,active) values(al,'b3d2-adm@byus.test','admin',true);
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(u,91342,'0xb3d2b3d2b3d2b3d2b3d2b3d2b3d2b3d2b3d20011','privy','embedded');
  insert into public.fan_profile_public_fields(app_user_id, favorite_celebrity_id, sns_links) values (u, c, '{}');
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload) values(j,'passport',p,'b3d2-pass-'||p,1,jsonb_build_object('recipient','0xb3d2b3d2b3d2b3d2b3d2b3d2b3d2b3d2b3d20011','celebritySlug','b3-sna','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,gen_random_uuid(),j);
  set local session_replication_role = origin;
  r := public.submit_fan_share_proof(u, c, 'x', 'https://x.com/f/status/1870000000000000002', 'x:1870000000000000002', true);
  pid := (r ->> 'id')::uuid;
  if r ->> 'status' <> 'pending' then raise exception 'nonsuper submit %', r; end if;
  if jsonb_array_length(public.read_admin_share_proofs(adm, al, 'pending', null, 50) -> 'items') <> 1 then raise exception 'nonsuper admin list empty'; end if;
  r := public.review_fan_share_proof(adm, al, pid, 0, 'accept', null, array['x']);
  if r ->> 'status' <> 'accepted' or r ->> 'creatorSlug' <> 'b3-sna' then raise exception 'nonsuper review %', r; end if;
  if not exists (select 1 from public.audit_logs where entity_type = 'fan_share_proof' and entity_id = pid::text and action = 'share_proof.accept') then raise exception 'nonsuper review left no audit row'; end if;
  r := public.pay_fan_share_proof(u, pid, gen_random_uuid(), '{}');
  if coalesce((r ->> 'points')::int, 0) <= 0 then raise exception 'nonsuper payout %', r; end if;
  if (select x ->> 'status' from jsonb_array_elements(public.list_fan_share_proofs(u, c) -> 'items') x limit 1) <> 'accepted' then raise exception 'nonsuper member list'; end if;
  raise notice 'share tag nonsuper apply ok';
end \$\$;
rollback;
SQL
} > "$TMP/member.sql"
$P -f "$TMP/member.sql" 2>&1 | grep -e "share tag nonsuper apply ok" -e ERROR | tee "$TMP/member.out"
grep -q "share tag nonsuper apply ok" "$TMP/member.out" || { echo "share tag nonsuper apply failed"; exit 1; }

# 4. outsider applier
{ OUTSIDE_SETUP outsider; echo "rollback;"; } > "$TMP/outsider.sql"
if out=$(psql -X -q -v ON_ERROR_STOP=1 -f "$TMP/outsider.sql" 2>&1); then echo "outsider applied without a gap"; exit 1; fi
echo "$out" | grep -q -e "B3_OWNER_GAP" -e "must be owner" -e "permission denied" -e "B3_PATCH_UNKNOWN" || { echo "outsider failed for another reason:"; echo "$out" | grep -m3 ERROR; exit 1; }
echo "outsider stopped: $(echo "$out" | grep -m1 ERROR | cut -c1-160)"
echo "share tag nonsuper ok"

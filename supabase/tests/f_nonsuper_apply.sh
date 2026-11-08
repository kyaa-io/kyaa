#!/usr/bin/env bash
# Review r4b H1: 20261215060000 + 20261215070000 applied by a role shaped like dev's byus_admin (no superuser, no BYPASSRLS, a member of
# postgres and byus_admin, the owners of the tables the new functions read). One transaction, rolled back, the role included.
# Checks, as the functions that role owns: (1) an operator cancel really voids the share stamp and takes the points back,
# (2) the account deletion trigger clears the proof address, (3) observe_fan_tiers records the tier.
# usage: f_nonsuper_apply.sh [git-ref]   no ref: the working tree's files; a ref (e.g. 3925cbc5e): that commit's files, to show the
# failure before the fix. STRIP_POLICY=1: the working tree's files without their owner-policy block, to show that a blocked cancel
# stops with an error and leaves the proof open. Uses the caller's PG* environment (local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper). Database: byus.
set -euo pipefail
REF="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
take() { # file -> $TMP/file without its own transaction lines
  mkdir -p "$TMP/$(dirname "$1")"
  if [ -n "$REF" ]; then git -C "$ROOT" show "$REF:$1"; else cat "$ROOT/$1"; fi | grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" > "$TMP/$1"
}
for f in supabase/rollback/20261215070000_share_proofs.sql supabase/rollback/20261215060000_fan_tier_history.sql \
         supabase/migrations/20261215060000_fan_tier_history.sql supabase/migrations/20261215070000_share_proofs.sql; do take "$f"; done
# 20261215090000 (one tier source) exists only in the working tree.
HAS90=0; if [ -z "$REF" ] || git -C "$ROOT" cat-file -e "$REF:supabase/migrations/20261215090000_tier_source_hearts.sql" 2>/dev/null; then HAS90=1; take supabase/migrations/20261215090000_tier_source_hearts.sql; fi
grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" "$ROOT/supabase/rollback/20261215090000_tier_source_hearts.sql" > "$TMP/rb90.sql"
APPLY90=""; [ "$HAS90" = 1 ] && APPLY90="\\i $TMP/supabase/migrations/20261215090000_tier_source_hearts.sql"
if [ "${STRIP_POLICY:-}" = 1 ]; then
  for f in supabase/migrations/20261215060000_fan_tier_history.sql supabase/migrations/20261215070000_share_proofs.sql; do
    sed -i '' '/-- owner-policy-begin/,/-- owner-policy-end/d' "$TMP/$f"
  done
fi
# The current rollback also removes what the older file added; always take it from the working tree.
grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" "$ROOT/supabase/rollback/20261215070000_share_proofs.sql" > "$TMP/supabase/rollback/20261215070000_share_proofs.sql"
EXPECT=0; [ -z "$REF" ] && [ "${STRIP_POLICY:-}" != 1 ] && EXPECT=1
psql -X -q -v ON_ERROR_STOP=1 -d byus <<SQL
begin;
create role f_apply nologin nosuperuser nobypassrls;
grant postgres, byus_admin to f_apply;
-- Local only: functions made by earlier local applies belong to the local superuser; membership stands in for that ownership.
grant localsuper to f_apply;
\i $TMP/rb90.sql
\i $TMP/supabase/rollback/20261215070000_share_proofs.sql
\i $TMP/supabase/rollback/20261215060000_fan_tier_history.sql
set role f_apply;
\i $TMP/supabase/migrations/20261215060000_fan_tier_history.sql
\i $TMP/supabase/migrations/20261215070000_share_proofs.sql
$APPLY90
reset role;
-- Locally byus_admin is a superuser and would hide the problem; take its row security bypass away inside this transaction only
-- for the functions f_apply now owns (they run as f_apply). Existing byus_admin functions keep running as before.
do \$\$
declare fp record; adm record; tier_rows integer; r jsonb; v_id uuid; award jsonb; bal_before bigint; bal_paid bigint; bal_after bigint;
  stamp_ok boolean; points_ok boolean; scrub_ok boolean; tier_ok boolean; one_ok boolean; one_bad integer; one_all integer; cancel_text text; trg record; other uuid;
begin
  if (select rolsuper or rolbypassrls from pg_roles where rolname = 'f_apply') then raise exception 'probe role is privileged'; end if;
  if pg_get_userbyid((select proowner from pg_proc where oid = 'public.dukjil_correct_share_grant(uuid,uuid,text)'::regprocedure)) <> 'f_apply' then raise exception 'functions not owned by the applying role'; end if;
  raise notice 'policies for f_apply: %', (select string_agg(c.relname, ',' order by c.relname) from pg_policy p join pg_class c on c.oid = p.polrelid where 'f_apply'::regrole = any(p.polroles));

  -- (3) tier history
  select p.app_user_id into fp from public.fan_passports p join public.app_users u on u.id = p.app_user_id and u.status = 'active' limit 1;
  delete from public.fan_tier_history where app_user_id = fp.app_user_id;
  perform public.observe_fan_tiers(fp.app_user_id, 'ko');
  select count(*) into tier_rows from public.fan_tier_history where app_user_id = fp.app_user_id;
  tier_ok := tier_rows > 0;
  raise notice 'probe3 tier history rows written: %', tier_rows;

  -- (1) cancel takes the grant back
  select p.app_user_id, p.celebrity_id into fp from public.fan_passports p join public.app_users u on u.id = p.app_user_id and u.status = 'active'
    where exists (select 1 from public.user_wallets w where w.app_user_id = p.app_user_id)
      and not exists (select 1 from public.dukjil_action_log d where d.app_user_id = p.app_user_id and d.action_key = 'share' and d.created_at > now() - interval '1 day')
    order by p.issued_at desc limit 1;
  select a.id allowlist, u.id actor into adm from public.admin_allowlist a join public.app_users u on u.verified_email = a.email and u.status = 'active' where a.active and a.role <> 'viewer' limit 1;
  begin
    r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/probe/status/1850000000000000777', 'x:1850000000000000777', true);
  exception when undefined_function then
    r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/probe/status/1850000000000000777', 'x:1850000000000000777');
  end;
  v_id := (r->>'id')::uuid;
  bal_before := public.group_wallet_balance(fp.app_user_id, 'fan_point');
  award := public.record_dukjil_action(fp.app_user_id, fp.celebrity_id, 'share', 'share-proof:' || v_id::text, extensions.gen_random_uuid(), '{}'::jsonb);
  update public.fan_share_proofs set points = (award->>'points')::int where id = v_id;
  bal_paid := public.group_wallet_balance(fp.app_user_id, 'fan_point');
  begin
    r := public.revoke_fan_share_proof(adm.actor, adm.allowlist, v_id, 'probe cancel');
    cancel_text := r::text;
  exception when others then cancel_text := 'error: ' || sqlerrm; end;
  bal_after := public.group_wallet_balance(fp.app_user_id, 'fan_point');
  stamp_ok := (award->>'stampId') is null or exists (select 1 from public.community_stamps s where s.id = (award->>'stampId')::uuid and s.revoked_at is not null);
  points_ok := bal_after = bal_before;
  raise notice 'probe1 paid % (stamp %), cancel answered %, proof status %, stamp voided %, balance % -> % -> %',
    award->>'points', award->>'stampId', cancel_text, (select status from public.fan_share_proofs where id = v_id), stamp_ok, bal_before, bal_paid, bal_after;

  -- (2) deletion scrub through the real trigger (other cleanups on app_users are switched off inside this transaction only)
  select s.app_user_id into other from public.fan_share_proofs s where s.id = v_id;
  for trg in select tgname from pg_trigger where tgrelid = 'public.app_users'::regclass and not tgisinternal and tgname <> 'app_users_scrub_fan_share_proofs' loop
    execute format('alter table public.app_users disable trigger %I', trg.tgname);
  end loop;
  insert into public.account_deletion_requests (app_user_id, status) select other, 'pending'
    where not exists (select 1 from public.account_deletion_requests where app_user_id = other and status = 'pending');
  update public.app_users set status = 'disabled' where id = other;
  scrub_ok := (select url from public.fan_share_proofs where id = v_id) is null and exists (select 1 from public.fan_share_proofs where id = v_id);
  raise notice 'probe2 address cleared by the deletion trigger: %', scrub_ok;

  -- (4) one tier source (20261215090000): the replaced functions keep their owner, and MY agrees with the fan list.
  select count(*) filter (where (x.value -> 'passport' ->> 'tier') is distinct from public.get_fan_effective_tier(p.app_user_id, p.celebrity_id)), count(*)
    into one_bad, one_all
    from (select distinct app_user_id from public.fan_passports limit 60) u
    cross join lateral jsonb_array_elements(public.get_owned_my_fan_activity_with_stages(u.app_user_id, 'ko', now()) -> 'creators') x
    join public.celebrities c on c.slug = x.value -> 'celebrity' ->> 'slug'
    join public.fan_passports p on p.app_user_id = u.app_user_id and p.celebrity_id = c.id;
  one_ok := one_bad = 0 and pg_get_userbyid((select proowner from pg_proc where oid = 'public.get_fan_effective_tier_for_score(uuid,uuid,integer,integer)'::regprocedure)) = 'postgres';
  raise notice 'probe4 MY vs fan list tier differences: % of % passports, for_score owner %', one_bad, one_all, pg_get_userbyid((select proowner from pg_proc where oid = 'public.get_fan_effective_tier_for_score(uuid,uuid,integer,integer)'::regprocedure));
  raise notice 'RESULT stamp=% points=% scrub=% tier=% one_source=%', stamp_ok, points_ok, scrub_ok, tier_ok, one_ok;
  if $EXPECT = 1 and not (stamp_ok and points_ok and scrub_ok and tier_ok and one_ok) then raise exception 'probe failed'; end if;
end \$\$;
rollback;
SQL

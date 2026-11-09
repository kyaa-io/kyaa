#!/usr/bin/env bash
# B6 plan v4 S18: the three B6 rollbacks on a disposable copy that has the B6 migrations. It commits, so never point it at a
# database you keep. usage: b6_rollback.sh <socket-dir> <port> <scratch-database>
set -euo pipefail
SOCKET_DIR="$1"; PORT="$2"; DB="$3"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
sql() { psql -X -q -At -v ON_ERROR_STOP=1 -h "$SOCKET_DIR" -p "$PORT" -d "$DB" "$@"; }
WORK="$(mktemp -d "${TMPDIR:-/tmp}/b6-rollback.XXXXXX")"; trap 'rm -rf "$WORK"' EXIT

# The originals the rollback must bring back, captured before it runs.
sql -c "select string_agg(regexp_replace(p.oid::regprocedure::text,'_before_b6\(','(')||'='||md5(regexp_replace(pg_get_functiondef(p.oid),'FUNCTION public\.([a-z_]+)_before_b6\(','FUNCTION public.\1(')),E'\n' order by regexp_replace(p.oid::regprocedure::text,'_before_b6\(','('))
 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like '%\_before\_b6'" > "$WORK/expected"
[ "$(wc -l < "$WORK/expected")" -ge 23 ] || { echo "S18 fixture: expected at least 23 _before_b6 copies" >&2; exit 1; }

# Rows: declined; declined then cancelled; declined then blocked; an ordinary pending request.
sql <<'SQL'
do $$
declare pub uuid:='b6180000-0000-4000-8000-0000000000aa';u uuid;r jsonb;
 a uuid:='b6180000-0000-4000-8000-000000000001';b uuid:='b6180000-0000-4000-8000-000000000002';c uuid:='b6180000-0000-4000-8000-000000000003';
 d uuid:='b6180000-0000-4000-8000-000000000004';e uuid:='b6180000-0000-4000-8000-000000000005';
begin
 insert into public.group_pages(id,kind,name)values(pub,'hobby','B6 rollback page');
 foreach u in array array[a,b,c,d,e] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:b618-'||u,u||'@example.test');
  insert into public.group_memberships(page_id,app_user_id)values(pub,u);
 end loop;
 r:=public.request_social_dm(a,b,'declined',extensions.gen_random_uuid());perform public.resolve_social_dm(b,(r->>'id')::uuid,'reject',extensions.gen_random_uuid());
 r:=public.request_social_dm(a,c,'declined then cancelled',extensions.gen_random_uuid());perform public.resolve_social_dm(c,(r->>'id')::uuid,'reject',extensions.gen_random_uuid());
 perform public.resolve_social_dm(a,(r->>'id')::uuid,'cancel',extensions.gen_random_uuid());
 r:=public.request_social_dm(a,d,'declined then blocked',extensions.gen_random_uuid());perform public.resolve_social_dm(d,(r->>'id')::uuid,'reject',extensions.gen_random_uuid());
 perform public.block_social_profile(d,a,extensions.gen_random_uuid());
 perform public.request_social_dm(a,e,'ordinary',extensions.gen_random_uuid());
end $$;
SQL
rows() { sql -c "select md5(string_agg(id::text||status||coalesce(retry_at::text,'')||updated_at::text,',' order by id)) from public.social_dm_conversations"; }

sql -f "$ROOT/supabase/rollback/20261220042000_b6_profile_report.sql"
sql -f "$ROOT/supabase/rollback/20261220041000_b6_profile_refs.sql"

# A failure part-way leaves everything as it was: a view on declined_at stops the column drop at the end.
sql -c "create view public.b6_rollback_blocker as select declined_at from public.social_dm_conversations"
before="$(rows)"
if sql -f "$ROOT/supabase/rollback/20261220040000_b6_dm_request_privacy.sql" 2>"$WORK/fail.log"; then echo "S18 rollback should have failed" >&2; exit 1; fi
grep -q "b6_rollback_blocker" "$WORK/fail.log" || { cat "$WORK/fail.log" >&2; exit 1; }
[ "$(rows)" = "$before" ] || { echo "S18 a failed rollback changed rows" >&2; exit 1; }
[ "$(sql -c "select count(*) from pg_proc where proname='request_social_dm_before_b6'")" = 1 ] || { echo "S18 a failed rollback dropped functions" >&2; exit 1; }
sql -c "drop view public.b6_rollback_blocker"

sql -f "$ROOT/supabase/rollback/20261220040000_b6_dm_request_privacy.sql"
sql -v expected="$(cat "$WORK/expected")" > "$WORK/actual" <<'SQL'
select string_agg(p.oid::regprocedure::text||'='||md5(pg_get_functiondef(p.oid)),E'\n' order by p.oid::regprocedure::text) from pg_proc p
 where p.pronamespace='public'::regnamespace and p.oid::regprocedure::text in(select split_part(line,'=',1) from unnest(string_to_array(:'expected',E'\n')) line)
SQL
diff "$WORK/expected" "$WORK/actual" || { echo "S18 functions differ from their _before_b6 originals" >&2; exit 1; }
sql <<'SQL'
do $$
declare a uuid:='b6180000-0000-4000-8000-000000000001';
begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='social_dm_conversations' and column_name='declined_at') then raise exception 'S18 declined_at left'; end if;
 if to_regclass('public.social_dm_request_log') is not null or to_regclass('public.social_profile_return_refs') is not null or to_regclass('public.social_profile_report_snapshots') is not null then raise exception 'S18 tables left'; end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and (proname like '%\_before\_b6' or proname like 'b6\_%' or proname in('social_lock_pair_for','social_lock_pair_actor','social_dm_hidden_for','read_owned_social_blocks_closed','report_social_profile','read_social_profile_by_ref'))) then raise exception 'S18 functions left'; end if;
 if (select status||':'||(retry_at between now()+interval '23 hours' and now()+interval '25 hours') from public.social_dm_conversations where requester_id=a and 'b6180000-0000-4000-8000-000000000002' in(user_low_id,user_high_id))<>'rejected:true' then raise exception 'S18 declined row'; end if;
 if (select status from public.social_dm_conversations where requester_id=a and 'b6180000-0000-4000-8000-000000000003' in(user_low_id,user_high_id))<>'cancelled' then raise exception 'S18 cancelled row'; end if;
 if (select status from public.social_dm_conversations where requester_id=a and 'b6180000-0000-4000-8000-000000000004' in(user_low_id,user_high_id))<>'rejected' then raise exception 'S18 blocked row'; end if;
 if (select status from public.social_dm_conversations where requester_id=a and 'b6180000-0000-4000-8000-000000000005' in(user_low_id,user_high_id))<>'pending' then raise exception 'S18 ordinary row'; end if;
end $$;
SQL
# A second run stops at the shape check.
if sql -f "$ROOT/supabase/rollback/20261220040000_b6_dm_request_privacy.sql" 2>"$WORK/twice.log"; then echo "S18 second run should stop" >&2; exit 1; fi
grep -q B6_DM_PRIVACY_ROLLBACK_SHAPE "$WORK/twice.log"
echo "PASS b6_rollback"

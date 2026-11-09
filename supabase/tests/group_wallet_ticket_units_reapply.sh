#!/usr/bin/env bash
# 20261219070000 after the full chain: rollback → 1 ticket per ad again → re-apply → N tickets again, then the ticket-units suite on the
# re-applied body (a second apply is a no-op). One transaction, rolled back.
# Needs PGHOST/PGPORT/PGDATABASE of a disposable database with every migration applied (scripts/verify-clean-migration-chain.sh
# BYUS_CLEAN_DB_SHELL_ASSERTION_FILE, or verify-backend-security-behavior.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
strip() { grep -v -x -e 'begin;' -e 'commit;' -e 'rollback;' -e "notify pgrst, 'reload schema';" -e '\\set ON_ERROR_STOP on'; }
strip < "$ROOT/supabase/migrations/20261219070000_group_wallet_ticket_units.sql" > "$TMP/m.sql"
strip < "$ROOT/supabase/rollback/20261219070000_group_wallet_ticket_units.sql" > "$TMP/rb.sql"
strip < "$ROOT/supabase/tests/group_wallet_ticket_units.sql" > "$TMP/t.sql"
psql -X -q -v ON_ERROR_STOP=1 -h "$PGHOST" -p "${PGPORT:-5432}" -d "${PGDATABASE:-byus_clean}" <<SQL
begin;
create function pg_temp.reapply_body()returns text language sql as \$\$select pg_get_functiondef('public.exchange_owned_group_wallet(uuid,uuid,text,text,integer,uuid,integer)'::regprocedure)\$\$;
create function pg_temp.reapply_count(needle text)returns integer language sql as \$\$select (length(pg_temp.reapply_body())-length(replace(pg_temp.reapply_body(),needle,'')))/length(needle)\$\$;
do \$\$begin if pg_temp.reapply_count('p_units<>1')<>0 then raise exception 'REAPPLY: the chain must end with the migration applied';end if;end\$\$;
\i $TMP/rb.sql
do \$\$begin if pg_temp.reapply_count('if p_units<>1 then raise exception ''GROUP_WALLET_INVALID'';end if;')<>1 or pg_temp.reapply_count('p_units<>1')<>1 then raise exception 'REAPPLY: rollback must restore only the new-request check';end if;end\$\$;
\i $TMP/m.sql
do \$\$begin if pg_temp.reapply_count('p_units<>1')<>0 then raise exception 'REAPPLY: re-apply after the rollback must lift the check';end if;raise notice 'PASS rollback then re-apply';end\$\$;
\i $TMP/m.sql
\i $TMP/t.sql
rollback;
SQL

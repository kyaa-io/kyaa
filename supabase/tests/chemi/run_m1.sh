#!/usr/bin/env bash
# 케미 M1 DB 시험 묶음. PG* 환경값의 일회용 DB(케미 마이그레이션까지 적용, 시험 줄 없음)에서 돈다.
# 저장소 재생과 함께: BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=$PWD/supabase/tests/chemi/run_m1.sh scripts/verify-clean-migration-chain.sh
# 케미 밖 객체 비교까지 하려면 같은 서버의 케미 직전 DB 이름을 CHEMI_BASE_DB 로 준다(schema_additive.sh 1번).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; ROOT="$HERE/../../.."
P="psql -X -q -v ON_ERROR_STOP=1 -At"
node "$ROOT/scripts/chemi-chain-schema-sql.mjs" --check 2>/dev/null
bash "$HERE/schema_additive.sh"          # 시드 0 검사가 있어 맨 먼저
for f in m1_closure chain_payload base_fn erase_user; do $P -f "$HERE/$f.sql"; done   # 각 파일은 끝에 되돌린다
bash "$HERE/deletion_race.sh"            # 줄을 커밋한다 — 맨 끝
echo "chemi m1 db ok"

#!/usr/bin/env bash
# Home gallery cursor read (20261230000000) on the disposable replay database:
#   BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase/tests/home_gallery_cursor.sh TMPDIR=<short dir> scripts/verify-clean-migration-chain.sh
# HOME_GALLERY_FIXTURE_DIR, when set, receives the real SQL responses used by the web contract tests.
set -euo pipefail
HOME_GALLERY_SETUP_ONLY=1 source "$(dirname "${BASH_SOURCE[0]}")/home_gallery_shorts.sh"
MIGRATION="$ROOT_DIR/supabase/migrations/20261230000000_home_gallery_keyset_read.sql"
ROLLBACK="$ROOT_DIR/supabase/rollback/20261230000000_home_gallery_keyset_read.sql"

# The read as the web calls it. $1 = after-key jsonb (the previous answer's "last") or 'null', $2 = limit.
page() {
  if [[ "$1" == null ]]; then sq "select public.read_public_home_gallery_page('ko',$2)"
  else
    local rank at id; rank="$(jq -r .rank <<<"$1")"; at="$(jq -r .at <<<"$1")"; id="$(jq -r .id <<<"$1")"
    sq "select public.read_public_home_gallery_page('ko',$2,$rank,'$at'::timestamptz,'$id')"
  fi
}
ids() { jq -r '[.items[].id] | join(" ")' <<<"$1"; }
# Every page until hasMore is false, as the browser reads it; prints the ids in the order read.
read_all() {
  local key=null out="" p
  while :; do
    p="$(page "$key" 24)"; out+="$(ids "$p") "
    [[ "$(jq -r .hasMore <<<"$p")" == true ]] || break
    key="$(jq -c .last <<<"$p")"
  done
  echo $out
}

# S-0 the first page is the old read: same photos, same order, same hasMore (this also fails when only one of the two reads is changed later)
old_ids() { sq "select string_agg(i->>'id', ' ' order by o) from jsonb_array_elements(public.read_public_home_gallery_photos('ko',$1,24)->'items') with ordinality x(i,o)"; }
eq "$(ids "$(page null 24)")" "$(old_ids 0)" 'S-0 first page equals the old read'
eq "$(sq "select (public.read_public_home_gallery_page('ko',24)->'items' = public.read_public_home_gallery_photos('ko',0,24)->'items')::text")" true 'S-0 items identical json'
eq "$(sq "select (public.read_public_home_gallery_page('ko',24)->>'hasMore') = (public.read_public_home_gallery_photos('ko',0,24)->>'hasMore')")" t 'S-0 hasMore'

# C-0 start from a list that holds only this test's 49 photos: hide every photo the shared fixtures made.
seed_hidden="$(sq "select string_agg(format('(%L,true,null,%L)', i->>'id', 'cursor test base'), ',') from jsonb_array_elements(public.read_public_home_gallery_photos('ko',0,24)->'items') i")"
run -c "insert into public.home_gallery_curation(photo_id,hidden,rank,reason) values $seed_hidden"
eq "$(sq "select jsonb_array_length(public.read_public_home_gallery_page('ko',24)->'items')")" 0 'C-0 fixture photos hidden'

# 49 photos of one creator, one per notice, newest first by n. n=24 and n=25 share a time, so the page boundary falls inside a tie; so do n=40 and n=41.
BASE="$(q "select date_trunc('second', now()) - interval '2 days'")"
declare -a NOTICE
for n in $(seq 1 49); do
  minutes=$n; [[ $n == 25 ]] && minutes=24; [[ $n == 41 ]] && minutes=40
  NOTICE[$n]="$(q "select r8test.notice('$C1','cur-$n','커서 사진 $n','https://www.instagram.com/p/CUR$(printf %03d $n)/','[{\"src\":\"$(img $((100 + n)))\",\"w\":1080,\"h\":1080}]',null,'$BASE'::timestamptz - interval '$minutes minutes')")"
done
all="$(read_all)"
eq "$(wc -w <<<"$all" | tr -d ' ')" 49 'C-1 reads all 49 photos'
eq "$(tr ' ' '\n' <<<"$all" | sort | uniq -d | wc -l | tr -d ' ')" 0 'C-1 no photo twice'
eq "$all" "$(old_ids 0) $(old_ids 24) $(old_ids 48)" 'C-1 same order as the old read when nothing changes'
first_hidden="$(echo $all | cut -d' ' -f1)"          # a photo on the first page
twenty_fifth="$(echo $all | cut -d' ' -f25)"         # the first photo of the second page, after the tie at the boundary
rest_after_24="$(echo $all | cut -d' ' -f25-)"

# C-2 acceptance (#898): read the first 24, hide one photo in front of the reader, read to the end: every other photo comes exactly once.
p1="$(page null 24)"
eq "$(jq -r '.items | length' <<<"$p1")" 24 'C-2 first page 24'
run -c "insert into public.home_gallery_curation(photo_id,hidden,rank,reason) values ('$first_hidden',true,null,'cursor test hide in front')"
# what the old read does now: its second page starts one photo late and drops the original 25th
eq "$(old_ids 24 | cut -d' ' -f1)" "$(echo $rest_after_24 | cut -d' ' -f2)" 'C-2 (old read, for contrast) skips the original 25th photo'
p2="$(page "$(jq -c .last <<<"$p1")" 24)"
p3="$(page "$(jq -c .last <<<"$p2")" 24)"
eq "$(ids "$p2") $(ids "$p3")" "$rest_after_24" 'C-2 original 25th and all after it, each once'
eq "$(jq -r .hasMore <<<"$p3")" false 'C-2 ends'
grep -q "$twenty_fifth" <<<"$(ids "$p2")"; pass C-2 'original 25th photo is on the next page'
# a photo hidden in front is not shown again, a new one in front does not repeat the last page
fresh="$(q "select r8test.notice('$C1','cur-fresh','커서 새 사진','https://www.instagram.com/p/CURFRESH/','[{\"src\":\"$(img 200)\",\"w\":1080,\"h\":1080}]',null,now())")"
eq "$(ids "$(page "$(jq -c .last <<<"$p1")" 24)") $(ids "$p3")" "$rest_after_24" 'C-3 a photo published in front of the reader does not move the next page'
eq "$(jq -r '.items[0].id' <<<"$(page null 24)")" "$fresh:1" 'C-3 ... and is the first photo of a fresh read'
# unpublish (not hide) a photo in front and one that is the cursor photo itself
cursor_notice="$(cut -d: -f1 <<<"$(jq -r .last.id <<<"$p1")")"
at3="$(q "select published_at from public.celebrity_notices where id='${NOTICE[3]}'")"; atc="$(q "select published_at from public.celebrity_notices where id='$cursor_notice'")"
run -c "update public.celebrity_notices set publication_status='draft', published_at=null where id in ('${NOTICE[3]}','$cursor_notice')"
eq "$(ids "$(page "$(jq -c .last <<<"$p1")" 24)") $(ids "$p3")" "$rest_after_24" 'C-4 unpublished photos, also the cursor photo itself, do not move the next page'
run -c "update public.celebrity_notices set publication_status='published', published_at='$at3' where id='${NOTICE[3]}'"
run -c "update public.celebrity_notices set publication_status='published', published_at='$atc' where id='$cursor_notice'"

# C-5 curation rank: ranked photos lead, and a ranked photo is still read once; the whole read equals the old read on a quiet list
run -c "delete from public.home_gallery_curation where photo_id in ('$first_hidden')"
run -c "insert into public.home_gallery_curation(photo_id,hidden,rank,reason) values ('${NOTICE[30]}:1',false,2,'cursor test rank'),('${NOTICE[45]}:1',false,1,'cursor test rank')"
all2="$(read_all)"
eq "$(echo $all2 | cut -d' ' -f1,2)" "${NOTICE[45]}:1 ${NOTICE[30]}:1" 'C-5 ranked photos first, rank 1 then rank 2'
eq "$all2" "$(old_ids 0) $(old_ids 24) $(old_ids 48)" 'C-5 same order as the old read with curation'
eq "$(tr ' ' '\n' <<<"$all2" | sort | uniq -d | wc -l | tr -d ' ')" 0 'C-5 no photo twice'
# page boundary on a rank: a page ending on the rank-2 photo continues with the unranked ones
two="$(page null 2)"
eq "$(ids "$(page "$(jq -c .last <<<"$two")" 1)")" "$(echo $all2 | cut -d' ' -f3)" 'C-5 continues after a ranked photo'

# C-6 a limit of 1 across a tie reads every photo once (the key breaks the tie by id)
key=null; got=""
while :; do p="$(page "$key" 1)"; got+="$(ids "$p") "; [[ "$(jq -r .hasMore <<<"$p")" == true ]] || break; key="$(jq -c .last <<<"$p")"; done
eq "$(echo $got)" "$all2" 'C-6 one at a time = 24 at a time, across the ties'

# C-7 the key carries microseconds and the id, and the answer to an empty page has no key
eq "$(jq -r '.last | keys | join(",")' <<<"$p1")" 'at,id,rank' 'C-7 key fields'
eq "$(jq -r '.last.at | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}(\\.[0-9]{1,6})?(Z|[+-][0-9]{2}(:[0-9]{2})?)$")' <<<"$p1")" true 'C-7 ISO time'
eq "$(sq "select (public.read_public_home_gallery_page('ko',24,2147483647,'1970-01-01'::timestamptz,'zzz'))::text")" '{"last": null, "items": [], "hasMore": false}' 'C-7 past the end'

# C-8 the first read of a list on a position (home pool, a cursor from before the change) still answers, and its last key continues
eq "$(sq "select (public.read_public_home_gallery_page('ko',24,p_offset=>24)->'items' = public.read_public_home_gallery_photos('ko',24,24)->'items')::text")" true 'C-8 offset read equals the old read'
off="$(sq "select public.read_public_home_gallery_page('ko',24,p_offset=>24)")"
eq "$(ids "$(page "$(jq -c .last <<<"$off")" 24)")" "$(echo $all2 | cut -d' ' -f49-)" 'C-8 continues from the last key of an offset page'

# V-1 refused input, permissions
for bad in "24,1,null,null" "24,null,'2026-01-01'::timestamptz,null" "24,1,'2026-01-01'::timestamptz,null" "24,0,'2026-01-01'::timestamptz,'x:1'"; do
  expect_fail V-1 'invalid home gallery page' "set role service_role; select public.read_public_home_gallery_page('ko',$bad)"
done
expect_fail V-1 'invalid home gallery page' "set role service_role; select public.read_public_home_gallery_page('ko',25)"
expect_fail V-1 'invalid home gallery page' "set role service_role; select public.read_public_home_gallery_page('ko',24,1,'2026-01-01'::timestamptz,'x:1',5)"
expect_fail V-1 'invalid home gallery page' "set role service_role; select public.read_public_home_gallery_page('ko',24,p_offset=>-1)"
for role in anon authenticated; do
  expect_fail V-2 'permission denied' "set role $role; select public.read_public_home_gallery_page('ko')"
done

if [[ -n "${HOME_GALLERY_FIXTURE_DIR:-}" ]]; then
  # Real answers for the web contract tests: a middle page with a key, and the end of the list.
  run -c "delete from public.home_gallery_curation where reason = 'cursor test rank'"
  m1="$(page null 2)"; m2="$(page "$(jq -c .last <<<"$m1")" 2)"
  jq . <<<"$m1" > "$HOME_GALLERY_FIXTURE_DIR/read_public_home_gallery_page_first.json"
  jq . <<<"$m2" > "$HOME_GALLERY_FIXTURE_DIR/read_public_home_gallery_page_second.json"
  jq . <<<"$(page "$(jq -c .last <<<"$p2")" 24)" > "$HOME_GALLERY_FIXTURE_DIR/read_public_home_gallery_page_end.json"
  sq "select jsonb_pretty(public.read_public_home_gallery_page('ko',24,2147483647,'1970-01-01'::timestamptz,'zzz'))" > "$HOME_GALLERY_FIXTURE_DIR/read_public_home_gallery_page_empty.json"
fi

# O-1 the owner guard: a new read owned by another role than the old read is refused (the migration part between $owner$ markers)
run -c "create role cursor_test_owner nologin nobypassrls; grant usage, create on schema public to cursor_test_owner; alter function public.read_public_home_gallery_page(public.content_locale,integer,integer,timestamptz,text,integer) owner to cursor_test_owner"
if out="$(awk '/^do \$owner\$/{on=1} on{print} /^\$owner\$;/{on=0}' "$MIGRATION" | psql -X -q -v ON_ERROR_STOP=1 2>&1)"; then echo 'FAIL O-1 different owner accepted' >&2; exit 1; fi
[[ "$out" == *HOME_GALLERY_CURSOR_OWNER_GAP* ]] || { echo "$out" >&2; exit 1; }
pass O-1 'a new read with another owner than the old read stops the migration'
run -c "alter function public.read_public_home_gallery_page(public.content_locale,integer,integer,timestamptz,text,integer) owner to current_user"

# R-1 rollback drops only the new read; the old read still answers; re-apply works
run -f "$ROLLBACK"
eq "$(q "select to_regprocedure('public.read_public_home_gallery_page(public.content_locale,integer,integer,timestamptz,text,integer)') is null")" t 'R-1 rollback drops the new read'
eq "$(sq "select jsonb_array_length(public.read_public_home_gallery_photos('ko',0,24)->'items')")" 24 'R-1 old read untouched'
run -f "$MIGRATION"
eq "$(ids "$(page null 24)")" "$(old_ids 0)" 'R-1 re-applied read equals the old read'
echo 'PASS home_gallery_cursor: first page = old read, 49 photos with a hidden/unpublished/added photo in front read once each, ties, curation rank, offset start, refused input, owner guard, rollback/reapply'

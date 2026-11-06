#!/usr/bin/env bash
# Run only through scripts/verify-clean-migration-chain.sh (BYUS_CLEAN_DB_SHELL_ASSERTION_FILE). Each scenario gets its own copy of the replay.
# DOC261107_LOAD14 points at the doc-14 load-14.sql; without it a minimal elina stands in.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; F="$HERE/fixtures"; BASE="$PGDATABASE"; FAILS=0
export PGOPTIONS="-c byus.doc261107_dev=SEED_DOC_261107_DEV_ONLY -c byus.doc261107_viewer_emails=doc261107-viewer@example.test"
q(){ psql -X -q -v ON_ERROR_STOP=1 -d "$1" "${@:2}"; }
at(){ psql -X -At -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
ok(){ echo "PASS $1"; }; bad(){ echo "FAIL $1"; FAILS=$((FAILS+1)); }
same(){ if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 got [$2] expected [$3]"; fi; }
ATLEAST(){ if [[ "$2" -ge "$3" ]]; then ok "$1 ($2)"; else bad "$1 got [$2] wanted >= $3"; fi; }
VIEWER=d2611a00-0000-4000-8000-000000000001; TEST_PAGE=d2611003-0000-4000-8000-000000000001; HOBBY=d2611003-0000-4000-8000-000000000002; CELEB=d2611002-0000-4000-8000-000000000001
# Row digest of every table in public, one line per table.
snapshot(){ psql -X -At -v ON_ERROR_STOP=1 -d "$1" <<'SQL'
select format('select %L||%L||count(*)||%L||md5(coalesce(string_agg(t::text,%L order by t::text),%L)) from %s t',c.oid::regclass::text,' ',' ','|','',c.oid::regclass) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by 1
\gexec
SQL
}
changed(){ diff <(echo "$1") <(echo "$2") | grep '^>' | sed 's/^> //' | cut -d' ' -f1 | sed 's/^public\.//' | sort | tr '\n' ' ' | sed 's/ $//'; }
prepare(){ createdb -T "$BASE" "$1"
 if [[ -n "${DOC261107_LOAD14:-}" ]]; then
  at "$1" "insert into public.app_users(id,privy_user_id,verified_email) values('d2611a00-0000-4000-8000-000000000002','did:privy:doc261107-admin','doc261107-admin@example.test');insert into public.admin_allowlist(id,email,role) values('d2611a00-0000-4000-8000-000000000003','doc261107-admin@example.test','admin')" >/dev/null
  q "$1" -f "$DOC261107_LOAD14" >/dev/null 2>&1 || bad "load-14 on $1"
 else
  q "$1" <<'SQL'
insert into public.app_users(id,privy_user_id,verified_email) values('d2611a00-0000-4000-8000-000000000002','did:privy:doc261107-admin','doc261107-admin@example.test');
insert into public.admin_allowlist(id,email,role) values('d2611a00-0000-4000-8000-000000000003','doc261107-admin@example.test','admin');
begin;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role,fan_count) values('d2611a00-0000-4000-8000-000000000004','elina','published','/images/guest-home/elina-card.jpg',now(),'{creator}','creator',0);
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values('d2611a00-0000-4000-8000-000000000004','ko','엘리나','소개','사진'),('d2611a00-0000-4000-8000-000000000004','en','Elina','Intro','Photo');
commit;
insert into public.group_pages(kind,celebrity_id,name) select 'fan','d2611a00-0000-4000-8000-000000000004','엘리나' where not exists(select 1 from public.group_pages where celebrity_id='d2611a00-0000-4000-8000-000000000004');
SQL
 fi
 at "$1" "insert into public.app_users(id,privy_user_id,verified_email) values('$VIEWER','did:privy:doc261107-viewer','doc261107-viewer@example.test');insert into public.user_profiles(app_user_id,nickname,nickname_normalized) values('$VIEWER','뷰어','뷰어')" >/dev/null
 # A real member already on elina must stay through cleanup.
 at "$1" "insert into public.app_users(id,privy_user_id,verified_email) values('d2611a00-0000-4000-8000-000000000005','did:privy:doc261107-real','doc261107-real@example.test');insert into public.group_memberships(page_id,app_user_id,role) select g.id,'d2611a00-0000-4000-8000-000000000005','member' from public.group_pages g join public.celebrities c on c.id=g.celebrity_id where c.slug='elina'" >/dev/null
}
ELINA="(select g.id from public.group_pages g join public.celebrities c on c.id=g.celebrity_id where c.slug='elina')"
EXPECTED_TABLES="app_user_avatars app_users blockchain_jobs celebrities celebrity_localizations celebrity_quizzes content_assets creator_heart_ledger fan_activities fan_passports fan_post_comments fan_post_likes fan_post_views fan_posts fan_score_ledger group_artist_bindings group_artist_presence_settings group_comments group_memberships group_messages group_pages group_post_reactions group_post_views group_posts group_rooms mobile_media_assets quiz_attempts quiz_passes ranking_snapshots social_friendships social_profile_settings user_profiles"

echo "== guards"
DB=dt_guard; prepare $DB
OUT="$(PGOPTIONS='' q $DB -f "$F/doc-261107-dev.sql" 2>&1)"; case "$OUT" in *DOC261107_CONFIRMATION_REQUIRED*) ok "seed refuses without the confirmation";; *) bad "seed ran without confirmation: $OUT";; esac
OUT="$(PGOPTIONS='' q $DB -f "$F/doc-261107-dev-cleanup.sql" 2>&1)"; case "$OUT" in *DOC261107_CONFIRMATION_REQUIRED*) ok "cleanup refuses without the confirmation";; *) bad "cleanup ran without confirmation";; esac
OUT="$(PGOPTIONS="-c byus.doc261107_dev=SEED_DOC_261107_DEV_ONLY -c byus.doc261107_viewer_emails=nobody@example.test" q $DB -f "$F/doc-261107-dev.sql" 2>&1)"; case "$OUT" in *DOC261107_VIEWER_NOT_FOUND*) ok "unknown viewer stops the seed";; *) bad "unknown viewer accepted: $OUT";; esac
same "guards leave no rows" "$(at $DB "select count(*) from public.app_users where id::text like 'd2611001-%'")" 0

echo "== scenario 1: seed twice, reads, cleanup restores every table"
DB=dt_main; prepare $DB
S0="$(snapshot $DB)"
q $DB -f "$F/doc-261107-dev.sql" >/dev/null 2>"/tmp/dt-$$.err"; same "first seed exits 0" "$?" 0; grep -E 'ERROR|WARNING' "/tmp/dt-$$.err"
S1="$(snapshot $DB)"
q $DB -f "$F/doc-261107-dev.sql" >/dev/null 2>&1; same "second seed exits 0" "$?" 0
S2="$(snapshot $DB)"
same "second seed changes nothing" "$(changed "$S1" "$S2")" ""
same "seed writes only the expected tables (no alert, notification, stamp, ticket, event)" "$(changed "$S0" "$S1")" "$EXPECTED_TABLES"

same "every fixture job is stopped and has nothing to mint" "$(at $DB "select count(*) from public.blockchain_jobs where operation_key like 'doc-261107:%' and not (status='FAILED' and attempts=0 and payload='{}' and last_error_code='DEV_FIXTURE_NO_BROADCAST')")" 0
same "no other job exists" "$(at $DB "select count(*) from public.blockchain_jobs where operation_key not like 'doc-261107:%'")" 0
echo "-- ranking [40]"
R="$(at $DB "select public.read_group_people('$VIEWER','$TEST_PAGE','ranking','',null,100)")"
same "signed-in ranking is open on the test page" "$(echo "$R" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d["ranking"]["available"],d["ranking"]["fanCount"]>=100,len(d["items"])>=99,d["items"][0]["rank"],d["items"][0]["points"]>d["items"][-1]["points"])')" "True True True 1 True"
same "viewer has a rank on the test page" "$(at $DB "select (public.read_celebrity_fan_leaderboard('doc261107-test-ranking','$VIEWER','ko','all')->'me'->>'points')")" 60
same "signed-out ranking has 100 rows" "$(at $DB "select jsonb_array_length(public.read_group_public_ranking(null,'$TEST_PAGE')->'rows')")" 100
same "fan_count on the published creator" "$(at $DB "select fan_count from public.published_celebrities where slug='doc261107-test-ranking' and locale='ko'")" 120
same "elina stays under the condition, so both states can be seen" "$(at $DB "select public.read_group_people('$VIEWER',$ELINA,'ranking')->'ranking'->>'reason'")" threshold
echo "-- people and friends [39]"
same "signed-out fan list is full" "$(at $DB "select jsonb_array_length(public.read_group_public_people(null,'$TEST_PAGE',0,30)->'items')")" 30
ATLEAST "friends on the test page" "$(at $DB "select jsonb_array_length(public.read_group_people('$VIEWER','$TEST_PAGE','friends')->'items')")" 5
ATLEAST "friends on elina" "$(at $DB "select jsonb_array_length(public.read_group_people('$VIEWER',$ELINA,'friends')->'items')")" 5
same "friend states" "$(at $DB "select string_agg(status||'='||n,',' order by status) from (select status,count(*) n from public.social_friendships where payload_hash='doc-261107-fixture' group by 1) x")" "accepted=6,pending=3"
echo "-- every fixture nickname and title is marked"
same "nicknames start with 시험" "$(at $DB "select count(*) from public.user_profiles where app_user_id::text like 'd2611001-%' and nickname not like '시험%'")" 0
same "post titles start with [시험]" "$(at $DB "select (select count(*) from public.fan_posts where id::text like 'd2611004-%' and body not like '[시험]%')+(select count(*) from public.group_posts where id::text like 'd2611006-%' and title not like '[시험]%')+(select count(*) from public.fan_post_comments where id::text like 'd2611005-%' and body not like '[시험]%')")" 0
same "accounts cannot sign in" "$(at $DB "select count(*) from public.app_users where id::text like 'd2611001-%' and (privy_user_id not like 'fixture:%' or verified_email not like '%@example.test')")" 0
echo "-- full post [28][29][30]"
P1=d2611004-0000-4000-8000-000000000001
same "fan post has title, date, body, photos, video, likes, comments and replies" "$(at $DB "select public.fan_web_post_json('$VIEWER','$P1','ko')" | python3 -c 'import json,sys;p=json.load(sys.stdin);print(p["body"].split("\n")[0]!="",p["createdAt"]!="",len(p["assets"]),p["video"] is not None,p["likeCount"],p["commentCount"],p["viewCount"],p["artist"] if "artist" in p else None)')" "True True 2 True 12 5 34 None"
same "replies point at the parent" "$(at $DB "select count(*) from public.fan_post_comments where post_id='$P1' and parent_id is not null")" 2
same "video read is authorized" "$(at $DB "select public.authorize_fan_post_media_read('$VIEWER','d2611011-0000-4000-8000-000000000001','original')->>'storagePath'")" "doc-261107/video-1/original.mp4"
same "photo read is authorized" "$(at $DB "select public.read_content_asset('$VIEWER','d2611010-0000-4000-8000-000000000001') is not null")" t
same "guest can read the public post" "$(at $DB "select public.fan_web_post_json(null,'$P1','ko') is not null")" t
same "elina post with an artist author" "$(at $DB "select public.fan_artist_mark(jsonb_build_array(jsonb_build_object('id','d2611004-0000-4000-8000-000000000005')),'post')->0->>'artist'")" true
same "group post has photo and video" "$(at $DB "select string_agg(kind,',' order by kind) from public.mobile_media_assets where attached_id='d2611006-0000-4000-8000-000000000001'")" "image,video"
same "group comment replies" "$(at $DB "select count(*) from public.group_comments where post_id='d2611006-0000-4000-8000-000000000001' and parent_id is not null")" 1
echo "-- rooms [31][32]"
ATLEAST "public room count" "$(at $DB "select (public.read_group_public_rooms(null,'$TEST_PAGE')->>'roomCount')::int")" 5
same "room states" "$(at $DB "select string_agg(distinct status,',' order by status) from public.group_rooms where page_id='$TEST_PAGE'")" "closed,open,readonly,scheduled"
echo "-- artist presence [16]"
PRES(){ at $DB "select public.groups_content_dispatch('presence','$VIEWER',$ELINA)->'artists'"; }
same "bound but nothing to show yet" "$(PRES | python3 -c 'import json,sys;a=json.load(sys.stdin);print(len(a),a[0]["online"],a[0]["visitedToday"])')" "1 False False"
PGOPTIONS="$PGOPTIONS -c byus.doc261107_presence=online" q $DB -f "$F/doc-261107-dev-presence.sql" 2>&1 | grep ERROR
same "online" "$(PRES | python3 -c 'import json,sys;a=json.load(sys.stdin);print(a[0]["nickname"],a[0]["online"],a[0]["visitedToday"])')" "시험 아티스트 True True"
PGOPTIONS="$PGOPTIONS -c byus.doc261107_presence=today" q $DB -f "$F/doc-261107-dev-presence.sql" 2>&1 | grep ERROR
same "visited today" "$(PRES | python3 -c 'import json,sys;a=json.load(sys.stdin);print(a[0]["online"],a[0]["visitedToday"])')" "False True"
PGOPTIONS="$PGOPTIONS -c byus.doc261107_presence=off" q $DB -f "$F/doc-261107-dev-presence.sql" 2>&1 | grep ERROR
same "off shows nothing" "$(PRES | python3 -c 'import json,sys;a=json.load(sys.stdin);print(a[0]["online"],a[0]["visitedToday"])')" "False False"
echo "-- gauge is off by default"
same "gauge count after seed" "$(at $DB "select public.read_jjinfan_challenge('$CELEB')->>'count'")" 0
PGOPTIONS="$PGOPTIONS -c byus.doc261107_gauge=37" q $DB -f "$F/doc-261107-dev-gauge.sql" 2>&1 | grep ERROR
same "gauge values when asked" "$(at $DB "select public.read_jjinfan_challenge('$CELEB')->>'count'")" 37
PGOPTIONS="$PGOPTIONS -c byus.doc261107_gauge=0" q $DB -f "$F/doc-261107-dev-gauge.sql" 2>&1 | grep ERROR
same "gauge back to zero" "$(at $DB "select public.read_jjinfan_challenge('$CELEB')->>'count'")" 0
OUT="$(q $DB -f "$F/doc-261107-dev-gauge.sql" 2>&1)"; case "$OUT" in *DOC261107_GAUGE_VALUE*) ok "gauge needs a value";; *) bad "gauge ran without a value: $OUT";; esac
echo "-- cleanup"
q $DB -f "$F/doc-261107-dev-cleanup.sql" 2>&1 | grep -E 'ERROR|doc261107_cleanup' | cut -c1-300
S3="$(snapshot $DB)"
same "cleanup restores every table" "$(changed "$S0" "$S3")" ""
if [[ -n "$(diff <(echo "$S0") <(echo "$S3"))" ]]; then diff <(echo "$S0") <(echo "$S3") | head -20; fi
same "real elina member stays" "$(at $DB "select count(*) from public.group_memberships m where m.app_user_id='d2611a00-0000-4000-8000-000000000005'")" 1
q $DB -f "$F/doc-261107-dev-cleanup.sql" >/dev/null 2>&1; same "cleanup twice is safe" "$?" 0
q $DB -f "$F/doc-261107-dev.sql" >/dev/null 2>&1; same "seed works again after cleanup" "$?" 0
# Default timestamps differ on a new run, so this compares row counts, not digests.
same "reseed has the same row counts as the first seed" "$(diff <(echo "$S1" | cut -d' ' -f1,2) <(snapshot $DB | cut -d' ' -f1,2))" ""

echo "== scenario 2: a person used the data, then cleanup"
DB=dt_used; prepare $DB
q $DB -f "$F/doc-261107-dev.sql" >/dev/null 2>&1
S_BEFORE_USE="$(at $DB "select count(*) from public.group_memberships where app_user_id='d2611a00-0000-4000-8000-000000000005'")"
q $DB <<SQL 2>&1 | grep ERROR
select public.read_fan_post('$VIEWER','$P1','ko');
select public.groups_content_dispatch('post-detail','$VIEWER','$HOBBY','d2611006-0000-4000-8000-000000000001');
select public.groups_content_dispatch('heartbeat','$VIEWER','$TEST_PAGE');
insert into public.fan_post_comments(post_id,app_user_id,body,idempotency_key) values('$P1','$VIEWER','뷰어 댓글',gen_random_uuid());
insert into public.fan_post_comments(post_id,parent_id,app_user_id,body,idempotency_key) values('$P1','d2611005-0000-4000-8000-000000000001','$VIEWER','뷰어 답글',gen_random_uuid());
insert into public.fan_post_likes(post_id,app_user_id) values('$P1','$VIEWER');
insert into public.group_comments(post_id,author_id,body,anonymous) values('d2611006-0000-4000-8000-000000000001','$VIEWER','뷰어 모임 댓글',false);
update public.social_friendships set status='accepted',accepted_at=now() where payload_hash='doc-261107-fixture' and status='pending' and addressee_id='$VIEWER';
SQL
ATLEAST "the person left activity" "$(at $DB "select count(*) from public.fan_post_comments where app_user_id='$VIEWER'")" 2
OUT="$(q $DB -f "$F/doc-261107-dev-cleanup.sql" 2>&1)"; same "cleanup after use exits 0" "$?" 0; echo "$OUT" | grep -E 'ERROR|doc261107_cleanup' | cut -c1-500
same "no fixture user left" "$(at $DB "select count(*) from public.app_users where id::text like 'd2611001-%'")" 0
same "no comment on removed posts" "$(at $DB "select count(*) from public.fan_post_comments c where not exists(select 1 from public.fan_posts p where p.id=c.post_id)")" 0
same "viewer keeps the account" "$(at $DB "select count(*) from public.app_users where id='$VIEWER'")" 1
same "no viewer row on the test creator" "$(at $DB "select (select count(*) from public.fan_passports where celebrity_id='$CELEB')+(select count(*) from public.group_memberships where page_id='$TEST_PAGE')")" 0
same "real elina member stays" "$(at $DB "select count(*) from public.group_memberships where app_user_id='d2611a00-0000-4000-8000-000000000005'")" "$S_BEFORE_USE"

echo "== scenario 3: ranking refresh ran before cleanup"
DB=dt_refresh; prepare $DB
q $DB -f "$F/doc-261107-dev.sql" >/dev/null 2>&1
at $DB "select public.refresh_ranking_snapshots()" >/dev/null
same "signed-out ranking survives a refresh" "$(at $DB "select jsonb_array_length(public.read_group_public_ranking(null,'$TEST_PAGE')->'rows')")" 100
ZERO=00000000-0000-0000-0000-000000000000
at $DB "insert into public.ranking_snapshots(kind,scope_id,period,period_start,computed_at,rows) values('creator_hearts','$ZERO','week','2020-01-06',now(),'[]'),('creator_hearts','$ZERO','week','2020-01-13',now(),jsonb_build_array(jsonb_build_object('rank',1,'subjectId','$CELEB')))" >/dev/null
q $DB -f "$F/doc-261107-dev-cleanup.sql" >/dev/null 2>&1; same "cleanup after refresh exits 0" "$?" 0
same "a snapshot that was already empty stays" "$(at $DB "select count(*) from public.ranking_snapshots where kind='creator_hearts' and period_start='2020-01-06'")" 1
same "a snapshot emptied by removing the fixture goes" "$(at $DB "select count(*) from public.ranking_snapshots where kind='creator_hearts' and period_start='2020-01-13'")" 0
same "no snapshot mentions a fixture row" "$(at $DB "select count(*) from public.ranking_snapshots where rows::text like '%d26110%' or scope_id::text like 'd26110%'")" 0

echo "== scenario 4: no elina page"
DB=dt_noelina; createdb -T "$BASE" $DB
at $DB "insert into public.app_users(id,privy_user_id,verified_email) values('$VIEWER','did:privy:doc261107-viewer','doc261107-viewer@example.test')" >/dev/null
OUT="$(q $DB -f "$F/doc-261107-dev.sql" 2>&1)"; case "$OUT" in *DOC261107_ELINA_PAGE_MISSING*) ok "stops when the doc-14 data is missing";; *) bad "ran without elina: $OUT";; esac

if [[ -n "${DOC261107_LOAD14:-}" ]]; then
 echo "== scenario 5: doc-14 load stays clean around this data"
 DB=dt_load; prepare $DB
 q $DB -f "$F/doc-261107-dev.sql" >/dev/null 2>&1
 OUT="$(q $DB -f "$DOC261107_LOAD14" 2>&1)"; same "load-14 rerun over the seed exits 0" "$?" 0
 same "load-14 rerun writes zero rows" "$(echo "$OUT" | sed -n 's/.*LOAD14 summary //p' | python3 -c 'import json,sys;print(sum(json.loads(sys.stdin.read()).values()))')" 0
 same "elina is the csv page" "$(at $DB "select count(*) from public.celebrities where slug='elina' and id='18ec5319-95fb-4134-95f4-97ff95ae726b'")" 1
fi
rm -f "/tmp/dt-$$.err"
echo "DOC261107 failures: $FAILS"; [[ "$FAILS" -eq 0 ]]

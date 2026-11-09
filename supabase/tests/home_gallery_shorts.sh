#!/usr/bin/env bash
# Home gallery and Shorts reads (20261220022000) on the disposable replay database:
#   BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase/tests/home_gallery_shorts.sh TMPDIR=/tmp scripts/verify-clean-migration-chain.sh
# HOME_GALLERY_FIXTURE_DIR, when set, receives the real SQL responses used by the web contract tests.
set -euo pipefail
trap 'echo "FAIL at line $LINENO: $BASH_COMMAND" >&2' ERR
if [[ "${PGDATABASE:-}" != "byus_clean" || "${PGHOST:-}" != /*/byus-clean-db.*/socket || ! -d "$PGHOST" ]]; then
  echo 'Home gallery checks require the disposable local replay socket' >&2; exit 1
fi
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT_DIR/supabase/migrations/20261220022000_home_gallery_shorts_reads.sql"
q() { psql -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }
sq() { psql -X -Atq -v ON_ERROR_STOP=1 -c "set role service_role; $1"; }
run() { psql -X -q -v ON_ERROR_STOP=1 "$@" >/dev/null; }
pass() { echo "PASS $1 $2"; }
eq() { [[ "$1" == "$2" ]] || { echo "FAIL $3: got '$1', want '$2'" >&2; exit 1; }; pass "$3" "$2"; }
expect_fail() {
  local out
  if out="$(psql -X -Atq -v ON_ERROR_STOP=1 -c "$3" 2>&1)"; then echo "FAIL $1 expected error /$2/, got success: $out" >&2; exit 1; fi
  grep -Eq "$2" <<<"$out" || { echo "FAIL $1 expected /$2/, got: $out" >&2; exit 1; }
  pass "$1" "refused: $2"
}
access_block() { awk '/^do \$access\$/{on=1} on{print} /^\$access\$;/{on=0}' "$MIGRATION"; }
check_only_block() { access_block | awk '/^begin$/&&!b{print;b=1;skip=1;next} /-- checks:/{skip=0} !skip{print}'; }

A='99000000-0000-4000-8000-000000000001'; L='99000000-0000-4000-8000-000000000002'
IMG='https://dev.kyaa.io/public-assets/cms-assets/public-image-assets/'
img() { printf '%s%064d.webp' "$IMG" "$1"; }
payload() { printf '{"slug":"%s","imageUrl":"/r8.jpg","imagePosition":"center","displayOrder":%s,"fanCount":0,"primaryRole":"actor","localizations":{"ko":{"name":"%s","summary":"r8data","imageAlt":"r8data"},"en":{"name":"%s EN","summary":"r8data","imageAlt":"r8data"}},"themes":[],"socialLinks":[]}' "$1" "$2" "$3" "$3"; }
run <<SQL
insert into public.app_users(id,privy_user_id,verified_email,status) values ('$A','did:privy:r8data-n2r','r8data-n2r@example.invalid','active');
insert into public.admin_allowlist(id,email,role,active) values ('$L','r8data-n2r@example.invalid','admin',true);
SQL
C1="$(q "select public.save_admin_celebrity('$L',gen_random_uuid(),null,'$(payload r8data-photo 991 'R8 사진')'::jsonb)->>'id'")"
C2="$(q "select public.save_admin_celebrity('$L',gen_random_uuid(),null,'$(payload r8data-hidden 992 'R8 숨김')'::jsonb)->>'id'")"
run -c "update public.celebrities set status='published', published_at=now() where id in ('$C1','$C2')"
run <<'SQL'
create schema r8test;
create function r8test.body(p_title text, p_url text, p_images jsonb) returns jsonb language sql as $$
  select jsonb_build_object('type','doc','content',
    jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text','원문 캡션'))))
    || coalesce((select jsonb_agg(jsonb_build_object('type','image','attrs',jsonb_strip_nulls(jsonb_build_object('src',i->>'src','alt',coalesce(i->>'alt',p_title),'width',i->'w','height',i->'h')))) from jsonb_array_elements(p_images) i),'[]'::jsonb)
    || jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',p_url,'marks',jsonb_build_array(jsonb_build_object('type','link','attrs',jsonb_build_object('href',p_url))))))));
$$;
create function r8test.notice(p_celebrity uuid, p_slug text, p_title text, p_url text, p_images jsonb, p_en_title text default null, p_at timestamptz default now()) returns uuid language plpgsql as $$
declare v uuid := extensions.gen_random_uuid();
begin
  insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,visibility) values (v,p_celebrity,p_slug,'published',p_at,'public');
  insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json) values
    (v,'ko',p_title,r8test.body(p_title,p_url,p_images)), (v,'en',coalesce(p_en_title,p_title),r8test.body(p_title,p_url,p_images));
  return v;
end $$;
SQL
ok1="$(q "select r8test.notice('$C1','r8-ok1','공식 게시물 1','https://www.instagram.com/p/R8A/','[{\"src\":\"$(img 1)\",\"w\":1080,\"h\":1350},{\"src\":\"$(img 2)\",\"w\":1080,\"h\":1080}]',null,now()-interval '1 hour')")"
ok2="$(q "select r8test.notice('$C1','r8-ok2','공식 게시물 2','https://www.youtube.com/watch?v=R8DATAVIDEO','[{\"src\":\"$(img 3)\",\"w\":1200,\"h\":800}]',null,now()-interval '2 hours')")"
q "select r8test.notice('$C1','r8-lang','언어 다름','https://www.instagram.com/p/R8B/','[{\"src\":\"$(img 4)\",\"w\":10,\"h\":10}]','Different')" >/dev/null
q "select r8test.notice('$C1','r8-alt','alt 다름','https://www.instagram.com/p/R8C/','[{\"src\":\"$(img 5)\",\"w\":10,\"h\":10,\"alt\":\"장면 설명\"}]')" >/dev/null
q "select r8test.notice('$C1','r8-size','크기 없음','https://www.instagram.com/p/R8D/','[{\"src\":\"$(img 6)\"}]')" >/dev/null
q "select r8test.notice('$C1','r8-host','다른 호스트','https://example.com/p/R8E/','[{\"src\":\"$(img 7)\",\"w\":10,\"h\":10}]')" >/dev/null
q "select r8test.notice('$C1','r8-private','비공개 사진','https://www.instagram.com/p/R8F/','[{\"src\":\"/api/content-assets/99000000-0000-4000-8000-0000000000f1\",\"w\":10,\"h\":10}]')" >/dev/null
q "select r8test.notice('$C1','r8-ratio','긴 사진','https://www.instagram.com/p/R8G/','[{\"src\":\"$(img 8)\",\"w\":1000,\"h\":2510}]')" >/dev/null
members="$(q "select r8test.notice('$C1','r8-members','회원 공개','https://www.instagram.com/p/R8H/','[{\"src\":\"$(img 9)\",\"w\":10,\"h\":10}]')")"
run -c "update public.celebrity_notices set visibility='members' where id='$members'"
q "select r8test.notice('$C2','r8-hidden','숨김 크리에이터','https://www.instagram.com/p/R8I/','[{\"src\":\"$(img 10)\",\"w\":10,\"h\":10}]')" >/dev/null
run -c "update public.group_pages set status='hidden' where celebrity_id='$C2'"
[[ "$(q "select count(*) from public.group_pages where celebrity_id='$C2' and status='hidden'")" == 1 ]] || run -c "insert into public.group_pages(kind,name,celebrity_id,status,listed) values ('fan','r8 hidden','$C2','hidden',true)"

# CMS image-role photos: admin alt; profile is not a gallery photo; ratio filter
asset() { q "insert into public.public_image_assets(content_sha256,storage_path,url,width,height,mime_type,byte_size,created_by_app_user_id,created_by_admin_allowlist_id)
  values (md5('$1')||md5('$1'),'public-image-assets/'||md5('$1')||md5('$1')||'.webp','https://db.test/storage/v1/object/public/cms-assets/public-image-assets/'||md5('$1')||md5('$1')||'.webp',$2,$3,'image/webp',100,'$A','$L') returning id"; }
bind() { run -c "insert into public.public_image_role_bindings(owner_type,owner_id,celebrity_id,role,asset_id,alt_ko,alt_en,revision,updated_by_app_user_id,updated_by_admin_allowlist_id)
  values ('celebrity','$1','$1','$2','$3','$4','$5',1,'$A','$L')"; }
AL="$(asset land 1600 900)"; AP="$(asset port 900 1600)"; AF="$(asset prof 800 800)"; AX="$(asset wide 2600 1000)"; AH="$(asset hide 1000 1000)"
bind "$C1" landscape "$AL" 'R8 사진 무대 사진' 'R8 photo stage'
bind "$C1" portrait "$AP" 'R8 사진 세로 사진' 'R8 photo portrait'
bind "$C1" profile "$AF" 'R8 프로필' 'R8 profile'
bind "$C2" landscape "$AH" '숨김 사진' 'hidden'
q "select 1" >/dev/null
items() { sq "select coalesce(string_agg(i->>'source' || '|' || (i->>'alt'), ',' order by o), '') from jsonb_array_elements(public.read_public_home_gallery_photos('$1',0,24)->'items') with ordinality x(i,o)"; }

# P-1 permissions
for role in anon authenticated; do
  expect_fail P-1 'permission denied' "set role $role; select public.read_public_home_gallery_photos('ko')"
  expect_fail P-1 'permission denied' "set role $role; select public.read_public_home_shorts('ko')"
  expect_fail P-1 'permission denied' "set role $role; select public.home_gallery_source_shape(gen_random_uuid())"
done
# G-1 only the collected shape on an official host, https sized images in ratio, public notice, public creator; CMS landscape/portrait
got="$(items ko)"
eq "$(sq "select count(*) from jsonb_array_elements(public.read_public_home_gallery_photos('ko',0,24)->'items') i where i->>'source'='official_sns'")" 3 G-1
grep -q 'official_sns|공식 게시물 1' <<<"$got" && grep -q 'official_sns|공식 게시물 2' <<<"$got"; pass G-1 'both collected notices, original title as alt'
for bad in '언어 다름' '장면 설명' '크기 없음' '다른 호스트' '비공개 사진' '긴 사진' '회원 공개' '숨김 크리에이터' 'R8 프로필' '숨김 사진'; do
  grep -q "|$bad" <<<"$got" && { echo "FAIL G-1 $bad leaked" >&2; exit 1; }
done; pass G-1 'shape, host, private src, ratio, members, hidden creator, profile and hidden CMS photo excluded'
grep -q 'cms_upload|R8 사진 무대 사진' <<<"$got" && grep -q 'cms_upload|R8 사진 세로 사진' <<<"$got"; pass G-1 'CMS photos with admin alt'
grep -q 'cms_upload|R8 photo stage' <<<"$(items en)"; pass G-1 'CMS alt follows the locale'
eq "$(sq "select (public.read_public_home_gallery_photos('ko',0,24)->'items') @> '[{\"sourceHref\":\"/c/r8data-photo/notices/r8-ok1\",\"image\":{\"width\":1080,\"height\":1350}}]'")" t G-1
eq "$(sq "select string_agg(k, ',' order by k) from jsonb_array_elements(public.read_public_home_gallery_photos('ko',0,24)->'items') i, jsonb_object_keys(i) k where i->>'id' = '$ok1:1'")" 'alt,creator,id,image,source,sourceHref' G-1
# G-2 paging and limits
eq "$(sq "select jsonb_array_length(public.read_public_home_gallery_photos('ko',0,2)->'items') || '|' || (public.read_public_home_gallery_photos('ko',0,2)->>'hasMore')")" '2|true' G-2
eq "$(sq "select public.read_public_home_gallery_photos('ko',4,24)->>'hasMore'")" false G-2
expect_fail G-2 'invalid home gallery page' "set role service_role; select public.read_public_home_gallery_photos('ko',0,25)"
expect_fail G-2 'invalid home gallery page' "set role service_role; select public.read_public_home_gallery_photos('ko',-1,5)"
# G-3 the source changes: an image removed from the notice or the notice unpublished leaves the gallery on the next read
run -c "update public.celebrity_notice_localizations set body_json=r8test.body(title,'https://www.instagram.com/p/R8A/','[{\"src\":\"$(img 1)\",\"w\":1080,\"h\":1350}]') where notice_id='$ok1'"
eq "$(sq "select count(*) from jsonb_array_elements(public.read_public_home_gallery_photos('ko',0,24)->'items') i where i->>'source'='official_sns'")" 2 G-3
run -c "update public.celebrity_notices set publication_status='draft', published_at=null where id='$ok2'"
eq "$(sq "select count(*) from jsonb_array_elements(public.read_public_home_gallery_photos('ko',0,24)->'items') i where i->>'source'='official_sns'")" 1 G-3
run -c "update public.celebrity_notices set publication_status='published', published_at=now()-interval '2 hours' where id='$ok2'"

# S-* Shorts from LIVE YouTube links
template="$(q "select (to_jsonb(e) - 'id' - 'slug')::text from public.live_events e where e.live_type='general' order by e.id limit 1")"
[[ -n "$template" ]] || { echo 'FAIL S-0 no general LIVE row in the replay to copy' >&2; exit 1; }
live() { # slug celebrity youtube-or-null replay-url-or-null replay-published status starts-offset
  q "with e as (insert into public.live_events select * from jsonb_populate_record(null::public.live_events, '$template'::jsonb || jsonb_build_object(
      'id', gen_random_uuid(), 'slug', '$1', 'celebrity_id', '$2', 'publication_status', '$6', 'published_at', case when '$6'='published' then now() end,
      'archived_at', null, 'archived_by_admin_allowlist_id', null, 'archive_reason', null,
      'live_provider', case when $3::text is null then 'tiktok' else 'youtube' end,
      'youtube_url', coalesce($3::text, 'https://www.tiktok.com/@r8data/live'), 'external_live_url', coalesce($3::text, 'https://www.tiktok.com/@r8data/live'),
      'replay_provider', case when $4::text is null then null else 'youtube' end, 'replay_url', $4::text, 'replay_published', $5,
      'starts_at', now() - interval '$7 hours', 'ends_at', now() - interval '$7 hours' + interval '1 hour',
      'reservation_opens_at', now() - interval '$7 hours' - interval '2 days', 'reservation_closes_at', now() - interval '$7 hours' - interval '1 hour')) returning id),
    l as (insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt)
          select e.id, x.locale::public.content_locale, x.title, 'r8data', 'r8data' from e, (values ('ko','R8 라이브 $1'),('en','R8 LIVE $1')) x(locale,title))
    select id from e" 2>&1
}
L1="$(live r8-live-watch "$C1" "'https://www.youtube.com/watch?v=R8shortsAA1'" null false published 1 || true)"
[[ "$L1" =~ ^[0-9a-f-]{36}$ ]] || { echo "FAIL S-0 LIVE fixture: $L1" >&2; exit 1; }
live r8-live-short "$C1" "'https://youtu.be/R8shortsBB2'" null false published 2 >/dev/null
live r8-live-replay "$C1" null "'https://www.youtube.com/watch?v=R8shortsCC3'" true published 3 >/dev/null
live r8-live-unpub-replay "$C1" null "'https://www.youtube.com/watch?v=R8shortsDD4'" false published 4 >/dev/null
live r8-live-tiktok "$C1" null null false published 5 >/dev/null
live r8-live-draft "$C1" "'https://www.youtube.com/watch?v=R8shortsEE5'" null false draft 6 >/dev/null
live r8-live-dup "$C1" "'https://www.youtube.com/watch?v=R8shortsAA1'" null false published 7 >/dev/null
live r8-live-hidden "$C2" "'https://www.youtube.com/watch?v=R8shortsFF6'" null false published 8 >/dev/null
eq "$(sq "select string_agg(i->>'videoId', ',' order by o) from jsonb_array_elements(public.read_public_home_shorts('ko',12)) with ordinality x(i,o) where i->>'videoId' like 'R8shorts%'")" 'R8shortsAA1,R8shortsBB2,R8shortsCC3' S-1
eq "$(sq "select (public.read_public_home_shorts('ko',12) @> '[{\"videoId\":\"R8shortsAA1\",\"href\":\"https://www.youtube.com/watch?v=R8shortsAA1\",\"liveHref\":\"/live/r8-live-watch\"}]')::text")" true S-1
title="$(q "select title from public.live_event_localizations where live_event_id='$L1' and locale='ko'")"
eq "$(sq "select x->>'title' from jsonb_array_elements(public.read_public_home_shorts('ko',12)) x where x->>'videoId'='R8shortsAA1'")" "$title" S-1
eq "$(sq "select jsonb_array_length(public.read_public_home_shorts('ko',1))")" 1 S-2
expect_fail S-2 'invalid home shorts page' "set role service_role; select public.read_public_home_shorts('ko',13)"
if [[ -n "${HOME_GALLERY_FIXTURE_DIR:-}" ]]; then
  sq "select jsonb_pretty(public.read_public_home_gallery_photos('ko',0,12))" > "$HOME_GALLERY_FIXTURE_DIR/read_public_home_gallery_photos.json"
  sq "select jsonb_pretty(public.read_public_home_gallery_photos('en',0,2))" > "$HOME_GALLERY_FIXTURE_DIR/read_public_home_gallery_photos_page.json"
  sq "select jsonb_pretty(jsonb_path_query_array(public.read_public_home_shorts('ko',12), '\$[*] ? (@.videoId starts with \"R8shorts\")'))" > "$HOME_GALLERY_FIXTURE_DIR/read_public_home_shorts.json"
fi

# O-1 ordinary owner without bypassrls: the access block gives the reads what they need, filters still apply
run <<'SQL'
create role r8data_n2r_owner nologin nobypassrls;
alter function public.home_gallery_creator_public(uuid) owner to r8data_n2r_owner;
alter function public.home_gallery_source_shape(uuid) owner to r8data_n2r_owner;
alter function public.home_creator_json(uuid,public.content_locale) owner to r8data_n2r_owner;
alter function public.read_public_home_gallery_photos(public.content_locale,integer,integer) owner to r8data_n2r_owner;
alter function public.read_public_home_shorts(public.content_locale,integer) owner to r8data_n2r_owner;
SQL
expect_fail O-1 'permission denied' "set role service_role; select public.read_public_home_gallery_photos('ko')"
access_block | run
before="$(items ko)"
access_block | run
eq "$(items ko)" "$before" O-1
grep -q '숨김' <<<"$before" && { echo 'FAIL O-1 hidden creator leaked under an ordinary owner' >&2; exit 1; }; pass O-1 'hidden filter holds for an ordinary owner'
eq "$(sq "select count(*) from jsonb_array_elements(public.read_public_home_shorts('ko',12)) x where x->>'videoId' like 'R8shorts%'")" 3 O-1
run -c "drop policy home_n2_owner_r8data_n2r_owner_r on public.group_pages"
if out="$(check_only_block | psql -X -q -v ON_ERROR_STOP=1 2>&1)"; then echo 'FAIL O-1 check passed without the group_pages policy' >&2; exit 1; fi
grep -q 'HOME_CONTENT_OWNER_GAP: r8data_n2r_owner has no read policy on group_pages' <<<"$out"; pass O-1 'missing policy -> HOME_CONTENT_OWNER_GAP'
access_block | run

# R-1 rollback drops only home_n2 policies, N1 keeps working, re-apply works
others="$(q "select count(*) from pg_policy where polname not like 'home\_n2\_owner\_%'")"
run -f "$ROOT_DIR/supabase/rollback/20261220022000_home_gallery_shorts_reads.sql"
eq "$(q "select count(*) from pg_policy where polname like 'home\_n2\_owner\_%'")" 0 R-1
eq "$(q "select count(*) from pg_policy where polname not like 'home\_n2\_owner\_%'")" "$others" R-1
eq "$(q "select (to_regprocedure('public.read_public_home_gallery_photos(public.content_locale,integer,integer)') is null)::text")" true R-1
eq "$(sq "select public.read_public_home_notices('ko')->>'hasMore'")" false R-1
run -f "$MIGRATION"
eq "$(sq "select (jsonb_array_length(public.read_public_home_gallery_photos('ko',0,24)->'items') > 0)::text")" true R-1
echo 'home gallery and shorts checks passed'

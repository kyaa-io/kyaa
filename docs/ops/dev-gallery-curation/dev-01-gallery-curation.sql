-- dev: home gallery curation (CEO feedback 2026-11-09 23:42). Writes public.home_gallery_curation and a private rollback snapshot; no CMS, notice or upload row changes.
-- Needs, in this order, on dev: 20261220100000_home_gallery_relative_url.sql (official photos stored as /api/content-assets paths), then
-- 20261220120000_home_gallery_curation.sql (the table and the read). Apply with dev-run.sh after both migrations.
-- Selection: Elina/Changha/Yuna photos first; hidden = revealing outfit, covered face, or low information. 13 ranked photos (15 rows: two photos also carry the other role id), 16 hidden rows; Home shows ranks 1-12 (the 13th, 김민주 profile photo, is the first one behind them: it keeps column bottoms level).
-- Verify: select count(*) from public.home_gallery_curation;  -> 31   and the Home read lists 12 photos, 5 of them 엘창유.
-- Atomic apply; repeat runs fail until the previous backup is deliberately undone.
begin;
set local lock_timeout = '5s';
lock table public.home_gallery_curation in share row exclusive mode;
create temp table gallery_curation_input (photo_id text primary key, hidden boolean, rank integer, reason text) on commit drop;
insert into gallery_curation_input values
  ('e41e5515-d1a3-4b38-b1c1-e938f23dfc5c:1', false, 1, '엘리나 공식 인스타그램 사진: 쿠킹 클래스, 얼굴·원본 선명'),
  ('65fc6390-c425-4781-9c70-db18d30e4d9f:1', false, 2, '창하 공식 인스타그램 사진: 얼굴 선명'),
  ('57f00ea3-4327-4635-8266-229d8e396c87:1', false, 3, '유나 공식 인스타그램 사진: 얼굴 선명'),
  ('e41e5515-d1a3-4b38-b1c1-e938f23dfc5c:2', false, 4, '엘리나 공식 인스타그램 사진: 쿠킹 클래스, 얼굴 선명'),
  ('live:c0960f8b-f01c-4308-97f8-3d13173922e8:landscape', false, 5, '엘리나 LIVE 가로 사진: 얼굴 선명'),
  ('celebrity:ae823360-ff59-4b9d-b336-1f013fe0fbb1:landscape', false, 6, '현지 프로필 사진: 얼굴 선명'),
  ('celebrity:ae823360-ff59-4b9d-b336-1f013fe0fbb1:portrait', false, 6, '현지 프로필 사진: 얼굴 선명'),
  ('celebrity:31691249-7c5d-41b4-b7d8-1d802e6dfa87:landscape', false, 7, '위나 단체 사진: 얼굴 선명, 흰 셔츠 의상'),
  ('celebrity:c4afd379-0ed9-4be5-86b2-9c6375aab5ad:landscape', false, 8, '엔카이브 단체 사진: 전원 정면'),
  ('celebrity:00000000-0000-4000-8000-000000000a01:landscape', false, 13, '김민주 프로필 사진: 얼굴 선명, 홈 12장 밖 첫 순위'),
  ('celebrity:00000000-0000-4000-8000-000000000a01:portrait', false, 13, '김민주 프로필 사진: 얼굴 선명, 홈 12장 밖 첫 순위'),
  ('1edc602a-2ec0-4fc2-8343-d3bf2bd7b858:1', false, 9, '아렴 공식 인스타그램 사진: 얼굴 선명'),
  ('celebrity:c4afd379-0ed9-4be5-86b2-9c6375aab5ad:portrait', false, 10, '엔카이브 단체 세로 사진: 전원 정면'),
  ('celebrity:473bd25e-2496-4677-9162-a5c7d38900fc:portrait', false, 11, '런앤뮤직 공식 이미지: 인물 없음, 선명'),
  ('6bd02378-4b5a-4975-a2cb-90f81e7c308f:1', false, 12, '재희 공식 인스타그램 사진: 얼굴이 작아 뒤쪽 순위'),
  ('celebrity:6661d23c-47b2-470c-b625-2c8e0a0403b5:landscape', true, null, '히로로 프로필 사진: 노출이 큰 의상(CEO 지적)'),
  ('celebrity:6661d23c-47b2-470c-b625-2c8e0a0403b5:portrait', true, null, '히로로 프로필 사진: 노출이 큰 의상(CEO 지적)'),
  ('d363b65b-f261-4c81-8de3-a22e360e4e37:1', true, null, '제니 공식 인스타그램 사진: 노출이 큰 의상'),
  ('ebf22b11-b8f3-4845-a050-3b66769a3d73:1', true, null, '위나 공식 인스타그램 사진: 노출이 큰 의상'),
  ('celebrity:31691249-7c5d-41b4-b7d8-1d802e6dfa87:portrait', true, null, '위나 단체 사진: 짧은 의상 위주, 노출이 큰 의상 기준으로 제외'),
  ('75929837-eab6-460e-a54c-1e98cff6e880:1', true, null, '엔카이브 공식 인스타그램 사진: 얼굴이 가려지고 어두움'),
  ('00000000-0000-4000-8000-0000000000a1:1', true, null, '김민주 공식 인스타그램 사진: 얼굴 가림·뒷모습·사물 위주'),
  ('00000000-0000-4000-8000-0000000000a1:2', true, null, '김민주 공식 인스타그램 사진: 얼굴 가림·뒷모습·사물 위주'),
  ('00000000-0000-4000-8000-0000000000a2:1', true, null, '김민주 공식 인스타그램 사진: 얼굴 가림·뒷모습·사물 위주'),
  ('00000000-0000-4000-8000-0000000000a2:2', true, null, '김민주 공식 인스타그램 사진: 얼굴 가림·뒷모습·사물 위주'),
  ('00000000-0000-4000-8000-0000000000a3:1', true, null, '김민주 공식 인스타그램 사진: 얼굴 가림·뒷모습·사물 위주'),
  ('00000000-0000-4000-8000-0000000000a3:2', true, null, '김민주 공식 인스타그램 사진: 얼굴 가림·뒷모습·사물 위주'),
  ('00000000-0000-4000-8000-0000000000a4:1', true, null, '김민주 공식 인스타그램 사진: 얼굴 가림·뒷모습·사물 위주'),
  ('00000000-0000-4000-8000-0000000000a4:2', true, null, '김민주 공식 인스타그램 사진: 얼굴 가림·뒷모습·사물 위주'),
  ('00000000-0000-4000-8000-0000000000a5:1', true, null, '김민주 공식 인스타그램 사진: 얼굴 가림·뒷모습·사물 위주'),
  ('00000000-0000-4000-8000-0000000000a5:2', true, null, '김민주 공식 인스타그램 사진: 얼굴 가림·뒷모습·사물 위주');
-- Source candidates BEFORE public-result asset deduplication or curation filtering.
-- Both landscape and portrait bindings must remain valid IDs even for one asset.
-- Reuse the installed read's source predicates, including the preceding relative-URL
-- migration. Extract only the candidate UNION, not its public dedup/filter/page.
do $candidates$
declare
  definition text := pg_catalog.pg_get_functiondef('public.read_public_home_gallery_photos(public.content_locale,integer,integer)'::regprocedure);
  source_start text := 'select n.published_at at,';
  source_end text := ') u where not public.home_gallery_curation_hidden(u.id)';
  dedup text := 'select distinct on (a.id)';
  source_sql text;
begin
  if (length(definition) - length(replace(definition, source_start, ''))) / length(source_start) <> 1
     or (length(definition) - length(replace(definition, source_end, ''))) / length(source_end) <> 1
     or (length(definition) - length(replace(definition, dedup, ''))) / length(dedup) <> 1 then
    raise exception 'DEV_GALLERY_CURATION_CANDIDATE_SHAPE: expected one source UNION, dedup and curation boundary';
  end if;
  source_sql := source_start || split_part(split_part(definition, source_start, 2), source_end, 1);
  source_sql := replace(replace(source_sql, dedup, 'select'), 'p_locale', '''ko''::public.content_locale');
  execute 'create temp table gallery_curation_candidates on commit drop as select id from (' || source_sql || ') candidates';
end
$candidates$;
do $$
declare missing text;
begin
  select string_agg(i.photo_id, ', ' order by i.photo_id) into missing from gallery_curation_input i
    where not exists (select 1 from gallery_curation_candidates c where c.id = i.photo_id);
  if missing is not null then raise exception 'DEV_GALLERY_CURATION_MISSING_SOURCE_IDS: %', missing; end if;
end $$;
-- Do not use IF NOT EXISTS: never overwrite the original pre-apply snapshot.
create table public.dev_01_gallery_curation_backup as
select i.photo_id, c.photo_id is not null as existed, c.hidden, c.rank, c.reason, c.updated_at
from gallery_curation_input i left join public.home_gallery_curation c using (photo_id);
alter table public.dev_01_gallery_curation_backup add primary key (photo_id);
alter table public.dev_01_gallery_curation_backup enable row level security;
alter table public.dev_01_gallery_curation_backup force row level security;
revoke all on public.dev_01_gallery_curation_backup from public, anon, authenticated, service_role;
do $$ begin
  execute format('create policy dev_01_backup_owner on public.dev_01_gallery_curation_backup to %I using (true) with check (true)', current_user);
end $$;
insert into public.home_gallery_curation (photo_id, hidden, rank, reason)
select photo_id, hidden, rank, reason from gallery_curation_input
on conflict (photo_id) do update set hidden = excluded.hidden, rank = excluded.rank, reason = excluded.reason, updated_at = pg_catalog.clock_timestamp();
commit;

-- UNDO (run this block separately; restore exact previous rows, including updated_at):
-- begin;
-- set local lock_timeout = '5s';
-- lock table public.home_gallery_curation in share row exclusive mode;
-- delete from public.home_gallery_curation c using public.dev_01_gallery_curation_backup b
-- where c.photo_id = b.photo_id and not b.existed;
-- insert into public.home_gallery_curation (photo_id, hidden, rank, reason, updated_at)
-- select photo_id, hidden, rank, reason, updated_at from public.dev_01_gallery_curation_backup where existed
-- on conflict (photo_id) do update set hidden = excluded.hidden, rank = excluded.rank,
-- reason = excluded.reason, updated_at = excluded.updated_at;
-- drop table public.dev_01_gallery_curation_backup;
-- commit;

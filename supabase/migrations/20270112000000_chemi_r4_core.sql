-- 케미 r4 core (W1-DB-2 · F-B13·F-B1·F-B3). 설계 CHEMI-ARCH-R4B §12.2·§2.1·§5.3 + R4C §5.3·§12.1·§12.3.
-- 이 파일만으로 선다: 옛 함수·옛 웹이 그대로 돈다(새 열은 null 허용·기본값·트리거가 채운다).
-- 한 트랜잭션. 고치는 케미 표를 첫머리에서 정해진 순서로 access exclusive 로 잡는다. 5초 안에 못 잡으면 실패하고 다시 돌린다.
-- 케미 밖 객체는 읽기만 한다(app_users · app_user_moderation_restrictions · dukjil_kst_date).

begin;
set local lock_timeout = '5s';
lock table public.chemi_user_state, public.chemi_profiles, public.chemi_partners, public.chemi_charts, public.chemi_readings,
  public.chemi_switches, public.chemi_exp_log, public.chemi_minis, public.chemi_album in access exclusive mode;

-- 입력 버전 순번은 전체에서 하나다(철회 뒤 재등록한 프로필이 옛 번호를 다시 갖지 않는다, r4b §2.1).
create sequence public.chemi_input_rev_seq as bigint;
revoke all on sequence public.chemi_input_rev_seq from public, anon, authenticated, service_role;

-- 새 표 4개 -------------------------------------------------------------------------------------------

-- 쓴 수 장부(M1 꼴, r4c §5.3). 줄이 지워지는 때는 탈퇴와 kst_date < 오늘 − 1 정리 둘뿐이다.
-- 상대 삭제·고침, 결과 삭제, 생일 철회는 줄을 남기고 item_key 를 'erased:{seq}' 로, reading_id 를 null 로 바꾼다.
create table public.chemi_daily_uses (
  user_id uuid not null references public.app_users(id) on delete cascade,
  kst_date date not null,
  bucket text not null check (bucket in ('compat_free','friend_free','open:saju','open:fortune','open:star','open:tarot')),
  seq smallint not null,
  item_key text not null check (char_length(item_key) between 1 and 160),
  reading_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, kst_date, bucket, seq),
  unique (user_id, kst_date, bucket, item_key),
  check ((bucket in ('compat_free','friend_free') and seq = 1) or (bucket like 'open:%' and seq between 1 and 3))
);

create table public.chemi_star_cuts (
  version text primary key check (char_length(version) between 1 and 40),
  cuts jsonb not null check (jsonb_typeof(cuts) = 'array'),
  sample_n integer not null check (sample_n >= 1000),
  created_at timestamptz not null default now()
);

create table public.chemi_charms (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null check (kind in ('card','cheer','special')),
  kst_date date not null,
  character text not null check (character in ('changha','elina','yuna','dosa')),
  design_code text not null check (char_length(design_code) between 1 and 40),
  reading_id uuid,
  order_id uuid,
  created_at timestamptz not null default now()
);
create unique index chemi_charms_daily_idx on public.chemi_charms (user_id, kst_date) where kind in ('card','cheer');

create table public.chemi_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  reporter_id uuid not null references public.app_users(id) on delete cascade,
  target_kind text not null check (target_kind in ('reading_line','ask_answer','share_card')),
  target_id uuid not null,
  line_key text not null default '' check (char_length(line_key) <= 80),
  reason text not null check (char_length(reason) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_kind, target_id, line_key)
);

alter table public.chemi_daily_uses enable row level security;
alter table public.chemi_star_cuts enable row level security;
alter table public.chemi_charms enable row level security;
alter table public.chemi_reports enable row level security;
revoke all on public.chemi_daily_uses, public.chemi_star_cuts, public.chemi_charms, public.chemi_reports
  from public, anon, authenticated, service_role;

-- 기존 케미 표에 더하는 열 -------------------------------------------------------------------------------

-- F-B1: sound_on 을 쓰는 코드가 없다(r4b V4, git grep sound_on → chemi_core.sql 정의 한 곳). 지금 값 true 는 전부 열 기본값이라
-- 사용자가 고른 값이 아니다. null 허용·기본값 없음으로 바꾸고 기존 줄은 null 로 둔다.
alter table public.chemi_user_state alter column sound_on drop not null, alter column sound_on drop default;
update public.chemi_user_state set sound_on = null where sound_on is not null;
alter table public.chemi_user_state
  add column hide_activity boolean not null default false,
  add column fp_salt bytea check (fp_salt is null or octet_length(fp_salt) = 32);

-- F-B3: 장소는 코드 + 서버가 찾은 좌표·시간대. 옛 글자 birth_place 는 화면에 보여 줄 이름으로만 남는다.
alter table public.chemi_profiles
  add column birth_place_code text check (birth_place_code ~ '^(kr:[0-9]{2}|gn:[0-9]{1,9})$'),
  add column birth_lat numeric(7,4) check (birth_lat between -90 and 90),
  add column birth_lon numeric(7,4) check (birth_lon between -180 and 180),
  add column birth_tz text check (char_length(birth_tz) between 1 and 64),
  add column term_side text check (term_side in ('before','after')),
  add column birth_rev bigint,
  add check ((birth_place_code is null) = (birth_lat is null)),
  add check ((birth_place_code is null) = (birth_lon is null)),
  add check ((birth_place_code is null) = (birth_tz is null));
alter table public.chemi_partners
  add column birth_place_code text check (birth_place_code ~ '^(kr:[0-9]{2}|gn:[0-9]{1,9})$'),
  add column birth_lat numeric(7,4) check (birth_lat between -90 and 90),
  add column birth_lon numeric(7,4) check (birth_lon between -180 and 180),
  add column birth_tz text check (char_length(birth_tz) between 1 and 64),
  add column rev bigint,
  add column compat_first_date date,
  add check ((birth_place_code is null) = (birth_lat is null)),
  add check ((birth_place_code is null) = (birth_lon is null)),
  add check ((birth_place_code is null) = (birth_tz is null));
update public.chemi_profiles set birth_rev = nextval('public.chemi_input_rev_seq');
update public.chemi_partners set rev = nextval('public.chemi_input_rev_seq');
alter table public.chemi_profiles alter column birth_rev set not null;
alter table public.chemi_partners alter column rev set not null;

alter table public.chemi_charts add column birth_rev bigint, add column engine_seq integer check (engine_seq >= 0);

alter table public.chemi_readings
  add column input_rev bigint,
  add column partner_rev bigint,
  add column opened_by text check (opened_by in ('free','exempt','quota','open','entitlement','pass')),
  add column purge_after date,
  add column last_step smallint check (last_step between 1 and 99),
  add column last_step_at timestamptz;
alter table public.chemi_readings drop constraint chemi_readings_kind_check;
alter table public.chemi_readings add constraint chemi_readings_kind_check check (kind in
  ('first','daily','topic','compat','tarot3','date','goodday','month','calendar','friend_today','tomorrow','week','natal'));
create index chemi_readings_content_day_idx on public.chemi_readings (content, kst_date, user_id);
create index chemi_readings_purge_idx on public.chemi_readings (purge_after) where purge_after is not null;

alter table public.chemi_switches add column reopens_at timestamptz;

-- Q1: 도사도 EXP·미니·앨범 줄을 가질 수 있게 넓힌다(넓히는 것이라 기존 줄은 통과).
alter table public.chemi_exp_log drop constraint chemi_exp_log_character_check;
alter table public.chemi_exp_log add constraint chemi_exp_log_character_check check (character in ('changha','elina','yuna','dosa'));
alter table public.chemi_minis drop constraint chemi_minis_character_check;
alter table public.chemi_minis add constraint chemi_minis_character_check check (character in ('changha','elina','yuna','dosa'));
alter table public.chemi_album drop constraint chemi_album_character_check;
alter table public.chemi_album add constraint chemi_album_character_check check (character in ('changha','elina','yuna','dosa'));

-- 입력 버전 트리거(r4b §2.1): 저장 함수가 옛 판이든 새 판이든 입력이 바뀌면 순번에서 새 값을 넣는다.
create function public.chemi_profile_rev_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or (new.birth_date, new.calendar, new.birth_time, new.time_precision, new.gender, new.birth_place_code, new.term_side)
      is distinct from (old.birth_date, old.calendar, old.birth_time, old.time_precision, old.gender, old.birth_place_code, old.term_side) then
    new.birth_rev := pg_catalog.nextval('public.chemi_input_rev_seq');
  else
    new.birth_rev := old.birth_rev;
  end if;
  return new;
end $$;
create function public.chemi_partner_rev_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or (new.birth_date, new.calendar, new.birth_time, new.time_precision, new.gender, new.birth_place_code)
      is distinct from (old.birth_date, old.calendar, old.birth_time, old.time_precision, old.gender, old.birth_place_code) then
    new.rev := pg_catalog.nextval('public.chemi_input_rev_seq');
  else
    new.rev := old.rev;
  end if;
  return new;
end $$;
create trigger chemi_profiles_rev before insert or update on public.chemi_profiles
  for each row execute function public.chemi_profile_rev_trg();
create trigger chemi_partners_rev before insert or update on public.chemi_partners
  for each row execute function public.chemi_partner_rev_trg();

-- 공통 장부 트리거(r4c §12.3): 옛 함수가 쓴 무료 궁합 줄(opened_by null)도 장부에 남긴다. v2 는 opened_by 를 늘 채운다.
create function public.chemi_readings_legacy_use_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.opened_by is null and new.kind in ('compat','friend_today') then
    insert into public.chemi_daily_uses (user_id, kst_date, bucket, seq, item_key, reading_id)
    values (new.user_id, new.kst_date, case new.kind when 'compat' then 'compat_free' else 'friend_free' end, 1, 'legacy:' || new.id::text, new.id)
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger chemi_readings_legacy_use after insert on public.chemi_readings
  for each row execute function public.chemi_readings_legacy_use_trg();

-- 이용 제한 계정(r4b §18 K21, r4c §12.1 에서 core 로). 읽기만 한다. 내부 함수 — service_role 에도 주지 않는다.
create function public.chemi_assert_unrestricted(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.app_user_moderation_restrictions where app_user_id = p_user and revoked_at is null) then
    raise exception 'CHEMI_ACCOUNT_RESTRICTED' using errcode = '42501';
  end if;
end $$;

revoke all on function public.chemi_profile_rev_trg(), public.chemi_partner_rev_trg(), public.chemi_readings_legacy_use_trg(),
  public.chemi_assert_unrestricted(uuid) from public, anon, authenticated, service_role;

-- 옛 줄 연결(r4c §12.3) --------------------------------------------------------------------------------

-- 장부 이관: 오늘 − 1 이후 옛 무료 궁합 줄을 사용자·날짜·칸마다 가장 이른 1줄씩. 표 잠금 때문에 이관과 트리거 사이로 빠지는 쓰기가 없다.
insert into public.chemi_daily_uses (user_id, kst_date, bucket, seq, item_key, reading_id, created_at)
select distinct on (r.user_id, r.kst_date, b.bucket) r.user_id, r.kst_date, b.bucket, 1, 'legacy:' || r.id::text, r.id, r.created_at
from public.chemi_readings r
  cross join lateral (select case r.kind when 'compat' then 'compat_free' else 'friend_free' end as bucket) b
where r.kind in ('compat','friend_today') and r.kst_date >= public.dukjil_kst_date() - 1
order by r.user_id, r.kst_date, b.bucket, r.created_at, r.id
on conflict do nothing;

-- 저장한 상대 연결(K4): 옛 궁합 줄의 target_key 가 그 사용자의 상대 번호이면 가장 이른 날짜를 compat_first_date 로.
update public.chemi_partners p set compat_first_date = f.first_date
from (select r.user_id, r.target_key, min(r.kst_date) as first_date from public.chemi_readings r
      where r.kind in ('compat','friend_today') group by r.user_id, r.target_key) f
where f.user_id = p.user_id and f.target_key = p.id::text;

commit;

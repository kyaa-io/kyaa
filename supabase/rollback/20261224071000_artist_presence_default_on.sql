-- 기본 켜짐 이전으로: 트리거·기본값을 되돌리고, 이 마이그레이션이 바꾼 행만 이전 값으로(없던 행은 지움).
-- 그 뒤 본인이 직접 바꾼 값도 백업 대상이면 이전 값으로 돌아간다.
begin;
drop trigger if exists group_artist_presence_default_on on public.group_artist_bindings;
drop function if exists public.group_artist_presence_default_on();
alter table public.group_artist_presence_settings alter column enabled set default false;
delete from public.group_artist_presence_settings s using public.group_artist_presence_default_backup b
 where b.app_user_id=s.app_user_id and b.previous_enabled is null;
update public.group_artist_presence_settings s set enabled=b.previous_enabled from public.group_artist_presence_default_backup b
 where b.app_user_id=s.app_user_id and b.previous_enabled is not null;
drop table public.group_artist_presence_default_backup;
commit;

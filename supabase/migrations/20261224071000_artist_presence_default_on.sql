begin;

-- 11/13 사용자: 연결된 아티스트의 '접속 공개'는 기본 켜짐. 본인이 MY > 접속 공개에서 끌 수 있다(설정 화면·저장 경로는 그대로).
-- 기존 연결 아티스트도 모두 켜짐으로 맞춘다. 되돌리기용으로 바꾸기 전 값을 남긴다(previous_enabled null = 행이 없었음).
create table public.group_artist_presence_default_backup(
  app_user_id uuid primary key references public.app_users(id) on delete cascade,
  previous_enabled boolean
);
alter table public.group_artist_presence_default_backup enable row level security;
revoke all on public.group_artist_presence_default_backup from public,anon,authenticated;
grant all on public.group_artist_presence_default_backup to service_role;

insert into public.group_artist_presence_default_backup(app_user_id,previous_enabled)
select distinct b.app_user_id,s.enabled
from public.group_artist_bindings b
left join public.group_artist_presence_settings s on s.app_user_id=b.app_user_id
where b.app_user_id is not null and s.enabled is distinct from true;

insert into public.group_artist_presence_settings(app_user_id,enabled)
select distinct b.app_user_id,true from public.group_artist_bindings b where b.app_user_id is not null
on conflict(app_user_id) do update set enabled=true;

alter table public.group_artist_presence_settings alter column enabled set default true;

-- 새로 연결되는 아티스트는 설정 행을 켜짐으로 만든다. 이미 행이 있으면(본인이 끈 값 포함) 건드리지 않는다.
create function public.group_artist_presence_default_on()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.app_user_id is not null then
    insert into public.group_artist_presence_settings(app_user_id,enabled) values(new.app_user_id,true)
    on conflict(app_user_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.group_artist_presence_default_on() from public,anon,authenticated,service_role;
create trigger group_artist_presence_default_on after insert on public.group_artist_bindings
for each row execute function public.group_artist_presence_default_on();

commit;

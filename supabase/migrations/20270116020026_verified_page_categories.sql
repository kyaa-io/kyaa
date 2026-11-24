alter type public.celebrity_primary_role add value if not exists 'underground_idol';

update public.celebrities
set primary_role = 'creator', roles = array['creator'::public.celebrity_role]
where primary_role in ('singer','actor','show_host')
   or slug in ('aryeom','hyunji','park-myungho','thisisj-official');

alter table public.celebrities add constraint celebrities_current_category
  check (primary_role not in ('singer','actor','show_host'));

-- No public policy. Survey records have no fan-page ID or reward-bearing content.
create table public.unverified_idol_candidates (
  country text not null check (country in ('JP','KR')),
  official_name text not null,
  official_x text,
  schedule_celebrity_id uuid unique references public.celebrities(id),
  recent_show text,
  next_show text,
  primary key (country, official_name)
);
alter table public.unverified_idol_candidates enable row level security;
revoke all on public.unverified_idol_candidates from public;
do $$
declare target_role text;
begin
  for target_role in select rolname from pg_roles where rolname in ('anon','authenticated') loop
    execute format('revoke all on public.unverified_idol_candidates from %I', target_role);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update on public.unverified_idol_candidates to service_role;
  end if;
end $$;

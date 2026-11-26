alter type public.celebrity_primary_role add value if not exists 'underground_idol';

update public.celebrities
set primary_role = 'creator', roles = array['creator'::public.celebrity_role]
where primary_role in ('singer','actor','show_host')
   or slug in ('aryeom','hyunji','park-myungho','thisisj-official');

-- The update above queues deferred constraint triggers on existing rows (publication check, welcome notice).
-- Run them now: ALTER TABLE refuses a table with pending trigger events when the file is applied in one transaction.
set constraints all immediate;

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

-- Staff link the independently reviewed vote result to an existing draft.
-- Normal CMS publication remains the final operator action.
alter table public.unverified_idol_candidates
  add column winner_evidence text,
  add column consent_evidence text,
  add column approved_by uuid,
  add column approved_at timestamptz;

create function public.approve_underground_winner(
  p_actor uuid, p_country text, p_name text, p_draft uuid,
  p_winner_evidence text, p_consent_evidence text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_content_editor(p_actor, true);
  if nullif(trim(p_winner_evidence),'') is null or nullif(trim(p_consent_evidence),'') is null then
    raise exception 'vote result and team consent required';
  end if;
  update public.unverified_idol_candidates set
    schedule_celebrity_id = p_draft, winner_evidence = p_winner_evidence,
    consent_evidence = p_consent_evidence, approved_by = p_actor, approved_at = now()
  where country = p_country and official_name = p_name and approved_at is null;
  if not found then raise exception 'no pending candidate'; end if;
  update public.celebrities set primary_role = 'underground_idol', roles = array['artist'::public.celebrity_role]
    where id = p_draft and status = 'draft' and primary_role is distinct from 'brand';
  if not found then raise exception 'eligible draft required'; end if;
end $$;
revoke all on function public.approve_underground_winner(uuid,text,text,uuid,text,text) from public;
do $$
declare target_role text;
begin
  for target_role in select rolname from pg_roles where rolname in ('anon','authenticated') loop
    execute format('revoke all on function public.approve_underground_winner(uuid,text,text,uuid,text,text) from %I', target_role);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.approve_underground_winner(uuid,text,text,uuid,text,text) to service_role;
  end if;
end $$;

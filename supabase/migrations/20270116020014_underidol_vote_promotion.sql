begin;
-- The future monthly ballot records its certified winner here after closing.
create table public.underidol_vote_winners (
  ballot_month date primary key check (extract(day from ballot_month) = 1),
  celebrity_id uuid not null references public.celebrities(id),
  approved_at timestamptz,
  approved_by uuid,
  team_consent_ref text,
  official_account_ref text,
  check ((approved_at is null and approved_by is null and team_consent_ref is null and official_account_ref is null)
      or (approved_at is not null and approved_by is not null and team_consent_ref is not null and official_account_ref is not null))
);
alter table public.underidol_vote_winners enable row level security;
create function public.approve_underidol_vote_winner(p_admin uuid, p_allowlist uuid, p_month date,
  p_creator uuid, p_consent text, p_account text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_active_admin(p_admin,p_allowlist,true);
  if nullif(trim(p_consent),'') is null or nullif(trim(p_account),'') is null then
    raise exception 'PROMOTION_EVIDENCE_REQUIRED';
  end if;
  update public.underidol_vote_winners set approved_at=now(), approved_by=p_admin,
    team_consent_ref=trim(p_consent), official_account_ref=trim(p_account)
    where ballot_month=p_month and celebrity_id=p_creator and approved_at is null;
  if not found then raise exception 'PROMOTION_UNAVAILABLE'; end if;
end $$;
revoke all on public.underidol_vote_winners from public;
revoke all on function public.approve_underidol_vote_winner(uuid,uuid,date,uuid,text,text) from public;
do $$
declare target text;
begin
  for target in select rolname from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role') loop
    execute format('revoke all on public.underidol_vote_winners from %I',target);
    execute format('revoke all on function public.approve_underidol_vote_winner(uuid,uuid,date,uuid,text,text) from %I',target);
    if target='service_role' then
      grant execute on function public.approve_underidol_vote_winner(uuid,uuid,date,uuid,text,text) to service_role;
    end if;
  end loop;
end $$;
commit;

create function public.group_application_integrity_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
 if new.status in ('submitted','reviewing','changes_requested') and (tg_op = 'INSERT' or new.kind is distinct from old.kind or lower(btrim(new.name)) is distinct from lower(btrim(old.name)) or old.status not in ('submitted','reviewing','changes_requested')) then
  if exists(select 1 from public.group_applications a where a.id <> new.id and a.applicant_id = new.applicant_id and a.kind = new.kind and lower(btrim(a.name)) = lower(btrim(new.name)) and a.status in ('submitted','reviewing','changes_requested')) then
   raise exception 'GROUPS_CONFLICT';
  end if;
 end if;
 if tg_op = 'UPDATE' and new.status in ('rejected','changes_requested') and (new.status is distinct from old.status or new.reason is distinct from old.reason) and coalesce(btrim(new.reason), '') = '' then
  raise exception 'GROUPS_INVALID_REQUEST';
 end if;
 return new;
end$$;
create trigger group_applications_integrity_insert before insert on public.group_applications for each row execute function public.group_application_integrity_guard();
create trigger group_applications_integrity_update before update on public.group_applications for each row execute function public.group_application_integrity_guard();
revoke all on function public.group_application_integrity_guard() from public, anon, authenticated;

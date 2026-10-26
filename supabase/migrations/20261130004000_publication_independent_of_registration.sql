-- Publication does not wait for chain registration; issuance keeps its own verification gate.
create or replace function public.guard_creator_registration_publication()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.slug is distinct from old.slug and exists (
      select 1 from public.fan_action_verified_creators where creator_id = old.id
    ) then
      raise exception 'celebrity slug is immutable after on-chain registration' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

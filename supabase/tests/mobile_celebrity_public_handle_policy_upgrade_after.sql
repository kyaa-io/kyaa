do $$
begin
  if (select record from public.handle_policy_upgrade_snapshot) is distinct from
     (select to_jsonb(c) from public.celebrities c where id='88280000-0000-4000-8000-000000000001') then
    raise exception 'existing creator changed during handle policy upgrade';
  end if;
end $$;
drop table public.handle_policy_upgrade_snapshot;

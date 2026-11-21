create function public.chemi_grow_on_first_affinity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.chemi_album(user_id, character, slot, unlocked_at)
    values (new.user_id, new.character, 1, new.adopted_at)
    on conflict do nothing;
  if found then
    perform public.chemi_chain_enqueue(
      'album', 'album:' || new.user_id || ':' || new.character || ':1', new.user_id,
      jsonb_build_object('character', new.character, 'slot', 1, 'stage', 0), clock_timestamp());
  end if;
  return new;
end $$;

revoke all on function public.chemi_grow_on_first_affinity() from public, anon, authenticated;

create trigger chemi_grow_on_first_affinity
  after insert or update of exp_total on public.chemi_minis
  for each row when (new.exp_total > 0 and new.character in ('changha', 'elina', 'yuna'))
  execute function public.chemi_grow_on_first_affinity();

-- Bring previously earned affinity into the same album and record path.
update public.chemi_minis m set exp_total = m.exp_total
where m.exp_total > 0 and m.character in ('changha', 'elina', 'yuna')
  and not exists (select from public.chemi_album a
    where a.user_id = m.user_id and a.character = m.character and a.slot = 1);

-- The seasonal reading earns the standard 10 affinity once per member and KST day.
alter table public.chemi_exp_log drop constraint chemi_exp_log_source_check;
alter table public.chemi_exp_log add constraint chemi_exp_log_source_check
  check (source in ('feed','fortune','star','tarot','saju','run','match','share','christmas'));

create unique index chemi_christmas_daily_affinity
  on public.chemi_exp_log(user_id, kst_date) where source = 'christmas';

create function public.chemi_christmas_affinity(p_user uuid, p_character text)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  perform public.chemi_lock_user(p_user);
  if p_character is null or p_character not in ('changha','elina','yuna') then
    raise exception 'CHEMI_INVALID' using errcode = '22023';
  end if;
  insert into public.chemi_exp_log(user_id, character, source, kst_date, exp)
    values(p_user, p_character, 'christmas', public.dukjil_kst_date(), 10)
    on conflict do nothing;
  if not found then return 0; end if;
  insert into public.chemi_minis(user_id, character, exp_total) values(p_user, p_character, 10)
    on conflict(user_id, character) do update set exp_total = public.chemi_minis.exp_total + 10;
  return 10;
end $$;
revoke all on function public.chemi_christmas_affinity(uuid,text) from public, anon, authenticated;
grant execute on function public.chemi_christmas_affinity(uuid,text) to service_role;

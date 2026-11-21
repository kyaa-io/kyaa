alter table public.chemi_readings drop constraint chemi_readings_kind_check;
alter table public.chemi_readings add constraint chemi_readings_kind_check check (kind in
  ('first','daily','topic','compat','tarot3','date','goodday','month','calendar','friend_today','tomorrow','week','natal','keepsake','amulet'));

create function public.chemi_save_deep_context(
  p_user uuid, p_character text, p_kind text, p_day date, p_result jsonb, p_version text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  reading uuid;
  target text := md5(p_result::text);
begin
  perform public.chemi_lock_user(p_user, true);
  if p_day is distinct from public.dukjil_kst_date()
    or p_kind not in ('tomorrow','week','keepsake','amulet') then
    raise exception 'CHEMI_UNAVAILABLE';
  end if;
  select id into reading from public.chemi_readings
    where user_id = p_user and content = 'fortune' and kind = p_kind and kst_date = p_day and target_key = target;
  if not found then
    insert into public.chemi_readings(user_id, content, kind, character, kst_date, target_key, result, engine_version, table_version)
      values (p_user, 'fortune', p_kind, p_character, p_day, target, p_result, p_version, p_version)
      returning id into reading;
  end if;
  return jsonb_build_object('readingId', reading);
end $$;
revoke all on function public.chemi_save_deep_context(uuid,text,text,date,jsonb,text) from public, anon, authenticated;
grant execute on function public.chemi_save_deep_context(uuid,text,text,date,jsonb,text) to service_role;

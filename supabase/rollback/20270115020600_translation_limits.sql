-- Restores the constant limits of 20261130007000 (10/min, user 10,000/day, service 20,000/day, 200,000/month).
begin;
create or replace function public.check_display_translation_budget(p_app_user_id uuid,p_requester_hash text,p_character_count integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=clock_timestamp(); v_day timestamptz;v_month timestamptz;v_min_count bigint;v_user_chars bigint;v_day_chars bigint;v_month_chars bigint;
begin
  if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id); end if;
  if p_requester_hash is null or p_requester_hash !~ '^[a-f0-9]{64}$' or p_character_count is null or p_character_count not between 1 and 20000 then raise exception 'TRANSLATION_INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web:translation-budget',0));
  v_now:=clock_timestamp();
  v_day:=date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC';
  v_month:=date_trunc('month',v_now at time zone 'UTC') at time zone 'UTC';
  select count(*) filter(where created_at>v_now-interval '1 minute'),coalesce(sum(character_count) filter(where created_at>=v_day),0)
    into v_min_count,v_user_chars from public.display_translation_requests
    where case when p_app_user_id is null then app_user_id is null and requester_hash=p_requester_hash else app_user_id=p_app_user_id end;
  if p_app_user_id is not null then
    select v_min_count+count(*) filter(where created_at>v_now-interval '1 minute'),v_user_chars+coalesce(sum(character_count) filter(where created_at>=v_day),0)
    into v_min_count,v_user_chars from public.content_translation_requests where app_user_id=p_app_user_id;
  end if;
  select coalesce(sum(character_count) filter(where created_at>=v_day),0),coalesce(sum(character_count),0)
    into v_day_chars,v_month_chars from (
      select character_count,created_at from public.content_translation_requests where created_at>=v_month
      union all select character_count,created_at from public.display_translation_requests where created_at>=v_month
    ) requests;
  if v_min_count>=10 or v_user_chars+p_character_count>10000 or v_day_chars+p_character_count>20000 or v_month_chars+p_character_count>200000 then raise exception 'TRANSLATION_RATE_LIMITED'; end if;

end $$;
drop function public.record_translation_limit_block(integer);
drop table public.translation_limit_alerts;
drop trigger translation_limits_touch on public.translation_limits;
drop function public.touch_translation_limits();
drop table public.translation_limits;
commit;

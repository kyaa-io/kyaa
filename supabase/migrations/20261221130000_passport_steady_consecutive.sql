-- Preserve previously issued stamps; new awards require consecutive valid Seoul attendance dates.
create or replace function public.passport_issue_steady_checkin(p_user uuid, p_celebrity uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pol public.dukjil_policy_versions; need integer; have integer; existing uuid;
begin
  if p_user is null or p_celebrity is null then return null; end if;
  select id into existing from public.community_stamps
   where app_user_id = p_user and kind = 'steady_checkin'
     and source_key = 'steady-checkin:' || p_celebrity::text || ':page1';
  if existing is not null then return existing; end if;
  pol := public.passport_policy_row();
  if pol.version is null then return null; end if;
  select nullif(s ->> 'days', '')::integer into need from jsonb_array_elements(coalesce(pol.mission_book #> '{pages,0,slots}', '[]'::jsonb)) s
   where s ->> 'action' = 'steady_checkin' limit 1;
  if need is null or need < 1 then return null; end if;
  select count(*) into have from public.group_creator_attendance a join public.community_stamps st on st.id = a.stamp_id
   where a.app_user_id = p_user and a.celebrity_id = p_celebrity and st.revoked_at is null
     and a.attendance_date between public.dukjil_kst_date() - (need - 1) and public.dukjil_kst_date();
  if have < need then return null; end if;
  return public.dukjil_issue_stamp(p_user, p_celebrity, 'steady_checkin', 'steady-checkin:' || p_celebrity::text || ':page1', pol.version);
end $$;

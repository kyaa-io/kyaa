begin;
-- Reject old clients at the write source, including calls from the ad wrapper.
create or replace function public.claim_passport_page(
  p_user uuid, p_celebrity uuid, p_page_no integer, p_request_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'PASSPORT_HEART_CLAIM_RETIRED' using errcode = 'P0001';
end $$;

create or replace function public.issue_owned_passport_claim_ad_session(
  p_user uuid, p_celebrity uuid, p_page_no integer, p_ttl_seconds integer,
  p_issue_limit integer, p_issue_window_seconds integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'PASSPORT_HEART_CLAIM_RETIRED' using errcode = 'P0001';
end $$;

create or replace function public.creator_jjinfan_count(p_celebrity uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select count(*) from (
    select p.app_user_id
    from public.fan_passports p
    join public.app_users u on u.id = p.app_user_id and u.status = 'active'
    join public.passport_page_slots slot on slot.passport_id = p.id and slot.page_no = 1
    join public.community_stamps s on s.id = slot.stamp_id and s.revoked_at is null
    where p.celebrity_id = p_celebrity and p.business_status = 'issued'
    group by p.id, p.app_user_id
    having count(distinct s.kind) = 9
  ) completed
$$;
commit;

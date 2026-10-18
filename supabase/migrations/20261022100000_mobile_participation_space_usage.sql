begin;

create or replace function public.read_owned_mobile_participation_space(p_app_user_id uuid,p_space_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.mobile_participation_spaces%rowtype;v_visit public.mobile_participation_space_visits%rowtype;v_benefit jsonb;v_claim public.benefit_claims%rowtype;v_used_at timestamptz;v_now timestamptz:=pg_catalog.clock_timestamp();v_space_state text;v_can_claim boolean:=false;v_can_issue_qr boolean:=false;v_reason text;v_favorite jsonb;v_locations jsonb;v_claim_count integer:=0;v_usage_count integer:=0;v_per_user_limit integer:=0;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select*into s from public.mobile_participation_spaces where id=p_space_id and state='published';
  if not found then return null;end if;
  v_space_state:=case when v_now<s.opens_at then'upcoming'when v_now>=s.closes_at then'closed'else'open'end;
  select jsonb_build_object('slug',c.slug,'name',l.name,'imageUrl',c.image_url)into v_favorite from public.celebrities c join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale where c.id=s.celebrity_id and c.status='published'and c.archived_at is null;
  if v_favorite is null then return null;end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',case p_locale when'en'then x.title_en else x.title_ko end,'address',case p_locale when'en'then x.address_en else x.address_ko end,'state',case when v_now<x.opens_at then'upcoming'when v_now>=x.closes_at then'closed'else'open'end,'path','/spaces/'||x.id::text)order by x.opens_at,x.id),'[]'::jsonb)into v_locations from public.mobile_participation_spaces x where x.celebrity_id=s.celebrity_id and x.state='published';
  select*into v_visit from public.mobile_participation_space_visits where space_id=s.id and app_user_id=p_app_user_id order by visited_at desc,id desc limit 1;
  if s.benefit_id is not null then
    select value into v_benefit from public.get_published_benefits((v_favorite->>'slug'),p_locale,v_now)as benefit(value)where(value->>'id')::uuid=s.benefit_id;
    select b.per_user_limit,count(c.id)::integer into v_per_user_limit,v_claim_count from public.benefits b left join public.benefit_claims c on c.benefit_id=b.id and c.app_user_id=p_app_user_id where b.id=s.benefit_id group by b.per_user_limit;
    select count(u.id)::integer into v_usage_count from public.benefit_claims c join public.benefit_claim_usage_events u on u.benefit_claim_id=c.id where c.benefit_id=s.benefit_id and c.app_user_id=p_app_user_id;
    select*into v_claim from public.benefit_claims where benefit_id=s.benefit_id and app_user_id=p_app_user_id order by claimed_at desc,id desc limit 1;
    if v_claim.id is not null then select used_at into v_used_at from public.benefit_claim_usage_events where benefit_claim_id=v_claim.id;end if;
    v_can_claim:=v_space_state='open'and v_visit.id is not null and v_claim.id is null and coalesce((v_benefit->>'available')::boolean,false);
    v_can_issue_qr:=v_space_state='open'and v_visit.id is not null and v_claim.id is not null and v_used_at is null;
    v_reason:=case when v_space_state='upcoming'then'space_upcoming'when v_space_state='closed'then'space_closed'when v_visit.id is null then'visit_required'when v_used_at is not null then'benefit_used'when v_claim.id is not null then null when not coalesce((v_benefit->>'available')::boolean,false)then'benefit_unavailable'else null end;
    v_benefit:=coalesce(v_benefit,jsonb_build_object('id',s.benefit_id,'available',false))||jsonb_build_object('claimState',case when v_used_at is not null then'used'when v_claim.id is not null then'claimed'else'not_claimed'end,'claimId',v_claim.id,'claimedAt',v_claim.claimed_at,'usedAt',v_used_at,'canClaim',v_can_claim,'canIssueQr',v_can_issue_qr,'unavailableReason',v_reason,'grantedByVisit',false,'perUserLimit',v_per_user_limit,'claimCount',v_claim_count,'usageCount',v_usage_count,'path','/benefits/'||s.benefit_id::text);
  end if;
  return jsonb_build_object('serverNow',v_now,'favorite',v_favorite,'space',jsonb_build_object('id',s.id,'slug',s.slug,'policyVersion',s.policy_version,'state',v_space_state,'title',case p_locale when'en'then s.title_en else s.title_ko end,'summary',case p_locale when'en'then s.summary_en else s.summary_ko end,'imageUrl',s.image_url,'address',case p_locale when'en'then s.address_en else s.address_ko end,'opensAt',s.opens_at,'closesAt',s.closes_at,'scanAllowed',v_space_state='open','path','/spaces/'||s.id::text),'locations',v_locations,'visit',jsonb_build_object('completed',v_visit.id is not null,'visitedAt',v_visit.visited_at),'benefit',v_benefit);
end $$;

revoke all on function public.read_owned_mobile_participation_space(uuid,uuid,public.content_locale) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_participation_space(uuid,uuid,public.content_locale) to service_role;

commit;

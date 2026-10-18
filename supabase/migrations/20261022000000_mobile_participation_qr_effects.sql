begin;

alter table public.mobile_participation_qr_codes
  add column destination_path text,
  add column benefit_id uuid references public.benefits(id) on delete restrict;

create table public.mobile_participation_spaces (
  id uuid primary key default extensions.gen_random_uuid(),
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  slug text not null unique check(slug~'^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  policy_version text not null,
  state text not null default'draft'check(state in('draft','published','closed')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  benefit_id uuid references public.benefits(id) on delete restrict,
  title_ko text not null,
  title_en text not null,
  summary_ko text not null default'',
  summary_en text not null default'',
  image_url text,
  address_ko text not null default'',
  address_en text not null default'',
  revision integer not null default 1 check(revision>0),
  created_by_admin_id uuid not null references public.admin_allowlist(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check(opens_at<closes_at)
);

create table public.mobile_participation_qr_stamps (
  id uuid primary key default extensions.gen_random_uuid(),
  qr_code_id uuid not null references public.mobile_participation_qr_codes(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  source_type text not null,
  source_id uuid not null,
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  passport_id uuid not null references public.fan_passports(id) on delete restrict,
  activity_id uuid unique references public.fan_activities(id) on delete restrict,
  stamp_id uuid unique references public.stamps(id) on delete restrict,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(qr_code_id,app_user_id),
  check((activity_id is null)=(stamp_id is null))
);

create unique index mobile_participation_spaces_benefit_unique
  on public.mobile_participation_spaces(benefit_id) where benefit_id is not null;

create table public.mobile_participation_benefit_qr_requests (
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  request_key uuid not null,
  space_id uuid not null references public.mobile_participation_spaces(id) on delete restrict,
  benefit_claim_id uuid not null references public.benefit_claims(id) on delete restrict,
  qr_id uuid not null references public.mobile_participation_qr_codes(id) on delete restrict,
  raw_code text not null,
  result jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(app_user_id,request_key)
);

create table public.mobile_participation_space_visits (
  id uuid primary key default extensions.gen_random_uuid(),
  qr_code_id uuid not null references public.mobile_participation_qr_codes(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  space_id uuid not null references public.mobile_participation_spaces(id) on delete restrict,
  benefit_id uuid references public.benefits(id) on delete restrict,
  visited_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(qr_code_id,app_user_id)
);

alter table public.mobile_participation_spaces enable row level security;
alter table public.mobile_participation_spaces force row level security;
alter table public.mobile_participation_qr_stamps enable row level security;
alter table public.mobile_participation_qr_stamps force row level security;
alter table public.mobile_participation_benefit_qr_requests enable row level security;
alter table public.mobile_participation_benefit_qr_requests force row level security;
alter table public.mobile_participation_space_visits enable row level security;
alter table public.mobile_participation_space_visits force row level security;
revoke all on public.mobile_participation_spaces,public.mobile_participation_qr_stamps,public.mobile_participation_space_visits,public.mobile_participation_benefit_qr_requests from public,anon,authenticated,service_role;

create function public.mobile_participation_qr_destination_allowed(p_purpose text,p_target_id uuid,p_benefit_id uuid,p_path text)
returns boolean language sql immutable set search_path='' as $$
  select case p_purpose
    when 'profile' then p_path='/fans/profile-links/'||p_target_id::text
    when 'stamp' then p_path='/my/activity'
    when 'live' then p_path~'^/live/[a-z0-9]+(?:-[a-z0-9]+)*$' or p_path='/participation/contexts/live/'||p_target_id::text
    when 'event' then p_path='/participation/contexts/event/'||p_target_id::text
    when 'space' then p_path='/participation/spaces/'||p_target_id::text
    when 'album' then p_path='/participation/contexts/album/'||p_target_id::text
    when 'event_checkin' then p_path='/participation/events/'||p_target_id::text
    when 'benefit_use' then p_benefit_id is not null and p_path='/benefits/'||p_benefit_id::text
    when 'prize_pickup' then p_path='/my/raffles'
    else false end
$$;

create or replace function public.validate_fan_activity_source()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.activity_type='knowledge'and(new.source_type<>'quiz_pass'or not exists(select 1 from public.quiz_passes where id=new.source_id and app_user_id=new.app_user_id and celebrity_id=new.celebrity_id))then raise exception'knowledge activity must reference an owned quiz pass';
  elsif new.activity_type='reservation'and(new.source_type<>'live_reservation'or not exists(select 1 from public.live_reservations where id=new.source_id and app_user_id=new.app_user_id and celebrity_id=new.celebrity_id))then raise exception'reservation activity must reference an owned live reservation for the same celebrity';
  elsif new.activity_type='attendance'and not(
    (new.source_type='live_attendance'and exists(select 1 from public.live_attendances where id=new.source_id and app_user_id=new.app_user_id and celebrity_id=new.celebrity_id))or
    (new.source_type='mobile_participation_qr_stamp'and exists(select 1 from public.mobile_participation_qr_stamps where id=new.source_id and app_user_id=new.app_user_id and celebrity_id=new.celebrity_id))
  )then raise exception'attendance activity must reference an owned attendance source for the same celebrity';
  elsif new.activity_type='survey'and(new.source_type<>'live_survey_response'or not exists(select 1 from public.live_survey_responses where id=new.source_id and app_user_id=new.app_user_id and celebrity_id=new.celebrity_id and status='submitted'))then raise exception'survey activity must reference an owned submitted response for the same celebrity';
  elsif new.activity_type='membership'and(new.source_type<>'certification_submission'or not exists(select 1 from public.certification_submissions where id=new.source_id and app_user_id=new.app_user_id and celebrity_id=new.celebrity_id and status='approved'and membership_platform is not null))then raise exception'membership activity must reference an owned approved membership submission';
  end if;
  return new;
end $$;

create function public.award_owned_mobile_participation_qr_stamp(p_qr_id uuid,p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.mobile_participation_qr_codes%rowtype;e public.mobile_participation_events%rowtype;p public.fan_passports%rowtype;s public.mobile_participation_qr_stamps%rowtype;v_activity_id uuid:=extensions.gen_random_uuid();v_stamp_id uuid:=extensions.gen_random_uuid();v_job_id uuid:=extensions.gen_random_uuid();v_wallet text;v_slug text;v_payload jsonb;
begin
  select*into q from public.mobile_participation_qr_codes where id=p_qr_id for update;
  if not found or q.purpose<>'stamp'or q.target_type<>'event'then raise exception'MOBILE_PARTICIPATION_QR_PURPOSE_INVALID';end if;
  select*into e from public.mobile_participation_events where id=q.target_id and state='published'and policy_version=q.policy_version and pg_catalog.clock_timestamp()>=starts_at and pg_catalog.clock_timestamp()<ends_at;
  if not found then raise exception'MOBILE_PARTICIPATION_TARGET_UNAVAILABLE';end if;
  select*into p from public.fan_passports where app_user_id=p_app_user_id and celebrity_id=e.celebrity_id and business_status='issued'for key share;
  if not found then raise exception'MOBILE_PARTICIPATION_FAN_VERIFICATION_REQUIRED';end if;
  select lower(address)into v_wallet from public.user_wallets where app_user_id=p_app_user_id and chain_id=91342 and provider='privy'and wallet_type='embedded';
  if v_wallet is null then raise exception'MOBILE_PARTICIPATION_FAN_VERIFICATION_REQUIRED';end if;
  insert into public.mobile_participation_qr_stamps(qr_code_id,app_user_id,source_type,source_id,celebrity_id,passport_id)values(q.id,p_app_user_id,q.target_type,q.target_id,e.celebrity_id,p.id)on conflict(qr_code_id,app_user_id)do nothing;
  select*into s from public.mobile_participation_qr_stamps where qr_code_id=q.id and app_user_id=p_app_user_id for update;
  if s.stamp_id is null then
    insert into public.fan_activities(id,app_user_id,celebrity_id,activity_type,source_type,source_id)values(v_activity_id,p_app_user_id,e.celebrity_id,'attendance','mobile_participation_qr_stamp',s.id);
    insert into public.fan_score_ledger(activity_id,app_user_id,celebrity_id,points)values(v_activity_id,p_app_user_id,e.celebrity_id,3);
    select slug into v_slug from public.celebrities where id=e.celebrity_id;
    v_payload:=jsonb_build_object('recipient',v_wallet,'celebritySlug',v_slug,'issuanceId','0x'||lpad(replace(v_stamp_id::text,'-',''),64,'0'),'stampType','Attendance');
    insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)values(v_job_id,'stamp',v_stamp_id,'byus:stamp:v1:'||v_stamp_id::text,1,v_payload);
    insert into public.stamps(id,app_user_id,celebrity_id,passport_id,activity_id,stamp_type,blockchain_job_id)values(v_stamp_id,p_app_user_id,e.celebrity_id,p.id,v_activity_id,'attendance',v_job_id);
    update public.mobile_participation_qr_stamps set activity_id=v_activity_id,stamp_id=v_stamp_id where id=s.id returning*into s;
  end if;
  return jsonb_build_object('id',s.stamp_id,'passportId',s.passport_id,'activityId',s.activity_id,'scorePoints',3,'recordedAt',s.recorded_at);
end $$;

create function public.mobile_participation_qr_effect(p_qr_id uuid,p_app_user_id uuid,p_benefit_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'stampRecorded',exists(select 1 from public.mobile_participation_qr_stamps s where s.qr_code_id=p_qr_id and s.app_user_id=p_app_user_id and s.stamp_id is not null),
    'stamp',(select jsonb_build_object('id',s.stamp_id,'passportId',s.passport_id,'activityId',s.activity_id,'scorePoints',3,'recordedAt',s.recorded_at)from public.mobile_participation_qr_stamps s where s.qr_code_id=p_qr_id and s.app_user_id=p_app_user_id and s.stamp_id is not null),
    'spaceVisitRecorded',exists(select 1 from public.mobile_participation_space_visits v where v.qr_code_id=p_qr_id and v.app_user_id=p_app_user_id),
    'benefit',case when p_benefit_id is null then null else jsonb_build_object(
      'id',p_benefit_id,
      'state',case
        when exists(select 1 from public.benefit_claims c join public.benefit_claim_usage_events u on u.benefit_claim_id=c.id where c.benefit_id=p_benefit_id and c.app_user_id=p_app_user_id) then 'used'
        when exists(select 1 from public.benefit_claims c where c.benefit_id=p_benefit_id and c.app_user_id=p_app_user_id) then 'claimed'
        when exists(select 1 from public.benefits b where b.id=p_benefit_id and b.publication_status='published' and pg_catalog.clock_timestamp()>=b.claim_opens_at and pg_catalog.clock_timestamp()<b.claim_closes_at) then 'available'
        else 'unavailable' end,
      'grantedByScan',false)
    end)
$$;

create function public.read_owned_mobile_participation_space(p_app_user_id uuid,p_space_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.mobile_participation_spaces%rowtype;v_visit public.mobile_participation_space_visits%rowtype;v_benefit jsonb;v_claim public.benefit_claims%rowtype;v_used_at timestamptz;v_now timestamptz:=pg_catalog.clock_timestamp();v_space_state text;v_can_claim boolean:=false;v_can_issue_qr boolean:=false;v_reason text;v_favorite jsonb;v_locations jsonb;
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
    select*into v_claim from public.benefit_claims where benefit_id=s.benefit_id and app_user_id=p_app_user_id order by claimed_at desc,id desc limit 1;
    if v_claim.id is not null then select used_at into v_used_at from public.benefit_claim_usage_events where benefit_claim_id=v_claim.id;end if;
    v_can_claim:=v_space_state='open'and v_visit.id is not null and v_claim.id is null and coalesce((v_benefit->>'available')::boolean,false);
    v_can_issue_qr:=v_space_state='open'and v_visit.id is not null and v_claim.id is not null and v_used_at is null;
    v_reason:=case when v_space_state='upcoming'then'space_upcoming'when v_space_state='closed'then'space_closed'when v_visit.id is null then'visit_required'when v_used_at is not null then'benefit_used'when v_claim.id is not null then null when not coalesce((v_benefit->>'available')::boolean,false)then'benefit_unavailable'else null end;
    v_benefit:=coalesce(v_benefit,jsonb_build_object('id',s.benefit_id,'available',false))||jsonb_build_object('claimState',case when v_used_at is not null then'used'when v_claim.id is not null then'claimed'else'not_claimed'end,'claimId',v_claim.id,'claimedAt',v_claim.claimed_at,'usedAt',v_used_at,'canClaim',v_can_claim,'canIssueQr',v_can_issue_qr,'unavailableReason',v_reason,'grantedByVisit',false,'path','/benefits/'||s.benefit_id::text);
  end if;
  return jsonb_build_object('serverNow',v_now,'favorite',v_favorite,'space',jsonb_build_object('id',s.id,'slug',s.slug,'policyVersion',s.policy_version,'state',v_space_state,'title',case p_locale when'en'then s.title_en else s.title_ko end,'summary',case p_locale when'en'then s.summary_en else s.summary_ko end,'imageUrl',s.image_url,'address',case p_locale when'en'then s.address_en else s.address_ko end,'opensAt',s.opens_at,'closesAt',s.closes_at,'scanAllowed',v_space_state='open','path','/spaces/'||s.id::text),'locations',v_locations,'visit',jsonb_build_object('completed',v_visit.id is not null,'visitedAt',v_visit.visited_at),'benefit',v_benefit);
end $$;

create function public.read_owned_mobile_participation_benefit(p_app_user_id uuid,p_benefit_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_space_id uuid;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select s.id into v_space_id from public.mobile_participation_spaces s where s.benefit_id=p_benefit_id and s.state='published';
  if v_space_id is null then return null;end if;
  return public.read_owned_mobile_participation_space(p_app_user_id,v_space_id,p_locale);
end $$;

create function public.upsert_admin_mobile_participation_space(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_space_id uuid,p_expected_revision integer,p_celebrity_id uuid,p_slug text,p_policy_version text,p_state text,p_opens_at timestamptz,p_closes_at timestamptz,p_benefit_id uuid,p_title_ko text,p_title_en text,p_summary_ko text,p_summary_en text,p_image_url text,p_address_ko text,p_address_en text,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.mobile_participation_spaces%rowtype;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  if p_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$'or p_state not in('draft','published','closed')or p_opens_at>=p_closes_at or length(btrim(coalesce(p_policy_version,'')))not between 1 and 80 or length(btrim(coalesce(p_title_ko,'')))not between 1 and 200 or length(btrim(coalesce(p_title_en,'')))not between 1 and 200 or length(coalesce(p_summary_ko,''))>5000 or length(coalesce(p_summary_en,''))>5000 or length(coalesce(p_address_ko,''))>500 or length(coalesce(p_address_en,''))>500 or(p_image_url is not null and p_image_url!~'^/[^[:space:]]+$'and p_image_url!~'^https://[^[:space:]]+$')or length(btrim(coalesce(p_reason,'')))not between 10 and 500 then raise exception'MOBILE_PARTICIPATION_INVALID';end if;
  if not exists(select 1 from public.celebrities where id=p_celebrity_id and status='published'and archived_at is null)then raise exception'MOBILE_PARTICIPATION_TARGET_UNAVAILABLE';end if;
  if p_benefit_id is not null and not exists(select 1 from public.benefits where id=p_benefit_id and celebrity_id=p_celebrity_id and publication_status='published')then raise exception'MOBILE_PARTICIPATION_BENEFIT_UNAVAILABLE';end if;
  if p_space_id is null then
    insert into public.mobile_participation_spaces(celebrity_id,slug,policy_version,state,opens_at,closes_at,benefit_id,title_ko,title_en,summary_ko,summary_en,image_url,address_ko,address_en,created_by_admin_id)values(p_celebrity_id,p_slug,p_policy_version,p_state,p_opens_at,p_closes_at,p_benefit_id,btrim(p_title_ko),btrim(p_title_en),coalesce(p_summary_ko,''),coalesce(p_summary_en,''),p_image_url,coalesce(p_address_ko,''),coalesce(p_address_en,''),p_actor_admin_allowlist_id)returning*into s;
  else
    update public.mobile_participation_spaces set celebrity_id=p_celebrity_id,slug=p_slug,policy_version=p_policy_version,state=p_state,opens_at=p_opens_at,closes_at=p_closes_at,benefit_id=p_benefit_id,title_ko=btrim(p_title_ko),title_en=btrim(p_title_en),summary_ko=coalesce(p_summary_ko,''),summary_en=coalesce(p_summary_en,''),image_url=p_image_url,address_ko=coalesce(p_address_ko,''),address_en=coalesce(p_address_en,''),revision=revision+1,updated_at=pg_catalog.clock_timestamp()where id=p_space_id and revision=p_expected_revision returning*into s;
    if not found then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;
  end if;
  insert into public.mobile_participation_admin_audits(actor_app_user_id,actor_admin_allowlist_id,action,target_type,target_id,correlation_id,reason,detail)values(p_actor_app_user_id,p_actor_admin_allowlist_id,'space_upserted','space',s.id,p_correlation_id,btrim(p_reason),jsonb_build_object('revision',s.revision,'state',s.state,'benefitId',s.benefit_id));
  return jsonb_build_object('id',s.id,'revision',s.revision,'state',s.state,'policyVersion',s.policy_version,'benefitId',s.benefit_id,'destinationPath','/participation/spaces/'||s.id::text);
end $$;

create function public.issue_owned_mobile_participation_benefit_qr(p_app_user_id uuid,p_space_id uuid,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.mobile_participation_spaces%rowtype;c public.benefit_claims%rowtype;existing public.mobile_participation_benefit_qr_requests%rowtype;q public.mobile_participation_qr_codes%rowtype;raw text:='byus_'||replace(extensions.gen_random_uuid()::text,'-','');result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_request_key is null then raise exception'MOBILE_PARTICIPATION_INVALID';end if;
  select*into existing from public.mobile_participation_benefit_qr_requests where app_user_id=p_app_user_id and request_key=p_request_key;
  if found then if existing.space_id<>p_space_id then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;return existing.result||jsonb_build_object('replayed',true);end if;
  select*into s from public.mobile_participation_spaces where id=p_space_id and state='published'and benefit_id is not null and pg_catalog.clock_timestamp()>=opens_at and pg_catalog.clock_timestamp()<closes_at for key share;
  if not found then raise exception'MOBILE_PARTICIPATION_TARGET_UNAVAILABLE';end if;
  if not exists(select 1 from public.mobile_participation_space_visits v where v.space_id=s.id and v.app_user_id=p_app_user_id)then raise exception'MOBILE_PARTICIPATION_VISIT_REQUIRED';end if;
  select*into c from public.benefit_claims where benefit_id=s.benefit_id and app_user_id=p_app_user_id order by claimed_at desc,id desc limit 1 for update;
  if not found or exists(select 1 from public.benefit_claim_usage_events u where u.benefit_claim_id=c.id)then raise exception'MOBILE_PARTICIPATION_BENEFIT_UNAVAILABLE';end if;
  if not exists(select 1 from public.benefits b where b.id=s.benefit_id and b.publication_status='published'and b.archived_at is null and pg_catalog.clock_timestamp()>=b.claim_opens_at and pg_catalog.clock_timestamp()<b.claim_closes_at)then raise exception'MOBILE_PARTICIPATION_BENEFIT_UNAVAILABLE';end if;
  update public.mobile_participation_qr_codes set state='revoked'where purpose='benefit_use'and target_id=c.id and owner_app_user_id=p_app_user_id and state='active';
  insert into public.mobile_participation_qr_codes(token_hash,purpose,target_type,target_id,owner_app_user_id,benefit_id,destination_path,policy_version,expires_at,one_time,staff_required,created_by_app_user_id)values(encode(extensions.digest(raw,'sha256'),'hex'),'benefit_use','benefit_claim',c.id,p_app_user_id,s.benefit_id,'/benefits/'||s.benefit_id::text,s.policy_version,pg_catalog.clock_timestamp()+interval'3 minutes',true,true,p_app_user_id)returning*into q;
  result:=jsonb_build_object('id',q.id,'spaceId',s.id,'claimId',c.id,'benefitId',s.benefit_id,'rawCode',raw,'purpose','benefit_use','destinationPath',q.destination_path,'expiresAt',q.expires_at,'oneTime',true,'staffConfirmationRequired',true,'replayed',false);
  insert into public.mobile_participation_benefit_qr_requests(app_user_id,request_key,space_id,benefit_claim_id,qr_id,raw_code,result)values(p_app_user_id,p_request_key,s.id,c.id,q.id,raw,result);
  return result;
end $$;

create function public.read_owned_mobile_participation_benefit_qr(p_app_user_id uuid,p_space_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select r.result||jsonb_build_object('replayed',true)into result from public.mobile_participation_benefit_qr_requests r join public.mobile_participation_qr_codes q on q.id=r.qr_id join public.mobile_participation_spaces s on s.id=r.space_id and s.benefit_id=q.benefit_id join public.benefit_claims c on c.id=r.benefit_claim_id and c.app_user_id=r.app_user_id and c.benefit_id=s.benefit_id where r.app_user_id=p_app_user_id and r.space_id=p_space_id and q.state='active'and q.expires_at>pg_catalog.clock_timestamp()and s.state='published'and s.policy_version=q.policy_version and pg_catalog.clock_timestamp()>=s.opens_at and pg_catalog.clock_timestamp()<s.closes_at and not exists(select 1 from public.benefit_claim_usage_events u where u.benefit_claim_id=c.id)order by r.created_at desc limit 1;
  return result;
end $$;

create function public.read_owned_mobile_participation_qr_request(p_app_user_id uuid,p_request_key uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare req public.mobile_participation_qr_requests%rowtype;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select * into req from public.mobile_participation_qr_requests where app_user_id=p_app_user_id and request_key=p_request_key;
  if not found then return null; end if;
  return req.result||jsonb_build_object('replayed',true);
end $$;

create or replace function public.resolve_owned_mobile_participation_qr(p_app_user_id uuid,p_raw_code text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h text:=encode(extensions.digest(coalesce(p_raw_code,''),'sha256'),'hex');q public.mobile_participation_qr_codes%rowtype;req public.mobile_participation_qr_requests%rowtype;result jsonb;status text;v_effect jsonb;v_destination text;v_verification text;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_request_key is null or length(coalesce(p_raw_code,''))not between 8 and 512 then raise exception'MOBILE_PARTICIPATION_INVALID';end if;
  select*into req from public.mobile_participation_qr_requests where app_user_id=p_app_user_id and request_key=p_request_key;
  if found then if req.token_hash<>h then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;return req.result||jsonb_build_object('replayed',true);end if;
  if(select count(*)from public.mobile_participation_qr_requests where app_user_id=p_app_user_id and created_at>pg_catalog.clock_timestamp()-interval'1 minute')>=20 then raise exception'MOBILE_PARTICIPATION_QR_RATE_LIMITED';end if;
  select*into q from public.mobile_participation_qr_codes where token_hash=h for update;
  if not found then status:='unknown';
  elsif q.owner_app_user_id is not null and q.owner_app_user_id<>p_app_user_id then status:='unknown';
  elsif q.state='consumed'then status:='used';
  elsif q.state='revoked'then status:='unknown';
  elsif q.expires_at<=pg_catalog.clock_timestamp()then status:='expired';
  else
    status:='resolved';
    if q.purpose='stamp' then
      if not exists(select 1 from public.mobile_participation_events e where e.id=q.target_id and e.state='published'and e.policy_version=q.policy_version and pg_catalog.clock_timestamp()>=e.starts_at and pg_catalog.clock_timestamp()<e.ends_at)then status:='expired';
      elsif not exists(select 1 from public.fan_passports p where p.app_user_id=p_app_user_id and p.celebrity_id=(select e.celebrity_id from public.mobile_participation_events e where e.id=q.target_id)and p.business_status='issued')or not exists(select 1 from public.user_wallets w where w.app_user_id=p_app_user_id and w.chain_id=91342 and w.provider='privy'and w.wallet_type='embedded')then status:='fan_verification_required';
      else perform public.award_owned_mobile_participation_qr_stamp(q.id,p_app_user_id);end if;
    elsif q.purpose='space' then
      if not exists(select 1 from public.mobile_participation_spaces s where s.id=q.target_id and s.state='published'and s.policy_version=q.policy_version and s.benefit_id is not distinct from q.benefit_id and pg_catalog.clock_timestamp()>=s.opens_at and pg_catalog.clock_timestamp()<s.closes_at)then status:='expired';
      else insert into public.mobile_participation_space_visits(qr_code_id,app_user_id,space_id,benefit_id)values(q.id,p_app_user_id,q.target_id,q.benefit_id)on conflict(qr_code_id,app_user_id)do nothing;end if;
    elsif q.purpose in('live','event','album')then
      if not exists(select 1 from public.mobile_participation_contexts c where c.id=q.target_id and c.context_type=q.purpose and c.state='published'and c.policy_version=q.policy_version and pg_catalog.clock_timestamp()>=c.opens_at and pg_catalog.clock_timestamp()<c.closes_at)then status:='expired';end if;
    elsif q.purpose='profile'then
      if not exists(select 1 from public.social_profile_links l join public.social_profile_settings s on s.app_user_id=l.app_user_id and s.profile_visible where l.token=q.target_id and l.expires_at>pg_catalog.clock_timestamp())then status:='expired';end if;
    elsif q.purpose='event_checkin'then
      if not exists(select 1 from public.mobile_participation_events e where e.id=q.target_id and e.state='published'and e.policy_version=q.policy_version and pg_catalog.clock_timestamp()<e.ends_at)then status:='expired';end if;
    elsif q.purpose='benefit_use'then
      if not exists(select 1 from public.benefit_claims c where c.id=q.target_id and c.benefit_id=q.benefit_id and c.app_user_id=p_app_user_id)or exists(select 1 from public.benefit_claim_usage_events u where u.benefit_claim_id=q.target_id)then status:='used';end if;
    elsif q.purpose='prize_pickup'then
      if not exists(select 1 from public.mobile_benefit_awards a where a.id=q.target_id and a.app_user_id=p_app_user_id and a.fulfillment_method='on_site_pickup'and a.fulfillment_status in('ready','pickup_available'))then status:='used';end if;
    end if;
    if status='resolved'and q.one_time and not q.staff_required then update public.mobile_participation_qr_codes set state='consumed',consumed_at=pg_catalog.clock_timestamp(),consumed_by_app_user_id=p_app_user_id where id=q.id returning*into q;end if;
  end if;
  if status in('resolved','used')then v_effect:=public.mobile_participation_qr_effect(q.id,p_app_user_id,q.benefit_id);end if;
  v_destination:=case when status in('resolved','used')and q.purpose='stamp'and v_effect#>>'{stamp,id}'is not null then'/stamps/'||(v_effect#>>'{stamp,id}')when status in('resolved','used','fan_verification_required')then q.destination_path else null end;
  if status='fan_verification_required'then select'/c/'||c.slug||'/verify'into v_verification from public.mobile_participation_events e join public.celebrities c on c.id=e.celebrity_id where e.id=q.target_id;end if;
  result:=jsonb_build_object('requestId',extensions.gen_random_uuid(),'status',status,'purpose',case when status in('resolved','used','fan_verification_required')then q.purpose else null end,'targetType',case when status in('resolved','used','fan_verification_required')then q.target_type else null end,'targetId',case when status in('resolved','used','fan_verification_required')then q.target_id else null end,'destinationPath',v_destination,'verificationPath',v_verification,'expiresAt',case when status in('resolved','used','expired','fan_verification_required')then q.expires_at else null end,'consumedAt',case when status in('resolved','used')then q.consumed_at else null end,'staffConfirmationRequired',case when status in('resolved','used')then coalesce(q.staff_required,false)else false end,'effect',v_effect,'replayed',false);
  insert into public.mobile_participation_qr_requests(id,app_user_id,request_key,token_hash,result)values((result->>'requestId')::uuid,p_app_user_id,p_request_key,h,result);
  return result;
end $$;

create or replace function public.confirm_admin_mobile_participation_qr(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_request_id uuid,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare req public.mobile_participation_qr_requests%rowtype;q public.mobile_participation_qr_codes%rowtype;award public.mobile_benefit_awards%rowtype;claim public.benefit_claims%rowtype;v_result jsonb;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  if length(btrim(coalesce(p_reason,'')))not between 10 and 500 then raise exception'MOBILE_PARTICIPATION_INVALID';end if;
  select*into req from public.mobile_participation_qr_requests where id=p_request_id for update;
  if not found or req.result->>'status'not in('resolved','consumed')then raise exception'MOBILE_PARTICIPATION_QR_NOT_FOUND';end if;
  select*into q from public.mobile_participation_qr_codes where token_hash=req.token_hash for update;
  if q.state='consumed'and q.consumed_by_app_user_id=req.app_user_id then return req.result||jsonb_build_object('replayed',true);end if;
  if not found or not q.staff_required or q.state<>'active'or q.expires_at<=pg_catalog.clock_timestamp()then raise exception'MOBILE_PARTICIPATION_QR_UNAVAILABLE';end if;
  if q.purpose='prize_pickup'then
    select*into award from public.mobile_benefit_awards where id=q.target_id and app_user_id=req.app_user_id and fulfillment_method='on_site_pickup'for update;
    if not found or award.fulfillment_status not in('ready','pickup_available')then raise exception'MOBILE_PARTICIPATION_PICKUP_UNAVAILABLE';end if;
    update public.mobile_benefit_awards set fulfillment_status='pickup_completed',updated_at=pg_catalog.clock_timestamp()where id=award.id;
  elsif q.purpose='event_checkin'then
    insert into public.mobile_participation_checkins(event_id,app_user_id,source,policy_version,confirmed_by_admin_id)select e.id,req.app_user_id,'staff',e.policy_version,p_actor_admin_allowlist_id from public.mobile_participation_events e where e.id=q.target_id and e.state='published'and e.policy_version=q.policy_version and pg_catalog.clock_timestamp()>=e.starts_at and pg_catalog.clock_timestamp()<e.ends_at on conflict(event_id,app_user_id)do update set status='valid',source='staff',policy_version=excluded.policy_version,confirmed_at=pg_catalog.clock_timestamp(),confirmed_by_admin_id=excluded.confirmed_by_admin_id;
    if not found then raise exception'MOBILE_PARTICIPATION_EVENT_UNAVAILABLE';end if;
  elsif q.purpose='benefit_use'then
    select*into claim from public.benefit_claims where id=q.target_id and benefit_id=q.benefit_id and app_user_id=req.app_user_id for update;
    if not found then raise exception'MOBILE_PARTICIPATION_BENEFIT_UNAVAILABLE';end if;
    perform public.mark_admin_benefit_claim_used(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,claim.id,pg_catalog.now());
  else raise exception'MOBILE_PARTICIPATION_QR_PURPOSE_INVALID';end if;
  update public.mobile_participation_qr_codes set state='consumed',consumed_at=pg_catalog.clock_timestamp(),consumed_by_app_user_id=req.app_user_id where id=q.id returning*into q;
  v_result:=jsonb_build_object('requestId',req.id,'status','consumed','purpose',q.purpose,'targetType',q.target_type,'targetId',q.target_id,'destinationPath',q.destination_path,'consumedAt',q.consumed_at,'staffConfirmationRequired',q.staff_required,'effect',public.mobile_participation_qr_effect(q.id,req.app_user_id,q.benefit_id),'replayed',false);
  update public.mobile_participation_qr_requests set result=v_result where id=req.id;
  insert into public.mobile_participation_admin_audits(actor_app_user_id,actor_admin_allowlist_id,action,target_type,target_id,correlation_id,reason,detail)values(p_actor_app_user_id,p_actor_admin_allowlist_id,'qr_confirmed',q.purpose,q.target_id,p_correlation_id,btrim(p_reason),jsonb_build_object('requestId',req.id,'appUserId',req.app_user_id));
  return v_result;
end $$;

drop function public.issue_admin_mobile_participation_qr(uuid,uuid,text,text,uuid,uuid,text,timestamptz,boolean,boolean,text,uuid);
create function public.issue_admin_mobile_participation_qr(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_purpose text,p_target_type text,p_target_id uuid,p_owner_app_user_id uuid,p_benefit_id uuid,p_destination_path text,p_policy_version text,p_expires_at timestamptz,p_one_time boolean,p_staff_required boolean,p_reason text,p_correlation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare raw text:='byus_'||replace(extensions.gen_random_uuid()::text,'-','');q public.mobile_participation_qr_codes%rowtype;claim public.benefit_claims%rowtype;space public.mobile_participation_spaces%rowtype;context public.mobile_participation_contexts%rowtype;v_benefit_id uuid:=p_benefit_id;v_destination_path text:=p_destination_path;v_claim_found boolean:=false;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  if p_purpose='benefit_use'then select*into claim from public.benefit_claims where id=p_target_id and app_user_id=p_owner_app_user_id;v_claim_found:=found;if v_claim_found and p_benefit_id is not null and p_benefit_id<>claim.benefit_id then raise exception'MOBILE_PARTICIPATION_BENEFIT_UNAVAILABLE';end if;if v_claim_found then v_benefit_id:=claim.benefit_id;end if;end if;
  if p_purpose='space'then select*into space from public.mobile_participation_spaces where id=p_target_id;if found then if p_benefit_id is not null and p_benefit_id is distinct from space.benefit_id then raise exception'MOBILE_PARTICIPATION_BENEFIT_UNAVAILABLE';end if;v_benefit_id:=space.benefit_id;end if;end if;
  if v_destination_path is null then v_destination_path:=case p_purpose when'profile'then'/fans/profile-links/'||p_target_id::text when'stamp'then'/my/activity'when'live'then'/participation/contexts/live/'||p_target_id::text when'event'then'/participation/contexts/event/'||p_target_id::text when'space'then'/participation/spaces/'||p_target_id::text when'album'then'/participation/contexts/album/'||p_target_id::text when'event_checkin'then'/participation/events/'||p_target_id::text when'benefit_use'then'/benefits/'||v_benefit_id::text when'prize_pickup'then'/my/raffles'else null end;end if;
  if p_purpose not in('profile','stamp','live','event','space','album','event_checkin','benefit_use','prize_pickup')or p_expires_at<=pg_catalog.clock_timestamp()or length(btrim(coalesce(p_reason,'')))not between 10 and 500 or p_correlation_id is null or not public.mobile_participation_qr_destination_allowed(p_purpose,p_target_id,v_benefit_id,v_destination_path)then raise exception'MOBILE_PARTICIPATION_INVALID';end if;
  if p_purpose in('event_checkin','benefit_use','prize_pickup')and(not p_staff_required or not p_one_time)then raise exception'MOBILE_PARTICIPATION_QR_PURPOSE_INVALID';end if;
  if p_purpose='stamp'and p_staff_required then raise exception'MOBILE_PARTICIPATION_QR_PURPOSE_INVALID';end if;
  if (p_purpose in('live','event','album')and p_target_type<>'participation_context')or(p_purpose='profile'and p_target_type<>'profile_link')or(p_purpose='stamp'and p_target_type<>'event')or(p_purpose='space'and p_target_type<>'fan_place')or(p_purpose='event_checkin'and p_target_type<>'event')or(p_purpose='benefit_use'and p_target_type<>'benefit_claim')or(p_purpose='prize_pickup'and p_target_type<>'mobile_benefit_award')then raise exception'MOBILE_PARTICIPATION_QR_PURPOSE_INVALID';end if;
  if p_purpose='profile'and not exists(select 1 from public.social_profile_links l join public.social_profile_settings s on s.app_user_id=l.app_user_id and s.profile_visible where l.token=p_target_id and l.expires_at>pg_catalog.clock_timestamp())then raise exception'MOBILE_PARTICIPATION_TARGET_UNAVAILABLE';end if;
  if p_purpose in('live','event','album')then select*into context from public.mobile_participation_contexts c where c.id=p_target_id and c.context_type=p_purpose and c.state='published'and c.policy_version=p_policy_version and pg_catalog.clock_timestamp()>=c.opens_at and pg_catalog.clock_timestamp()<c.closes_at;if not found or(p_purpose='live'and v_destination_path not in('/participation/contexts/live/'||p_target_id::text,'/live/'||context.slug))then raise exception'MOBILE_PARTICIPATION_TARGET_UNAVAILABLE';end if;end if;
  if p_purpose in('stamp','event_checkin')and not exists(select 1 from public.mobile_participation_events e where e.id=p_target_id and e.state='published'and e.policy_version=p_policy_version and pg_catalog.clock_timestamp()>=e.starts_at and pg_catalog.clock_timestamp()<e.ends_at)then raise exception'MOBILE_PARTICIPATION_TARGET_UNAVAILABLE';end if;
  if p_purpose='space'and(space.id is null or space.state<>'published'or space.policy_version<>p_policy_version or pg_catalog.clock_timestamp()<space.opens_at or pg_catalog.clock_timestamp()>=space.closes_at)then raise exception'MOBILE_PARTICIPATION_TARGET_UNAVAILABLE';end if;
  if p_purpose='benefit_use'and(not v_claim_found or exists(select 1 from public.benefit_claim_usage_events u where u.benefit_claim_id=claim.id))then raise exception'MOBILE_PARTICIPATION_BENEFIT_UNAVAILABLE';end if;
  if p_purpose='prize_pickup'and not exists(select 1 from public.mobile_benefit_awards a where a.id=p_target_id and a.app_user_id=p_owner_app_user_id and a.fulfillment_method='on_site_pickup'and a.fulfillment_status in('ready','pickup_available'))then raise exception'MOBILE_PARTICIPATION_PICKUP_UNAVAILABLE';end if;
  insert into public.mobile_participation_qr_codes(token_hash,purpose,target_type,target_id,owner_app_user_id,benefit_id,destination_path,policy_version,expires_at,one_time,staff_required,created_by_admin_id)values(encode(extensions.digest(raw,'sha256'),'hex'),p_purpose,p_target_type,p_target_id,p_owner_app_user_id,v_benefit_id,v_destination_path,p_policy_version,p_expires_at,p_one_time,p_staff_required,p_actor_admin_allowlist_id)returning*into q;
  insert into public.mobile_participation_admin_audits(actor_app_user_id,actor_admin_allowlist_id,action,target_type,target_id,correlation_id,reason,detail)values(p_actor_app_user_id,p_actor_admin_allowlist_id,'qr_issued',p_purpose,p_target_id,p_correlation_id,btrim(p_reason),jsonb_build_object('qrId',q.id,'expiresAt',q.expires_at,'destinationPath',q.destination_path,'benefitId',q.benefit_id));
  return jsonb_build_object('id',q.id,'rawCode',raw,'purpose',q.purpose,'targetType',q.target_type,'targetId',q.target_id,'benefitId',q.benefit_id,'destinationPath',q.destination_path,'expiresAt',q.expires_at,'oneTime',q.one_time,'staffConfirmationRequired',q.staff_required);
end $$;

revoke all on function public.mobile_participation_qr_destination_allowed(text,uuid,uuid,text),public.award_owned_mobile_participation_qr_stamp(uuid,uuid),public.mobile_participation_qr_effect(uuid,uuid,uuid),public.read_owned_mobile_participation_space(uuid,uuid,public.content_locale),public.read_owned_mobile_participation_benefit(uuid,uuid,public.content_locale),public.issue_owned_mobile_participation_benefit_qr(uuid,uuid,uuid),public.read_owned_mobile_participation_benefit_qr(uuid,uuid),public.upsert_admin_mobile_participation_space(uuid,uuid,uuid,integer,uuid,text,text,text,timestamptz,timestamptz,uuid,text,text,text,text,text,text,text,text,uuid),public.read_owned_mobile_participation_qr_request(uuid,uuid),public.issue_admin_mobile_participation_qr(uuid,uuid,text,text,uuid,uuid,uuid,text,text,timestamptz,boolean,boolean,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_participation_space(uuid,uuid,public.content_locale),public.read_owned_mobile_participation_benefit(uuid,uuid,public.content_locale),public.issue_owned_mobile_participation_benefit_qr(uuid,uuid,uuid),public.read_owned_mobile_participation_benefit_qr(uuid,uuid),public.upsert_admin_mobile_participation_space(uuid,uuid,uuid,integer,uuid,text,text,text,timestamptz,timestamptz,uuid,text,text,text,text,text,text,text,text,uuid),public.read_owned_mobile_participation_qr_request(uuid,uuid),public.issue_admin_mobile_participation_qr(uuid,uuid,text,text,uuid,uuid,uuid,text,text,timestamptz,boolean,boolean,text,uuid) to service_role;

commit;

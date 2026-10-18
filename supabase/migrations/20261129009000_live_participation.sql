-- Explicit broadcast links replace only their canonical source's earning reward.
begin;
alter table public.mobile_fan_economy_policies drop constraint mobile_fan_economy_policies_kind_check;
alter table public.mobile_fan_economy_policies add constraint mobile_fan_economy_policies_kind_check check(kind in('earning','exchange','vote','correction','broadcast'));
create table public.live_participation_missions(
 id uuid primary key default extensions.gen_random_uuid(),live_event_id uuid not null references public.live_events(id),
 mission_key text not null check(mission_key in('reserve','waiting','song','story','dance','topic','matching','sns','attendance','comment','like','early','first','quiz','corner','crew','reflection','highlight','best','idea','aftershare','nextreserve','return','bonus')),
 kind text not null check(kind in('reservation','waiting','song','text','url','image','attendance','choice','quiz','crew','return','bonus')),
 phase text not null check(phase in('before','during','after')),title text not null check(length(btrim(title))between 1 and 160),description text not null default '' check(length(description)<=2000),
 survey_id uuid unique references public.live_surveys(id),certification_mission_id uuid unique references public.certification_missions(id),
 thread_id uuid,next_live_event_id uuid references public.live_events(id),policy_id uuid not null references public.mobile_fan_economy_policies(id),
 opens_at timestamptz not null,closes_at timestamptz not null,public boolean not null default false,enabled boolean not null default false,revision integer not null default 1,
 unique(live_event_id,mission_key),check(opens_at<closes_at),check(revision>0)
);
create table public.live_participation_receipts(
 id uuid primary key default extensions.gen_random_uuid(),app_user_id uuid not null references public.app_users(id),live_event_id uuid not null references public.live_events(id),
 mission_id uuid not null references public.live_participation_missions(id),mission_key text not null,source_id uuid not null,
 awarded_points integer not null check(awarded_points>=0),point_ledger_id uuid unique references public.mobile_fan_economy_ledger(id),
 approved_at timestamptz not null default clock_timestamp(),unique(app_user_id,live_event_id,mission_key),check((awarded_points=0)=(point_ledger_id is null))
);
create unique index live_participation_first_winner on public.live_participation_receipts(live_event_id)where mission_key='first';
create table public.live_participation_requests(
 app_user_id uuid not null references public.app_users(id),request_key uuid not null,input jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(app_user_id,request_key)
);
create table public.live_participation_entries(
 id uuid primary key default extensions.gen_random_uuid(),app_user_id uuid not null references public.app_users(id),mission_id uuid not null references public.live_participation_missions(id),
 role text check(role in('recording','guidance','highlights')),created_at timestamptz not null default clock_timestamp(),unique(app_user_id,mission_id)
);
create function public.live_participation_points(p_key text)returns integer language sql immutable set search_path='' as $$
 select case p_key when 'reserve'then 5 when 'nextreserve'then 5 when 'song'then 10 when 'story'then 20 when 'dance'then 10 when 'topic'then 5 when 'matching'then 5 when 'sns'then 20 when 'attendance'then 10 when 'comment'then 20 when 'like'then 10 when 'early'then 20 when 'first'then 30 when 'quiz'then 20 when 'corner'then 5 when 'reflection'then 10 when 'highlight'then 30 when 'best'then 5 when 'idea'then 10 when 'aftershare'then 20 when 'return'then 20 when 'bonus'then 20 else 0 end $$;
create function public.live_participation_validate_mission()returns trigger language plpgsql security definer set search_path='' as $$
declare creator uuid; source_creator uuid; source_live uuid;expected_kind text;expected_phase text;begin
 select celebrity_id into strict creator from public.live_events where id=new.live_event_id;
 if not exists(select 1 from public.mobile_fan_economy_policies where id=new.policy_id and celebrity_id=creator and kind='broadcast' and rules='{"contract":"live-v1"}'::jsonb)then raise exception 'LIVE_PARTICIPATION_POLICY_INVALID';end if;
 if tg_op='UPDATE' and (new.live_event_id,new.mission_key,new.kind,new.survey_id,new.certification_mission_id,new.next_live_event_id,new.policy_id)is distinct from(old.live_event_id,old.mission_key,old.kind,old.survey_id,old.certification_mission_id,old.next_live_event_id,old.policy_id)then raise exception 'LIVE_PARTICIPATION_SOURCE_IMMUTABLE';end if;
 expected_kind:=case when new.mission_key in('reserve','nextreserve')then'reservation'when new.mission_key in('story','dance','reflection','idea')then'text'when new.mission_key in('sns','highlight','aftershare')then'url'when new.mission_key in('comment','like','early','first')then'image'when new.mission_key in('topic','matching','corner','best')then'choice'else new.mission_key end;
 expected_phase:=case when new.mission_key in('reserve','waiting','song','story','dance','topic','matching','sns')then'before'when new.mission_key in('attendance','comment','like','early','first','quiz','corner','crew')then'during'else'after'end;
 if new.kind<>expected_kind or new.phase<>expected_phase then raise exception 'LIVE_PARTICIPATION_KIND_INVALID';end if;
 if new.kind in('choice','quiz')then
  if new.survey_id is null or new.certification_mission_id is not null then raise exception 'LIVE_PARTICIPATION_SOURCE_INVALID';end if;
  select l.celebrity_id,s.live_event_id into source_creator,source_live from public.live_surveys s join public.live_events l on l.id=s.live_event_id where s.id=new.survey_id and not s.legacy_contract and(s.mission_type='quiz')=(new.kind='quiz')and(not(new.public and new.enabled)or s.publication_status='published');
  if source_creator is distinct from creator or source_live is distinct from new.live_event_id then raise exception 'LIVE_PARTICIPATION_SOURCE_INVALID';end if;
 elsif new.kind in('text','url','image','song')then
  if new.certification_mission_id is null or new.survey_id is not null then raise exception 'LIVE_PARTICIPATION_SOURCE_INVALID';end if;
  select celebrity_id into source_creator from public.certification_missions where id=new.certification_mission_id and membership_platform is null and(not(new.public and new.enabled)or status='active');
  if source_creator is distinct from creator then raise exception 'LIVE_PARTICIPATION_SOURCE_INVALID';end if;
 elsif new.survey_id is not null or new.certification_mission_id is not null then raise exception 'LIVE_PARTICIPATION_SOURCE_INVALID';end if;
 if new.mission_key='nextreserve' then
  if not exists(select 1 from public.live_events n join public.live_events l on l.id=new.live_event_id where n.id=new.next_live_event_id and n.celebrity_id=creator and n.starts_at>l.starts_at)then raise exception 'LIVE_PARTICIPATION_SOURCE_INVALID';end if;
 elsif new.next_live_event_id is not null then raise exception 'LIVE_PARTICIPATION_SOURCE_INVALID';end if;
 if new.kind='waiting'and not exists(select 1 from public.fan_posts where id=new.thread_id and celebrity_id=creator and deleted_at is null and hidden_at is null and visibility='public')then raise exception 'LIVE_PARTICIPATION_SOURCE_INVALID';end if;
 return new;end $$;
create trigger live_participation_mission_validate before insert or update on public.live_participation_missions for each row execute function public.live_participation_validate_mission();
create function public.live_participation_source_mission(p_creator uuid,p_action text,p_scope text)returns uuid language sql stable security definer set search_path='' as $$
 select m.id from public.live_participation_missions m join public.live_events l on l.id=m.live_event_id
 where l.celebrity_id=p_creator and case p_action when'live_reservation'then m.mission_key='reserve'and m.live_event_id::text=p_scope when'live_attendance'then m.mission_key='attendance'and m.live_event_id::text=p_scope when'mission_completion'then m.survey_id::text=p_scope when'certification'then m.certification_mission_id::text=p_scope else false end limit 1 $$;
create function public.live_participation_source_linked(p_creator uuid,p_action text,p_scope text)returns boolean language sql stable security definer set search_path='' as $$select public.live_participation_source_mission(p_creator,p_action,p_scope)is not null $$;
create function public.live_participation_award(p_owner uuid,p_mission uuid,p_source uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.live_participation_missions%rowtype;l public.live_events%rowtype;r public.live_participation_receipts%rowtype;
 delta integer;target integer;entry uuid;receipt_id uuid:=extensions.gen_random_uuid();previous_live uuid;source_time timestamptz;
 ineligible jsonb:=jsonb_build_object('status','not_eligible','asset','fan_point','amount',0,'policyVersion','live-v1','sourceId',p_source,'ledgerId',null);
begin
 select * into strict m from public.live_participation_missions where id=p_mission;
 select * into strict l from public.live_events where id=m.live_event_id;
 -- Existing canonical producers own their source/review locks; wallet stays last.
 perform public.fan_web_lock_active_user(p_owner);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-wallet:'||p_owner||':'||l.celebrity_id,0));
 select * into r from public.live_participation_receipts where app_user_id=p_owner and live_event_id=l.id and mission_key=m.mission_key;
 if found then return jsonb_build_object('status',case when r.awarded_points>0 then'awarded'else'not_eligible'end,'asset','fan_point','amount',r.awarded_points,'policyVersion','live-v1','sourceId',r.source_id,'ledgerId',r.point_ledger_id,'replayed',true);end if;
 -- Closing a broadcast's earning never rolls back an old native source, score, stamp or review.
 if not m.enabled or not m.public or l.publication_status<>'published'or l.archived_at is not null or public.live_effective_status_at(l.id,clock_timestamp())='cancelled'then return ineligible;end if;
 if m.certification_mission_id is not null then select submitted_at into source_time from public.certification_submissions where id=p_source and mission_id=m.certification_mission_id and app_user_id=p_owner and status='approved';
 elsif m.survey_id is not null then select submitted_at into source_time from public.live_survey_responses where id=p_source and survey_id=m.survey_id and app_user_id=p_owner and status='submitted';
 elsif m.mission_key='reserve'then select reserved_at into source_time from public.live_reservations where id=p_source and live_event_id=l.id and app_user_id=p_owner;
 elsif m.mission_key='attendance'then select attended_at into source_time from public.live_attendances where id=p_source and live_event_id=l.id and app_user_id=p_owner;
 elsif m.mission_key='bonus'then select submitted_at into source_time from public.certification_submissions where id=p_source and app_user_id=p_owner and status='approved';
 else select created_at into source_time from public.live_participation_entries where id=p_source and app_user_id=p_owner and mission_id=m.id;end if;
 if source_time is null then raise exception 'LIVE_PARTICIPATION_SOURCE_INVALID';end if;
 if m.mission_key<>'bonus'and(source_time<m.opens_at or source_time>=m.closes_at or(m.phase='before'and source_time>=l.starts_at)or(m.phase='during'and(source_time<l.starts_at or(l.ends_at is not null and source_time>=l.ends_at)))or(m.phase='after'and(l.ends_at is null or source_time<l.ends_at)))then return ineligible;end if;
 if exists(select 1 from public.fan_ticket_ledger where app_user_id=p_owner and celebrity_id=l.celebrity_id and source_id=p_source and amount>0)or exists(select 1 from public.mobile_fan_economy_activity_receipts where app_user_id=p_owner and celebrity_id=l.celebrity_id and source_id=p_source)then return ineligible;end if;
 if m.kind='song'and not exists(select 1 from public.certification_submissions cs join public.live_fan_submissions fs on fs.id=cs.live_fan_submission_id where cs.id=p_source and fs.app_user_id=p_owner and fs.live_event_id=l.id and fs.kind='song'and fs.status<>'hidden'and fs.deleted_at is null)then raise exception 'LIVE_PARTICIPATION_SOURCE_INVALID';end if;
 if m.kind='text'and not exists(select 1 from public.certification_submissions where id=p_source and length(btrim(coalesce(participation_payload->>'text',note,'')))between 1 and 5000)then raise exception 'LIVE_PARTICIPATION_SOURCE_INVALID';end if;
 if m.kind='url'and not exists(select 1 from public.certification_submissions where id=p_source and participation_payload->>'url'~'^https?://[^[:space:]]+$')then raise exception 'LIVE_PARTICIPATION_SOURCE_INVALID';end if;
 if m.mission_key='bonus'and(clock_timestamp()<m.opens_at or clock_timestamp()>=m.closes_at or l.ends_at is null or clock_timestamp()<l.ends_at)then return ineligible;end if;
 target:=public.live_participation_points(m.mission_key);delta:=target;
 if m.mission_key in('attendance','early','first')then delta:=greatest(0,target-coalesce((select sum(awarded_points)from public.live_participation_receipts where app_user_id=p_owner and live_event_id=l.id and mission_key in('attendance','early','first')),0));end if;
 if m.mission_key='return'then
  select id into previous_live from public.live_events where celebrity_id=l.celebrity_id and starts_at<l.starts_at and ends_at<=clock_timestamp()and(publication_status='published'or ever_published_at is not null)and public.live_effective_status_at(id,clock_timestamp())='ended'order by starts_at desc limit 1;
  if not(exists(select 1 from public.live_attendances where app_user_id=p_owner and live_event_id=l.id)or exists(select 1 from public.live_participation_receipts where app_user_id=p_owner and live_event_id=l.id and mission_key in('attendance','early','first')))
   or not(exists(select 1 from public.live_attendances where app_user_id=p_owner and live_event_id=previous_live)
    or exists(select 1 from public.live_survey_responses sr join public.live_surveys survey on survey.id=sr.survey_id where sr.app_user_id=p_owner and sr.live_event_id=previous_live and sr.status='submitted'and not sr.legacy_contract and(survey.mission_type<>'quiz'or sr.correctness is true))
    or exists(select 1 from public.live_participation_receipts where app_user_id=p_owner and live_event_id=previous_live and mission_key not in('reserve','waiting','crew','bonus')))then raise exception 'LIVE_PARTICIPATION_RETURN_INELIGIBLE';end if;
 end if;
 if delta>0 then entry:=public.mobile_fan_economy_post(p_owner,l.celebrity_id,'fan_point',delta,'live_participation',receipt_id,m.policy_id);end if;
 insert into public.live_participation_receipts(id,app_user_id,live_event_id,mission_id,mission_key,source_id,awarded_points,point_ledger_id)values(receipt_id,p_owner,l.id,m.id,m.mission_key,p_source,delta,entry);
 return jsonb_build_object('status',case when delta>0 then'awarded'else'not_eligible'end,'asset','fan_point','amount',delta,'policyVersion','live-v1','sourceId',p_source,'ledgerId',entry,'replayed',false);
end $$;
alter function public.award_mobile_fan_activity(uuid,uuid,text,text)rename to award_mobile_fan_activity_before_live_participation;
create function public.award_mobile_fan_activity(p_owner uuid,p_creator uuid,p_action text,p_scope text)returns jsonb language plpgsql security definer set search_path='' as $$
declare m uuid;source uuid;begin
 m:=public.live_participation_source_mission(p_creator,p_action,p_scope);
 if m is null then return public.award_mobile_fan_activity_before_live_participation(p_owner,p_creator,p_action,p_scope);end if;
 perform public.fan_web_lock_active_user(p_owner);perform public.mobile_fan_lock_reward_source(p_owner,p_creator);
 case p_action
 when 'live_reservation'then select id into source from public.live_reservations where app_user_id=p_owner and celebrity_id=p_creator and live_event_id::text=p_scope;
 when 'live_attendance'then select id into source from public.live_attendances where app_user_id=p_owner and celebrity_id=p_creator and live_event_id::text=p_scope;
 when 'mission_completion'then select id into source from public.live_survey_responses where app_user_id=p_owner and celebrity_id=p_creator and survey_id::text=p_scope and status='submitted'and not legacy_contract;
 when 'certification'then select id into source from public.certification_submissions where app_user_id=p_owner and celebrity_id=p_creator and mission_id::text=p_scope and status='approved';
 else source:=null;end case;
 if source is null then return jsonb_build_object('status','not_eligible','asset','fan_point','amount',0,'policyVersion',null,'sourceId',null,'ledgerId',null);end if;
 return public.live_participation_award(p_owner,m,source);end $$;
-- Patch the shared legacy/point split, including callers which have no general earning policy.
do $$declare f record;definition text;old_gate text;new_gate text;begin
 for f in select * from(values
 ('reward_live_reservation_ticket','public.mobile_fan_source_uses_points(new.celebrity_id,new.created_at)','public.live_participation_source_linked(new.celebrity_id,''live_reservation'',new.live_event_id::text)'),
 ('reward_live_attendance_ticket','public.mobile_fan_source_uses_points(new.celebrity_id,new.created_at)','public.live_participation_source_linked(new.celebrity_id,''live_attendance'',new.live_event_id::text)'),
 ('award_fan_ticket_activity','public.mobile_fan_source_uses_points(p_creator,(select occurred_at from public.fan_ticket_activity_sources(p_owner,p_creator) where action_key=p_action and scope_key=p_scope))','public.live_participation_source_linked(p_creator,p_action,p_scope)'),
 ('finalize_certification_review_internal','exists(select 1 from public.certification_submissions s where s.id=p_submission_id and public.mobile_fan_source_uses_points(s.celebrity_id,coalesce(s.reviewed_at,now())))','exists(select 1 from public.certification_submissions s where s.id=p_submission_id and public.live_participation_source_linked(s.celebrity_id,''certification'',s.mission_id::text))'),
 ('submit_owned_live_mission_before_fan_web','exists(select 1 from public.live_surveys s join public.live_events l on l.id=s.live_event_id where s.id=p_mission_id and public.mobile_fan_source_uses_points(l.celebrity_id,now()))','exists(select 1 from public.live_surveys s join public.live_events l on l.id=s.live_event_id where s.id=p_mission_id and public.live_participation_source_linked(l.celebrity_id,''mission_completion'',s.id::text))')
 )as gates(name,old_gate,new_gate)loop
 select pg_get_functiondef(p.oid)into strict definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname=f.name;
 if position(f.old_gate in definition)=0 then raise exception 'LIVE_PARTICIPATION_PRODUCER_PATCH_MISSING: %',f.name;end if;
 execute replace(definition,f.old_gate,'('||f.old_gate||' or '||f.new_gate||')');
 end loop;end $$;
-- This precheck runs in the shared native producer, before a response or reward exists.
do $$declare definition text;begin
 select pg_get_functiondef(oid)into strict definition from pg_proc where oid='public.submit_owned_live_mission_before_fan_web(uuid,uuid,uuid,jsonb,uuid,text,text)'::regprocedure;
 execute replace(definition,'perform public.mobile_fan_lock_reward_source(p_app_user_id,','perform public.live_participation_check_quiz(p_mission_id,p_answers); perform public.mobile_fan_lock_reward_source(p_app_user_id,');end $$;
create function public.live_participation_check_quiz(p_survey uuid,p_answers jsonb)returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.live_participation_missions where survey_id=p_survey and kind='quiz')then
  if jsonb_typeof(p_answers)is distinct from'array' or jsonb_array_length(p_answers)<>(select count(*)from public.live_survey_questions where survey_id=p_survey)or exists(select 1 from public.live_survey_questions q where q.survey_id=p_survey and not exists(select 1 from jsonb_array_elements(p_answers)a where a->>'questionId'=q.id::text and a->'selectedOptionIds'=jsonb_build_array(q.correct_option_id::text)))then raise exception 'LIVE_PARTICIPATION_QUIZ_INCORRECT';end if;
 end if;end $$;
-- Only linked text submissions can omit images; normal certification keeps its original contract.
do $$declare f record;definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and (p.proname='submit_owned_certification' or p.proname='submit_owned_certification_with_media' or p.proname like'submit_owned_certification_fw_%' or p.proname like'submit_owned_certification_before_%')loop
 definition:=pg_get_functiondef(f.oid);
 definition:=replace(definition,'jsonb_array_length(p_upload_ids) not between 1 and 3','(jsonb_array_length(p_upload_ids) not between 1 and 3 and not(jsonb_array_length(p_upload_ids)=0 and exists(select 1 from public.live_participation_missions where certification_mission_id=p_mission_id and kind in(''text'',''url'',''song''))))');
 definition:=replace(definition,'<>array_length(ids,1)','<>coalesce(array_length(ids,1),0)');
 execute definition;
 end loop;end $$;
alter table public.certification_submissions add column participation_payload jsonb,add column live_fan_submission_id uuid references public.live_fan_submissions(id);
alter table public.live_participation_missions add constraint live_participation_thread_fk foreign key(thread_id)references public.fan_posts(id);
create function public.submit_owned_live_participation(p_app_user_id uuid,p_live_slug text,p_mission_id uuid,p_request_key uuid,p_payload jsonb,p_stamp_id uuid,p_stamp_operation_key text,p_stamp_issuance_id text)returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.live_participation_missions%rowtype;l public.live_events%rowtype;prior public.live_participation_requests%rowtype;input jsonb;result jsonb;canonical jsonb;source uuid;award jsonb;previous uuid;target public.live_events%rowtype;answers jsonb;canonical_replayed boolean:=false;begin
 if not exists(select 1 from public.app_users where id=p_app_user_id and status='active')then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED';end if;
 input:=jsonb_build_object('liveEventId',(select id from public.live_events where slug=p_live_slug),'liveSlug',p_live_slug,'missionId',p_mission_id,'payload',p_payload);
 if p_request_key is null or jsonb_typeof(p_payload)is distinct from'object'then raise exception 'LIVE_PARTICIPATION_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('live-participation-request:'||p_app_user_id||':'||p_request_key,0));
 select * into prior from public.live_participation_requests where app_user_id=p_app_user_id and request_key=p_request_key;
 if found then if prior.input<>input then raise exception 'LIVE_PARTICIPATION_REQUEST_CONFLICT';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 select * into m from public.live_participation_missions where id=p_mission_id;
 select * into l from public.live_events where id=m.live_event_id and slug=p_live_slug and publication_status='published'and archived_at is null;
 if l.id is null then raise exception 'LIVE_PARTICIPATION_NOT_FOUND';end if;
 if p_payload->>'kind'is distinct from m.kind or m.kind='bonus'then raise exception 'LIVE_PARTICIPATION_INVALID';end if;
 if not public.fan_web_is_member(p_app_user_id,l.celebrity_id)then raise exception 'LIVE_PARTICIPATION_MEMBERSHIP_REQUIRED';end if;
 if not m.enabled or not m.public or clock_timestamp()<m.opens_at or clock_timestamp()>=m.closes_at or public.live_effective_status_at(l.id,clock_timestamp())='cancelled' or(m.phase='before'and clock_timestamp()>=l.starts_at)or(m.phase='during'and(clock_timestamp()<l.starts_at or(l.ends_at is not null and clock_timestamp()>=l.ends_at)))or(m.phase='after'and(l.ends_at is null or clock_timestamp()<l.ends_at))then raise exception 'LIVE_PARTICIPATION_CLOSED';end if;
 if m.kind='reservation'then
  select * into strict target from public.live_events where id=coalesce(m.next_live_event_id,m.live_event_id);
  -- Reuse B's reservation source, even when reached from A's next-reserve card.
  if not exists(select 1 from public.live_participation_missions where live_event_id=target.id and mission_key='reserve'and enabled and public)then raise exception 'LIVE_PARTICIPATION_NEXT_UNCONFIGURED';end if;
  canonical:=public.reserve_owned_live_event(p_app_user_id,target.id,p_request_key,p_stamp_id,p_stamp_operation_key,p_stamp_issuance_id);
  select id into source from public.live_reservations where app_user_id=p_app_user_id and live_event_id=target.id;
  canonical_replayed:=canonical->>'stampId'is distinct from p_stamp_id::text;
 elsif m.kind='attendance'then
  canonical:=public.attend_owned_live_event_with_replay(p_app_user_id,l.slug,p_request_key,upper(btrim(p_payload->>'code')),true,p_stamp_id,p_stamp_operation_key,p_stamp_issuance_id);
  if canonical?'errorCode'then raise exception 'LIVE_PARTICIPATION_ATTENDANCE_INVALID';end if;
  select id into source from public.live_attendances where app_user_id=p_app_user_id and live_event_id=l.id;
  canonical_replayed:=canonical->>'stampId'is distinct from p_stamp_id::text;
 elsif m.kind in('choice','quiz')then
  select jsonb_agg(jsonb_build_object('questionId',a->>'questionId','selectedOptionIds',a->'optionIds'))into answers from jsonb_array_elements(p_payload->'answers')a;
  canonical:=public.submit_owned_live_mission(p_app_user_id,m.survey_id,p_request_key,answers,p_stamp_id,p_stamp_operation_key,p_stamp_issuance_id);
  select id into source from public.live_survey_responses where app_user_id=p_app_user_id and survey_id=m.survey_id and status='submitted';
  canonical_replayed:=canonical#>>'{mission,stamp,id}'is distinct from p_stamp_id::text;
 elsif m.kind in('text','url','image','song')then
  if m.kind='text'and length(btrim(coalesce(p_payload->>'text','')))not between 1 and 5000 then raise exception 'LIVE_PARTICIPATION_INVALID';end if;
  if m.kind='url'and(coalesce(p_payload->>'url','')!~'^https?://[^[:space:]]+$'or length(p_payload->>'url')>2048)then raise exception 'LIVE_PARTICIPATION_INVALID';end if;
  if m.mission_key='highlight'and length(btrim(coalesce(p_payload->>'text','')))<1 then raise exception 'LIVE_PARTICIPATION_INVALID';end if;
  if m.kind='song'and not exists(select 1 from public.live_fan_submissions where id=(p_payload->>'submissionId')::uuid and app_user_id=p_app_user_id and live_event_id=l.id and kind='song'and deleted_at is null and status<>'hidden')then raise exception 'LIVE_PARTICIPATION_SONG_INVALID';end if;
  select id into previous from public.certification_submissions where app_user_id=p_app_user_id and mission_id=m.certification_mission_id and status='rejected'order by submitted_at desc limit 1;
  canonical:=public.submit_owned_certification_with_media(p_app_user_id,m.certification_mission_id,p_request_key,coalesce(p_payload->'uploadIds','[]'::jsonb),left(concat_ws(E'\n',p_payload->>'text',p_payload->>'url'),1000),previous);
  source:=(canonical->>'id')::uuid;canonical_replayed:=coalesce((canonical->>'replayed')::boolean,false);
  update public.certification_submissions set participation_payload=p_payload,live_fan_submission_id=case when m.kind='song'then(p_payload->>'submissionId')::uuid else null end where id=source and status='pending'and not canonical_replayed;
 elsif m.kind in('crew','waiting','return')then
  if m.kind='waiting'and not exists(select 1 from public.fan_posts t where t.id=m.thread_id and t.celebrity_id=l.celebrity_id and t.deleted_at is null and t.hidden_at is null and t.visibility='public')then raise exception 'LIVE_PARTICIPATION_THREAD_UNAVAILABLE';end if;
  insert into public.live_participation_entries(app_user_id,mission_id,role)values(p_app_user_id,m.id,case when m.kind='crew'then p_payload->>'role'end)on conflict(app_user_id,mission_id)do nothing;
  select id into source from public.live_participation_entries where app_user_id=p_app_user_id and mission_id=m.id;
  award:=public.live_participation_award(p_app_user_id,m.id,source);canonical_replayed:=coalesce((award->>'replayed')::boolean,false);
 else raise exception 'LIVE_PARTICIPATION_INVALID';end if;
 if source is null then raise exception 'LIVE_PARTICIPATION_SOURCE_INVALID';end if;
 result:=jsonb_build_object('missionId',m.id,'sourceId',source,'state',case when m.kind in('text','url','image','song')then coalesce(canonical->>'status','pending')else'approved'end,'awardedPoints',case when canonical_replayed then 0 else coalesce((select sum(awarded_points)from public.live_participation_receipts where app_user_id=p_app_user_id and source_id=source),0)end,'replayed',canonical_replayed);
 insert into public.live_participation_requests(app_user_id,request_key,input,result)values(p_app_user_id,p_request_key,input,result);return result;end $$;
create function public.read_live_participation(p_live_slug text,p_phase text,p_app_user_id uuid default null)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.live_events%rowtype;creator text;member boolean;missions jsonb;begin
 if p_phase not in('before','during','after')then raise exception 'LIVE_PARTICIPATION_INVALID';end if;
 select e.* into l from public.live_events e join public.celebrities c on c.id=e.celebrity_id and c.status='published'and c.archived_at is null where e.slug=p_live_slug and e.publication_status='published'and e.archived_at is null;
 if l.id is null then raise exception 'LIVE_PARTICIPATION_NOT_FOUND';end if;
 select slug into creator from public.celebrities where id=l.celebrity_id;
 member:=p_app_user_id is not null and public.fan_web_is_member(p_app_user_id,l.celebrity_id);
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',m.id,'key',m.mission_key,'kind',m.kind,'phase',m.phase,'title',m.title,'description',m.description,'opensAt',m.opens_at,'closesAt',m.closes_at,
 'points',public.live_participation_points(m.mission_key),'rewardMode',case when m.mission_key in('attendance','early','first')then'attendance_highest'else'fixed'end,
 'source',jsonb_strip_nulls(jsonb_build_object('surveyId',case when member then m.survey_id end,'certificationMissionId',case when member then m.certification_mission_id end,'threadId',case when member then m.thread_id end,'nextLiveSlug',(select slug from public.live_events where id=m.next_live_event_id and publication_status='published'and archived_at is null))),
 'state',case when r.id is not null then'approved'when s.id is not null then s.status::text when not m.enabled or(m.survey_id is not null and not exists(select 1 from public.live_surveys where id=m.survey_id and publication_status='published'))or(m.certification_mission_id is not null and not exists(select 1 from public.certification_missions where id=m.certification_mission_id and status='active'and statement_timestamp()>=opens_at and statement_timestamp()<closes_at))or statement_timestamp()<m.opens_at or statement_timestamp()>=m.closes_at or public.live_effective_status_at(l.id,clock_timestamp())='cancelled'or(m.phase='before'and statement_timestamp()>=l.starts_at)or(m.phase='during'and(statement_timestamp()<l.starts_at or(l.ends_at is not null and statement_timestamp()>=l.ends_at)))or(m.phase='after'and(l.ends_at is null or statement_timestamp()<l.ends_at))then'closed'else'available'end,
 'crewRole',case when member then(select role from public.live_participation_entries where app_user_id=p_app_user_id and mission_id=m.id)end,'submittedAnswers',case when member then coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'optionIds',a.selected_option_ids))from public.live_survey_responses sr join public.live_survey_answers a on a.response_id=sr.id where sr.app_user_id=p_app_user_id and sr.survey_id=m.survey_id and sr.status='submitted'),'[]'::jsonb)else'[]'::jsonb end,'submittedText',case when member then coalesce(s.participation_payload->>'text',s.note)end,'submittedUrl',case when member then s.participation_payload->>'url'end,'submissionId',coalesce(s.id,r.source_id),'rejectionReason',s.rejection_reason,'awardedPoints',coalesce(r.awarded_points,0),
 'responseCount',case when member and m.kind='choice'then(select count(*)from public.live_survey_responses where survey_id=m.survey_id and status='submitted')else 0 end,
 'questions',case when not member or not exists(select 1 from public.live_surveys where id=m.survey_id and publication_status='published')then'[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'prompt',ql.question_text,'multiple',q.question_type='multiple_choice','options',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',o.id,'label',ol.label,'responseCount',case when m.kind='choice'then(select count(*)from public.live_survey_answers a join public.live_survey_responses x on x.id=a.response_id where a.question_id=q.id and o.id=any(a.selected_option_ids)and x.status='submitted')end))order by o.position)from public.live_survey_options o join public.live_survey_option_localizations ol on ol.option_id=o.id and ol.locale='ko'where o.question_id=q.id),'[]'::jsonb))order by q.position)from public.live_survey_questions q join public.live_survey_question_localizations ql on ql.question_id=q.id and ql.locale='ko'where q.survey_id=m.survey_id),'[]'::jsonb)end
 )order by m.phase,m.opens_at,m.id),'[]'::jsonb)into missions
 from public.live_participation_missions m
 left join public.live_participation_receipts r on member and r.app_user_id=p_app_user_id and r.live_event_id=coalesce(m.next_live_event_id,m.live_event_id)and r.mission_key=case when m.mission_key='nextreserve'then'reserve'else m.mission_key end
 left join lateral(select cs.* from public.certification_submissions cs where member and cs.app_user_id=p_app_user_id and cs.mission_id=m.certification_mission_id order by cs.submitted_at desc limit 1)s on true
 where m.live_event_id=l.id and m.phase=p_phase and m.public;
 return jsonb_build_object('live',jsonb_build_object('id',l.id,'slug',l.slug,'creatorSlug',creator,'title',coalesce((select title from public.live_event_localizations where live_event_id=l.id and locale='ko'),l.slug),'startsAt',l.starts_at,'endsAt',l.ends_at,'status',public.live_effective_status_at(l.id,statement_timestamp())),
 'phase',p_phase,'policy',jsonb_build_object('status',case when exists(select 1 from public.live_participation_missions where live_event_id=l.id and public and enabled)then'configured'else'unconfigured'end,'version',case when exists(select 1 from public.live_participation_missions where live_event_id=l.id and public and enabled)then'live-v1'end),'missions',missions,
 'contributionPoints',case when member then coalesce((select sum(awarded_points)from public.live_participation_receipts where app_user_id=p_app_user_id and live_event_id=l.id),0)else 0 end);end $$;
create function public.read_owned_participation_summary(p_app_user_id uuid,p_creator_slug text)returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;begin
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_creator_slug);
 return jsonb_build_object('celebrityId',creator,'availablePoints',public.mobile_fan_economy_balance(p_app_user_id,creator,'fan_point'),'hearts',public.mobile_fan_economy_balance(p_app_user_id,creator,'support_voucher'),
 'lifetimePoints',coalesce((select sum(amount)from public.mobile_fan_economy_ledger where app_user_id=p_app_user_id and celebrity_id=creator and asset='fan_point'and amount>0),0),
 'contributionPoints',coalesce((select sum(r.awarded_points)from public.live_participation_receipts r join public.live_events l on l.id=r.live_event_id where r.app_user_id=p_app_user_id and l.celebrity_id=creator),0),
 'sentHearts',coalesce((select sum(units)from public.mobile_fan_support_contributions where app_user_id=p_app_user_id and celebrity_id=creator),0),'freeDrawEntries',public.get_fan_ticket_balance(p_app_user_id,creator));end $$;
create function public.read_public_live_dashboard()returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('approvedParticipation',(select count(*)from public.live_participation_receipts),'participatingBroadcasts',(select count(distinct live_event_id)from public.live_participation_receipts),'sentHearts',coalesce((select sum(units)from public.mobile_fan_support_contributions),0),
 'process',jsonb_build_object('pending',(select count(*)from public.certification_submissions s join public.live_participation_missions m on m.certification_mission_id=s.mission_id where s.status='pending'),'approved',(select count(*)from public.certification_submissions s join public.live_participation_missions m on m.certification_mission_id=s.mission_id where s.status='approved'),'rejected',(select count(*)from public.certification_submissions s join public.live_participation_missions m on m.certification_mission_id=s.mission_id where s.status='rejected')),'asOf',statement_timestamp()) $$;
create function public.live_participation_selection_bonus(p_submission uuid)returns void language plpgsql security definer set search_path='' as $$declare s public.certification_submissions%rowtype;m uuid;begin
 select * into s from public.certification_submissions where id=p_submission and status='approved';
 if not found or s.live_fan_submission_id is null then return;end if;
 select bonus.id into m from public.live_participation_missions own join public.live_participation_missions bonus on bonus.live_event_id=own.live_event_id and bonus.mission_key='bonus'and bonus.enabled and bonus.public and clock_timestamp()>=bonus.opens_at and clock_timestamp()<bonus.closes_at join public.live_events event on event.id=bonus.live_event_id and event.ends_at<=clock_timestamp()join public.live_fan_submissions fs on fs.id=s.live_fan_submission_id and fs.live_event_id=own.live_event_id and fs.app_user_id=s.app_user_id and fs.status='selected'and fs.deleted_at is null where own.certification_mission_id=s.mission_id;
 if m is not null and exists(select 1 from public.live_participation_receipts where source_id=s.id and app_user_id=s.app_user_id)then perform public.live_participation_award(s.app_user_id,m,s.id);end if;end $$;
create function public.live_participation_selected_trigger()returns trigger language plpgsql security definer set search_path='' as $$declare s record;begin
 if tg_table_name='live_fan_submissions'then
  if new.status='selected'and new.deleted_at is null then for s in select id from public.certification_submissions where live_fan_submission_id=new.id and status='approved'loop perform public.live_participation_selection_bonus(s.id);end loop;end if;
 else perform public.live_participation_selection_bonus(new.id);end if;return new;end $$;
create trigger live_participation_selected after update of status on public.live_fan_submissions for each row execute function public.live_participation_selected_trigger();
-- Approval receipts are written by the producer before its final result; bonus follows that receipt.
create function public.live_participation_receipt_bonus_trigger()returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.mission_key='song'then perform public.live_participation_selection_bonus(new.source_id);end if;return new;end $$;
create trigger live_participation_receipt_bonus after insert on public.live_participation_receipts for each row execute function public.live_participation_receipt_bonus_trigger();
create function public.admin_save_live_participation(p_actor uuid,p_allowlist uuid,p_correlation uuid,p_input jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.live_events%rowtype;m public.live_participation_missions%rowtype;before_row jsonb;policy uuid;begin
 perform public.assert_active_admin(p_actor,p_allowlist,true);
 select * into strict l from public.live_events where id=(p_input->>'liveEventId')::uuid;
 if p_input->>'id'is not null then select * into m from public.live_participation_missions where id=(p_input->>'id')::uuid for update;if not found or m.live_event_id<>l.id or m.revision is distinct from(p_input->>'expectedRevision')::integer then raise exception 'LIVE_PARTICIPATION_STALE_REVISION';end if;before_row:=to_jsonb(m);policy:=m.policy_id;
 else
  select id into policy from public.mobile_fan_economy_policies where celebrity_id=l.celebrity_id and kind='broadcast'and version='live-v1';
  if policy is null then insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at)values(l.celebrity_id,'live-v1','broadcast','{"contract":"live-v1"}',clock_timestamp())on conflict(celebrity_id,kind,version)do nothing;
   select id into policy from public.mobile_fan_economy_policies where celebrity_id=l.celebrity_id and kind='broadcast'and version='live-v1';end if;
 end if;
 if m.id is null then
 insert into public.live_participation_missions(live_event_id,mission_key,kind,phase,title,description,survey_id,certification_mission_id,thread_id,next_live_event_id,policy_id,opens_at,closes_at,public,enabled)
 values(l.id,p_input->>'key',p_input->>'kind',p_input->>'phase',p_input->>'title',coalesce(p_input->>'description',''),(p_input->>'surveyId')::uuid,(p_input->>'certificationMissionId')::uuid,(p_input->>'threadId')::uuid,(p_input->>'nextLiveEventId')::uuid,policy,(p_input->>'opensAt')::timestamptz,(p_input->>'closesAt')::timestamptz,(p_input->>'public')::boolean,(p_input->>'enabled')::boolean)returning * into m;
 else update public.live_participation_missions set title=p_input->>'title',description=coalesce(p_input->>'description',''),opens_at=(p_input->>'opensAt')::timestamptz,closes_at=(p_input->>'closesAt')::timestamptz,public=(p_input->>'public')::boolean,enabled=(p_input->>'enabled')::boolean,revision=revision+1 where id=m.id returning * into m;end if;
 perform public.fan_web_participation_audit(p_actor,p_allowlist,p_correlation,'save','live_participation_mission',m.id,before_row,to_jsonb(m));return to_jsonb(m);end $$;
create function public.admin_read_live_participation(p_actor uuid,p_allowlist uuid,p_live uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$declare creator uuid;begin
 perform public.assert_active_admin(p_actor,p_allowlist,false);select celebrity_id into strict creator from public.live_events where id=p_live;
 return jsonb_build_object('missions',coalesce((select jsonb_agg(to_jsonb(m)order by phase,mission_key)from public.live_participation_missions m where live_event_id=p_live),'[]'::jsonb),
 'surveys',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',mission_type,'status',publication_status))from public.live_surveys where live_event_id=p_live and not legacy_contract),'[]'::jsonb),
 'certifications',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title_ko,'status',status))from public.certification_missions where celebrity_id=creator and membership_platform is null),'[]'::jsonb),
 'threads',coalesce((select jsonb_agg(jsonb_build_object('id',id,'body',body))from public.fan_posts where celebrity_id=creator and deleted_at is null and hidden_at is null and visibility='public'),'[]'::jsonb),
 'nextLives',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'slug',n.slug))from public.live_events n join public.live_events l on l.id=p_live where n.celebrity_id=creator and n.starts_at>l.starts_at and n.archived_at is null),'[]'::jsonb));end $$;
create function public.get_owned_live_participation_upload_target(p_app_user_id uuid,p_live_slug text,p_mission_id uuid)returns uuid language plpgsql security definer set search_path='' as $$declare target uuid;begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 select m.certification_mission_id into target from public.live_participation_missions m join public.live_events l on l.id=m.live_event_id join public.celebrities c on c.id=l.celebrity_id
 where m.id=p_mission_id and l.slug=p_live_slug and l.publication_status='published'and l.archived_at is null and public.live_effective_status_at(l.id,clock_timestamp())<>'cancelled'and c.status='published'and c.archived_at is null and m.enabled and m.public and clock_timestamp()>=m.opens_at and clock_timestamp()<m.closes_at and public.fan_web_is_member(p_app_user_id,l.celebrity_id);
 if target is null then raise exception 'LIVE_PARTICIPATION_UPLOAD_UNAVAILABLE';end if;return target;end $$;
alter function public.read_owned_mobile_fan_reward(uuid,uuid)rename to read_owned_mobile_fan_reward_before_live;
create function public.read_owned_mobile_fan_reward(p_app_user_id uuid,p_source_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$declare r public.live_participation_receipts%rowtype;begin
 perform public.fan_web_lock_active_user(p_app_user_id);select * into r from public.live_participation_receipts where app_user_id=p_app_user_id and source_id=p_source_id and mission_key<>'bonus'limit 1;
 if found then return jsonb_build_object('status',case when r.awarded_points>0 then'awarded'else'not_eligible'end,'asset','fan_point','amount',r.awarded_points,'policyVersion','live-v1','sourceId',r.source_id,'ledgerId',r.point_ledger_id);end if;
 return public.read_owned_mobile_fan_reward_before_live(p_app_user_id,p_source_id);end $$;
revoke all on function public.read_owned_mobile_fan_reward_before_live(uuid,uuid),public.read_owned_mobile_fan_reward(uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_fan_reward(uuid,uuid)to service_role;
alter function public.get_admin_certification_queue(uuid,uuid,public.certification_submission_status)rename to get_admin_certification_queue_before_live;
create function public.get_admin_certification_queue(p_actor uuid,p_allowlist uuid,p_status public.certification_submission_status default 'pending')returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item||jsonb_build_object('participationPayload',s.participation_payload,'liveFanSubmissionId',s.live_fan_submission_id,'broadcastMissionKey',m.mission_key)order by ord),'[]'::jsonb)
 from jsonb_array_elements(public.get_admin_certification_queue_before_live(p_actor,p_allowlist,p_status))with ordinality rows(item,ord)join public.certification_submissions s on s.id=(item->>'id')::uuid left join public.live_participation_missions m on m.certification_mission_id=s.mission_id $$;
revoke all on function public.get_admin_certification_queue_before_live(uuid,uuid,public.certification_submission_status),public.get_admin_certification_queue(uuid,uuid,public.certification_submission_status)from public,anon,authenticated,service_role;
grant execute on function public.get_admin_certification_queue(uuid,uuid,public.certification_submission_status)to service_role;
create function public.admin_select_live_participation(p_actor uuid,p_allowlist uuid,p_correlation uuid,p_submission_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$declare s public.certification_submissions%rowtype;m uuid;result jsonb;begin
 perform public.assert_certification_admin(p_actor,p_allowlist);
 select * into s from public.certification_submissions where id=p_submission_id and status='approved'for update;
 if not found then raise exception 'LIVE_PARTICIPATION_SELECTION_INVALID';end if;
 select bonus.id into m from public.live_participation_missions own join public.live_participation_missions bonus on bonus.live_event_id=own.live_event_id and bonus.mission_key='bonus'and bonus.enabled and bonus.public and clock_timestamp()>=bonus.opens_at and clock_timestamp()<bonus.closes_at join public.live_events event on event.id=bonus.live_event_id and event.ends_at<=clock_timestamp()where own.certification_mission_id=s.mission_id and exists(select 1 from public.live_participation_receipts where source_id=s.id and app_user_id=s.app_user_id and mission_key<>'bonus');
 if m is null then raise exception 'LIVE_PARTICIPATION_SELECTION_INVALID';end if;
 result:=public.live_participation_award(s.app_user_id,m,s.id);
 perform public.fan_web_participation_audit(p_actor,p_allowlist,p_correlation,'select','live_participation',s.id,null,result);return result;end $$;
alter function public.read_owned_mobile_fan_support_reward(uuid,uuid,bigint,text)rename to read_owned_mobile_fan_support_reward_before_live;
create function public.read_owned_mobile_fan_support_reward(p_app_user_id uuid,p_source_id uuid,p_after_sequence bigint,p_celebrity_slug text)returns jsonb language plpgsql security definer set search_path='' as $$declare r public.live_participation_receipts%rowtype;creator uuid;seq bigint;reward jsonb;begin
 creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);
 select * into r from public.live_participation_receipts where app_user_id=p_app_user_id and source_id=p_source_id and mission_key<>'bonus'limit 1;
 if not found then return public.read_owned_mobile_fan_support_reward_before_live(p_app_user_id,p_source_id,p_after_sequence,p_celebrity_slug);end if;
 if not exists(select 1 from public.live_events where id=r.live_event_id and celebrity_id=creator)or p_after_sequence is null or p_after_sequence not between 0 and 9007199254740991 then raise exception 'FAN_ECONOMY_INVALID';end if;
 select owner_sequence into seq from public.mobile_fan_economy_ledger where id=r.point_ledger_id;
 reward:=public.read_owned_mobile_fan_reward(p_app_user_id,p_source_id);return jsonb_build_object('reward',reward,'ledgerSequence',seq,'newlyAwarded',coalesce(seq>p_after_sequence and r.awarded_points>0,false));end $$;
revoke all on function public.read_owned_mobile_fan_support_reward_before_live(uuid,uuid,bigint,text),public.read_owned_mobile_fan_support_reward(uuid,uuid,bigint,text)from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_fan_support_reward(uuid,uuid,bigint,text)to service_role;
do $$declare f record;definition text;begin
 for f in select * from(values
 ('get_public_certifications','public.mobile_fan_source_uses_points(c.id,clock_timestamp())','exists(select 1 from public.live_participation_missions m where m.certification_mission_id=(item->>''id'')::uuid)'),
 ('get_public_certification','public.mobile_fan_source_uses_points(m.celebrity_id,clock_timestamp())','exists(select 1 from public.live_participation_missions lm where lm.certification_mission_id=p_id)'),
 ('get_owned_certification_submission','public.mobile_fan_source_uses_points(x.celebrity_id,clock_timestamp())','exists(select 1 from public.live_participation_missions lm where lm.certification_mission_id=x.mission_id)')
 )as gates(name,old_gate,new_gate)loop
 select pg_get_functiondef(p.oid)into strict definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname=f.name;
 if position(f.old_gate in definition)>0 then execute replace(definition,f.old_gate,'('||f.old_gate||' or '||f.new_gate||')');end if;
 end loop;end $$;
-- Member summaries and private submissions cannot be selected through a client key.
do $$declare t text;f record;begin
 foreach t in array array['live_participation_missions','live_participation_receipts','live_participation_requests','live_participation_entries']loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 if t<>'live_participation_missions'then execute format('create trigger %I before update or delete on public.%I for each row execute function public.reject_fan_ticket_ledger_mutation()',t||'_immutable',t);execute format('create trigger %I before truncate on public.%I for each statement execute function public.reject_fan_ticket_ledger_mutation()',t||'_no_truncate',t);end if;
 end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and(p.proname like'live_participation_%'or p.proname in('submit_owned_live_participation','read_live_participation','read_owned_participation_summary','read_public_live_dashboard','admin_save_live_participation','admin_select_live_participation','admin_read_live_participation','get_owned_live_participation_upload_target','award_mobile_fan_activity_before_live_participation','award_mobile_fan_activity'))loop
 execute 'revoke all on function '||f.signature||' from public,anon,authenticated,service_role';
 if f.proname in('submit_owned_live_participation','read_live_participation','read_owned_participation_summary','read_public_live_dashboard','admin_save_live_participation','admin_select_live_participation','admin_read_live_participation','get_owned_live_participation_upload_target')then execute 'grant execute on function '||f.signature||' to service_role';end if;
 end loop;end $$;
commit;

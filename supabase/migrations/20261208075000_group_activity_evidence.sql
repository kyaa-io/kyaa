begin;
-- Activity proof uses the validated image pipeline, with a separate durable,
-- private target; changing a current submission never deletes its prior proof.
create table public.group_activity_evidence(
 id uuid primary key default extensions.gen_random_uuid(),
 target_type text not null check(target_type in('mission_submission','event_review')),
 target_id uuid not null,page_id uuid not null references public.group_pages(id),
 owner_id uuid not null references public.app_users(id),
 asset_id uuid not null unique references public.mobile_media_assets(id),
 created_at timestamptz not null default clock_timestamp()
);
-- Preserve current application_evidence and gift_application CHECK branches.
do $$declare c record;begin
 select oid,conname,pg_get_expr(conbin,conrelid)body into c from pg_constraint where conrelid='public.group_image_references'::regclass and contype='c'and pg_get_constraintdef(oid)like '%target_type%';
 if c.oid is null then raise exception 'GROUP_ACTIVITY_MEDIA_CONTRACT_CHANGED';end if;
 execute format('alter table public.group_image_references drop constraint %I',c.conname);
 execute format('alter table public.group_image_references add constraint %I check((%s)or target_type=''activity_evidence'')',c.conname,c.body);
end $$;
alter table public.group_missions add column submission_kind text not null default 'text'check(submission_kind in('text','photo','survey')),
 add column survey_question text check(survey_question is null or length(btrim(survey_question))between 1 and 500),add column survey_options jsonb;
alter table public.group_missions add constraint group_mission_survey_config check(submission_kind<>'survey'or(survey_question is not null and jsonb_typeof(survey_options)='array'and jsonb_array_length(survey_options)=3));
alter table public.group_mission_submissions
 add column current_revision integer not null default 1 check(current_revision>0),
 add column evidence_id uuid references public.group_activity_evidence(id) deferrable initially deferred,
 add column original_attested boolean not null default false,add column submission_kind text not null default 'text',add column survey_response jsonb;
alter table public.group_mission_submissions drop constraint group_mission_submissions_body_check;
alter table public.group_mission_submissions add constraint group_mission_submissions_body_check check((submission_kind='survey'and length(body)<=10000)or(submission_kind<>'survey'and length(btrim(body))between 1 and 10000));
alter table public.group_event_registrations
 add column review_title text check(review_title is null or length(btrim(review_title))between 1 and 200),
 add column review_revision integer not null default 0 check(review_revision>=0),
 add column review_evidence_id uuid references public.group_activity_evidence(id) deferrable initially deferred;
update public.group_event_registrations set review_revision=1 where review_body is not null;
create table public.group_mission_submission_revisions(
 submission_id uuid not null references public.group_mission_submissions(id)on delete cascade,
 revision integer not null check(revision>0),body text not null check(length(body)<=10000),
 evidence_id uuid references public.group_activity_evidence(id) deferrable initially deferred,
 original_attested boolean not null,submission_kind text not null default 'text',survey_response jsonb,created_at timestamptz not null default clock_timestamp(),primary key(submission_id,revision)
);
create table public.group_mission_submission_reviews(
 submission_id uuid not null,revision integer not null,
 action text not null check(action in('approve','reject')),reason text,
 reviewer_id uuid references public.app_users(id),request_id uuid,
 created_at timestamptz not null default clock_timestamp(),primary key(submission_id,revision),
 foreign key(submission_id,revision)references public.group_mission_submission_revisions(submission_id,revision)on delete cascade
);
create table public.group_event_review_revisions(
 registration_id uuid not null references public.group_event_registrations(id)on delete cascade,
 revision integer not null check(revision>0),title text check(title is null or length(btrim(title))between 1 and 200),
 body text not null check(length(btrim(body))between 1 and 5000),
 evidence_id uuid references public.group_activity_evidence(id) deferrable initially deferred,
 request_id uuid,created_at timestamptz not null default clock_timestamp(),primary key(registration_id,revision)
);
insert into public.group_mission_submission_revisions(submission_id,revision,body,original_attested,created_at)
 select id,current_revision,body,original_attested,created_at from public.group_mission_submissions;
insert into public.group_mission_submission_reviews(submission_id,revision,action,reason,reviewer_id,created_at)
 select id,current_revision,case when status='completed'then'approve'else'reject'end,reason,reviewed_by,coalesce(reviewed_at,created_at)
 from public.group_mission_submissions where status in('rejected','completed');
insert into public.group_event_review_revisions(registration_id,revision,title,body,created_at)
 select id,review_revision,review_title,review_body,coalesce(reviewed_at,created_at)from public.group_event_registrations where review_body is not null;

create function public.group_activity_evidence_json(p_evidence uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select coalesce((select jsonb_build_object('imageAssetId',asset_id,'imageUrl','/api/groups/images/'||asset_id::text)from public.group_activity_evidence where id=p_evidence),'{"imageAssetId":null,"imageUrl":null}'::jsonb)
$$;
create function public.group_attach_activity_evidence(p_actor uuid,p_kind text,p_target uuid,p_asset uuid)returns uuid language plpgsql security definer set search_path=''as $$
declare a public.mobile_media_assets;e public.group_activity_evidence;page uuid;owner_id uuid;new_id uuid:=extensions.gen_random_uuid();
begin
 perform public.fan_web_lock_active_user(p_actor);
 if p_asset is null then return null;end if;
 if p_kind='mission_submission'then
  select m.page_id,s.app_user_id into page,owner_id from public.group_mission_submissions s join public.group_missions m on m.id=s.mission_id where s.id=p_target;
 elsif p_kind='event_review'then
  select event_row.page_id,r.app_user_id into page,owner_id from public.group_event_registrations r join public.group_events event_row on event_row.id=r.event_id where r.id=p_target;
 else raise exception 'GROUP_ACTIVITY_INVALID';end if;
 if page is null or owner_id is distinct from p_actor then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
 select *into a from public.mobile_media_assets where id=p_asset for update;
 if not found or a.app_user_id<>p_actor or a.kind<>'image'or a.purpose<>'group_image'or a.state<>'ready'or a.storage_deleted_at is not null or a.cleanup_requested_at is not null then raise exception 'GROUP_ACTIVITY_INVALID';end if;
 select *into e from public.group_activity_evidence where asset_id=p_asset;
 if found then
  if e.target_type<>p_kind or e.target_id<>p_target or e.page_id<>page or e.owner_id<>p_actor or a.attached_type is distinct from'group_image'or a.attached_id is distinct from e.id or not exists(select 1 from public.group_image_references where target_type='activity_evidence'and target_id=e.id and asset_id=p_asset)then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  return e.id;
 end if;
 if a.attached_id is not null or exists(select 1 from public.group_image_references where asset_id=p_asset)then raise exception 'GROUP_ACTIVITY_INVALID';end if;
 insert into public.group_activity_evidence(id,target_type,target_id,page_id,owner_id,asset_id)values(new_id,p_kind,p_target,page,p_actor,p_asset);
 insert into public.group_image_references(target_type,target_id,asset_id)values('activity_evidence',new_id,p_asset);
 update public.mobile_media_assets set attached_type='group_image',attached_id=new_id,attached_version=1,access_scope='group_image',position=0,updated_at=clock_timestamp()where id=p_asset;
 return new_id;
end $$;

create function public.group_activity_history_immutable()returns trigger language plpgsql set search_path=''as $$
declare present boolean;
begin
 if tg_op='DELETE'then
  if tg_table_name='group_event_review_revisions'then select exists(select 1 from public.group_event_registrations where id=old.registration_id)into present;
  elsif tg_table_name='group_activity_evidence'then
   if old.target_type='mission_submission'then select exists(select 1 from public.group_mission_submissions where id=old.target_id)into present;
   else select exists(select 1 from public.group_event_registrations where id=old.target_id)into present;end if;
  else select exists(select 1 from public.group_mission_submissions where id=old.submission_id)into present;end if;
  if not present then return old;end if;
 end if;
 raise exception 'GROUP_ACTIVITY_CONFLICT';
end $$;
do $$declare t text;begin foreach t in array array['group_activity_evidence','group_mission_submission_revisions','group_mission_submission_reviews','group_event_review_revisions']loop
 execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
 execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger group_activity_history_immutable before update or delete on public.%I for each row execute function public.group_activity_history_immutable()',t);
end loop;end $$;
create function public.group_release_deleted_activity_evidence()returns trigger language plpgsql security definer set search_path=''as $$
declare kind text:=case tg_table_name when'group_mission_submissions'then'mission_submission'else'event_review'end;proof public.group_activity_evidence;
begin
 for proof in select *from public.group_activity_evidence where target_type=kind and target_id=old.id loop
  delete from public.group_image_references where target_type='activity_evidence'and target_id=proof.id;
  update public.mobile_media_assets set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=clock_timestamp(),cleanup_retry_at=greatest(clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval'5 minutes'),updated_at=clock_timestamp()where id=proof.asset_id and attached_type='group_image'and attached_id=proof.id;
  delete from public.group_activity_evidence where id=proof.id;
 end loop;
 return old;
end $$;
create trigger group_release_deleted_activity_evidence after delete on public.group_mission_submissions for each row execute function public.group_release_deleted_activity_evidence();
create trigger group_release_deleted_activity_evidence after delete on public.group_event_registrations for each row execute function public.group_release_deleted_activity_evidence();
-- Keep all current gift/qualification ACL paths, and keep the public function OID.
do $$declare definition text;begin
 if to_regprocedure('public.authorize_group_image_read_before_activity_evidence(uuid,uuid,text)')is not null then raise exception 'GROUP_ACTIVITY_MEDIA_WRAPPER_EXISTS';end if;
 if not exists(select 1 from pg_proc where oid='public.authorize_group_image_read(uuid,uuid,text)'::regprocedure and prosecdef and proconfig @>array['search_path=""'])then raise exception 'GROUP_ACTIVITY_MEDIA_CONTRACT_CHANGED';end if;
 definition:=pg_get_functiondef('public.authorize_group_image_read(uuid,uuid,text)'::regprocedure);execute replace(definition,'FUNCTION public.authorize_group_image_read(','FUNCTION public.authorize_group_image_read_before_activity_evidence(');
end $$;
create or replace function public.authorize_group_image_read(p_app_user_id uuid,p_asset_id uuid,p_variant text)returns jsonb language plpgsql security definer set search_path=''as $$
declare proof public.group_activity_evidence;a public.mobile_media_assets;allowed boolean;admin uuid;
begin
 select e.*into proof from public.group_activity_evidence e join public.group_image_references r on r.target_type='activity_evidence'and r.target_id=e.id and r.asset_id=e.asset_id where e.asset_id=p_asset_id;
 if not found then return public.authorize_group_image_read_before_activity_evidence(p_app_user_id,p_asset_id,p_variant);end if;
 if p_variant not in('original','thumbnail')then raise exception 'MEDIA_INVALID_INPUT';end if;
 if p_app_user_id is null then return null;end if;
 perform public.fan_web_lock_active_user(p_app_user_id);
 select *into a from public.mobile_media_assets where id=p_asset_id and purpose='group_image'and kind='image'and state='ready'and storage_deleted_at is null;
 if not found then return null;end if;
 allowed:=proof.owner_id=p_app_user_id or exists(select 1 from public.group_memberships where page_id=proof.page_id and app_user_id=p_app_user_id and role in('owner','manager'));
 if not allowed then
  select aa.id into admin from public.admin_allowlist aa join public.app_users u on u.verified_email=aa.email and u.status='active'where u.id=p_app_user_id and aa.active limit 1;
  allowed:=admin is not null;
  if allowed then insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_app_user_id,admin,'groups.activity.evidence.read','group_activity_evidence',proof.id::text,extensions.gen_random_uuid(),jsonb_build_object('assetId',a.id));end if;
 end if;
 if not coalesce(allowed,false)then return null;end if;
 return jsonb_build_object('storagePath',case when p_variant='thumbnail'then a.thumbnail_path else a.storage_path end,'contentType',case when p_variant='thumbnail'then'image/webp'else a.content_type end);
end $$;
create function public.group_activity_submission_json(p_id uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('id',s.id,'body',s.body,'status',s.status,'reason',s.reason,'rewardPoints',s.reward_points,'currentRevision',s.current_revision,'originalAttested',s.original_attested,'submissionKind',s.submission_kind,'surveyResponse',s.survey_response,'history',coalesce((select jsonb_agg(jsonb_build_object('revision',v.revision,'body',v.body,'originalAttested',v.original_attested,'submissionKind',v.submission_kind,'surveyResponse',v.survey_response,'status',case when review.action='approve'then'completed'when review.action='reject'then'rejected'else'pending'end,'reason',review.reason,'createdAt',v.created_at)||public.group_activity_evidence_json(v.evidence_id)order by v.revision desc)from public.group_mission_submission_revisions v left join public.group_mission_submission_reviews review on review.submission_id=v.submission_id and review.revision=v.revision where v.submission_id=s.id),'[]'::jsonb))||public.group_activity_evidence_json(s.evidence_id)from public.group_mission_submissions s where s.id=p_id
$$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.group_mission_json(uuid,uuid)'::regprocedure);
 if to_regprocedure('public.group_mission_json_before_activity_evidence(uuid,uuid)')is not null then raise exception 'GROUP_ACTIVITY_MISSION_WRAPPER_EXISTS';end if;
 execute replace(definition,'FUNCTION public.group_mission_json(','FUNCTION public.group_mission_json_before_activity_evidence(');
end $$;
create or replace function public.group_mission_json(p_id uuid,p_actor uuid default null)returns jsonb language sql stable security definer set search_path=''as $$
 select public.group_mission_json_before_activity_evidence(p_id,p_actor)||jsonb_build_object('submissionKind',submission_kind,'surveyQuestion',survey_question,'surveyOptions',survey_options)from public.group_missions where id=p_id
$$;

-- Patch only the original receipt-bearing branches; preserve QR/operations/image wrappers.
do $migration$declare f record;body text;old text;next text;begin
 select p.oid,p.prosrc into f from pg_proc p where p.oid='public.group_activities_dispatch_before_operations(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure;body:=f.prosrc;
 old:=$old$ when 'mission'then
  select *into s from public.group_mission_submissions where mission_id=m.id and app_user_id=p_actor;
  result:=jsonb_build_object('mission',public.group_mission_json(m.id,p_actor),'submission',case when s.id is null then null else jsonb_build_object('id',s.id,'body',s.body,'status',s.status,'reason',s.reason,'rewardPoints',s.reward_points)end,'canSubmit',role is not null and m.state='published'and coalesce(s.status,'none')in('none','rejected'),'canReview',manager);
$old$;next:=$new$ when 'mission'then
  select *into s from public.group_mission_submissions where mission_id=m.id and app_user_id=p_actor;
  result:=jsonb_build_object('mission',public.group_mission_json(m.id,p_actor),'submission',case when s.id is null then null else public.group_activity_submission_json(s.id)end,'canSubmit',role is not null and m.state='published'and coalesce(s.status,'none')in('none','rejected'),'canReview',manager);
$new$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_ACTIVITY_BRANCH_CHANGED: mission';end if;body:=replace(body,old,next);
 old:=$old$ when 'mission-submissions'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  result:=jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'appUserId',app_user_id,'nickname',coalesce(nullif(btrim((select nickname from public.user_profiles where app_user_id=x.app_user_id)),''),'회원'),'avatarUrl',public.public_fan_avatar_url(app_user_id),'body',body,'status',status,'reason',reason,'rewardPoints',reward_points)order by created_at,id)from(select *from public.group_mission_submissions where mission_id=m.id and((p_input->>'cursor')is null or id>(p_input->>'cursor')::uuid)order by id limit page_limit)x),'[]'));
$old$;next:=$new$ when 'mission-submissions'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  result:=jsonb_build_object('items',coalesce((select jsonb_agg(public.group_activity_submission_json(x.id)||jsonb_build_object('appUserId',app_user_id,'nickname',coalesce(nullif(btrim((select nickname from public.user_profiles where app_user_id=x.app_user_id)),''),'회원'),'avatarUrl',public.public_fan_avatar_url(app_user_id),'body',body,'status',status,'reason',reason,'rewardPoints',reward_points)order by created_at,id)from(select *from public.group_mission_submissions where mission_id=m.id and((p_input->>'cursor')is null or id>(p_input->>'cursor')::uuid)order by id limit page_limit)x),'[]'));
$new$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_ACTIVITY_BRANCH_CHANGED: mission-submissions';end if;body:=replace(body,old,next);
 old:=$old$ when 'event'then
  select *into r from public.group_event_registrations where event_id=e.id and app_user_id=p_actor;
  result:=jsonb_build_object('event',public.group_event_json(e.id,p_actor),'participation',jsonb_build_object('status',coalesce(r.status,'none'),'ticketId',case when r.status='confirmed'then r.id end,'checkedInAt',r.checked_in_at),'canApply',role is not null and e.state='published'and clock_timestamp()>=e.opens_at and clock_timestamp()<e.closes_at and coalesce(r.status,'none')in('none','cancelled','rejected'),'canReview',role is not null and r.checked_in_at is not null and clock_timestamp()>=e.ends_at,'canManage',manager);
$old$;next:=$new$ when 'event'then
  select *into r from public.group_event_registrations where event_id=e.id and app_user_id=p_actor;
  result:=jsonb_build_object('event',public.group_event_json(e.id,p_actor),'participation',jsonb_build_object('status',coalesce(r.status,'none'),'ticketId',case when r.status='confirmed'then r.id end,'checkedInAt',r.checked_in_at),'canApply',role is not null and e.state='published'and clock_timestamp()>=e.opens_at and clock_timestamp()<e.closes_at and coalesce(r.status,'none')in('none','cancelled','rejected'),'canReview',role is not null and r.checked_in_at is not null and clock_timestamp()>=e.ends_at,'canManage',manager,'review',case when r.review_body is null then null else jsonb_build_object('title',r.review_title,'body',r.review_body,'currentRevision',r.review_revision)||public.group_activity_evidence_json(r.review_evidence_id)end);
$new$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_ACTIVITY_BRANCH_CHANGED: event';end if;body:=replace(body,old,next);
 old:=$old$ when 'event-review-write'then
  select *into r from public.group_event_registrations where event_id=e.id and app_user_id=p_actor and status='confirmed'for update;
  if role is null or not found or r.checked_in_at is null or clock_timestamp()<e.ends_at or e.state='cancelled'then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  update public.group_event_registrations set review_body=p_input->>'body',reviewed_at=clock_timestamp()where id=r.id;result:=jsonb_build_object('status','saved','eventId',e.id);
$old$;next:=$new$ when 'event-review-write'then
  select *into r from public.group_event_registrations where event_id=e.id and app_user_id=p_actor and status='confirmed'for update;
  if role is null or not found or r.checked_in_at is null or clock_timestamp()<e.ends_at or e.state='cancelled'then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if(r.review_revision>0 or p_input?'expectedReviewRevision')and(p_input->>'expectedReviewRevision')::integer is distinct from r.review_revision then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  if length(btrim(coalesce(p_input->>'body','')))not between 1 and 5000 or(p_input?'title'and length(btrim(p_input->>'title'))not between 1 and 200)then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  update public.group_event_registrations set review_title=case when p_input?'title'then btrim(p_input->>'title')else review_title end,review_body=p_input->>'body',review_revision=review_revision+1,reviewed_at=clock_timestamp()where id=r.id returning *into r;
  if p_input?'imageAssetId'then update public.group_event_registrations set review_evidence_id=public.group_attach_activity_evidence(p_actor,'event_review',r.id,(p_input->>'imageAssetId')::uuid)where id=r.id returning *into r;end if;
  insert into public.group_event_review_revisions(registration_id,revision,title,body,evidence_id,request_id)values(r.id,r.review_revision,r.review_title,r.review_body,r.review_evidence_id,req);
  result:=jsonb_build_object('status','saved','eventId',e.id,'currentRevision',r.review_revision,'review',jsonb_build_object('title',r.review_title,'body',r.review_body,'currentRevision',r.review_revision)||public.group_activity_evidence_json(r.review_evidence_id));
$new$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_ACTIVITY_BRANCH_CHANGED: event-review-write';end if;body:=replace(body,old,next);
 old:=$old$ when 'mission-save'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if p_item_id is null then insert into public.group_missions(page_id,title,instructions,image_url,state)values(g.id,p_input->>'title',p_input->>'instructions',p_input->>'imageUrl',p_input->>'state')returning *into m;
  else update public.group_missions set title=p_input->>'title',instructions=p_input->>'instructions',image_url=p_input->>'imageUrl',state=p_input->>'state',revision=revision+1 where id=m.id and revision=(p_input->>'expectedRevision')::integer returning *into m;if not found then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;end if;result:=jsonb_build_object('mission',public.group_mission_json(m.id,p_actor));
$old$;next:=$new$ when 'mission-save'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if p_item_id is null then insert into public.group_missions(page_id,title,instructions,image_url,state)values(g.id,p_input->>'title',p_input->>'instructions',p_input->>'imageUrl',p_input->>'state')returning *into m;
  else update public.group_missions set title=p_input->>'title',instructions=p_input->>'instructions',image_url=p_input->>'imageUrl',state=p_input->>'state',revision=revision+1 where id=m.id and revision=(p_input->>'expectedRevision')::integer returning *into m;if not found then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;end if;
  if p_input?'submissionKind'then
   if p_input->>'submissionKind'not in('text','photo','survey')then raise exception 'GROUP_ACTIVITY_INVALID';end if;
   if p_input->>'submissionKind'='survey'and(length(btrim(coalesce(p_input->>'surveyQuestion','')))not between 1 and 500 or jsonb_typeof(p_input->'surveyOptions')is distinct from'array'or jsonb_array_length(p_input->'surveyOptions')<>3 or exists(select 1 from jsonb_array_elements(p_input->'surveyOptions')x where jsonb_typeof(x)<>'string'or length(btrim(x#>>'{}'))not between 1 and 200)or(select count(distinct x)from jsonb_array_elements(p_input->'surveyOptions')x)<>3)then raise exception 'GROUP_ACTIVITY_INVALID';end if;
   update public.group_missions set submission_kind=p_input->>'submissionKind',survey_question=case when p_input->>'submissionKind'='survey'then p_input->>'surveyQuestion'end,survey_options=case when p_input->>'submissionKind'='survey'then p_input->'surveyOptions'end where id=m.id returning *into m;
  end if;
  result:=jsonb_build_object('mission',public.group_mission_json(m.id,p_actor));
$new$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_ACTIVITY_BRANCH_CHANGED: mission-save';end if;body:=replace(body,old,next);
 old:=$old$ when 'mission-submit'then
  if role is null then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if m.state<>'published'then raise exception 'GROUP_ACTIVITY_CLOSED';end if;
  select *into s from public.group_mission_submissions where mission_id=m.id and app_user_id=p_actor for update;
  if s.id is not null and s.status<>'rejected'then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  insert into public.group_mission_submissions(mission_id,app_user_id,body)values(m.id,p_actor,p_input->>'body')on conflict(mission_id,app_user_id)do update set body=excluded.body,status='pending',reason=null,reviewed_at=null,reviewed_by=null returning *into s;
  result:=jsonb_build_object('id',s.id,'status',s.status);
$old$;next:=$new$ when 'mission-submit'then
  if role is null then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if m.state<>'published'then raise exception 'GROUP_ACTIVITY_CLOSED';end if;
  select *into s from public.group_mission_submissions where mission_id=m.id and app_user_id=p_actor for update;
  if s.id is not null and(s.status<>'rejected'or(p_input->>'expectedSubmissionRevision')::integer is distinct from s.current_revision)then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  if m.submission_kind<>'text'and(p_input->>'expectedMissionRevision')::integer is distinct from m.revision then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  if(m.submission_kind<>'survey'and p_input?'surveyChoice')or(m.submission_kind<>'photo'and(p_input?'imageAssetId'or p_input?'originalAttested'))then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  if m.submission_kind='photo'and(p_input->>'imageAssetId'is null and s.evidence_id is null or not coalesce((p_input->>'originalAttested')::boolean,false))then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  if m.submission_kind='survey'then
   if(p_input->>'surveyChoice')::integer is null or(p_input->>'surveyChoice')::integer not between 0 and 2 then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  elsif length(btrim(coalesce(p_input->>'body','')))not between 1 and 10000 then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  insert into public.group_mission_submissions(mission_id,app_user_id,body,original_attested,submission_kind,survey_response)
  values(m.id,p_actor,coalesce(p_input->>'body',''),coalesce((p_input->>'originalAttested')::boolean,false),m.submission_kind,case when m.submission_kind='survey'then jsonb_build_object('submissionKind',m.submission_kind,'missionRevision',m.revision,'question',m.survey_question,'options',m.survey_options,'choiceIndex',(p_input->>'surveyChoice')::integer,'choiceLabel',m.survey_options->>((p_input->>'surveyChoice')::integer),'opinion',coalesce(p_input->>'body',''))end)
  on conflict(mission_id,app_user_id)do update set body=excluded.body,status='pending',reason=null,reviewed_at=null,reviewed_by=null,current_revision=public.group_mission_submissions.current_revision+1,original_attested=excluded.original_attested,submission_kind=excluded.submission_kind,survey_response=excluded.survey_response,evidence_id=case when excluded.submission_kind='photo'then public.group_mission_submissions.evidence_id else null end returning *into s;
  if p_input?'imageAssetId'then update public.group_mission_submissions set evidence_id=public.group_attach_activity_evidence(p_actor,'mission_submission',s.id,(p_input->>'imageAssetId')::uuid)where id=s.id returning *into s;end if;
  insert into public.group_mission_submission_revisions(submission_id,revision,body,evidence_id,original_attested,submission_kind,survey_response)values(s.id,s.current_revision,s.body,s.evidence_id,s.original_attested,s.submission_kind,s.survey_response);
  result:=public.group_activity_submission_json(s.id);
$new$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_ACTIVITY_BRANCH_CHANGED: mission-submit';end if;body:=replace(body,old,next);
 old:=$old$ when 'mission-review'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  select *into s from public.group_mission_submissions where id=p_sub_id and mission_id=m.id for update;
  if not found or s.status<>'pending'then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  if p_input->>'action'='reject'and length(btrim(coalesce(p_input->>'reason','')))=0 then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  if p_input->>'action'='approve'and m.reward_points>0 then
   select coalesce(sum(reward_points),0)into spent from public.group_mission_submissions where mission_id=m.id and status='completed';
   if spent+m.reward_points>m.reward_budget then raise exception 'GROUP_ACTIVITY_CAPACITY';end if;
   entry:=public.group_wallet_post(s.app_user_id,'fan_point',m.reward_points,'group_mission',s.id);
  end if;
  update public.group_mission_submissions set status=case when p_input->>'action'='approve'then'completed'else'rejected'end,reason=p_input->>'reason',reviewed_by=p_actor,reviewed_at=clock_timestamp(),reward_points=case when p_input->>'action'='approve'then m.reward_points else 0 end,reward_ledger_id=entry where id=s.id returning *into s;
  result:=jsonb_build_object('id',s.id,'status',s.status,'rewardPoints',s.reward_points);
$old$;next:=$new$ when 'mission-review'then
  if not manager then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if p_input->>'action'not in('approve','reject')then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  select *into s from public.group_mission_submissions where id=p_sub_id and mission_id=m.id for update;
  if not found or s.status<>'pending'or(p_input->>'expectedSubmissionRevision')::integer is distinct from s.current_revision then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  if p_input->>'action'='reject'and length(btrim(coalesce(p_input->>'reason','')))=0 then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  if p_input->>'action'='approve'and m.reward_points>0 then
   select coalesce(sum(reward_points),0)into spent from public.group_mission_submissions where mission_id=m.id and status='completed';
   if spent+m.reward_points>m.reward_budget then raise exception 'GROUP_ACTIVITY_CAPACITY';end if;
   entry:=public.group_wallet_post(s.app_user_id,'fan_point',m.reward_points,'group_mission',s.id);
  end if;
  update public.group_mission_submissions set status=case when p_input->>'action'='approve'then'completed'else'rejected'end,reason=p_input->>'reason',reviewed_by=p_actor,reviewed_at=clock_timestamp(),reward_points=case when p_input->>'action'='approve'then m.reward_points else 0 end,reward_ledger_id=entry where id=s.id returning *into s;
  insert into public.group_mission_submission_reviews(submission_id,revision,action,reason,reviewer_id,request_id)values(s.id,s.current_revision,p_input->>'action',p_input->>'reason',p_actor,req);
  result:=public.group_activity_submission_json(s.id);
$new$;
 if position(old in body)=0 or(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_ACTIVITY_BRANCH_CHANGED: mission-review';end if;body:=replace(body,old,next);
 execute replace(pg_get_functiondef(f.oid),f.prosrc,body);
end $migration$;
do $$declare t text;begin foreach t in array array['group_activity_evidence','group_mission_submission_revisions','group_mission_submission_reviews','group_event_review_revisions']loop execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);end loop;end $$;
revoke all on function public.group_activity_evidence_json(uuid),public.group_attach_activity_evidence(uuid,text,uuid,uuid),public.group_activity_history_immutable(),public.group_release_deleted_activity_evidence(),public.authorize_group_image_read_before_activity_evidence(uuid,uuid,text),public.group_mission_json_before_activity_evidence(uuid,uuid),public.group_activity_submission_json(uuid)from public,anon,authenticated,service_role;
commit;

begin;
alter table public.group_official_event_applications drop constraint group_official_event_applications_status_check;
alter table public.group_official_event_applications add constraint group_official_event_applications_status_check check(status in('submitted','reviewing','changes_requested','approved','rejected'));
alter table public.group_official_event_applications add column previous_application_id uuid unique references public.group_official_event_applications(id);
create table public.group_event_checkin_audit(
 id uuid primary key default extensions.gen_random_uuid(),registration_id uuid not null references public.group_event_registrations(id),actor_id uuid not null references public.app_users(id),request_id uuid not null,
 method text not null check(method in('qr','manual')),reason text,already_checked_in boolean not null,created_at timestamptz not null default clock_timestamp(),unique(actor_id,request_id),check(method<>'manual'or length(btrim(reason))between 1 and 500)
);
create trigger group_event_checkin_audit_immutable before update or delete on public.group_event_checkin_audit for each row execute function public.reject_fan_ticket_ledger_mutation();
create table public.group_event_support_submissions(
 id uuid primary key default extensions.gen_random_uuid(),event_id uuid not null references public.group_events(id),applicant_id uuid not null references public.app_users(id),revision integer not null check(revision>0),description text not null check(length(btrim(description))between 1 and 10000),source_url text not null check(source_url~'^https://'),
 previous_submission_id uuid unique references public.group_event_support_submissions(id),status text not null default'submitted'check(status in('submitted','changes_requested','approved')),reason text,reviewed_by uuid references public.admin_allowlist(id),created_at timestamptz not null default clock_timestamp(),reviewed_at timestamptz,unique(event_id,revision)
);
create function public.group_event_submission_source_immutable()returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE'or (to_jsonb(new)-array['status','reason','reviewed_by','reviewed_at'])is distinct from(to_jsonb(old)-array['status','reason','reviewed_by','reviewed_at'])then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;return new;
end $$;
create trigger group_event_support_source_immutable before update or delete on public.group_event_support_submissions for each row execute function public.group_event_submission_source_immutable();
create table public.group_event_support_reviews(id uuid primary key default extensions.gen_random_uuid(),submission_id uuid not null unique references public.group_event_support_submissions(id),reviewer_id uuid not null references public.admin_allowlist(id),action text not null check(action in('approve','request_changes')),reason text,created_at timestamptz not null default clock_timestamp());
create trigger group_event_support_reviews_immutable before update or delete on public.group_event_support_reviews for each row execute function public.reject_fan_ticket_ledger_mutation();
-- Record first scan versus a distinct scan request; original request replay retains its original result.
do $patch$declare source text;begin
 source:=pg_get_functiondef('public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 if position('qr_parts text[];begin' in source)=0 then raise exception 'Expected activity scan declaration missing';end if;
 source:=replace(source,'qr_parts text[];begin','qr_parts text[];already_checked boolean;begin');
 source:=replace(source,'return prior.response;','return case when p_operation=''event-check-in''then prior.response||jsonb_build_object(''replayed'',true)else prior.response end;');
 source:=replace(source,'if r.checked_in_at is null then update public.group_event_registrations set checked_in_at=clock_timestamp(),checked_in_by=p_actor','already_checked:=r.checked_in_at is not null; if r.checked_in_at is null then update public.group_event_registrations set checked_in_at=clock_timestamp(),checked_in_by=p_actor');
 source:=replace(source,'''registrationId'',r.id,''checkedInAt'',r.checked_in_at);','''registrationId'',r.id,''checkedInAt'',r.checked_in_at,''alreadyCheckedIn'',already_checked,''replayed'',false);');
 source:=replace(source,'exists(select 1 from public.group_memberships where page_id=g.id and app_user_id=r.app_user_id)','exists(select 1 from public.group_memberships membership join public.app_users account on account.id=membership.app_user_id and account.status=''active''where membership.page_id=g.id and membership.app_user_id=r.app_user_id)');
 source:=replace(source,'a.status<>''submitted''or a.event_revision','a.status not in(''submitted'',''reviewing'')or a.event_revision');
 source:=replace(source,'p_input->>''action''<>''approve''and length','p_input->>''action''not in(''approve'',''start_review'')and length');
 source:=replace(source,'status=case p_input->>''action''when''approve''then''approved''','status=case p_input->>''action''when''start_review''then''reviewing''when''approve''then''approved''');
 execute source;
end $patch$;
alter function public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)rename to group_activities_dispatch_before_operations;
create function public.group_event_support_json(p_id uuid)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'eventId',s.event_id,'revision',s.revision,'description',s.description,'sourceUrl',s.source_url,'status',s.status,'reason',s.reason,'createdAt',s.created_at,'reviewedAt',s.reviewed_at,'previousSubmissionId',s.previous_submission_id)from public.group_event_support_submissions s where s.id=p_id
$$;
create function public.group_activities_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_sub_id uuid default null,p_input jsonb default'{}',p_admin_id uuid default null)returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;detail jsonb;prior public.group_activity_receipts;payload jsonb;req uuid;reg public.group_event_registrations;e public.group_events;official public.group_official_event_applications;support public.group_event_support_submissions;previous uuid;new_id uuid;already boolean;lim integer:=coalesce((p_input->>'limit')::integer,30);cursor uuid:=(p_input->>'cursor')::uuid;ids uuid[];search text:=btrim(coalesce(p_input->>'search',''));begin
 if p_page_id is not null and not public.group_scope_visible(p_actor,p_page_id)then raise exception 'GROUP_ACTIVITY_NOT_FOUND';end if;
 if p_operation not in('event-participants','event-manual-check-in','official-applications','official-submit','event-support','event-support-submit','admin-event-support','event-support-review')then
  result:=public.group_activities_dispatch_before_operations(p_operation,p_actor,p_page_id,p_item_id,p_sub_id,p_input,p_admin_id);
  if p_operation='event-check-in'and not coalesce((result->>'replayed')::boolean,false)then insert into public.group_event_checkin_audit(registration_id,actor_id,request_id,method,already_checked_in)values((result->>'registrationId')::uuid,p_actor,(p_input->>'requestId')::uuid,'qr',(result->>'alreadyCheckedIn')::boolean)on conflict(actor_id,request_id)do nothing;end if;
  return result;
 end if;
 if p_actor is null then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
 perform public.fan_web_lock_active_user(p_actor);
 if lim not between 1 and 100 or length(search)>100 then raise exception 'GROUP_ACTIVITY_INVALID';end if;
 if p_operation='admin-event-support'then
  perform public.assert_active_admin(p_actor,p_admin_id,false);
  select array_agg(id order by id)into ids from(select id from public.group_event_support_submissions where(cursor is null or id>cursor)order by id limit lim+1)x;
  return jsonb_build_object('items',coalesce((select jsonb_agg(public.group_event_support_json(s.id)||jsonb_build_object('pageId',event_row.page_id,'pageName',g.name,'eventTitle',event_row.title,'attendanceCount',(select count(*)from public.group_event_registrations r where r.event_id=event_row.id and r.checked_in_at is not null),'reviewCount',(select count(*)from public.group_event_registrations r where r.event_id=event_row.id and r.review_body is not null))order by s.id)from public.group_event_support_submissions s join public.group_events event_row on event_row.id=s.event_id join public.group_pages g on g.id=event_row.page_id where s.id=any(ids[1:lim])),'[]'::jsonb),'nextCursor',case when cardinality(ids)>lim then ids[lim]end);
 end if;
 if p_operation in('event-manual-check-in','official-submit','event-support-submit','event-support-review')then
  perform pg_advisory_xact_lock(hashtextextended('group-activity-page:'||p_page_id,0));
  req:=(p_input->>'requestId')::uuid;if req is null then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  payload:=jsonb_build_object('pageId',p_page_id,'itemId',p_item_id,'subId',p_sub_id,'input',p_input);
  select *into prior from public.group_activity_receipts where actor_id=p_actor and request_id=req;
  if found then if prior.operation<>p_operation or prior.payload<>payload then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;return prior.response||case when p_operation='event-manual-check-in'then'{"replayed":true}'::jsonb else'{}'::jsonb end;end if;
 end if;
 detail:=public.group_activities_dispatch_before_operations('event',p_actor,p_page_id,p_item_id,null,'{}',p_admin_id);
 if not coalesce((detail->>'canManage')::boolean,false)then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
 select *into e from public.group_events where id=p_item_id and page_id=p_page_id;
 case p_operation
 when 'event-participants'then
  select array_agg(id order by id)into ids from(select r.id from public.group_event_registrations r left join public.user_profiles u on u.app_user_id=r.app_user_id where r.event_id=e.id and(cursor is null or r.id>cursor)and position(lower(search)in lower(coalesce(nullif(btrim(u.nickname),''),'회원')))>0 order by r.id limit lim+1)x;
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'appUserId',r.app_user_id,'nickname',coalesce(nullif(btrim(u.nickname),''),'회원'),'avatarUrl',public.public_fan_avatar_url(r.app_user_id),'status',r.status,'checkedInAt',r.checked_in_at)order by r.id)from public.group_event_registrations r left join public.user_profiles u on u.app_user_id=r.app_user_id where r.id=any(ids[1:lim])),'[]'::jsonb),'nextCursor',case when cardinality(ids)>lim then ids[lim]end);
 when 'event-manual-check-in'then
  if e.state<>'published'or clock_timestamp()<e.starts_at or clock_timestamp()>=e.ends_at then raise exception 'GROUP_ACTIVITY_CLOSED';end if;
  select *into reg from public.group_event_registrations where id=p_sub_id and event_id=e.id and status='confirmed'for update;
  if not found or not exists(select 1 from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active'where m.page_id=p_page_id and m.app_user_id=reg.app_user_id)then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
  if btrim(coalesce(p_input->>'confirmedName',''))is distinct from coalesce((select nullif(btrim(nickname),'')from public.user_profiles where app_user_id=reg.app_user_id),'회원')or length(btrim(coalesce(p_input->>'reason','')))not between 1 and 500 then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  already:=reg.checked_in_at is not null;
  if not already then update public.group_event_registrations set checked_in_at=clock_timestamp(),checked_in_by=p_actor where id=reg.id returning *into reg;end if;
  insert into public.group_event_checkin_audit(registration_id,actor_id,request_id,method,reason,already_checked_in)values(reg.id,p_actor,req,'manual',p_input->>'reason',already);
  result:=jsonb_build_object('status','checked_in','registrationId',reg.id,'checkedInAt',reg.checked_in_at,'alreadyCheckedIn',already,'replayed',false);
 when 'official-applications'then
  select array_agg(id order by id)into ids from(select id from public.group_official_event_applications where event_id=e.id and(cursor is null or id>cursor)order by id limit lim+1)x;
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'eventId',a.event_id,'eventRevision',a.event_revision,'description',a.description,'sourceUrl',a.source_url,'status',a.status,'reason',a.reason,'createdAt',a.created_at,'reviewedAt',a.reviewed_at,'previousApplicationId',a.previous_application_id)order by a.id)from public.group_official_event_applications a where a.id=any(ids[1:lim])),'[]'::jsonb),'nextCursor',case when cardinality(ids)>lim then ids[lim]end);
 when 'official-submit'then
  previous:=(p_input->>'previousApplicationId')::uuid;
  select *into official from public.group_official_event_applications where event_id=e.id order by created_at desc,id desc limit 1;
  if found and(official.status in('submitted','reviewing')or official.status='changes_requested'and previous is distinct from official.id or official.status='approved'and official.event_revision=e.revision)then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  if previous is not null and not exists(select 1 from public.group_official_event_applications where id=previous and event_id=e.id and status='changes_requested')then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  result:=public.group_activities_dispatch_before_operations(p_operation,p_actor,p_page_id,p_item_id,p_sub_id,p_input,p_admin_id);
  update public.group_official_event_applications set previous_application_id=previous where id=(result->>'id')::uuid;return result;
 when 'event-support'then
  select array_agg(id order by id)into ids from(select id from public.group_event_support_submissions where event_id=e.id and(cursor is null or id>cursor)order by id limit lim+1)x;
  return jsonb_build_object('attendanceCount',(select count(*)from public.group_event_registrations where event_id=e.id and checked_in_at is not null),'reviewCount',(select count(*)from public.group_event_registrations where event_id=e.id and review_body is not null),'items',coalesce((select jsonb_agg(public.group_event_support_json(s.id)order by s.id)from public.group_event_support_submissions s where s.id=any(ids[1:lim])),'[]'::jsonb),'nextCursor',case when cardinality(ids)>lim then ids[lim]end);
 when 'event-support-submit'then
  previous:=(p_input->>'previousSubmissionId')::uuid;
  select *into support from public.group_event_support_submissions where event_id=e.id order by revision desc limit 1;
  if found and(support.status<>'changes_requested'or previous is distinct from support.id)then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  if previous is not null and not exists(select 1 from public.group_event_support_submissions where id=previous and event_id=e.id and status='changes_requested')then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  insert into public.group_event_support_submissions(event_id,applicant_id,revision,description,source_url,previous_submission_id)values(e.id,p_actor,coalesce(support.revision,0)+1,p_input->>'description',p_input->>'sourceUrl',previous)returning id into new_id;result:=public.group_event_support_json(new_id);
 when 'event-support-review'then
  perform public.assert_active_admin(p_actor,p_admin_id,true);
  select *into support from public.group_event_support_submissions where id=p_sub_id and event_id=e.id for update;
  if not found or support.status<>'submitted'then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  if p_input->>'action'not in('approve','request_changes')or(p_input->>'action'='request_changes'and length(btrim(coalesce(p_input->>'reason','')))=0)then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  update public.group_event_support_submissions set status=case when p_input->>'action'='approve'then'approved'else'changes_requested'end,reason=p_input->>'reason',reviewed_by=p_admin_id,reviewed_at=clock_timestamp()where id=support.id;
  insert into public.group_event_support_reviews(submission_id,reviewer_id,action,reason)values(support.id,p_admin_id,p_input->>'action',p_input->>'reason');result:=public.group_event_support_json(support.id);
 end case;
 insert into public.group_activity_receipts(actor_id,request_id,operation,payload,response)values(p_actor,req,p_operation,payload,result);
 return result;
end $$;
do $$declare t text;begin foreach t in array array['group_event_checkin_audit','group_event_support_submissions','group_event_support_reviews']loop execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);end loop;end $$;
revoke all on function public.group_event_submission_source_immutable(),public.group_event_support_json(uuid),public.group_activities_dispatch_before_operations(text,uuid,uuid,uuid,uuid,jsonb,uuid),public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)from public,anon,authenticated,service_role;
grant execute on function public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)to service_role;
commit;

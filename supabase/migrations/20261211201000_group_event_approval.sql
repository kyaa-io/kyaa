-- Group events open only after a platform admin approves them.
--
-- Existing events: events that were ever public (published, cancelled, ended) stay approved, so
-- nothing is blocked retroactively. Drafts were never public, so they wait for review like new
-- events. The default then moves to 'pending' for every row created afterwards.
--
-- Re-approval rule, enforced by group_event_approval_requeue on every update path:
-- an approved event returns to pending when its title, start/end time, location or linked
-- mission changes, when capacity grows or becomes unlimited, when participant review is
-- turned off, or when a cancelled/ended event goes back to draft or published. Description, image,
-- application window and a smaller capacity stay approved; a description or image change
-- leaves an 'edit' audit row with the previous value. Saving a rejected event as draft or
-- published sends it back to pending and clears the reason.
--
-- While an event is not approved: lists, details and images are hidden from members and
-- guests; apply, ticket, check-in, review and official/support submissions are refused; the
-- registration table refuses the same writes, so the dukjil reward wire never fires. A member
-- whose application is still pending or confirmed when an event requeues can cancel, and sees
-- the last approved content, never the edit under review. Other past applicants see nothing.
--
-- The audit table is FORCE RLS. An ordinary function owner (no superuser, no BYPASSRLS) gets a
-- policy for exactly that role from group_event_approval_audit_owner_access(), like
-- dukjil_wire_failures in 20261210100000.
begin;

alter table public.group_events
 add column approval_status text not null default 'approved' check(approval_status in('pending','approved','rejected')),
 add column approval_reason text check(approval_reason is null or length(btrim(approval_reason))between 1 and 1000),
 add column approval_submitted_at timestamptz,
 add column approval_reviewed_at timestamptz,
 add column approval_reviewed_by uuid references public.admin_allowlist(id),
 add column approved_content jsonb,
 add constraint group_events_rejection_has_reason check(approval_status<>'rejected'or approval_reason is not null);
alter table public.group_events alter column approval_status set default 'pending';
update public.group_events set approval_status='pending' where state='draft';
create index group_events_approval_queue on public.group_events(approval_submitted_at,id)where approval_status='pending'and state='published';

create table public.group_event_approval_audit(
 id uuid primary key default extensions.gen_random_uuid(),
 event_id uuid not null references public.group_events(id),
 event_revision integer not null,
 action text not null check(action in('approve','reject','requeue','edit')),
 actor_id uuid references public.app_users(id),
 reviewer_id uuid references public.admin_allowlist(id),
 reason text,
 details jsonb,
 created_at timestamptz not null default clock_timestamp(),
 check((action in('requeue','edit'))=(reviewer_id is null)),
 check(action<>'reject'or length(btrim(reason))between 1 and 1000)
);
create index group_event_approval_audit_event on public.group_event_approval_audit(event_id,created_at);
create trigger group_event_approval_audit_immutable before update or delete on public.group_event_approval_audit for each row execute function public.reject_fan_ticket_ledger_mutation();
alter table public.group_event_approval_audit enable row level security;
alter table public.group_event_approval_audit force row level security;
revoke all on table public.group_event_approval_audit from public,anon,authenticated,service_role;

-- New rows enter the queue when published. A review is the only writer of approval_status.
create function public.group_event_approval_on_insert()returns trigger language plpgsql set search_path=''as $$begin
 if new.approval_status='pending'and new.state='published'then new.approval_submitted_at:=clock_timestamp();end if;return new;
end $$;
create trigger group_event_approval_on_insert before insert on public.group_events for each row execute function public.group_event_approval_on_insert();
create function public.group_event_approval_requeue()returns trigger language plpgsql security definer set search_path=''as $$
declare core_changed boolean;editor uuid:=coalesce(nullif(pg_catalog.current_setting('kyaa.group_event_actor',true),'')::uuid,new.created_by);begin
 if new.approval_status is distinct from old.approval_status then return new;end if;
 new.approval_reason:=old.approval_reason;new.approval_reviewed_at:=old.approval_reviewed_at;new.approval_reviewed_by:=old.approval_reviewed_by;new.approval_submitted_at:=old.approval_submitted_at;new.approved_content:=old.approved_content;
 core_changed:=new.title is distinct from old.title or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.location is distinct from old.location or new.linked_mission_id is distinct from old.linked_mission_id
  or(old.capacity is not null and(new.capacity is null or new.capacity>old.capacity))or(old.requires_approval and not new.requires_approval)or(old.state in('cancelled','ended')and new.state in('draft','published'));
 if(old.approval_status='approved'and core_changed)or(old.approval_status='rejected'and new.revision<>old.revision and new.state in('draft','published'))then
  -- What registered members keep seeing while the edit is under review. Images are left out: they are private until approval.
  if old.approval_status='approved'then new.approved_content:=jsonb_build_object('title',old.title,'description',old.description,'startsAt',old.starts_at,'endsAt',old.ends_at,'opensAt',old.opens_at,'closesAt',old.closes_at,'location',old.location,'capacity',old.capacity,'requiresApproval',old.requires_approval,'linkedMissionId',old.linked_mission_id);end if;
  new.approval_status:='pending';new.approval_reason:=null;new.approval_reviewed_at:=null;new.approval_reviewed_by:=null;new.approval_submitted_at:=clock_timestamp();
  insert into public.group_event_approval_audit(event_id,event_revision,action,actor_id)values(new.id,new.revision,'requeue',editor);
 elsif old.approval_status='approved'and(new.description is distinct from old.description or new.image_url is distinct from old.image_url)then
  insert into public.group_event_approval_audit(event_id,event_revision,action,actor_id,details)values(new.id,new.revision,'edit',editor,jsonb_strip_nulls(jsonb_build_object('description',case when new.description is distinct from old.description then old.description end,'imageUrl',case when new.image_url is distinct from old.image_url then old.image_url end)));
 elsif old.approval_status='pending'and new.state='published'and old.state<>'published'then
  new.approval_submitted_at:=clock_timestamp();
 end if;
 return new;
end $$;
create trigger group_event_approval_requeue before update on public.group_events for each row execute function public.group_event_approval_requeue();

-- Table-level gate: covers every present and future writer, and fires before zzz_dukjil_wire can pay.
create function public.group_event_registration_approval_gate()returns trigger language plpgsql security definer set search_path=''as $$begin
 if(select approval_status from public.group_events where id=new.event_id)='approved'then return new;end if;
 if tg_op='INSERT'or(new.checked_in_at is not null and old.checked_in_at is null)or new.review_body is distinct from old.review_body or(new.status in('pending','confirmed')and new.status<>old.status)then raise exception 'GROUP_ACTIVITY_CLOSED';end if;
 return new;
end $$;
create trigger group_event_registration_approval_gate before insert or update on public.group_event_registrations for each row execute function public.group_event_registration_approval_gate();

-- Patch the existing dispatch layers in place; every target must match or the migration stops.
do $migration$
declare f record;body text;old text;
begin
 select p.oid,p.prosrc into f from pg_proc p where p.oid='public.group_activities_dispatch_before_operations(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure;body:=f.prosrc;
 old:=$old$(state<>'draft'or manager)$old$;
 if(length(body)-length(replace(body,old,'')))/length(old)<>2 then raise exception 'GROUP_EVENT_APPROVAL_LIST_FILTER_CHANGED';end if;
 body:=replace(body,old,$next$(state<>'draft'or manager)and(approval_status='approved'or manager)$next$);
 old:=$old$if not found or(e.state='draft'and not manager)then raise exception 'GROUP_ACTIVITY_NOT_FOUND';end if;end if;$old$;
 if position(old in body)=0 then raise exception 'GROUP_EVENT_APPROVAL_LOOKUP_CHANGED';end if;
 body:=replace(body,old,$next$if not found or(e.state='draft'and not manager)or(e.approval_status<>'approved'and not manager and not(e.approved_content is not null and exists(select 1 from public.group_event_registrations where event_id=e.id and app_user_id=p_actor and status in('pending','confirmed'))))then raise exception 'GROUP_ACTIVITY_NOT_FOUND';end if;
   if e.approval_status<>'approved'and p_operation in('event-apply','event-review-participant','event-ticket','event-check-in','event-review-write','official-submit')then raise exception 'GROUP_ACTIVITY_CLOSED';end if;end if;$next$);
 old:=$old$'canApply',role is not null and e.state='published'$old$;
 if position(old in body)=0 then raise exception 'GROUP_EVENT_APPROVAL_CAN_APPLY_CHANGED';end if;
 body:=replace(body,old,$next$'canApply',e.approval_status='approved'and role is not null and e.state='published'$next$);
 old:=$old$'canReview',role is not null and r.checked_in_at is not null$old$;
 if position(old in body)=0 then raise exception 'GROUP_EVENT_APPROVAL_CAN_REVIEW_CHANGED';end if;
 body:=replace(body,old,$next$'canReview',e.approval_status='approved'and role is not null and r.checked_in_at is not null$next$);
 execute replace(pg_get_functiondef(f.oid),f.prosrc,body);

 select p.oid,p.prosrc into f from pg_proc p where p.oid='public.group_activities_dispatch_before_group_images(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure;body:=f.prosrc;
 old:=$old$select *into e from public.group_events where id=p_item_id and page_id=p_page_id;$old$;
 if(length(body)-length(replace(body,old,'')))/length(old)<>1 then raise exception 'GROUP_EVENT_APPROVAL_OPERATIONS_CHANGED';end if;
 body:=replace(body,old,old||$next$
 if e.approval_status<>'approved'and p_operation in('event-manual-check-in','official-submit','event-support-submit')then raise exception 'GROUP_ACTIVITY_CLOSED';end if;$next$);
 execute replace(pg_get_functiondef(f.oid),f.prosrc,body);

 select p.oid,p.prosrc into f from pg_proc p where p.oid='public.group_activity_next_cursor(text,uuid,boolean,integer,uuid)'::regprocedure;body:=f.prosrc;
 old:=$old$filter:='page_id=$1 and(state<>''draft''or $2)';$old$;
 if position(old in body)=0 then raise exception 'GROUP_EVENT_APPROVAL_CURSOR_CHANGED';end if;
 body:=replace(body,old,$next$filter:='page_id=$1 and(state<>''draft''or $2)and(approval_status=''approved''or $2)';$next$);
 execute replace(pg_get_functiondef(f.oid),f.prosrc,body);

 select p.oid,p.prosrc into f from pg_proc p where p.oid='public.authorize_group_image_read_before_qualification(uuid,uuid,text)'::regprocedure;body:=f.prosrc;
 old:=$old$select page_id,state='draft'into page,private from public.group_events where id=ref.target_id;$old$;
 if position(old in body)=0 then raise exception 'GROUP_EVENT_APPROVAL_IMAGE_CHANGED';end if;
 body:=replace(body,old,$next$select page_id,state='draft'or approval_status<>'approved'into page,private from public.group_events where id=ref.target_id;$next$);
 -- A reviewer must see what is being approved; each read is logged like an application image read.
 old:=$old$role in('owner','manager')));
 end if;
 if not coalesce(allowed,false)then return null;end if;$old$;
 if position(old in body)=0 then raise exception 'GROUP_EVENT_APPROVAL_IMAGE_ACCESS_CHANGED';end if;
 body:=replace(body,old,$next$role in('owner','manager')));
  if not coalesce(allowed,false)and ref.target_type='event'and p_app_user_id is not null and exists(select 1 from public.group_events where id=ref.target_id and approval_status='pending'and state='published')then
   select aa.id into admin from public.admin_allowlist aa join public.app_users u on u.verified_email=aa.email and u.status='active'where u.id=p_app_user_id and aa.active limit 1;
   allowed:=admin is not null;
   if allowed then insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_app_user_id,admin,'groups.event.image.read','group_event',ref.target_id::text,extensions.gen_random_uuid(),jsonb_build_object('assetId',a.id));end if;
  end if;
 end if;
 if not coalesce(allowed,false)then return null;end if;$next$);
 execute replace(pg_get_functiondef(f.oid),f.prosrc,body);

 -- Keep the projection OID: the dispatch layers and receipts call it by name.
 execute replace(pg_get_functiondef('public.group_event_json(uuid,uuid)'::regprocedure),'FUNCTION public.group_event_json(','FUNCTION public.group_event_json_before_approval(');
end $migration$;
create or replace function public.group_event_json(p_id uuid,p_actor uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select public.group_event_json_before_approval(p_id,p_actor)
  ||jsonb_build_object('approvalStatus',e.approval_status,'approvalReason',case when exists(select 1 from public.group_memberships m where m.page_id=e.page_id and m.app_user_id=p_actor and m.role in('owner','manager'))then e.approval_reason end)
  ||case when e.approval_status='approved'then'{}'::jsonb else'{"ticketAvailable":false}'::jsonb end
  ||case when e.approval_status<>'approved'and e.approved_content is not null and not exists(select 1 from public.group_memberships m where m.page_id=e.page_id and m.app_user_id=p_actor and m.role in('owner','manager'))then e.approved_content||'{"imageUrl":null}'::jsonb else'{}'::jsonb end
 from public.group_events e where e.id=p_id
$$;

-- Result notice for staff of the page: in-app only, same shape as the group raffle notice.
do $$
declare previous text;
begin
 select pg_get_expr(conbin,conrelid) into strict previous from pg_constraint where conrelid='public.fan_notifications'::regclass and conname='fan_notifications_source_shape';
 alter table public.fan_notifications drop constraint fan_notifications_source_shape;
 execute 'alter table public.fan_notifications add constraint fan_notifications_source_shape check (('||previous||') or (kind::text=''group_event_reviewed'' and live_event_id is null and benefit_id is null and web_only))';
 execute replace(pg_get_functiondef('public.fan_web_notification_kind(text)'::regprocedure),'FUNCTION public.fan_web_notification_kind(','FUNCTION public.fan_web_notification_kind_before_event_approval(');
 execute replace(pg_get_functiondef('public.fan_web_notification_path(uuid,uuid)'::regprocedure),'FUNCTION public.fan_web_notification_path(','FUNCTION public.fan_web_notification_path_before_event_approval(');
end $$;
create or replace function public.fan_web_notification_kind(p_kind text)returns boolean language sql immutable security definer set search_path=''as $$select p_kind='group_event_reviewed'or public.fan_web_notification_kind_before_event_approval(p_kind)$$;
create or replace function public.fan_web_notification_path(p_owner uuid,p_notification uuid)returns text language plpgsql stable security definer set search_path=''as $$
declare n public.fan_notifications;path text;begin
 select *into n from public.fan_notifications where id=p_notification and app_user_id=p_owner and superseded_at is null and scheduled_for<=now();
 if n.kind::text='group_event_reviewed'then
  select '/pages/groups/'||e.page_id||'/events/'||e.id into path from public.group_events e join public.app_users u on u.id=p_owner and u.status='active' where e.id=(n.payload->>'targetId')::uuid;return path;
 end if;
 return public.fan_web_notification_path_before_event_approval(p_owner,p_notification);
end $$;

alter function public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)rename to group_activities_dispatch_before_event_approval;
create function public.group_activities_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_sub_id uuid default null,p_input jsonb default'{}',p_admin_id uuid default null)returns jsonb language plpgsql security definer set search_path=''as $$
declare e public.group_events;prior public.group_activity_receipts;req uuid;payload jsonb;act text;note text;target text;result jsonb;lim integer;cursor_event uuid;ids uuid[];decisions integer;begin
 if p_operation='event-save'and p_actor is not null then perform pg_catalog.set_config('kyaa.group_event_actor',p_actor::text,true);end if;
 if p_operation not in('admin-event-approvals','event-approval-review')then
  return public.group_activities_dispatch_before_event_approval(p_operation,p_actor,p_page_id,p_item_id,p_sub_id,p_input,p_admin_id);
 end if;
 if p_actor is null or p_admin_id is null then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
 perform public.fan_web_lock_active_user(p_actor);
 perform public.assert_active_admin(p_actor,p_admin_id,p_operation='event-approval-review');
 if p_operation='admin-event-approvals'then
  lim:=coalesce((p_input->>'limit')::integer,30);cursor_event:=(p_input->>'cursor')::uuid;
  if lim not between 1 and 100 then raise exception 'GROUP_ACTIVITY_INVALID';end if;
  select array_agg(id order by approval_submitted_at,id)into ids from(select q.id,q.approval_submitted_at from public.group_events q where q.approval_status='pending'and q.state='published'and(cursor_event is null or(q.approval_submitted_at,q.id)>(select c.approval_submitted_at,c.id from public.group_events c where c.id=cursor_event))order by q.approval_submitted_at,q.id limit lim+1)x;
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'pageId',q.page_id,'pageName',g.name,'title',q.title,'description',q.description,'imageUrl',q.image_url,'startsAt',q.starts_at,'endsAt',q.ends_at,'opensAt',q.opens_at,'closesAt',q.closes_at,'location',q.location,'capacity',q.capacity,'requiresApproval',q.requires_approval,'linkedMissionTitle',(select m.title from public.group_missions m where m.id=q.linked_mission_id),'revision',q.revision,'submittedAt',q.approval_submitted_at,'creatorName',(select nullif(btrim(u.nickname),'')from public.user_profiles u where u.app_user_id=q.created_by),'creatorRole',(select m.role from public.group_memberships m where m.page_id=q.page_id and m.app_user_id=q.created_by))order by q.approval_submitted_at,q.id)from public.group_events q join public.group_pages g on g.id=q.page_id where q.id=any(ids[1:lim])),'[]'::jsonb),'nextCursor',case when cardinality(ids)>lim then ids[lim]end);
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-activity-page:'||p_page_id,0));
 req:=(p_input->>'requestId')::uuid;if req is null then raise exception 'GROUP_ACTIVITY_INVALID';end if;
 payload:=jsonb_build_object('pageId',p_page_id,'itemId',p_item_id,'subId',p_sub_id,'input',p_input);
 select *into prior from public.group_activity_receipts where actor_id=p_actor and request_id=req;
 if found then if prior.operation<>p_operation or prior.payload<>payload then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;return prior.response;end if;
 select *into e from public.group_events where id=p_item_id and page_id=p_page_id for update;
 if not found then raise exception 'GROUP_ACTIVITY_NOT_FOUND';end if;
 -- Nobody decides their own event, even when they also hold an admin account.
 if e.created_by=p_actor or exists(select 1 from public.group_memberships m where m.page_id=e.page_id and m.app_user_id=p_actor and m.role in('owner','manager'))then raise exception 'GROUP_ACTIVITY_FORBIDDEN';end if;
 act:=p_input->>'action';note:=nullif(btrim(coalesce(p_input->>'reason','')),'');
 if act is null or act not in('approve','reject')or(act='reject'and(note is null or length(note)>1000))or jsonb_typeof(p_input->'expectedRevision')<>'number'then raise exception 'GROUP_ACTIVITY_INVALID';end if;
 if e.revision<>(p_input->>'expectedRevision')::integer then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
 target:=case act when'approve'then'approved'else'rejected'end;
 if e.approval_status<>target then
  if e.approval_status<>'pending'or e.state<>'published'then raise exception 'GROUP_ACTIVITY_CONFLICT';end if;
  update public.group_events set approval_status=target,approved_content=case when act='approve'then null else approved_content end,approval_reason=case when act='reject'then note end,approval_reviewed_at=clock_timestamp(),approval_reviewed_by=p_admin_id where id=e.id returning *into e;
  insert into public.group_event_approval_audit(event_id,event_revision,action,actor_id,reviewer_id,reason)values(e.id,e.revision,act,p_actor,p_admin_id,case when act='reject'then note end);
  select count(*)into decisions from public.group_event_approval_audit where event_id=e.id and action in('approve','reject');
  insert into public.fan_notifications(app_user_id,kind,source_key,scheduled_for,deep_link,payload,web_only)
   select recipient,'group_event_reviewed','group-event-reviewed:'||e.id||':'||decisions,clock_timestamp(),'/pages/groups/'||e.page_id||'/events/'||e.id,jsonb_build_object('targetType','group_event','targetId',e.id,'revision',decisions),true
   from(select e.created_by recipient union select m.app_user_id from public.group_memberships m where m.page_id=e.page_id and m.role='owner')x join public.app_users u on u.id=x.recipient and u.status='active'
   on conflict(app_user_id,source_key)do nothing;
 end if;
 result:=jsonb_build_object('eventId',e.id,'approvalStatus',e.approval_status,'approvalReason',e.approval_reason,'revision',e.revision);
 insert into public.group_activity_receipts(actor_id,request_id,operation,payload,response)values(p_actor,req,p_operation,payload,result);
 return result;
end $$;

create function public.group_event_approval_audit_owner_access()returns void language plpgsql security definer set search_path=''as $$
declare r record;policy_name text;begin
 for r in select distinct o.rolname,o.rolbypassrls from pg_proc p join pg_roles o on o.oid=p.proowner where p.oid in('public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure,'public.group_event_approval_requeue()'::regprocedure)and not o.rolsuper loop
  execute format('grant select,insert on table public.group_event_approval_audit to %I',r.rolname);
  policy_name:='group_event_approval_audit_owner_'||r.rolname;
  if not r.rolbypassrls and not exists(select 1 from pg_policy where polrelid='public.group_event_approval_audit'::regclass and polname=policy_name)then
   execute format('create policy %I on public.group_event_approval_audit for all to %I using(true)with check(true)',policy_name,r.rolname);
  end if;
 end loop;
end $$;
select public.group_event_approval_audit_owner_access();

do $$declare signature text;begin
 foreach signature in array array['group_event_approval_audit_owner_access()','group_event_approval_on_insert()','group_event_approval_requeue()','group_event_registration_approval_gate()','group_event_json_before_approval(uuid,uuid)','group_event_json(uuid,uuid)','fan_web_notification_kind_before_event_approval(text)','fan_web_notification_path_before_event_approval(uuid,uuid)','group_activities_dispatch_before_event_approval(text,uuid,uuid,uuid,uuid,jsonb,uuid)','group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)']loop
  execute format('revoke all on function public.%s from public,anon,authenticated,service_role',signature);
 end loop;
end $$;
revoke all on function public.fan_web_notification_kind(text),public.fan_web_notification_path(uuid,uuid)from public,anon,authenticated;
grant execute on function public.fan_web_notification_path(uuid,uuid)to service_role;
grant execute on function public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)to service_role;
commit;

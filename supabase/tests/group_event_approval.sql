\set ON_ERROR_STOP on
begin;
\ir group_scope_fixture.sql
-- The clean-chain runner opens events for other suites; this suite needs the real rule.
alter table public.group_events alter column approval_status set default 'pending';
alter table public.group_events enable trigger group_event_approval_requeue;
create function pg_temp.expect_error(query text,expected text)returns void language plpgsql as $$begin execute query;raise exception 'NO_ERROR expected % for %',expected,query;exception when others then if sqlerrm<>expected then raise exception 'expected % got % for %',expected,sqlerrm,query;end if;end $$;
create function pg_temp.call(op text,actor uuid,page uuid,item uuid default null,sub uuid default null,input jsonb default '{}',admin uuid default null)returns text language sql as $$select format('select public.group_activities_dispatch(%L,%L,%L,%L,%L,%L::jsonb,%L)',op,actor,page,item,sub,input,admin)$$;
create function pg_temp.req(extra jsonb default '{}')returns jsonb language sql volatile as $$select jsonb_build_object('requestId',extensions.gen_random_uuid())||extra$$;
create function pg_temp.event_input(extra jsonb default '{}')returns jsonb language sql volatile as $$select pg_temp.req(jsonb_build_object('title','Approval fixture','description','Body','startsAt',clock_timestamp()-interval'1 hour','endsAt',clock_timestamp()+interval'2 hours','opensAt',clock_timestamp()-interval'1 day','closesAt',clock_timestamp()+interval'90 minutes','location','Hall A','capacity',10,'requiresApproval',false,'state','published')||extra)$$;
create function pg_temp.event_ids(j jsonb)returns uuid[] language sql as $$select coalesce(array_agg((x->>'id')::uuid),'{}')from jsonb_array_elements(j)x$$;
-- Records real wire calls without needing the reward catalogue; the transaction rolls this back.
create temp table wire_calls(action text,app_user uuid)on commit drop;
grant all on wire_calls to public;
create or replace function public.dukjil_policy_replaces_earning(p_at timestamptz default clock_timestamp())returns boolean language sql as $$select true$$;
create or replace function public.dukjil_wire_award(p_wire text,p_user uuid,p_celebrity uuid,p_action text,p_source text,p_params jsonb default '{}')returns void language plpgsql as $$begin insert into pg_temp.wire_calls values(p_action,p_user);end $$;

do $$
declare owner uuid:=extensions.gen_random_uuid();mgr uuid:=extensions.gen_random_uuid();a uuid:=extensions.gen_random_uuid();b uuid:=extensions.gen_random_uuid();admin uuid:=extensions.gen_random_uuid();allow uuid:=extensions.gen_random_uuid();view_user uuid:=extensions.gen_random_uuid();view_allow uuid:=extensions.gen_random_uuid();owner_allow uuid:=extensions.gen_random_uuid();page uuid:=extensions.gen_random_uuid();ev uuid;rev int;r jsonb;again jsonb;input jsonb;reg uuid;qr text;n int;fan_page uuid;fan_ev uuid;img uuid;
begin
 insert into public.app_users(id,privy_user_id,verified_email)select u,'did:privy:approval-'||u,u||'@example.test'from unnest(array[owner,mgr,a,b,admin,view_user])u;
 insert into public.admin_allowlist(id,email,role,active)values(allow,admin||'@example.test','admin',true),(view_allow,view_user||'@example.test','viewer',true),(owner_allow,owner||'@example.test','admin',true);
 insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(a,'Member A','member a'),(b,'Member B','member b');
 insert into public.group_pages(id,kind,name)values(page,'hobby','Approval page');
 insert into public.group_memberships(page_id,app_user_id,role)values(page,owner,'owner'),(page,mgr,'manager'),(page,a,'member'),(page,b,'member');

 -- 1. Saved events wait for approval and are hidden from every public read.
 r:=public.group_activities_dispatch('event-save',owner,page,null,null,pg_temp.event_input());ev:=(r#>>'{event,id}')::uuid;rev:=(r#>>'{event,revision}')::int;
 if r#>>'{event,approvalStatus}' is distinct from 'pending' then raise exception '1a new event not pending: %',r;end if;
 if (select approval_submitted_at is null from public.group_events where id=ev) then raise exception '1b no submitted time';end if;
 if ev=any(pg_temp.event_ids(public.group_activities_dispatch('events',a,page)->'events'))then raise exception '1c member list shows pending';end if;
 if ev=any(pg_temp.event_ids(public.group_activities_dispatch('events',null,page)->'events'))then raise exception '1d guest list shows pending';end if;
 if ev=any(pg_temp.event_ids(public.group_activities_dispatch('activities',a,page)->'events'))then raise exception '1e activities show pending';end if;
 perform public.group_activities_dispatch('event-save',owner,page,null,null,pg_temp.event_input());
 if public.group_activity_next_cursor('events',page,true,1,null) is null then raise exception '1f0 staff cursor lost pending rows';end if;
 if public.group_activity_next_cursor('events',page,false,1,null) is not null then raise exception '1f hidden row advanced public cursor';end if;
 perform pg_temp.expect_error(pg_temp.call('event',a,page,ev),'GROUP_ACTIVITY_NOT_FOUND');
 perform pg_temp.expect_error(pg_temp.call('event',null,page,ev),'GROUP_ACTIVITY_NOT_FOUND');
 if not ev=any(pg_temp.event_ids(public.group_activities_dispatch('events',owner,page)->'events'))then raise exception '1g owner cannot see own pending';end if;
 if not ev=any(pg_temp.event_ids(public.group_activities_dispatch('events',mgr,page)->'events'))then raise exception '1h manager cannot see pending';end if;
 r:=public.group_activities_dispatch('event',owner,page,ev);
 if (r->>'canApply')::boolean then raise exception '1i owner can apply on pending';end if;

 -- 2. Every participation path refuses a pending event, including the table itself.
 perform pg_temp.expect_error(pg_temp.call('event-apply',a,page,ev,null,pg_temp.req()),'GROUP_ACTIVITY_NOT_FOUND');
 perform pg_temp.expect_error(pg_temp.call('event-apply',owner,page,ev,null,pg_temp.req()),'GROUP_ACTIVITY_CLOSED');
 perform pg_temp.expect_error(pg_temp.call('event-review-write',owner,page,ev,null,pg_temp.req('{"body":"x"}')),'GROUP_ACTIVITY_CLOSED');
 perform pg_temp.expect_error(pg_temp.call('official-submit',owner,page,ev,null,pg_temp.req('{"description":"x","sourceUrl":null}')),'GROUP_ACTIVITY_CLOSED');
 perform pg_temp.expect_error(pg_temp.call('event-support-submit',owner,page,ev,null,pg_temp.req('{"description":"x","sourceUrl":"https://example.test/a"}')),'GROUP_ACTIVITY_CLOSED');
 perform pg_temp.expect_error(format('insert into public.group_event_registrations(event_id,app_user_id,status)values(%L,%L,%L)',ev,a,'confirmed'),'GROUP_ACTIVITY_CLOSED');

 -- 3. Only a writable platform admin who does not run the page decides.
 input:=pg_temp.req(jsonb_build_object('action','approve','expectedRevision',rev));
 perform pg_temp.expect_error(pg_temp.call('event-approval-review',a,page,ev,null,input),'GROUP_ACTIVITY_FORBIDDEN');
 perform pg_temp.expect_error(pg_temp.call('event-approval-review',owner,page,ev,null,input),'GROUP_ACTIVITY_FORBIDDEN');
 perform pg_temp.expect_error(pg_temp.call('event-approval-review',mgr,page,ev,null,input),'GROUP_ACTIVITY_FORBIDDEN');
 perform pg_temp.expect_error(pg_temp.call('event-approval-review',owner,page,ev,null,input,owner_allow),'GROUP_ACTIVITY_FORBIDDEN');
 perform pg_temp.expect_error(pg_temp.call('admin-event-approvals',a,null),'GROUP_ACTIVITY_FORBIDDEN');
 begin perform public.group_activities_dispatch('event-approval-review',view_user,page,ev,null,input,view_allow);raise exception 'NO_ERROR viewer approved';exception when others then if sqlerrm like 'NO_ERROR%' then raise;end if;end;
 if (select approval_status from public.group_events where id=ev)<>'pending' then raise exception '3a status changed by refused calls';end if;
 r:=public.group_activities_dispatch('admin-event-approvals',admin,null,null,null,'{"limit":30}',allow);
 if not ev=any(pg_temp.event_ids(r->'items'))then raise exception '3b queue lacks event';end if;
 select x into again from jsonb_array_elements(r->'items')x where x->>'id'=ev::text;
 if again->>'creatorRole'<>'owner' or again->'creatorName'<>'null'::jsonb or not again?'imageUrl' then raise exception '3d queue creator or image fields: %',again;end if;
 if (select x->>'pageName' from jsonb_array_elements(r->'items')x where x->>'id'=ev::text)<>'Approval page' or (select x->>'location' from jsonb_array_elements(r->'items')x where x->>'id'=ev::text)<>'Hall A' then raise exception '3c queue lacks detail';end if;

 -- 4. Reject needs a reason, shows it to staff only, and a save requeues.
 perform pg_temp.expect_error(pg_temp.call('event-approval-review',admin,page,ev,null,pg_temp.req(jsonb_build_object('action','reject','reason','  ','expectedRevision',rev)),allow),'GROUP_ACTIVITY_INVALID');
 input:=pg_temp.req(jsonb_build_object('action','reject','reason','장소가 불분명합니다','expectedRevision',rev));
 r:=public.group_activities_dispatch('event-approval-review',admin,page,ev,null,input,allow);
 again:=public.group_activities_dispatch('event-approval-review',admin,page,ev,null,input,allow);
 if again is distinct from r then raise exception '4a replay changed response';end if;
 if (select count(*) from public.group_event_approval_audit where event_id=ev and action='reject')<>1 then raise exception '4b replay duplicated audit';end if;
 r:=public.group_activities_dispatch('event',owner,page,ev);
 if r#>>'{event,approvalStatus}'<>'rejected' or r#>>'{event,approvalReason}'<>'장소가 불분명합니다' then raise exception '4c owner reason missing: %',r;end if;
 perform pg_temp.expect_error(pg_temp.call('event',a,page,ev),'GROUP_ACTIVITY_NOT_FOUND');
 perform pg_temp.expect_error(pg_temp.call('event-approval-review',admin,page,ev,null,pg_temp.req(jsonb_build_object('action','approve','expectedRevision',rev)),allow),'GROUP_ACTIVITY_CONFLICT');
 if (select count(*) from public.fan_notifications where app_user_id=owner and kind::text='group_event_reviewed' and payload->>'targetId'=ev::text)<>1 then raise exception '4d owner not notified of rejection';end if;
 r:=(select payload from public.fan_notifications where app_user_id=owner and kind::text='group_event_reviewed' and payload->>'targetId'=ev::text order by created_at desc limit 1);
 if r->>'decision'<>'rejected' or r->>'eventTitle' is distinct from (select title from public.group_events where id=ev) then raise exception '4d-1 rejection payload: %',r;end if;
 if r::text like '%장소가 불분명합니다%' or exists(select 1 from jsonb_object_keys(r)k where k not in('targetType','targetId','revision','decision','eventTitle')) then raise exception '4d-2 payload carries more than the decision and title: %',r;end if;
 r:=public.group_activities_dispatch('event-save',owner,page,ev,null,pg_temp.event_input(jsonb_build_object('expectedRevision',rev,'location','Hall B')));rev:=(r#>>'{event,revision}')::int;
 if r#>>'{event,approvalStatus}'<>'pending' or r#>>'{event,approvalReason}' is not null then raise exception '4e rejected save not requeued: %',r;end if;

 -- 5. Approve: stale revision refused, replay and repeat are idempotent, opposite decision conflicts.
 perform pg_temp.expect_error(pg_temp.call('event-approval-review',admin,page,ev,null,pg_temp.req(jsonb_build_object('action','approve','expectedRevision',rev-1)),allow),'GROUP_ACTIVITY_CONFLICT');
 input:=pg_temp.req(jsonb_build_object('action','approve','expectedRevision',rev));
 r:=public.group_activities_dispatch('event-approval-review',admin,page,ev,null,input,allow);
 again:=public.group_activities_dispatch('event-approval-review',admin,page,ev,null,input,allow);
 if again is distinct from r or r->>'approvalStatus'<>'approved' then raise exception '5a replay: %',again;end if;
 again:=public.group_activities_dispatch('event-approval-review',admin,page,ev,null,pg_temp.req(jsonb_build_object('action','approve','expectedRevision',rev)),allow);
 if again->>'approvalStatus'<>'approved' then raise exception '5b repeat approve';end if;
 if (select count(*) from public.group_event_approval_audit where event_id=ev and action='approve')<>1 then raise exception '5c repeat duplicated audit';end if;
 if (select count(*) from public.fan_notifications where app_user_id=owner and kind::text='group_event_reviewed' and payload->>'targetId'=ev::text)<>2 then raise exception '5d notifications';end if;
 if not exists(select 1 from public.fan_notifications where app_user_id=owner and kind::text='group_event_reviewed' and payload->>'targetId'=ev::text and payload->>'decision'='approved') then raise exception '5d-1 approval payload';end if;
 -- The older notification still says what it said.
 if not exists(select 1 from public.fan_notifications where app_user_id=owner and kind::text='group_event_reviewed' and payload->>'targetId'=ev::text and payload->>'decision'='rejected') then raise exception '5d-2 older decision changed';end if;
 perform pg_temp.expect_error(pg_temp.call('event-approval-review',admin,page,ev,null,pg_temp.req(jsonb_build_object('action','reject','reason','x','expectedRevision',rev)),allow),'GROUP_ACTIVITY_CONFLICT');
 if ev=any(pg_temp.event_ids(public.group_activities_dispatch('admin-event-approvals',admin,null,null,null,'{"limit":30}',allow)->'items'))then raise exception '5e queue still lists approved';end if;

 -- 6. After approval the event opens normally.
 if not ev=any(pg_temp.event_ids(public.group_activities_dispatch('events',a,page)->'events'))then raise exception '6a list hidden after approval';end if;
 if not (public.group_activities_dispatch('event',a,page,ev)->>'canApply')::boolean then raise exception '6b cannot apply after approval';end if;
 perform public.group_activities_dispatch('event-apply',a,page,ev,null,pg_temp.req());
 select id into reg from public.group_event_registrations where event_id=ev and app_user_id=a;
 qr:=public.group_activities_dispatch('event-ticket',a,page,ev)->>'qrPayload';
 perform public.group_activities_dispatch('event-apply',b,page,ev,null,pg_temp.req());

 -- 7. Core edits requeue; a member already holding a registration keeps detail and cancel only.
 r:=public.group_activities_dispatch('event-save',mgr,page,ev,null,pg_temp.event_input(jsonb_build_object('expectedRevision',rev,'location','Hall C','description','Body','startsAt',(select starts_at from public.group_events where id=ev),'endsAt',(select ends_at from public.group_events where id=ev))));rev:=(r#>>'{event,revision}')::int;
 if r#>>'{event,approvalStatus}'<>'pending' then raise exception '7a location edit did not requeue';end if;
 if (select count(*) from public.group_event_approval_audit where event_id=ev and action='requeue')<>2 then raise exception '7b requeue audit';end if;
 if ev=any(pg_temp.event_ids(public.group_activities_dispatch('events',a,page)->'events'))then raise exception '7c list after requeue';end if;
 r:=public.group_activities_dispatch('event',a,page,ev);
 if (r->>'canApply')::boolean or (r#>>'{event,ticketAvailable}')::boolean or r#>>'{event,approvalReason}' is not null then raise exception '7d registrant detail: %',r;end if;
 if r#>>'{event,location}'<>'Hall B' or r#>'{event,imageUrl}'<>'null'::jsonb then raise exception '7d1 registrant saw unreviewed content: %',r;end if;
 if public.group_activities_dispatch('event',owner,page,ev)#>>'{event,location}'<>'Hall C' then raise exception '7d2 staff lost the edited content';end if;
 if (select actor_id from public.group_event_approval_audit where event_id=ev and action='requeue' order by created_at desc limit 1)<>mgr then raise exception '7d3 requeue audit names the wrong actor';end if;
 perform pg_temp.expect_error(pg_temp.call('event-ticket',a,page,ev),'GROUP_ACTIVITY_CLOSED');
 perform pg_temp.expect_error(pg_temp.call('event-check-in',owner,page,ev,null,pg_temp.req(jsonb_build_object('qrPayload',qr))),'GROUP_ACTIVITY_CLOSED');
 perform pg_temp.expect_error(pg_temp.call('event-check-in',admin,page,ev,null,pg_temp.req(jsonb_build_object('qrPayload',qr)),allow),'GROUP_ACTIVITY_CLOSED');
 perform pg_temp.expect_error(pg_temp.call('event-manual-check-in',owner,page,ev,reg,pg_temp.req('{"confirmedName":"Member A","reason":"QR failed"}')),'GROUP_ACTIVITY_CLOSED');
 perform pg_temp.expect_error(format('update public.group_event_registrations set checked_in_at=now() where id=%L',reg),'GROUP_ACTIVITY_CLOSED');
 perform public.group_activities_dispatch('event-cancel',b,page,ev,null,pg_temp.req());
 perform pg_temp.expect_error(pg_temp.call('event',b,page,ev),'GROUP_ACTIVITY_NOT_FOUND');
 update public.group_event_registrations set status='rejected' where event_id=ev and app_user_id=b;
 perform pg_temp.expect_error(pg_temp.call('event',b,page,ev),'GROUP_ACTIVITY_NOT_FOUND');
 perform public.group_activities_dispatch('event-approval-review',admin,page,ev,null,pg_temp.req(jsonb_build_object('action','approve','expectedRevision',rev)),allow);
 r:=public.group_activities_dispatch('event-check-in',owner,page,ev,null,pg_temp.req(jsonb_build_object('qrPayload',qr)));
 if r->>'status'<>'checked_in' then raise exception '7e check-in after reapproval';end if;

 -- 8. Requeue matrix on one approved event: description stays; each listed change requeues.
 r:=public.group_activities_dispatch('event-save',owner,page,null,null,pg_temp.event_input('{"requiresApproval":true,"capacity":5}'));ev:=(r#>>'{event,id}')::uuid;rev:=1;
 perform public.group_activities_dispatch('event-approval-review',admin,page,ev,null,pg_temp.req(jsonb_build_object('action','approve','expectedRevision',rev)),allow);
 create temp table if not exists base on commit drop as select starts_at,ends_at,opens_at,closes_at from public.group_events where id=ev;
 input:=jsonb_build_object('startsAt',(select starts_at from base),'endsAt',(select ends_at from base),'opensAt',(select opens_at from base),'closesAt',(select closes_at from base),'requiresApproval',true,'capacity',5);
 r:=public.group_activities_dispatch('event-save',owner,page,ev,null,pg_temp.event_input(input||jsonb_build_object('expectedRevision',rev,'description','오타 수정','capacity',4)));rev:=rev+1;
 if r#>>'{event,approvalStatus}'<>'approved' then raise exception '8a minor edit requeued: %',r;end if;
 if (select count(*) from public.group_event_approval_audit where event_id=ev and action='edit' and actor_id=owner and details->>'description'='Body')<>1 then raise exception '8a1 description edit left no audit';end if;
 input:=input||'{"capacity":4}';
 r:=public.group_activities_dispatch('event-save',owner,page,ev,null,pg_temp.event_input(input||jsonb_build_object('expectedRevision',rev,'capacity',6)));rev:=rev+1;
 if r#>>'{event,approvalStatus}'<>'pending' then raise exception '8b capacity increase did not requeue';end if;
 perform public.group_activities_dispatch('event-approval-review',admin,page,ev,null,pg_temp.req(jsonb_build_object('action','approve','expectedRevision',rev)),allow);input:=input||'{"capacity":6}';
 r:=public.group_activities_dispatch('event-save',owner,page,ev,null,pg_temp.event_input(input||jsonb_build_object('expectedRevision',rev,'capacity',null)));rev:=rev+1;
 if r#>>'{event,approvalStatus}'<>'pending' then raise exception '8c unlimited capacity did not requeue';end if;
 perform public.group_activities_dispatch('event-approval-review',admin,page,ev,null,pg_temp.req(jsonb_build_object('action','approve','expectedRevision',rev)),allow);input:=input||'{"capacity":null}';
 r:=public.group_activities_dispatch('event-save',owner,page,ev,null,pg_temp.event_input(input||jsonb_build_object('expectedRevision',rev,'title','완전히 다른 행사')));rev:=rev+1;
 if r#>>'{event,approvalStatus}'<>'pending' then raise exception '8d title did not requeue';end if;
 perform public.group_activities_dispatch('event-approval-review',admin,page,ev,null,pg_temp.req(jsonb_build_object('action','approve','expectedRevision',rev)),allow);input:=input||'{"title":"완전히 다른 행사"}';
 r:=public.group_activities_dispatch('event-save',owner,page,ev,null,pg_temp.event_input(input||jsonb_build_object('expectedRevision',rev,'requiresApproval',false)));rev:=rev+1;
 if r#>>'{event,approvalStatus}'<>'pending' then raise exception '8e auto-confirm did not requeue';end if;
 perform public.group_activities_dispatch('event-approval-review',admin,page,ev,null,pg_temp.req(jsonb_build_object('action','approve','expectedRevision',rev)),allow);input:=input||'{"requiresApproval":false}';
 r:=public.group_activities_dispatch('event-save',owner,page,ev,null,pg_temp.event_input(input||jsonb_build_object('expectedRevision',rev,'state','cancelled')));rev:=rev+1;
 if r#>>'{event,approvalStatus}'<>'approved' then raise exception '8f plain cancel requeued';end if;
 r:=public.group_activities_dispatch('event-save',owner,page,ev,null,pg_temp.event_input(input||jsonb_build_object('expectedRevision',rev,'state','published')));rev:=rev+1;
 if r#>>'{event,approvalStatus}'<>'pending' then raise exception '8g revive did not requeue';end if;

 -- 9. Drafts stay out of the queue until published; a client cannot set approval fields; a new row is pending.
 r:=public.group_activities_dispatch('event-save',owner,page,null,null,pg_temp.event_input('{"state":"draft"}'));ev:=(r#>>'{event,id}')::uuid;
 if ev=any(pg_temp.event_ids(public.group_activities_dispatch('admin-event-approvals',admin,null,null,null,'{"limit":100}',allow)->'items'))then raise exception '9a draft queued';end if;
 perform pg_temp.expect_error(pg_temp.call('event-approval-review',admin,page,ev,null,pg_temp.req('{"action":"approve","expectedRevision":1}'),allow),'GROUP_ACTIVITY_CONFLICT');
 r:=public.group_activities_dispatch('event-save',owner,page,ev,null,pg_temp.event_input('{"expectedRevision":1,"state":"published"}'));
 if not ev=any(pg_temp.event_ids(public.group_activities_dispatch('admin-event-approvals',admin,null,null,null,'{"limit":100}',allow)->'items'))then raise exception '9b published draft not queued';end if;
 r:=public.group_activities_dispatch('event-save',owner,page,null,null,pg_temp.event_input('{"approvalStatus":"approved"}'));
 if r#>>'{event,approvalStatus}'<>'pending' then raise exception '9c client forged approval';end if;

 -- 10. Reward wire: a real AFTER trigger path pays nothing until approval.
 fan_page:=pg_temp.group_scope_fixture(a);
 insert into public.group_events(page_id,title,starts_at,ends_at,opens_at,closes_at,location,state,created_by)values(fan_page,'Wire',now()-interval'1 hour',now()+interval'1 hour',now()-interval'1 day',now()+interval'30 minutes','Wire hall','published',owner)returning id into fan_ev;
 perform pg_temp.expect_error(format('insert into public.group_event_registrations(event_id,app_user_id,status)values(%L,%L,%L)',fan_ev,a,'confirmed'),'GROUP_ACTIVITY_CLOSED');
 update public.group_events set approval_status='approved' where id=fan_ev;
 insert into public.group_event_registrations(event_id,app_user_id,status)values(fan_ev,a,'confirmed');
 update public.group_events set title='Wire changed' where id=fan_ev;
 if (select approval_status from public.group_events where id=fan_ev)<>'pending' then raise exception '10a table update did not requeue';end if;
 perform pg_temp.expect_error(format('update public.group_event_registrations set checked_in_at=now() where event_id=%L and app_user_id=%L',fan_ev,a),'GROUP_ACTIVITY_CLOSED');
 perform pg_temp.expect_error(format('update public.group_event_registrations set review_body=%L where event_id=%L and app_user_id=%L','x',fan_ev,a),'GROUP_ACTIVITY_CLOSED');
 select count(*) into n from wire_calls;if n<>0 then raise exception '10b wire paid while pending: %',n;end if;
 update public.group_event_registrations set status='cancelled' where event_id=fan_ev and app_user_id=a;
 update public.group_events set approval_status='approved' where id=fan_ev;
 update public.group_event_registrations set status='confirmed' where event_id=fan_ev and app_user_id=a;
 update public.group_event_registrations set checked_in_at=now() where event_id=fan_ev and app_user_id=a;
 select count(*) into n from wire_calls where action='event_checkin';if n<>1 then raise exception '10c wire not paid after approval: %',n;end if;

 -- 12. An admin can inspect a waiting event's image; members still cannot; drafts stay private.
 img:=extensions.gen_random_uuid();
 insert into public.mobile_media_assets(id,app_user_id,kind,purpose,content_type,expected_byte_size,actual_byte_size,storage_path,thumbnail_path,state,width,height,request_id,request_hash)values(img,owner,'image','group_image','image/webp',10,10,'group/'||img,'group/'||img||'-t','ready',10,10,img,repeat('a',64));
 r:=public.group_activities_dispatch('event-save',owner,page,null,null,pg_temp.event_input(jsonb_build_object('imageAssetId',img)));ev:=(r#>>'{event,id}')::uuid;
 if public.authorize_group_image_read(admin,img,'original') is null then raise exception '12a admin cannot read waiting image';end if;
 if public.authorize_group_image_read(a,img,'original') is not null or public.authorize_group_image_read(null,img,'original') is not null then raise exception '12b member read waiting image';end if;
 if public.authorize_group_image_read(owner,img,'original') is null then raise exception '12c owner lost image';end if;
 if (select count(*) from public.audit_logs where entity_id=ev::text and action='groups.event.image.read')<>1 then raise exception '12d admin image read not audited';end if;
 if (select x->>'imageUrl' from jsonb_array_elements(public.group_activities_dispatch('admin-event-approvals',admin,null,null,null,'{"limit":100}',allow)->'items')x where x->>'id'=ev::text)<>'/api/groups/images/'||img then raise exception '12e queue image url';end if;
 -- 11. Audit is append-only; no direct table grant exists.
 perform pg_temp.expect_error('delete from public.group_event_approval_audit','fan Ticket ledger is append-only');
 if has_table_privilege('authenticated','public.group_events','select') or has_table_privilege('anon','public.group_events','select') or has_table_privilege('authenticated','public.group_event_approval_audit','select') or has_table_privilege('service_role','public.group_event_approval_audit','select') then raise exception '11a direct table grant';end if;
 if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.group_event_approval_audit'::regclass) then raise exception '11b audit RLS';end if;
 if has_function_privilege('authenticated','public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)','execute') or not has_function_privilege('service_role','public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)','execute') then raise exception '11c dispatch grant';end if;

 raise notice 'group_event_approval: all groups passed';
end $$;
rollback;
\ir group_event_approval_transitions.sql

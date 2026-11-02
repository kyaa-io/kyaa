\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
create function pg_temp.event_source_assert(ok boolean,message text)returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL %',message;end if;raise notice 'PASS %',message;end $$;
create function pg_temp.event_source_error(statement text,expected text)returns void language plpgsql as $$begin begin execute statement;exception when others then if position(expected in sqlerrm)>0 then return;end if;raise;end;raise exception 'Expected %',expected;end $$;
do $$declare owner uuid:=gen_random_uuid();member uuid:=gen_random_uuid();other uuid:=gen_random_uuid();page uuid:=gen_random_uuid();other_page uuid:=gen_random_uuid();mission uuid:=gen_random_uuid();foreign_mission uuid:=gen_random_uuid();event uuid;input jsonb;updated jsonb;receipt jsonb;result jsonb;rev integer;prior_regs bigint;prior_receipts bigint;begin
 insert into public.app_users(id,privy_user_id,verified_email)values(owner,'did:privy:event-source-'||owner,owner||'@example.test'),(member,'did:privy:event-source-'||member,member||'@example.test'),(other,'did:privy:event-source-'||other,other||'@example.test');
 insert into public.group_pages(id,kind,name)values(page,'hobby','Event source fields'),(other_page,'hobby','Other page');
 insert into public.group_memberships(page_id,app_user_id,role)values(page,owner,'owner'),(page,member,'member');
 insert into public.group_missions(id,page_id,title,instructions,state)values(mission,page,'Same page draft','Private draft instructions','draft'),(foreign_mission,other_page,'Other page','Other instructions','published');
 input:=jsonb_build_object('requestId',gen_random_uuid(),'title','Source event','description','Original','imageUrl',null,'startsAt',now()+interval'1 day','endsAt',now()+interval'2 day','opensAt',now()-interval'1 day','closesAt',now()+interval'1 hour','location','Original location','capacity',10,'requiresApproval',false,'state','published','linkedMissionId',mission);
 result:=public.group_activities_dispatch('event-save',owner,page,null,null,input);event:=(result#>>'{event,id}')::uuid;
 perform pg_temp.event_source_assert(result#>>'{event,linkedMissionId}'=mission::text and result#>'{event,cancellationReason}'='null'::jsonb,'manager can save a same-page mission with optional absent cancellation reason');
 perform pg_temp.event_source_assert(public.group_event_json(event,member)->>'linkedMissionId'is null and public.group_event_json(event,null)->>'linkedMissionId'is null,'draft linked mission hidden from member and guest');
 update public.group_missions set state='published'where id=mission;
 perform pg_temp.event_source_assert(public.group_event_json(event,member)->>'linkedMissionId'=mission::text,'published linked mission visible through existing scope');
 insert into public.group_event_registrations(event_id,app_user_id,status)values(event,member,'confirmed');
 result:=public.group_activities_dispatch('event-save',owner,page,null,null,(input-'linkedMissionId')||jsonb_build_object('requestId',gen_random_uuid(),'state','cancelled'));
 perform pg_temp.event_source_assert(result#>'{event,cancellationReason}'='null'::jsonb,'new legacy-style cancellation never requires a reason');
 select count(*)into prior_regs from public.group_event_registrations;select count(*)into prior_receipts from public.group_activity_receipts;
 updated:=input||jsonb_build_object('requestId',gen_random_uuid(),'expectedRevision',1,'state','cancelled','cancellationReason','  Original cancellation reason  ');
 receipt:=public.group_activities_dispatch('event-save',owner,page,event,null,updated);
 perform pg_temp.event_source_assert(receipt#>>'{event,cancellationReason}'='  Original cancellation reason  'and(select cancellation_reason from public.group_events where id=event)='  Original cancellation reason  ','cancellation state and exact optional reason saved atomically');
 perform pg_temp.event_source_assert(public.group_event_json(event,member)->>'cancellationReason'='  Original cancellation reason  'and public.group_event_json(event,other)->>'cancellationReason'is null and public.group_event_json(event,null)->>'cancellationReason'is null,'only actual registrant/current manager sees reason, not nonregistrant or guest');
 update public.group_memberships set role='member'where page_id=page and app_user_id=owner;
 perform pg_temp.event_source_assert(public.group_event_json(event,owner)->>'cancellationReason'is null,'former manager without registration cannot read current reason');
 update public.group_memberships set role='owner'where page_id=page and app_user_id=owner;
 perform pg_temp.event_source_assert((select count(*)from public.group_event_registrations)=prior_regs and(select status from public.group_event_registrations where event_id=event and app_user_id=member)='confirmed','organizer cancellation never mutates existing registrations');
 perform pg_temp.event_source_assert(public.group_activities_dispatch('event-save',owner,page,event,null,updated)=receipt and(select count(*)from public.group_activity_receipts)=prior_receipts+1,'identical save retries replay one unchanged receipt');
 perform pg_temp.event_source_error(format('select public.group_activities_dispatch(''event-save'',%L,%L,%L,null,%L)',owner,page,event,updated||jsonb_build_object('cancellationReason','Changed')),'GROUP_ACTIVITY_CONFLICT');
 perform pg_temp.event_source_error(format('select public.group_activities_dispatch(''event-save'',%L,%L,%L,null,%L)',owner,page,event,updated||jsonb_build_object('requestId',gen_random_uuid(),'cancellationReason','Stale')),'GROUP_ACTIVITY_CONFLICT');
 perform pg_temp.event_source_assert((select cancellation_reason from public.group_events where id=event)='  Original cancellation reason  ','failed changed/stale requests leave saved reason unchanged');
 updated:=(updated-array['linkedMissionId','cancellationReason'])||jsonb_build_object('requestId',gen_random_uuid(),'expectedRevision',2);
 result:=public.group_activities_dispatch('event-save',owner,page,event,null,updated);
 perform pg_temp.event_source_assert(result#>>'{event,linkedMissionId}'=mission::text and result#>>'{event,cancellationReason}'='  Original cancellation reason  ','omitted fields preserve existing linked mission and reason');
 updated:=updated||jsonb_build_object('requestId',gen_random_uuid(),'expectedRevision',3,'linkedMissionId',null,'cancellationReason',null);result:=public.group_activities_dispatch('event-save',owner,page,event,null,updated);
 perform pg_temp.event_source_assert(result#>'{event,linkedMissionId}'='null'::jsonb and result#>'{event,cancellationReason}'='null'::jsonb,'explicit null clears both fields');
 for updated in select input||jsonb_build_object('requestId',gen_random_uuid(),'linkedMissionId',bad.value)from jsonb_array_elements(jsonb_build_array(to_jsonb(foreign_mission),to_jsonb(gen_random_uuid()),'true'::jsonb,'"bad"'::jsonb,'42'::jsonb))as bad(value) loop
  perform pg_temp.event_source_error(format('select public.group_activities_dispatch(''event-save'',%L,%L,null,null,%L)',owner,page,updated),'GROUP_ACTIVITY_INVALID');
 end loop;
 for updated in select input||jsonb_build_object('requestId',gen_random_uuid(),'cancellationReason',bad.value)from jsonb_array_elements(jsonb_build_array('true'::jsonb,'42'::jsonb,'{}'::jsonb,to_jsonb(repeat('x',1001))))as bad(value) loop
  perform pg_temp.event_source_error(format('select public.group_activities_dispatch(''event-save'',%L,%L,null,null,%L)',owner,page,updated),'GROUP_ACTIVITY_INVALID');
 end loop;
 perform pg_temp.event_source_error(format('select public.group_activities_dispatch(''event-save'',%L,%L,null,null,%L)',member,page,input||jsonb_build_object('requestId',gen_random_uuid())),'GROUP_ACTIVITY_FORBIDDEN');
 perform pg_temp.event_source_error(format('select public.group_activities_dispatch(''event-save'',null,%L,null,null,%L)',page,input||jsonb_build_object('requestId',gen_random_uuid())),'GROUP_ACTIVITY_FORBIDDEN');
 begin update public.group_events set linked_mission_id=foreign_mission where id=event;raise exception 'Cross-page FK accepted';exception when foreign_key_violation then null;end;
 perform pg_temp.event_source_assert((select linked_mission_id from public.group_events where id=event)is null,'composite actual-mission FK rejects direct cross-page writes');
end $$;
rollback;

\set ON_ERROR_STOP on
-- Runs right after the approval migration: no retroactive block, and only new rows default to pending.
do $$declare step text;old_row public.group_events;done constant uuid:='ea000000-0000-4000-8000-000000000006';draft_event jsonb;live constant uuid:='ea000000-0000-4000-8000-000000000004';draft constant uuid:='ea000000-0000-4000-8000-000000000005';page constant uuid:='ea000000-0000-4000-8000-000000000003';member constant uuid:='ea000000-0000-4000-8000-000000000002';r jsonb;begin
 if (select approval_status from public.group_events where id=live)<>'approved' then raise exception 'published event was not kept approved';end if;
 if (select approval_status from public.group_events where id=done)<>'approved' then raise exception 'cancelled event lost its approval';end if;
 if (select approval_status from public.group_events where id=draft)<>'pending' then raise exception 'unpublished draft was treated as approved';end if;
 if (select column_default from information_schema.columns where table_schema='public' and table_name='group_events' and column_name='approval_status') not like '''pending''%' then raise exception 'new events do not default to pending';end if;
 r:=public.group_activities_dispatch('event',member,page,live);
 if r#>>'{event,approvalStatus}'<>'approved' or not (r#>>'{event,ticketAvailable}')::boolean then raise exception 'existing event changed for its participant: %',r;end if;
 perform public.group_activities_dispatch('event-check-in','ea000000-0000-4000-8000-000000000001',page,live,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'qrPayload',public.group_activities_dispatch('event-ticket',member,page,live)->>'qrPayload'));
 -- The old draft must go through the queue when published, and must not be open meanwhile.
 draft_event:=public.group_activities_dispatch('event-save','ea000000-0000-4000-8000-000000000001',page,draft,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'expectedRevision',1,'title','Existing draft','description','','startsAt',now()+interval'1 day','endsAt',now()+interval'2 days','opensAt',now()-interval'1 hour','closesAt',now()+interval'1 day','location','Hall','capacity',null,'requiresApproval',false,'state','published'));
 if draft_event#>>'{event,approvalStatus}'<>'pending' or (select approval_submitted_at is null from public.group_events where id=draft) then raise exception 'published old draft skipped the queue: %',draft_event;end if;
 begin perform public.group_activities_dispatch('event-apply',member,page,draft,null,jsonb_build_object('requestId',extensions.gen_random_uuid()));raise exception 'NO_ERROR';exception when others then if sqlerrm<>'GROUP_ACTIVITY_NOT_FOUND' then raise exception 'old draft opened: %',sqlerrm;end if;end;
 -- A cancelled event nobody reviewed cannot come back through draft with its stored values.
 foreach step in array array['draft','published']loop
  select * into old_row from public.group_events where id=done;
  draft_event:=public.group_activities_dispatch('event-save','ea000000-0000-4000-8000-000000000001',page,done,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'expectedRevision',old_row.revision,'title',old_row.title,'description',old_row.description,'startsAt',old_row.starts_at,'endsAt',old_row.ends_at,'opensAt',old_row.opens_at,'closesAt',old_row.closes_at,'location',old_row.location,'capacity',old_row.capacity,'requiresApproval',old_row.requires_approval,'state',step));
  if draft_event#>>'{event,approvalStatus}'<>'pending' then raise exception 'unreviewed cancelled event skipped review at %: %',step,draft_event;end if;
 end loop;
 raise notice 'group_event_approval upgrade: existing events kept';
end $$;

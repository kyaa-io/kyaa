-- Every state and approval transition, and every state path, through the real event-save. No order of saves may open an event
-- that was not reviewed. Expected values come from the table below, not from the trigger. Disposable clean-chain DB only; rolls back.
\set ON_ERROR_STOP on
begin;
alter table public.group_events alter column approval_status set default 'pending';
alter table public.group_events enable trigger group_event_approval_requeue;
-- approved: leaving cancelled or ended for draft or published needs a new review. Everything else stays approved.
-- pending:  stays pending until a platform admin decides. No save changes that.
-- rejected: back to pending when saved as draft or published. Stays rejected while cancelled or ended.
create function pg_temp.expected(approval text,old_state text,new_state text)returns text language sql immutable as $$
 select case approval
  when'approved'then case when old_state in('cancelled','ended')and new_state in('draft','published')then'pending'else'approved'end
  when'pending'then'pending'
  when'rejected'then case when new_state in('draft','published')then'pending'else'rejected'end
 end
$$;
do $$
declare owner uuid:=extensions.gen_random_uuid();member uuid:=extensions.gen_random_uuid();admin uuid:=extensions.gen_random_uuid();allow uuid:=extensions.gen_random_uuid();page uuid:=extensions.gen_random_uuid();
 states constant text[]:=array['draft','published','cancelled','ended'];start_approval text;start_state text;depth int;seq int;step int;ev uuid;e public.group_events;r jsonb;want text;cur text;cur_state text;next_state text;paths int:=0;saves int:=0;left_terminal boolean;code int;
begin
 insert into public.app_users(id,privy_user_id,verified_email)select u,'did:privy:approval-path-'||u,u||'@example.test'from unnest(array[owner,member,admin])u;
 insert into public.admin_allowlist(id,email,role,active)values(allow,admin||'@example.test','admin',true);
 insert into public.group_pages(id,kind,name)values(page,'hobby','Transition page');
 insert into public.group_memberships(page_id,app_user_id,role)values(page,owner,'owner'),(page,member,'member');
 foreach start_approval in array array['approved','pending','rejected']loop foreach start_state in array states loop
  depth:=case when start_approval='approved'and start_state in('cancelled','ended')then 4 else 3 end;
  for seq in 0..(4^depth)::int-1 loop
   insert into public.group_events(page_id,title,description,starts_at,ends_at,opens_at,closes_at,location,capacity,requires_approval,state,created_by,approval_status,approval_reason)
    values(page,'Path','Body',now()+interval'1 day',now()+interval'2 days',now()-interval'1 day',now()+interval'1 day','Hall',10,false,start_state,owner,start_approval,case when start_approval='rejected'then'사유'end)returning * into e;
   ev:=e.id;cur:=start_approval;cur_state:=start_state;left_terminal:=false;paths:=paths+1;
   for step in 1..depth loop
    next_state:=states[1+(seq/(4^(step-1))::int)%4];
    select * into e from public.group_events where id=ev;
    r:=public.group_activities_dispatch('event-save',owner,page,ev,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'expectedRevision',e.revision,'title',e.title,'description',e.description,'startsAt',e.starts_at,'endsAt',e.ends_at,'opensAt',e.opens_at,'closesAt',e.closes_at,'location',e.location,'capacity',e.capacity,'requiresApproval',e.requires_approval,'state',next_state));saves:=saves+1;
    want:=pg_temp.expected(cur,cur_state,next_state);
    if r#>>'{event,approvalStatus}'<>want then raise exception 'start %/% seq % step %: %->% was % expected %',start_approval,start_state,seq,step,cur_state,next_state,r#>>'{event,approvalStatus}',want;end if;
    cur:=want;cur_state:=next_state;
   end loop;
   -- Whatever the path, only an approved row is open to members, and a waiting published row is in the queue.
   if cur_state='published'then
    code:=0;begin perform public.group_activities_dispatch('event',member,page,ev);exception when others then if sqlerrm<>'GROUP_ACTIVITY_NOT_FOUND'then raise;end if;code:=1;end;
    if(cur='approved')<>(code=0)then raise exception 'start %/% seq %: % published visible=%',start_approval,start_state,seq,cur,code=0;end if;
    if cur='pending'and not exists(select 1 from public.group_events where id=ev and approval_submitted_at is not null)then raise exception 'start %/% seq %: waiting row not submitted',start_approval,start_state,seq;end if;
   end if;
  end loop;
 end loop;end loop;
 if paths<>2*256+10*64 then raise exception 'walked % paths',paths;end if;

 -- The reported routes, end to end: reviewed, then cancelled or ended, then through draft. Member cannot apply until a new review.
 foreach start_state in array array['cancelled','ended']loop
  r:=public.group_activities_dispatch('event-save',owner,page,null,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'title','Route','description','Body','startsAt',now()-interval'1 hour','endsAt',now()+interval'2 hours','opensAt',now()-interval'1 day','closesAt',now()+interval'1 hour','location','Hall','capacity',10,'requiresApproval',false,'state','published'));ev:=(r#>>'{event,id}')::uuid;
  perform public.group_activities_dispatch('event-approval-review',admin,page,ev,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'action','approve','expectedRevision',1),allow);
  foreach next_state in array array[start_state,'draft','published']loop
   select * into e from public.group_events where id=ev;
   r:=public.group_activities_dispatch('event-save',owner,page,ev,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'expectedRevision',e.revision,'title',e.title,'description',e.description,'startsAt',e.starts_at,'endsAt',e.ends_at,'opensAt',e.opens_at,'closesAt',e.closes_at,'location',e.location,'capacity',e.capacity,'requiresApproval',e.requires_approval,'state',next_state));
  end loop;
  if r#>>'{event,approvalStatus}'<>'pending' then raise exception 'route via draft reopened % : %',start_state,r;end if;
  if not exists(select 1 from public.group_event_approval_audit where event_id=ev and action='requeue')then raise exception 'route left no requeue audit';end if;
  if not ev=any(select(x->>'id')::uuid from jsonb_array_elements(public.group_activities_dispatch('admin-event-approvals',admin,null,null,null,'{"limit":100}',allow)->'items')x)then
   -- The queue is ordered oldest first and the walk left many rows; read this row's queue condition directly.
   if not exists(select 1 from public.group_events where id=ev and approval_status='pending'and state='published')then raise exception 'route not queued';end if;
  end if;
  code:=0;begin perform public.group_activities_dispatch('event-apply',member,page,ev,null,jsonb_build_object('requestId',extensions.gen_random_uuid()));exception when others then if sqlerrm<>'GROUP_ACTIVITY_NOT_FOUND'then raise;end if;code:=1;end;
  if code<>1 then raise exception 'member applied after route via draft';end if;
  select * into e from public.group_events where id=ev;
  perform public.group_activities_dispatch('event-approval-review',admin,page,ev,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'action','approve','expectedRevision',e.revision),allow);
  perform public.group_activities_dispatch('event-apply',member,page,ev,null,jsonb_build_object('requestId',extensions.gen_random_uuid()));
 end loop;
 raise notice 'group_event_approval_transitions: % paths, % saves, no path skips review',paths,saves;
end $$;
rollback;

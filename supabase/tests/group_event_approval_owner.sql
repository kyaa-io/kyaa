-- Approval under an ordinary owner (not a superuser, no BYPASSRLS), the layout AWS reports: every public table and function owned
-- by one role, FORCE RLS only on the approval audit table. Without the owner policy each write below fails with 42501.
-- Disposable clean-chain DB only; everything rolls back, the role included.
\set ON_ERROR_STOP on
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required'; end if; end $$;
begin;
alter table public.group_events alter column approval_status set default 'pending';
alter table public.group_events enable trigger group_event_approval_requeue;
create role ea_fn_owner nosuperuser nobypassrls nologin;
grant usage on schema public, extensions to ea_fn_owner;
do $$declare r record;begin
 for r in select c.oid::regclass o,c.relforcerowsecurity f,c.oid from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in('r','p') and not exists(select 1 from pg_depend d where d.objid=c.oid and d.deptype='e') loop
  execute format('alter table %s owner to ea_fn_owner',r.o);
  if r.f and r.oid<>'public.group_event_approval_audit'::regclass then execute format('alter table %s no force row level security',r.o);end if;
 end loop;
 for r in select p.oid::regprocedure s from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') loop
  execute format('alter function %s owner to ea_fn_owner',r.s);
 end loop;
end $$;
do $$
declare owner uuid:=extensions.gen_random_uuid();admin uuid:=extensions.gen_random_uuid();allow uuid:=extensions.gen_random_uuid();page uuid:=extensions.gen_random_uuid();ev uuid;r jsonb;input jsonb;code text;
begin
 if (select rolsuper or rolbypassrls from pg_roles where rolname='ea_fn_owner') or not (select relforcerowsecurity from pg_class where oid='public.group_event_approval_audit'::regclass) or pg_get_userbyid((select proowner from pg_proc where oid='public.group_activities_dispatch(text,uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure))<>'ea_fn_owner' then raise exception 'layout is not an ordinary owner';end if;
 insert into public.app_users(id,privy_user_id,verified_email)select u,'did:privy:approval-owner-'||u,u||'@example.test'from unnest(array[owner,admin])u;
 insert into public.admin_allowlist(id,email,role,active)values(allow,admin||'@example.test','admin',true);
 insert into public.group_pages(id,kind,name)values(page,'hobby','Owner layout');
 insert into public.group_memberships(page_id,app_user_id,role)values(page,owner,'owner');
 input:=jsonb_build_object('title','Owner layout event','description','Body','startsAt',clock_timestamp()+interval'1 day','endsAt',clock_timestamp()+interval'2 days','opensAt',clock_timestamp()-interval'1 day','closesAt',clock_timestamp()+interval'1 day','location','Hall','capacity',10,'requiresApproval',false,'state','published');
 r:=public.group_activities_dispatch('event-save',owner,page,null,null,input||jsonb_build_object('requestId',extensions.gen_random_uuid()));ev:=(r#>>'{event,id}')::uuid;
 -- The layout is only real if the table refuses this role before the policy exists.
 if to_regprocedure('public.group_event_approval_audit_owner_access()') is not null then
  execute 'drop policy if exists '||quote_ident('group_event_approval_audit_owner_ea_fn_owner')||' on public.group_event_approval_audit';
  begin
   perform public.group_activities_dispatch('event-approval-review',admin,page,ev,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'action','approve','expectedRevision',1),allow);
   raise exception 'NO_ERROR audit accepted a write with no policy';
  exception when insufficient_privilege then null;end;
  if (select approval_status from public.group_events where id=ev)<>'pending' then raise exception 'refused decision changed the event';end if;
  perform public.group_event_approval_audit_owner_access();
 end if;
 r:=public.group_activities_dispatch('event-approval-review',admin,page,ev,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'action','approve','expectedRevision',1),allow);
 if r->>'approvalStatus'<>'approved' then raise exception 'approve: %',r;end if;
 r:=public.group_activities_dispatch('event-save',owner,page,ev,null,input||jsonb_build_object('requestId',extensions.gen_random_uuid(),'expectedRevision',1,'description','고친 설명'));
 if r#>>'{event,approvalStatus}'<>'approved' then raise exception 'description edit: %',r;end if;
 r:=public.group_activities_dispatch('event-save',owner,page,ev,null,input||jsonb_build_object('requestId',extensions.gen_random_uuid(),'expectedRevision',2,'description','고친 설명','location','Hall B'));
 if r#>>'{event,approvalStatus}'<>'pending' then raise exception 'requeue: %',r;end if;
 r:=public.group_activities_dispatch('event-approval-review',admin,page,ev,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'action','reject','reason','장소 확인','expectedRevision',3),allow);
 if r->>'approvalStatus'<>'rejected' then raise exception 'reject: %',r;end if;
 if (select array_agg(action order by created_at) from public.group_event_approval_audit where event_id=ev)<>array['approve','edit','requeue','reject'] then raise exception 'audit rows: %',(select array_agg(action order by created_at) from public.group_event_approval_audit where event_id=ev);end if;
 -- The policy is for this role alone.
 if not exists(select 1 from pg_policy p where p.polrelid='public.group_event_approval_audit'::regclass and p.polroles='{}'::oid[]||(select oid from pg_roles where rolname='ea_fn_owner')) then raise exception 'policy is not limited to the owner';end if;
 if exists(select 1 from pg_policy p where p.polrelid='public.group_event_approval_audit'::regclass and (0=any(p.polroles) or (select oid from pg_roles where rolname='service_role')=any(p.polroles) or (select oid from pg_roles where rolname='authenticated')=any(p.polroles) or (select oid from pg_roles where rolname='anon')=any(p.polroles))) then raise exception 'policy reaches another role';end if;
 if has_table_privilege('service_role','public.group_event_approval_audit','select') or has_table_privilege('authenticated','public.group_event_approval_audit','select') then raise exception 'direct audit grant';end if;
 raise notice 'group_event_approval_owner: approve, edit, requeue and reject work under an ordinary owner';
end $$;
rollback;

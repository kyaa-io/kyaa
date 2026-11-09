\set ON_ERROR_STOP on
-- B6 plan v4 S16: the B6 tables are FORCE RLS, so a function owner that is neither superuser nor BYPASSRLS needs its own policy.
-- The probe owns the access functions; it may use every table that existed before B6 (as an existing owner does), and only
-- b6_owner_access() may give it the three B6 tables. Synthetic fixtures only; everything rolls back.
do $$ begin if inet_server_addr() is not null then raise exception 'Disposable local database required'; end if; end $$;
begin;
create role b6_owner_probe nologin nosuperuser nobypassrls;
do $setup$
declare t record;f text;
begin
 execute format('grant %I to b6_owner_probe',current_user);
 for t in select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relrowsecurity
  and c.relname not in('social_dm_request_log','social_profile_return_refs','social_profile_report_snapshots') loop
  execute format('create policy b6_probe_existing on public.%I for all to b6_owner_probe using(true) with check(true)',t.relname);
 end loop;
 drop policy if exists b6_probe_existing on public.social_dm_request_log;
 foreach f in array array['public.issue_social_profile_return_ref(jsonb)','public.read_social_profile_by_ref(uuid,jsonb,public.content_locale)',
  'public.social_profile_ref_subject(uuid,jsonb)','public.scrub_social_account_on_deletion()','public.report_social_profile(uuid,jsonb,text,text,uuid)',
  'public.read_admin_content_reports(uuid,uuid,text,timestamptz,uuid,integer)','public.request_social_dm(uuid,uuid,text,uuid)',
  'public.social_dm_request_state(uuid,uuid)','public.social_dm_request_count(uuid)'] loop
  execute format('alter function %s owner to b6_owner_probe',f);
 end loop;
end $setup$;

-- Control: without its policies the check must fail.
do $control$
declare e text:='no error';u uuid:=extensions.gen_random_uuid();t uuid;
begin
 -- FORCE RLS really binds the probe: a row it may not see reads as absent.
 insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:b6o-control','b6o-control@example.test');
 insert into public.social_profile_return_refs(subject_id,expires_at)values(u,now()+interval '20 minutes') returning token into t;
 if public.read_social_profile_by_ref(null,jsonb_build_object('kind','return','token',t),'ko') is not null then raise exception 'S16 control: the probe read a row without a policy'; end if;
 begin perform public.b6_owner_check(); exception when others then e:=sqlerrm; end;
 if e not like 'B6_OWNER_GAP:%b6_owner_probe has no select policy on social_dm_request_log%' or e not like '%social_profile_return_refs%' or e not like '%social_profile_report_snapshots%' then raise exception 'S16 control: %',e; end if;
end $control$;
select public.b6_owner_access();
select public.b6_owner_check();

do $calls$
declare creator uuid:=extensions.gen_random_uuid();slug text:='b6-probe-fixture';pub uuid:=extensions.gen_random_uuid();
 author uuid:=extensions.gen_random_uuid();viewer uuid:=extensions.gen_random_uuid();admin_id uuid:=extensions.gen_random_uuid();allow uuid:=extensions.gen_random_uuid();
 u uuid;post uuid;ref jsonb;t1 uuid;r jsonb;rep uuid;
begin
 if (select pg_get_userbyid(proowner) from pg_proc where oid='public.issue_social_profile_return_ref(jsonb)'::regprocedure)<>'b6_owner_probe' then raise exception 'S16 fixture owner'; end if;
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,slug,'published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','B6 소유자','소개','사진');
 foreach u in array array[author,viewer,admin_id] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:b6o-'||u,u||'@example.test');
 end loop;
 insert into public.admin_allowlist(id,email,role)values(allow,admin_id||'@example.test','admin');
 insert into public.group_pages(id,kind,name)values(pub,'hobby','B6 probe page');
 insert into public.group_memberships(page_id,app_user_id)values(pub,author),(pub,viewer);
 post:=(public.save_fan_post(author,slug,null,'probe post','public','{}',null,extensions.gen_random_uuid())->>'id')::uuid;
 ref:=jsonb_build_object('kind','fan_post','id',post);
 -- Return refs: INSERT, SELECT (reuse, read) and DELETE (expired, deletion scrub).
 insert into public.social_profile_return_refs(subject_id,expires_at) select viewer,now()-interval '1 minute' from generate_series(1,3);
 t1:=(public.issue_social_profile_return_ref(ref)->>'returnRef')::uuid;
 if (public.issue_social_profile_return_ref(ref)->>'returnRef')::uuid<>t1 then raise exception 'S16 reuse (select)'; end if;
 if exists(select 1 from public.social_profile_return_refs where expires_at<=now()) then raise exception 'S16 delete expired'; end if;
 if public.read_social_profile_by_ref(viewer,jsonb_build_object('kind','return','token',t1),'ko')#>>'{profile,id}'<>author::text then raise exception 'S16 read return ref'; end if;
 -- Report: INSERT snapshot, admin SELECT snapshot.
 rep:=(public.report_social_profile(viewer,ref,'spam','probe',extensions.gen_random_uuid())->>'id')::uuid;
 if (select count(*) from public.social_profile_report_snapshots where report_id=rep)<>1 then raise exception 'S16 snapshot insert'; end if;
 r:=(select v from jsonb_array_elements(public.read_admin_content_reports(admin_id,allow,'open',null,null,50)->'items') v where v->>'id'=rep::text);
 if r#>>'{target,body}' not like '%probe%' then raise exception 'S16 admin snapshot select %',r; end if;
 -- Request log: INSERT and SELECT (count).
 perform public.request_social_dm(viewer,author,'probe',extensions.gen_random_uuid());
 if public.social_dm_request_count(viewer)<>1 or (select count(*) from public.social_dm_request_log where sender_id=viewer)<>1 then raise exception 'S16 log'; end if;
 if public.social_dm_request_state(viewer,author)<>'pending' then raise exception 'S16 state'; end if;
 -- Deletion scrub: DELETE.
 insert into public.account_deletion_requests(app_user_id,provider_subject)values(author,'did:privy:b6o-author');
 update public.app_users set status='disabled' where id=author;
 if exists(select 1 from public.social_profile_return_refs where subject_id=author) then raise exception 'S16 scrub delete'; end if;
end $calls$;
rollback;
\echo PASS b6_owner_probe

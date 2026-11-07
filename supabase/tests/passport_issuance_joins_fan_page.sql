\set ON_ERROR_STOP on
-- R1. The replay runs as a superuser, which hides owner grants, so the same paths run a second time with the functions under a plain owner,
-- split from the table owner the way dev keeps them. The last step applies the rollback file.
do $$ begin
 if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required'; end if;
end $$;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
 ('fb130000-0000-4000-8000-000000000011','r1-fan','draft','/images/x.png',null,'{creator}','singer');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
 select 'fb130000-0000-4000-8000-000000000011',l::public.content_locale,'R1','소개','사진' from unnest(array['ko','en']) l;
update public.celebrities set status='published',published_at=now() where id='fb130000-0000-4000-8000-000000000011';
insert into public.group_pages(id,kind,name) values('fb130000-0000-4000-8000-000000000021','hobby','R1 hobby');

create function pg_temp.page() returns uuid language sql as $$ select id from public.group_pages where celebrity_id='fb130000-0000-4000-8000-000000000011' $$;
create function pg_temp.fan(p_tag text,p_status public.app_user_status default 'active') returns uuid language sql as $$
 insert into public.app_users(privy_user_id,verified_email,status) values('did:privy:r1-'||p_tag,'r1-'||p_tag||'@example.test',p_status) returning id
$$;
create function pg_temp.issue(p_user uuid) returns void language plpgsql as $$
declare q uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); pass uuid:=gen_random_uuid(); c uuid:='fb130000-0000-4000-8000-000000000011';
 job uuid:=gen_random_uuid(); passport uuid:=gen_random_uuid(); wallet text:='0x'||substr(replace(gen_random_uuid()::text,'-','')||repeat('a',40),1,40);
begin
 insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at) values(q,c,(1000+random()*1000000)::int,'draft',null);
 insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
  select a,p_user,c,q,z.version,gen_random_uuid(),'passed',3,now() from public.celebrity_quizzes z where z.id=q;
 insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values(pass,p_user,c,a);
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(p_user,91342,wallet,'privy','embedded');
 insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
  values(job,'passport',passport,'byus:passport:v1:'||p_user||':r1-fan',1,jsonb_build_object('recipient',wallet,'celebritySlug','r1-fan','passportId','0x'||repeat('1',64)));
 insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(passport,p_user,c,pass,job);
end $$;
create function pg_temp.member(p_user uuid) returns boolean language sql as $$ select exists(select 1 from public.group_memberships where page_id=pg_temp.page() and app_user_id=p_user) $$;
create function pg_temp.refused(p_op text,p_user uuid,p_expect text) returns void language plpgsql as $$
begin
 begin
  perform public.groups_dispatch(p_op,p_user,pg_temp.page(),null,jsonb_build_object('requestId',gen_random_uuid()));
 exception when others then
  if sqlerrm<>p_expect then raise; end if;
  return;
 end;
 raise exception 'Expected refusal of % for %',p_op,p_user;
end $$;

create function pg_temp.suite(label text) returns void language plpgsql as $$
declare holder uuid:=pg_temp.fan(label||'-holder'); login uuid:=pg_temp.fan(label||'-login'); off uuid:=pg_temp.fan(label||'-off','disabled');
 v jsonb; post uuid; hobby uuid:='fb130000-0000-4000-8000-000000000021'; room record; ledger bigint;
begin
 -- Login only: reads, cannot join, cannot write, and stays out of the rooms.
 perform pg_temp.refused('join',login,'GROUPS_FORBIDDEN:passport_required');
 if pg_temp.member(login) then raise exception '% login-only joined',label; end if;
 begin
  perform public.save_fan_post(login,'r1-fan',null,'글','public','{}',null,gen_random_uuid());
  raise exception '% login-only posted',label;
 exception when others then if sqlerrm<>'FAN_WEB_FORBIDDEN' then raise; end if; end;
 for room in select id from public.group_rooms where page_id=pg_temp.page() loop
  if public.group_room_entry(login,room.id)->>'reason'<>'not_member' then raise exception '% login-only entered a room',label; end if;
 end loop;
 -- Issuing joins in the same transaction, and a membership row pays nothing beyond what issuing already paid.
 select count(*) into ledger from public.fan_score_ledger where app_user_id=holder;
 perform pg_temp.issue(holder);
 if not pg_temp.member(holder) then raise exception '% issue did not join',label; end if;
 if ledger<>(select count(*) from public.fan_score_ledger where app_user_id=holder) then raise exception '% issuing with the trigger paid points',label; end if;
 v:=public.save_fan_post(holder,'r1-fan',null,'글','public','{}',null,gen_random_uuid()); post:=(v->>'id')::uuid;
 perform public.post_fan_post_comment(holder,post,null,'댓글',gen_random_uuid());
 if not exists(select 1 from public.group_rooms where page_id=pg_temp.page() and default_key='free') then raise exception 'page has no free room'; end if;
 for room in select id,default_key from public.group_rooms where page_id=pg_temp.page() and default_key is not null loop
  if public.group_room_entry(holder,room.id)->>'reason'<>'ok' then raise exception '% holder refused from % room',label,room.default_key; end if;
 end loop;
 -- A repeated join is a no-op; there is no way out while holding the passport.
 perform public.groups_dispatch('join',holder,pg_temp.page(),null,jsonb_build_object('requestId',gen_random_uuid()));
 perform pg_temp.refused('leave',holder,'GROUPS_CONFLICT');
 -- A disabled account gets no passport and no row.
 begin
  perform pg_temp.issue(off);
 exception when others then if sqlerrm<>'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED' then raise; end if; end;
 if pg_temp.member(off) then raise exception '% disabled account joined',label; end if;
 -- Hobby pages keep the button.
 perform public.groups_dispatch('join',login,hobby,null,jsonb_build_object('requestId',gen_random_uuid()));
 perform public.groups_dispatch('leave',login,hobby);
 -- The backfill statement restores a missing row and a second run adds nothing.
 delete from public.group_memberships where page_id=pg_temp.page() and app_user_id=holder;
 for ledger in 1..2 loop
  insert into public.group_memberships(page_id,app_user_id,joined_at)
  select public.group_join_passport_page(p.celebrity_id),p.app_user_id,coalesce(p.issued_at,now())
  from public.fan_passports p join public.app_users u on u.id=p.app_user_id and u.status='active'
  where p.business_status='issued' and public.group_join_passport_page(p.celebrity_id) is not null
  on conflict(page_id,app_user_id) do nothing;
 end loop;
 if (select count(*) from public.group_memberships where page_id=pg_temp.page() and app_user_id=holder)<>1 then raise exception '% backfill row count',label; end if;
end $$;

select pg_temp.suite('super');

-- Wave stays check-in only: a passport writes no row there.
do $$ declare creator uuid; holder uuid:=pg_temp.fan('wave'); q uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); pass uuid:=gen_random_uuid(); begin
 select id into creator from public.celebrities where slug='kyaa-wave-fanpage';
 if creator is null then return; end if;
 if public.group_join_passport_page(creator) is not null then raise exception 'Wave page takes passport joins'; end if;
end $$;

-- Plain owners: functions under one role, tables under another, neither superuser nor bypassing row security.
create role r1_table_owner nosuperuser nologin;
create role r1_fn_owner nosuperuser nobypassrls nologin;
grant usage on schema public to r1_table_owner,r1_fn_owner;
grant select on public.group_pages,public.celebrities,public.fan_passports,public.group_memberships,public.group_artist_bindings,public.app_users to r1_fn_owner;
grant insert on public.group_memberships to r1_fn_owner;
grant execute on function public.group_scope_visible(uuid,uuid) to r1_fn_owner;
do $$ declare t text; begin
 foreach t in array array['group_pages','celebrities','fan_passports','group_memberships','group_artist_bindings','app_users'] loop
  execute format('create policy r1_fn_reads on public.%I for select to r1_fn_owner using (true)',t);
 end loop;
end $$;
create policy r1_fn_writes on public.group_memberships for insert to r1_fn_owner with check (true);
alter function public.group_join_passport_page(uuid) owner to r1_fn_owner;
alter function public.fan_passport_join_page_trigger() owner to r1_fn_owner;
alter function public.group_passport_membership_guard(text,uuid,uuid) owner to r1_fn_owner;
alter table public.group_memberships owner to r1_table_owner;
select pg_temp.suite('plain');

-- A dispatcher under a role that is not the applying role reaches the guard with the migration's one grant, and nothing is reachable from the API.
create role r1_dispatch_owner nosuperuser nobypassrls nologin;
grant usage on schema public to r1_dispatch_owner;
grant execute on function public.group_passport_membership_guard(text,uuid,uuid) to r1_dispatch_owner;
do $$ begin
 if has_function_privilege('r1_dispatch_owner','public.group_join_passport_page(uuid)','execute') then raise exception 'dispatch owner got more than the guard'; end if;
 if has_function_privilege('service_role','public.group_passport_membership_guard(text,uuid,uuid)','execute')
  or has_function_privilege('anon','public.fan_passport_join_page_trigger()','execute')
  or has_function_privilege('authenticated','public.group_join_passport_page(uuid)','execute') then raise exception 'R1 function reachable from the API'; end if;
end $$;

-- The revert leaves the old behaviour and keeps the rows.
\i supabase/rollback/20261213010000_passport_issuance_joins_fan_page.sql
do $$ declare login uuid:=pg_temp.fan('after-rollback'); begin
 perform public.groups_dispatch('join',login,pg_temp.page(),null,jsonb_build_object('requestId',gen_random_uuid()));
 if not pg_temp.member(login) then raise exception 'rollback did not restore the join'; end if;
 if exists(select 1 from pg_trigger where tgname='fan_passport_join_page') then raise exception 'rollback left the trigger'; end if;
end $$;

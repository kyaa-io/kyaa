do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required'; end if; end $$;
begin;
create function pg_temp.expect_draw_error(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlerrm=expected then return; else raise; end if; end; raise exception 'Expected error %',expected; end $$;
insert into public.app_users(id,privy_user_id,verified_email)
select ('91900000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'did:privy:wave-draw-'||i,'wave-draw-'||i||'@example.test' from generate_series(1,84)i;
insert into public.admin_allowlist(id,email,role,active) values
('91900000-0000-4000-8000-000000000081','wave-draw-81@example.test','admin',true),
('91900000-0000-4000-8000-000000000082','wave-draw-82@example.test','viewer',true);
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
values('91900000-0000-4000-8000-000000000090','kyaa-wave-fanpage','published','/fixture.webp',now(),'{brand}','brand');
insert into public.kyaa_wave_participants(app_user_id,name_encrypted)
select ('91900000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture' from generate_series(1,80)i;
insert into public.fan_posts(app_user_id,celebrity_id,body,visibility,idempotency_key,create_request_hash,created_at)
values('91900000-0000-4000-8000-000000000001','91900000-0000-4000-8000-000000000090','Wave draw fixture introduction','public',extensions.gen_random_uuid(),'fixture',clock_timestamp());
do $$
declare owner uuid:='91900000-0000-4000-8000-000000000001'; admin_id uuid:='91900000-0000-4000-8000-000000000081'; viewer uuid:='91900000-0000-4000-8000-000000000082'; outsider uuid:='91900000-0000-4000-8000-000000000083';
 prefs_request uuid:=extensions.gen_random_uuid(); execute_request uuid:=extensions.gen_random_uuid(); reveal_request uuid:=extensions.gen_random_uuid(); draw_id uuid; result jsonb; executed jsonb; revealed jsonb;
 candidate record; expected_key text; allocated jsonb:='{}'; loser uuid; winner uuid; signature text; i integer; ticket_count integer; audit_count integer; report_id uuid;
begin
 for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('kyaa_wave_draw_winners','read_owned_kyaa_wave_draw','save_owned_kyaa_wave_draw_preferences','read_admin_kyaa_wave_draw','execute_admin_kyaa_wave_draw','reveal_admin_kyaa_wave_draw') loop
 assert not has_function_privilege('anon',signature,'EXECUTE') and not has_function_privilege('authenticated',signature,'EXECUTE'); end loop;
 assert not has_table_privilege('service_role','public.kyaa_wave_draw_state','SELECT');
 assert not has_table_privilege('service_role','public.kyaa_wave_draw_candidates','SELECT');
 perform pg_temp.expect_draw_error(format('select public.read_owned_kyaa_wave_draw(%L)',outsider),'FAN_WEB_FORBIDDEN');
 perform pg_temp.expect_draw_error(format('select public.save_owned_kyaa_wave_draw_preferences(%L,array[''cap'',''cap'',''blue''],%L)',owner,prefs_request),'FAN_WEB_INVALID_INPUT');
 perform pg_temp.expect_draw_error(format('select public.save_owned_kyaa_wave_draw_preferences(%L,array[''cap'',''camera'',''other''],%L)',owner,prefs_request),'FAN_WEB_INVALID_INPUT');
 result:=public.save_owned_kyaa_wave_draw_preferences(owner,array['camera','meal','blue'],prefs_request);
 assert result->'result'->>'status'='pending' and result->'published'='[]'::jsonb and result->'draw'='null'::jsonb;
 assert public.save_owned_kyaa_wave_draw_preferences(owner,array['camera','meal','blue'],prefs_request)=result;
 perform pg_temp.expect_draw_error(format('select public.save_owned_kyaa_wave_draw_preferences(%L,array[''cap'',''meal'',''blue''],%L)',owner,prefs_request),'FAN_WEB_CONFLICT');
 for candidate in select app_user_id from public.kyaa_wave_participants where app_user_id<>owner loop
 perform public.save_owned_kyaa_wave_draw_preferences(candidate.app_user_id,array['camera','meal','blue'],extensions.gen_random_uuid()); end loop;
 assert (public.read_admin_kyaa_wave_draw(viewer,viewer)->>'entryCount')::integer=80;
 perform pg_temp.expect_draw_error(format('select public.execute_admin_kyaa_wave_draw(%L,%L,%L,%L)',viewer,viewer,extensions.gen_random_uuid(),execute_request),'FAN_WEB_FORBIDDEN');
 insert into public.content_reports(app_user_id,celebrity_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key)
 values(owner,'91900000-0000-4000-8000-000000000090','fan_post',extensions.gen_random_uuid(),1,'91900000-0000-4000-8000-000000000080','Fixture restriction',extensions.gen_random_uuid()) returning id into report_id;
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id) values('91900000-0000-4000-8000-000000000080',report_id,'Fixture moderation restriction',admin_id);
 select count(*) into audit_count from public.audit_logs;
 executed:=public.execute_admin_kyaa_wave_draw(admin_id,admin_id,extensions.gen_random_uuid(),execute_request);draw_id:=(executed->'draw'->>'id')::uuid;
 assert public.execute_admin_kyaa_wave_draw(admin_id,admin_id,extensions.gen_random_uuid(),execute_request)=executed;
 assert (select count(*) from public.audit_logs)=audit_count+1,'retry emits no duplicate audit';
 assert (select count(*) from public.kyaa_wave_draw_candidates)=79;
 assert (select tickets from public.kyaa_wave_draw_candidates where app_user_id=owner)>1,'completed introduction adds weight';
 assert (select min(tickets) from public.kyaa_wave_draw_candidates)<(select max(tickets) from public.kyaa_wave_draw_candidates),'varying weights exercised';
 assert not exists(select 1 from public.kyaa_wave_draw_candidates where app_user_id='91900000-0000-4000-8000-000000000080'),'restricted entrant excluded without stopping valid draw';
 assert (select count(*) from public.kyaa_wave_draw_candidates where prize_key is not null)=4,'Top3 stock exhausted';
 assert not exists(select 1 from public.kyaa_wave_draw_candidates c join public.kyaa_wave_draw_state s on s.id=c.draw_id where c.priority<>
 -ln((public.benefit_digest_uint256(extensions.digest(s.seed||pg_catalog.uuid_send(s.id)||pg_catalog.uuid_send(c.app_user_id),'sha256'))+1)/(power(2::numeric,256)+1))/c.tickets),'weighted priority exact';
 for candidate in select * from public.kyaa_wave_draw_candidates order by ordinal loop
 select count(*) into ticket_count from jsonb_array_elements(public.read_owned_kyaa_wave_missions(candidate.app_user_id)->'progress') m where m->>'status'='completed';
 assert candidate.tickets=ticket_count,'only currently completed missions weight entry';
 select p.prize_key into expected_key from unnest(candidate.preferences) with ordinality pref(key,rank) join public.kyaa_wave_draw_prizes p on p.prize_key=pref.key where coalesce((allocated->>p.prize_key)::integer,0)<p.quantity order by pref.rank limit 1;
 assert candidate.prize_key is not distinct from expected_key,'highest remaining preference';
 if expected_key is not null then allocated:=jsonb_set(allocated,array[expected_key],to_jsonb(coalesce((allocated->>expected_key)::integer,0)+1)); end if;
 end loop;
 assert not exists(select 1 from public.kyaa_wave_draw_candidates c join public.kyaa_wave_draw_candidates d on d.ordinal=c.ordinal+1 where c.priority>d.priority),'one weighted order';
 assert not exists(select 1 from public.kyaa_wave_draw_candidates group by app_user_id having count(*)>1);
 assert not exists(select 1 from public.kyaa_wave_draw_candidates c join public.kyaa_wave_draw_prizes p on p.prize_key=c.prize_key group by p.prize_key,p.quantity having count(*)>p.quantity);
 select app_user_id into loser from public.kyaa_wave_draw_candidates where prize_key is null limit 1;
 select app_user_id into winner from public.kyaa_wave_draw_candidates where prize_key='camera';
 assert public.read_owned_kyaa_wave_draw(loser)->'result'=jsonb_build_object('status','pending');
 assert public.read_owned_kyaa_wave_draw(winner)->'result'=jsonb_build_object('status','pending');
 assert public.read_owned_kyaa_wave_draw(owner)->'published'='[]'::jsonb;
 assert public.read_owned_kyaa_wave_draw(owner)::text not like '%seed%' and executed::text not like '%seed%';
 perform pg_temp.expect_draw_error(format('select public.execute_admin_kyaa_wave_draw(%L,%L,%L,%L)',admin_id,admin_id,extensions.gen_random_uuid(),extensions.gen_random_uuid()),'FAN_WEB_CONFLICT');
 perform pg_temp.expect_draw_error(format('select public.save_owned_kyaa_wave_draw_preferences(%L,array[''cap'',''meal'',''blue''],%L)',owner,extensions.gen_random_uuid()),'FAN_WEB_CONFLICT');
 perform pg_temp.expect_draw_error(format('select public.reveal_admin_kyaa_wave_draw(%L,%L,%L,%L,2,%L)',admin_id,admin_id,extensions.gen_random_uuid(),draw_id,reveal_request),'FAN_WEB_CONFLICT');
 revealed:=public.reveal_admin_kyaa_wave_draw(admin_id,admin_id,extensions.gen_random_uuid(),draw_id,1,reveal_request);
 assert public.reveal_admin_kyaa_wave_draw(admin_id,admin_id,extensions.gen_random_uuid(),draw_id,1,reveal_request)=revealed;
 assert public.reveal_admin_kyaa_wave_draw(admin_id,admin_id,extensions.gen_random_uuid(),draw_id,1,extensions.gen_random_uuid())=revealed,'already revealed index is harmless with a new request';
 assert (select count(*) from public.audit_logs)=audit_count+2;
 perform pg_temp.expect_draw_error(format('select public.reveal_admin_kyaa_wave_draw(%L,%L,%L,%L,2,%L)',admin_id,admin_id,extensions.gen_random_uuid(),draw_id,reveal_request),'FAN_WEB_CONFLICT');
 for i in 2..9 loop perform public.reveal_admin_kyaa_wave_draw(admin_id,admin_id,extensions.gen_random_uuid(),draw_id,i,extensions.gen_random_uuid());end loop;
 assert public.read_owned_kyaa_wave_draw(loser)->'result'->>'status'='pending','loser hidden through9';
 assert public.read_owned_kyaa_wave_draw(winner)->'result'->>'prizeKey'='camera';
 insert into public.user_blocks(app_user_id,blocked_app_user_id) values(loser,winner);
 assert public.read_owned_kyaa_wave_draw(loser)->'published'->7->'winners'='[]'::jsonb,'blocked winner omitted';
 delete from public.user_blocks where app_user_id=loser and blocked_app_user_id=winner;
 update public.app_users set status='disabled' where id=winner;
 assert not exists(select 1 from public.kyaa_wave_draw_requests where actor_id=winner and operation='preferences'),'disable erases cached preferences';
 assert exists(select 1 from public.kyaa_wave_draw_candidates where app_user_id=winner and prize_key='camera'),'disable preserves slot';
 assert public.kyaa_wave_draw_winners(null,10)->7->'winners'->0->>'nickname'='팬';
 perform public.reveal_admin_kyaa_wave_draw(admin_id,admin_id,extensions.gen_random_uuid(),draw_id,10,extensions.gen_random_uuid());
 assert public.read_owned_kyaa_wave_draw(loser)->'result'->>'status'='not_won';
 if owner<>winner then
 update public.fan_posts set hidden_at=clock_timestamp() where app_user_id=owner;
 assert (public.read_owned_kyaa_wave_draw(owner)->>'tickets')::integer=(select tickets from public.kyaa_wave_draw_candidates where app_user_id=owner),'draw tickets frozen after mission evidence changes'; end if;
 assert not exists(select 1 from public.audit_logs where action like 'kyaa_wave.draw_%' and (before_after_summary::text like '%seed%' or before_after_summary::text like '%preferences%'));
end $$;
rollback;
\echo 'Wave draw SQL assertions passed'

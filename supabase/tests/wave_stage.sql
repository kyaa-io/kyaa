begin;
create function pg_temp.check_true(value boolean,label text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'ASSERTION_FAILED: %',label; end if; end $$;
create function pg_temp.expect_error(p_sql text,p_message text) returns void language plpgsql as $$ begin execute p_sql; raise exception 'EXPECTED_ERROR_NOT_RAISED: %',p_message; exception when others then if sqlerrm='EXPECTED_ERROR_NOT_RAISED: '||p_message or position(p_message in sqlerrm)=0 then raise; end if; end $$;
do $$ declare actor uuid:='92900000-0000-4000-8000-000000000001'; admin uuid:='92900000-0000-4000-8000-000000000002'; key uuid:=extensions.gen_random_uuid(); result jsonb; replay jsonb; fan uuid:=md5('wave-stage-fixture:1')::uuid; asset uuid:=extensions.gen_random_uuid(); collection uuid; old_closes timestamptz[];
begin
 perform pg_temp.check_true((select count(*)=22 from public.benefit_cheer_entries where campaign_id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe')),'22 upgrade entries preserved');
 perform pg_temp.check_true((select count(*)=3 and sum(winner_quantity)=30 from public.live_benefit_campaign_items where draw_enabled and campaign_id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe')),'three approved prizes only');
 perform pg_temp.check_true((select publication_status='draft' from public.benefits where id='29a1f87a-1632-4851-9e38-de3d350cfcfa'),'Starbucks retained privately');
 perform pg_temp.check_true(not has_function_privilege('authenticated','public.execute_admin_wave_stage_draw(uuid,uuid,uuid,uuid,integer,integer)','execute'),'direct member draw denied');
 perform pg_temp.check_true(not has_table_privilege('service_role','public.cheer_photocard_entitlements','select'),'entitlements deny direct access');
 update public.admin_allowlist set role='viewer' where id=admin;
 perform pg_temp.check_true(public.read_admin_wave_stage(actor,admin) is not null,'viewer may read stage');
 perform pg_temp.expect_error(format('select public.execute_admin_wave_stage_draw(%L,%L,%L,%L,5,5)',actor,admin,key,key),'viewer is read-only');
 update public.admin_allowlist set role='admin' where id=admin;
 result:=public.read_admin_wave_stage(actor,admin);
 perform pg_temp.check_true(jsonb_array_length(result->'stage'->'creators')=2,'two creators');
 perform pg_temp.check_true(result->'stage'->'draw'='null'::jsonb,'unexecuted stage');
 perform pg_temp.expect_error(format('select public.execute_admin_wave_stage_draw(%L,%L,%L,%L,4,5)',actor,admin,key,key),'FAN_WEB_CONFLICT');
 perform pg_temp.check_true(not exists(select 1 from public.benefit_draws where campaign_id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe')),'stale request creates no draw');
 select id into collection from public.cheer_photocard_collections where campaign_id='aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb';
 -- Legacy all-mode remains covered independently of the two bundle campaigns.
 update public.cheer_photocard_collections set distribution_mode='all' where id=collection;
 insert into public.cheer_photocard_assets(id,collection_id,storage_path,width,height,content_type,position) values(asset,collection,'wave-stage/changha/original.webp',1200,1600,'image/webp',0);
 result:=public.read_celebrity_cheer_event_rewards('changha',fan,'ko');
 perform pg_temp.check_true((result->'event'->'photocard'->>'eligible')::boolean and jsonb_array_length(result->'event'->'photocard'->'assets')=1,'owner sees private asset metadata');
 perform pg_temp.check_true(not result::text like '%storagePath%' and not result::text like '%original.webp%','public metadata excludes original path');
 perform pg_temp.check_true(jsonb_array_length(public.read_celebrity_cheer_event_rewards('changha',null,'ko')->'event'->'photocard'->'assets')=0,'anonymous gets no asset ids');
 perform pg_temp.check_true(public.authorize_cheer_photocard_read(actor,asset) is null,'nonparticipant cannot read original');
 perform pg_temp.check_true(public.authorize_cheer_photocard_read(fan,asset)->>'watermarkCode' ~ '^[A-Z0-9]{12}$','owned asset has watermark code');
 update public.app_users set status='disabled' where id=fan;
 perform pg_temp.check_true(public.authorize_cheer_photocard_read(fan,asset) is null,'inactive participant cannot read original');
 update public.app_users set status='active' where id=fan;
 -- Empty and standalone partial states fail without automatic repair.
 begin
  update public.app_users set status='disabled' where id in(select app_user_id from public.benefit_cheer_entries where campaign_id='c3930f7f-bd2b-4e58-8cec-b3c61f8463fe');
  perform pg_temp.expect_error(format('select public.execute_admin_wave_stage_draw(%L,%L,%L,%L,5,5)',actor,admin,key,key),'WAVE_STAGE_EMPTY_CAMPAIGN');
  raise exception 'ROLLBACK_EMPTY_FIXTURE';
 exception when others then if sqlerrm<>'ROLLBACK_EMPTY_FIXTURE' then raise; end if; end;
 begin
  perform public.execute_admin_cheer_event_draw(actor,admin,key,'aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb',key,5);
  perform pg_temp.check_true((public.read_admin_wave_stage(actor,admin)->'stage'->>'drawConflict')::boolean,'standalone draw signals conflict');
  perform pg_temp.expect_error(format('select public.execute_admin_wave_stage_draw(%L,%L,%L,%L,5,5)',actor,admin,key,key),'FAN_WEB_CONFLICT');
  raise exception 'ROLLBACK_STANDALONE_FIXTURE';
 exception when others then if sqlerrm<>'ROLLBACK_STANDALONE_FIXTURE' then raise; end if; end;
 perform pg_temp.check_true(jsonb_array_length(public.get_owned_raffles(fan,'ko')->'items')=3,'owned catalog excludes disabled Starbucks');
 perform pg_temp.check_true(public.get_owned_benefit_entry_state(fan,'29a1f87a-1632-4851-9e38-de3d350cfcfa') is null,'disabled owned entry state absent');
 perform pg_temp.check_true(jsonb_array_length(public.read_celebrity_cheer_event('changha',fan,'ko')->'event'->'prizes')=2,'legacy event excludes disabled Starbucks');
 perform pg_temp.check_true((select fulfillment_method='digital' from public.live_benefit_campaign_items where benefit_id='adf58d92-c330-4e37-a4bf-6acbdd027a80'),'coffee chat needs no recipient form');
 perform pg_temp.check_true((select count(*)=2 from public.raffle_fulfillment_policies where version='fixture-v1'),'immutable old policies preserved');
 -- A forced error publishing the second campaign must roll back both draws and cutoffs.
 select array_agg(entry_closes_at order by id) into old_closes from public.live_benefit_campaigns where id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe');
end $$;
create function pg_temp.reject_second_publication() returns trigger language plpgsql as $$ begin if new.campaign_id='c3930f7f-bd2b-4e58-8cec-b3c61f8463fe' then raise exception 'TEST_SECOND_PUBLICATION_FAILURE'; end if; return new; end $$;
create trigger test_wave_stage_rollback before insert on public.benefit_draw_publications for each row execute function pg_temp.reject_second_publication();
select pg_temp.expect_error($q$select public.execute_admin_wave_stage_draw('92900000-0000-4000-8000-000000000001','92900000-0000-4000-8000-000000000002',gen_random_uuid(),gen_random_uuid(),5,5)$q$,'TEST_SECOND_PUBLICATION_FAILURE');
select pg_temp.check_true(not exists(select 1 from public.benefit_draws where campaign_id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe')),'atomic rollback restores both draws');
select pg_temp.check_true((select bool_and(revision=5 and entry_closes_at>clock_timestamp()) from public.live_benefit_campaigns where id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe')),'atomic rollback restores cutoffs and revisions');
drop trigger test_wave_stage_rollback on public.benefit_draw_publications;
do $$ declare key uuid:=extensions.gen_random_uuid(); result jsonb; replay jsonb; begin
 result:=public.execute_admin_wave_stage_draw('92900000-0000-4000-8000-000000000001','92900000-0000-4000-8000-000000000002',key,key,5,5);
 perform pg_temp.check_true(jsonb_array_length(result->'stage'->'draw'->'winners')=21,'undersubscribed coffee chat selects 11; hotel selects 5 each');
 perform pg_temp.check_true(result->'stage'->'draw'->>'executedAt'=result->'stage'->'draw'->>'publishedAt','single draw publication timestamp');
 perform pg_temp.check_true((select count(distinct executed_at)=1 from public.benefit_draws where campaign_id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe')),'same captured timestamp both campaigns');
 replay:=public.execute_admin_wave_stage_draw('92900000-0000-4000-8000-000000000001','92900000-0000-4000-8000-000000000002',key,key,5,5);
 perform pg_temp.check_true(replay->'stage'->'draw'=result->'stage'->'draw','old revision same key replay');
 perform pg_temp.expect_error($q$select public.execute_admin_wave_stage_draw('92900000-0000-4000-8000-000000000001','92900000-0000-4000-8000-000000000002',gen_random_uuid(),gen_random_uuid(),6,6)$q$,'FAN_WEB_CONFLICT');
 perform pg_temp.check_true(not (result::text ~ '(appUserId|email|phone|wallet|coupon|storagePath)'),'stage excludes private identifiers');
end $$;
rollback;

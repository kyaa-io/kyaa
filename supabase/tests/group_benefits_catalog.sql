\set ON_ERROR_STOP on
-- Rollback-only catalog contract on a disposable local database.
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
\ir group_scope_fixture.sql
create function pg_temp.catalog_assert(ok boolean,message text)returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL %',message;end if;raise notice 'PASS %',message;end $$;
create function pg_temp.catalog_error(statement text,expected text)returns void language plpgsql as $$begin begin execute statement;exception when others then if sqlerrm=expected then return;end if;raise;end;raise exception 'Expected %',expected;end $$;
do $$declare admin uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();page uuid:=gen_random_uuid();hidden_page uuid:=gen_random_uuid();creator uuid:=gen_random_uuid();fan_page uuid:=gen_random_uuid();photo uuid:=gen_random_uuid();survey uuid:=gen_random_uuid();draft uuid:=gen_random_uuid();hidden uuid:=gen_random_uuid();archived uuid:=gen_random_uuid();raffle uuid:=gen_random_uuid();closed_raffle uuid:=gen_random_uuid();hidden_raffle uuid:=gen_random_uuid();result jsonb;next_result jsonb;new_id uuid;wave_page uuid;wave_mission uuid:=gen_random_uuid();before_count bigint;begin
 insert into public.app_users(id,privy_user_id,verified_email)values(actor,'did:privy:catalog-'||actor,actor||'@example.test'),(outsider,'did:privy:catalog-'||outsider,outsider||'@example.test');
 insert into public.admin_allowlist(id,email,role,active)values(admin,actor||'@example.test','admin',true);
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role,archived_at,archived_by_admin_allowlist_id,archive_reason)values(creator,'catalog-'||creator,'published','/fixture.webp',now(),'{creator}','creator',now(),admin,'Archived catalog fixture');
 insert into public.group_pages(id,kind,name,status,celebrity_id)values(page,'hobby','Published group','published',null),(hidden_page,'hobby','Hidden group','hidden',null),(fan_page,'fan','Creator group','published',creator);
 insert into public.group_missions(id,page_id,title,instructions,state,submission_kind,survey_question,survey_options)values(photo,page,'Photo','Published instructions','published','photo',null,null),(survey,page,'Survey','Published survey','published','survey','Question','["A","B","C"]'),(draft,page,'Draft','Private draft','draft','photo',null,null),(hidden,hidden_page,'Hidden','Private hidden','published','photo',null,null),(archived,fan_page,'Creator photo','Visible until archive','published','photo',null,null);
 insert into public.group_missions(page_id,title,instructions,state,submission_kind)values(page,'Text excluded','Text','published','text'),(page,'Closed excluded','Closed','closed','photo');
 insert into public.group_raffles(id,page_id,title,winner_quantity,per_user_limit,opens_at,closes_at,submission_days,fulfillment_method,created_by)values(raffle,page,'Open raffle',1,1,now()-interval'1 hour',now()+interval'1 hour',7,'on_site_pickup',actor),(closed_raffle,page,'Closed raffle',1,1,now()-interval'2 hour',now()-interval'1 hour',7,'on_site_pickup',actor),(hidden_raffle,hidden_page,'Hidden raffle',1,1,now()-interval'1 hour',now()+interval'1 hour',7,'on_site_pickup',actor);
 update public.group_missions set image_url='javascript:alert(1)'where id=photo;
 select count(*)into before_count from public.group_mission_submissions;
 result:=public.read_group_benefits_catalog('missions',null);
 perform pg_temp.catalog_assert(exists(select 1 from jsonb_array_elements(result->'items')x where x->>'id'=photo::text)and exists(select 1 from jsonb_array_elements(result->'items')x where x->>'id'=survey::text)and not exists(select 1 from jsonb_array_elements(result->'items')x where x->>'id'in(draft::text,hidden::text)),'guest sees only accessible published photo/survey missions');
 perform pg_temp.catalog_assert((select x->>'rewardPoints'='0'and x->>'status'='published'and x->>'imageUrl'is null and x-array['id','pageId','pageName','title','description','imageUrl','status','submissionKind','rewardPoints','href']='{}'::jsonb from jsonb_array_elements(result->'items')x where x->>'id'=photo::text),'zero reward remains zero and projection excludes private/policy/participation fields');
 perform pg_temp.catalog_assert(public.read_group_benefits_catalog('missions',actor)=result and public.read_group_benefits_catalog('missions',outsider)=result,'active members and nonmembers share public visibility without participation promises');

 result:=public.read_group_benefits_catalog('missions',null);perform pg_temp.catalog_assert(not exists(select 1 from jsonb_array_elements(result->'items')x where x->>'id'=archived::text),'archived creator content excluded by existing scope visibility');
 perform pg_temp.catalog_error(format('select public.read_group_benefits_catalog(''missions'',null,%L)',hidden),'GROUP_BENEFITS_NOT_FOUND');
 perform pg_temp.catalog_error(format('select public.read_group_benefits_catalog(''missions'',null,%L)',draft),'GROUP_BENEFITS_NOT_FOUND');
 perform pg_temp.catalog_error(format('select public.read_group_benefits_catalog(''missions'',null,%L)',raffle),'GROUP_BENEFITS_NOT_FOUND');
 perform pg_temp.catalog_error(format('select public.read_group_benefits_catalog(''missions'',null,%L)',gen_random_uuid()),'GROUP_BENEFITS_NOT_FOUND');
 result:=public.read_group_benefits_catalog('raffles',null);perform pg_temp.catalog_assert(exists(select 1 from jsonb_array_elements(result->'items')x where x->>'id'=raffle::text and x->>'status'='open')and not exists(select 1 from jsonb_array_elements(result->'items')x where x->>'id'in(hidden_raffle::text,closed_raffle::text)),'raffles independently exclude closed and hidden targets');
 update public.group_raffles set cancelled_at=now()where id=raffle;
 perform pg_temp.catalog_error(format('select public.read_group_benefits_catalog(''raffles'',null,%L)',raffle),'GROUP_BENEFITS_NOT_FOUND');
 insert into public.group_missions(page_id,title,instructions,state,submission_kind)select page,'Pagination '||n,'Published','published','photo'from generate_series(1,31)n;
 result:=public.read_group_benefits_catalog('missions',actor);perform pg_temp.catalog_assert(jsonb_array_length(result->'items')=30 and result->>'nextCursor'is not null,'global mission pagination returns thirty plus a continuation');
 next_result:=public.read_group_benefits_catalog('missions',actor,(result->>'nextCursor')::uuid,30);perform pg_temp.catalog_assert(not exists(select 1 from jsonb_array_elements(result->'items')a join jsonb_array_elements(next_result->'items')b on a->>'id'=b->>'id')and jsonb_array_length(next_result->'items')>=3,'next mission page retains remaining rows without overlap');
 insert into public.group_raffles(page_id,title,winner_quantity,per_user_limit,opens_at,closes_at,submission_days,fulfillment_method,created_by)select page,'Future raffle '||n,1,1,now()+interval'1 hour',now()+interval'2 hour',7,'on_site_pickup',actor from generate_series(1,31)n;
 result:=public.read_group_benefits_catalog('raffles',actor);next_result:=public.read_group_benefits_catalog('raffles',actor,(result->>'nextCursor')::uuid,30);
 perform pg_temp.catalog_assert(jsonb_array_length(result->'items')=30 and jsonb_array_length(next_result->'items')>=1 and not exists(select 1 from jsonb_array_elements(result->'items')a join jsonb_array_elements(next_result->'items')b on a->>'id'=b->>'id'),'raffle cursor independently retains preparing entries without overlap');
 perform pg_temp.catalog_error(format('select public.read_group_benefits_catalog(''raffles'',null,%L)',photo),'GROUP_BENEFITS_NOT_FOUND');
 wave_page:=pg_temp.group_scope_fixture(actor,false);
 insert into public.group_missions(id,page_id,title,instructions,state,submission_kind)values(wave_mission,wave_page,'Restricted scope','Published scope instruction','published','photo');
 result:=public.read_group_benefits_catalog('missions',actor);perform pg_temp.catalog_assert(not exists(select 1 from jsonb_array_elements(result->'items')x where x->>'id'=wave_mission::text),'membership alone does not bypass WAVE scope access');
 perform pg_temp.catalog_error(format('select public.read_group_benefits_catalog(''missions'',null,%L)',wave_mission),'GROUP_BENEFITS_NOT_FOUND');
 perform pg_temp.catalog_error(format('select public.read_group_benefits_catalog(''missions'',%L,%L)',actor,wave_mission),'GROUP_BENEFITS_NOT_FOUND');
 perform pg_temp.group_scope_fixture(actor,true);
 result:=public.read_group_benefits_catalog('missions',actor,wave_mission,30);perform pg_temp.catalog_assert(result->>'kind'='missions','existing WAVE checked-in scope makes its cursor accessible');
 perform pg_temp.catalog_error('select public.read_group_benefits_catalog(''missions'',null,null,31)','GROUP_BENEFITS_INVALID');
 perform pg_temp.catalog_error('select public.read_group_benefits_catalog(''unknown'')','GROUP_BENEFITS_INVALID');
 perform pg_temp.catalog_error(format('select public.read_group_benefits_catalog(''missions'',%L)',gen_random_uuid()),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 perform pg_temp.catalog_assert((select count(*)from public.group_mission_submissions)=before_count,'discovery creates no submissions');
 perform pg_temp.catalog_assert(not has_function_privilege('anon','public.read_group_benefits_catalog(text,uuid,uuid,integer)','EXECUTE')and not has_function_privilege('authenticated','public.read_group_benefits_catalog(text,uuid,uuid,integer)','EXECUTE')and has_function_privilege('service_role','public.read_group_benefits_catalog(text,uuid,uuid,integer)','EXECUTE'),'catalog RPC remains service-role-only');
end $$;
rollback;

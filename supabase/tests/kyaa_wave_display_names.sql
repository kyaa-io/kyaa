-- Synthetic identities are used only in the disposable local assertion database.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required'; end if; end $$;
begin;
insert into public.app_users(id,privy_user_id,verified_email)
select ('92000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'did:privy:wave-names-'||i,'wave-names-'||i||'@example.test' from generate_series(1,4)i;
insert into public.admin_allowlist(id,email,role,active) values('92000000-0000-4000-8000-000000000004','wave-names-4@example.test','admin',true);
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
('92000000-0000-4000-8000-000000000010','kyaa-wave-fanpage','published','/fixture.webp',now(),'{brand}','brand'),
('92000000-0000-4000-8000-000000000011','wave-names-other','published','/fixture.webp',now(),'{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
('92000000-0000-4000-8000-000000000010','ko','Wave QA','QA','QA'),('92000000-0000-4000-8000-000000000011','ko','Other QA','QA','QA');
insert into public.kyaa_wave_participants(app_user_id,name_encrypted)
select ('92000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture' from generate_series(1,2)i;
insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash) values
('92000000-0000-4000-8000-000000000020','92000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000002','Wave post','public',gen_random_uuid(),'fixture'),
('92000000-0000-4000-8000-000000000021','92000000-0000-4000-8000-000000000011','92000000-0000-4000-8000-000000000002','Other post','public',gen_random_uuid(),'fixture');
insert into public.fan_post_comments(id,post_id,app_user_id,body,idempotency_key) values
('92000000-0000-4000-8000-000000000022','92000000-0000-4000-8000-000000000020','92000000-0000-4000-8000-000000000002','comment',gen_random_uuid());
insert into public.fan_lounge_messages(id,celebrity_id,app_user_id,body,idempotency_key,reply_to_id) values
('92000000-0000-4000-8000-000000000030','92000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000002','cheer',gen_random_uuid(),null),
('92000000-0000-4000-8000-000000000031','92000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000002','reply',gen_random_uuid(),'92000000-0000-4000-8000-000000000030');
insert into public.fan_clips(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash) values
('92000000-0000-4000-8000-000000000040','92000000-0000-4000-8000-000000000010','92000000-0000-4000-8000-000000000002','album','public',gen_random_uuid(),repeat('a',64));
insert into public.fan_clip_comments(id,clip_id,app_user_id,body,idempotency_key) values
('92000000-0000-4000-8000-000000000041','92000000-0000-4000-8000-000000000040','92000000-0000-4000-8000-000000000002','album comment',gen_random_uuid());
insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at) values
('92000000-0000-4000-8000-000000000050','92000000-0000-4000-8000-000000000010','names-fixture','published',now(),now());
insert into public.celebrity_notice_comments(id,notice_id,app_user_id,body,idempotency_key) values
('92000000-0000-4000-8000-000000000051','92000000-0000-4000-8000-000000000050','92000000-0000-4000-8000-000000000002','notice comment',gen_random_uuid());
insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)
values('92000000-0000-4000-8000-000000000050','ko','Fixture','{"type":"doc","content":[]}');
do $$
declare viewer uuid:='92000000-0000-4000-8000-000000000001'; author uuid:='92000000-0000-4000-8000-000000000002'; outsider uuid:='92000000-0000-4000-8000-000000000003'; admin_id uuid:='92000000-0000-4000-8000-000000000004'; refs jsonb; names jsonb;
begin
 assert not has_function_privilege('anon','public.read_kyaa_wave_display_names(uuid,jsonb,uuid)','execute');
 assert not has_function_privilege('authenticated','public.read_kyaa_wave_display_names(uuid,jsonb,uuid)','execute');
 assert has_function_privilege('service_role','public.read_kyaa_wave_display_names(uuid,jsonb,uuid)','execute');
 refs:='[{"kind":"fan_post","id":"92000000-0000-4000-8000-000000000020"},{"kind":"fan_post","id":"92000000-0000-4000-8000-000000000021"},{"kind":"fan_post_comment","id":"92000000-0000-4000-8000-000000000022"},{"kind":"cheer","id":"92000000-0000-4000-8000-000000000030"},{"kind":"cheer","id":"92000000-0000-4000-8000-000000000031"},{"kind":"fan_clip","id":"92000000-0000-4000-8000-000000000040"},{"kind":"fan_clip_comment","id":"92000000-0000-4000-8000-000000000041"},{"kind":"notice_comment","id":"92000000-0000-4000-8000-000000000051"}]';
 assert public.read_kyaa_wave_display_names(null,refs)='[]'::jsonb,'anonymous cannot resolve';
 assert public.read_kyaa_wave_display_names(outsider,refs)='[]'::jsonb,'unchecked account cannot resolve';
 names:=public.read_kyaa_wave_display_names(viewer,refs);
 assert jsonb_array_length(names)=7,names::text;
 assert not exists(select 1 from jsonb_array_elements(names)x where x->>'appUserId'<>author::text),'correct author only';
 assert public.read_kyaa_wave_display_names(viewer,jsonb_build_array(jsonb_build_object('kind','self','id',author)))='[]'::jsonb,'self cannot select another receipt';
 assert jsonb_array_length(public.read_kyaa_wave_display_names(viewer,jsonb_build_array(jsonb_build_object('kind','self','id',viewer))))=1;
 assert public.read_kyaa_wave_display_names(admin_id,refs,admin_id)='[]'::jsonb,'admin scope excludes normal social identities';
 begin perform public.read_kyaa_wave_display_names(viewer,refs,admin_id); raise exception 'wrong admin allowed'; exception when others then if sqlerrm<>'active admin required' then raise; end if; end;
 update public.celebrity_notice_comments set is_official=true where id='92000000-0000-4000-8000-000000000051';
 assert jsonb_array_length(public.read_kyaa_wave_display_names(viewer,refs))=6,'official display preserved';
 update public.fan_lounge_messages set removed_at=now() where id='92000000-0000-4000-8000-000000000030';
 assert jsonb_array_length(public.read_kyaa_wave_display_names(viewer,refs))=4,'removed parent hides own and reply identity';
 perform public.block_social_profile(viewer,author,gen_random_uuid());
 assert public.read_kyaa_wave_display_names(viewer,refs)='[]'::jsonb,'bilateral block enforced';
 perform public.unblock_social_profile(viewer,author);
 update public.kyaa_wave_draw_state set id='92000000-0000-4000-8000-000000000060',seed=decode(repeat('a',64),'hex'),executed_at=now(),revealed_through=1 where singleton;
 insert into public.kyaa_wave_draw_candidates(draw_id,app_user_id,preferences,tickets,priority,ordinal,prize_key) values
 ('92000000-0000-4000-8000-000000000060',author,array['tshirt','cap','camera'],1,1,1,'tshirt'),
 ('92000000-0000-4000-8000-000000000060',viewer,array['tshirt','cap','camera'],1,2,2,'cap');
 names:=public.kyaa_wave_draw_winners(viewer,1);
 assert names#>>'{0,winners,0,__waveNameReference}'='92000000-0000-4000-8000-000000000060:'||author::text,'stable candidate captured in original snapshot';
 assert jsonb_array_length(public.read_kyaa_wave_display_names(viewer,jsonb_build_array(jsonb_build_object('kind','draw','id','92000000-0000-4000-8000-000000000060:'||author::text))))=1;
 assert public.read_kyaa_wave_display_names(viewer,jsonb_build_array(jsonb_build_object('kind','draw','id','92000000-0000-4000-8000-000000000060:'||viewer::text)))='[]'::jsonb,'unrevealed winner withheld';
 assert jsonb_array_length(public.read_kyaa_wave_display_names(admin_id,jsonb_build_array(jsonb_build_object('kind','draw','id','92000000-0000-4000-8000-000000000060:'||viewer::text)),admin_id))=1,'authorized admin may inspect draw';
 perform public.block_social_profile(viewer,author,gen_random_uuid());
 assert public.read_kyaa_wave_display_names(viewer,jsonb_build_array(jsonb_build_object('kind','draw','id','92000000-0000-4000-8000-000000000060:'||author::text)))='[]'::jsonb,'blocked first winner cannot remap to second winner';
 perform public.unblock_social_profile(viewer,author);
 update public.app_users set status='disabled' where id=author;
 assert public.read_kyaa_wave_display_names(viewer,refs)='[]'::jsonb,'disabled author anonymized';
 begin perform public.read_kyaa_wave_display_names(viewer,(select jsonb_agg(jsonb_build_object('kind','profile','id',author)) from generate_series(1,501))); raise exception 'over-limit input allowed'; exception when others then if sqlerrm<>'FAN_WEB_INVALID_INPUT' then raise; end if; end;
 begin perform public.read_kyaa_wave_display_names(viewer,'{}'); raise exception 'unbounded input allowed'; exception when others then if sqlerrm<>'FAN_WEB_INVALID_INPUT' then raise; end if; end;
end $$;
set local role service_role;
select public.read_kyaa_wave_display_names('92000000-0000-4000-8000-000000000001','[]');
reset role;
rollback;

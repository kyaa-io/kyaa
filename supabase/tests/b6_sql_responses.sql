\set ON_ERROR_STOP on
-- Real answers of the SQL behind the B6 routes (plan v4 §10.2). Fixed ids; times and generated ids are replaced so the output is stable.
-- scripts/verify-b6-sql-responses.sh sends them through the real routes and compares them with the committed copy.
\set QUIET on
begin;
do $$
declare creator uuid:='7d000000-0000-4000-8000-0000000000c0';page uuid:='7d000000-0000-4000-8000-0000000000aa';
 viewer uuid:='7d000000-0000-4000-8000-000000000001';author uuid:='7d000000-0000-4000-8000-000000000002';empty uuid:='7d000000-0000-4000-8000-000000000003';
 recipient uuid:='7d000000-0000-4000-8000-000000000004';gone uuid:='7d000000-0000-4000-8000-000000000005';admin_id uuid:='7d000000-0000-4000-8000-000000000006';u uuid;r jsonb;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'b6-response','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','응답 크리에이터','소개','사진'),(creator,'en','Response creator','Summary','Photo');
 insert into public.group_pages(id,kind,name)values(page,'hobby','B6 response page');
 foreach u in array array[viewer,author,empty,recipient,gone,admin_id] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:b6s-'||u,u||'@example.test');
  if u<>empty then insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'s'||right(u::text,1),'s'||right(u::text,1)); end if;
  insert into public.group_memberships(page_id,app_user_id)values(page,u);
 end loop;
 insert into public.admin_allowlist(id,email,role)values('7d000000-0000-4000-8000-0000000000ad',admin_id||'@example.test','admin');
 insert into public.fan_profile_public_fields(app_user_id,favorite_celebrity_id,sns_links,bio)values(author,creator,'{https://example.test/s2}','응답 소개');
 insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash)values
  ('7d000000-0000-4000-8000-0000000000e1',creator,author,'response post','public',extensions.gen_random_uuid(),repeat('b',64)),
  ('7d000000-0000-4000-8000-0000000000e3',creator,empty,'empty user post','public',extensions.gen_random_uuid(),repeat('c',64));
 -- viewer asks recipient, recipient declines; viewer blocks an account that is then deleted.
 r:=public.request_social_dm(viewer,recipient,'response request','7d000000-0000-4000-8000-0000000000d1');
 perform public.resolve_social_dm(recipient,(r->>'id')::uuid,'reject',extensions.gen_random_uuid());
 perform public.block_social_profile(viewer,gone,extensions.gen_random_uuid());
 insert into public.account_deletion_requests(app_user_id,provider_subject)values(gone,'did:privy:b6s-gone');
 update public.app_users set status='disabled' where id=gone;
 perform public.report_social_profile(viewer,jsonb_build_object('kind','fan_post','id','7d000000-0000-4000-8000-0000000000e1'),'spam','응답 상세','7d000000-0000-4000-8000-0000000000d2');
end $$;
\t on
\a
select regexp_replace(regexp_replace(jsonb_pretty(jsonb_build_object(
  'by_ref_signed_in',public.read_social_profile_by_ref('7d000000-0000-4000-8000-000000000001',jsonb_build_object('kind','fan_post','id','7d000000-0000-4000-8000-0000000000e1'),'ko'),
  'by_ref_signed_out',public.read_social_profile_by_ref(null,jsonb_build_object('kind','fan_post','id','7d000000-0000-4000-8000-0000000000e1'),'ko'),
  'by_ref_empty_user_signed_out',public.read_social_profile_by_ref(null,jsonb_build_object('kind','fan_post','id','7d000000-0000-4000-8000-0000000000e3'),'en'),
  'by_ref_empty_user_signed_in',public.read_social_profile_by_ref('7d000000-0000-4000-8000-000000000001',jsonb_build_object('kind','fan_post','id','7d000000-0000-4000-8000-0000000000e3'),'ko'),
  'return_ref',public.issue_social_profile_return_ref(jsonb_build_object('kind','fan_post','id','7d000000-0000-4000-8000-0000000000e1')),
  'refs_open',public.read_social_profile_refs_open(null,jsonb_build_array(jsonb_build_object('kind','fan_post','id','7d000000-0000-4000-8000-0000000000e1'),jsonb_build_object('kind','fan_post','id','7d000000-0000-4000-8000-0000000000e9'))),
  'conversations_sender_after_decline',public.read_owned_dm_conversations('7d000000-0000-4000-8000-000000000001'),
  'conversations_decliner',public.read_owned_dm_conversations('7d000000-0000-4000-8000-000000000004'),
  'conversations_empty_user',public.read_owned_dm_conversations('7d000000-0000-4000-8000-000000000003'),
  'reach_sender_after_decline',public.read_social_profile_reach('7d000000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000004'),
  'blocks_closed',public.read_owned_social_blocks_closed('7d000000-0000-4000-8000-000000000001'),
  'report_replay',public.report_social_profile('7d000000-0000-4000-8000-000000000001',jsonb_build_object('kind','fan_post','id','7d000000-0000-4000-8000-0000000000e1'),'spam','응답 상세','7d000000-0000-4000-8000-0000000000d2'),
  'admin_reports',(select jsonb_build_object('items',jsonb_agg(v),'hasMore',false) from jsonb_array_elements(public.read_admin_content_reports('7d000000-0000-4000-8000-000000000006','7d000000-0000-4000-8000-0000000000ad','open',null,null,50)->'items') v where v->>'targetType'='user_profile'))),
 '"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+\+[0-9:]+"','"2026-11-09T00:00:00+00:00"','g'),
 '"(id|returnRef|conversationId)": "[0-9a-f]{8}-(?!0000-4000-8000)[0-9a-f-]{27}"','"\1": "00000000-0000-4000-8000-000000000000"','g');
rollback;

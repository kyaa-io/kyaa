begin;
do $$
declare
 owner_id uuid:='91700000-0000-4000-8000-000000000001';
 wave_id uuid:='91700000-0000-4000-8000-000000000010';
 other_id uuid:='91700000-0000-4000-8000-000000000011';
 post_id uuid:='91700000-0000-4000-8000-000000000020';
 other_post_id uuid:='91700000-0000-4000-8000-000000000021';
 comment_id uuid:='91700000-0000-4000-8000-000000000022';
 notice_id uuid:='91700000-0000-4000-8000-000000000023';
 asset_id uuid:='91700000-0000-4000-8000-000000000024';
 page jsonb;
begin
 insert into public.app_users(id,privy_user_id,verified_email) values(owner_id,'did:privy:wave-access-qa','wave-access-qa@example.test');
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
 (wave_id,'kyaa-wave-fanpage','published','/wave-qa.webp',now(),'{brand}','brand'),
 (other_id,'wave-access-other','published','/other-qa.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
 (wave_id,'ko','Wave QA','QA','QA'),(other_id,'ko','Other QA','QA','QA');
 insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash,created_at) values
 (post_id,wave_id,owner_id,'private wave body',extensions.gen_random_uuid(),'wave',now()+interval '1 day'),
 (other_post_id,other_id,owner_id,'public other body',extensions.gen_random_uuid(),'other',now());
 insert into public.fan_post_comments(id,post_id,app_user_id,body,idempotency_key) values(comment_id,post_id,owner_id,'comment',extensions.gen_random_uuid());
 insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at)
 values(notice_id,wave_id,'wave-access-notice','published',now(),now());
 insert into public.content_assets(id,app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,notice_id)
 values(asset_id,owner_id,wave_id,'wave-access/'||asset_id,50,100,100,repeat('a',64),notice_id);
 assert public.is_kyaa_wave_resource('fan_post',post_id::text),'post owner';
 assert not public.is_kyaa_wave_resource('fan_post',other_post_id::text),'other creator preserved';
 assert public.is_kyaa_wave_resource('fan_post_comment',comment_id::text),'comment parent owner';
 assert public.is_kyaa_wave_resource('notice',notice_id::text),'notice owner';
 assert public.is_kyaa_wave_resource('content_asset',asset_id::text),'asset owner';
 assert not public.is_kyaa_wave_resource('fan_post','invalid'),'invalid ID';
 assert not public.is_kyaa_wave_resource('fan_post',extensions.gen_random_uuid()::text),'missing ID';
 assert not public.is_kyaa_wave_resource('unsupported',post_id::text),'unknown kind';
 assert not has_function_privilege('anon','public.is_kyaa_wave_resource(text,text)','execute'),'anon cannot resolve';
 assert not has_function_privilege('authenticated','public.is_kyaa_wave_resource(text,text)','execute'),'clients cannot resolve';
 assert has_function_privilege('service_role','public.is_kyaa_wave_resource(text,text)','execute'),'service can resolve';
 insert into public.brands(id,slug,logo_url,logo_alt) values('91700000-0000-4000-8000-000000000030','wave-access-brand','/qa.webp','QA');
 insert into public.live_events(id,slug,celebrity_id,brand_id,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,live_provider,external_live_url,approved_hero_url,fan_code_hash)
 values('91700000-0000-4000-8000-000000000031','wave-access-live',wave_id,'91700000-0000-4000-8000-000000000030',now()+interval '2 day',now()+interval '3 day',now(),now()+interval '1 day','https://youtube.com/watch?v=abcdefghijk','youtube','https://youtube.com/watch?v=abcdefghijk','/qa.webp',repeat('a',64));
 insert into public.live_surveys(id,live_event_id,version) values('91700000-0000-4000-8000-000000000032','91700000-0000-4000-8000-000000000031',1);
 assert public.is_kyaa_wave_resource('live_mission','91700000-0000-4000-8000-000000000032'),'mission event owner';
 update public.live_events set celebrity_id=other_id where id='91700000-0000-4000-8000-000000000031';
 assert not public.is_kyaa_wave_resource('live_mission','91700000-0000-4000-8000-000000000032'),'other creator mission preserved';
 page:=public.read_public_home_feed(null,'ko');
 assert page::text not like '%private wave body%' and page::text not like '%kyaa-wave-fanpage%','Wave never enters public home feed';
 assert page::text like '%public other body%','other content remains public';
end $$;
rollback;

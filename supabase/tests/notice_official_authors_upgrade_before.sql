insert into public.app_users(id,privy_user_id,verified_email)
values('81810000-0000-4000-8000-000000000001','did:privy:official-author-upgrade','official-author-upgrade@example.test');
insert into public.admin_allowlist(id,email,role,active)
values('81810000-0000-4000-8000-000000000002','official-author-upgrade@example.test','admin',true);
insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
values('81810000-0000-4000-8000-000000000003','official-author-upgrade','draft','/official-author-upgrade.webp','{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
  ('81810000-0000-4000-8000-000000000003','ko','공식 작성자 업그레이드','공식 작성자 업그레이드','공식 작성자 업그레이드'),
  ('81810000-0000-4000-8000-000000000003','en','Official author upgrade','Official author upgrade','Official author upgrade');
update public.celebrities set status='published',published_at=clock_timestamp()
where id='81810000-0000-4000-8000-000000000003';
insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,post_type)
values('81810000-0000-4000-8000-000000000004','81810000-0000-4000-8000-000000000003','upgrade-official-thread','draft','artist_post');
insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json) values
  ('81810000-0000-4000-8000-000000000004','ko','업그레이드 공식 글','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"업그레이드 본문"}]}]}'::jsonb),
  ('81810000-0000-4000-8000-000000000004','en','Upgrade official post','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Upgrade body"}]}]}'::jsonb);
update public.celebrity_notices set publication_status='published',published_at=clock_timestamp(),ever_published_at=clock_timestamp()
where id='81810000-0000-4000-8000-000000000004';
insert into public.celebrity_notice_comments(id,notice_id,app_user_id,body,idempotency_key)
values('81810000-0000-4000-8000-000000000005','81810000-0000-4000-8000-000000000004','81810000-0000-4000-8000-000000000001','기존 관리자 댓글','81810000-0000-4000-8000-000000000006');

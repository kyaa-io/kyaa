insert into public.app_users(id,privy_user_id,verified_email)
values('81400000-0000-4000-8000-000000000001','did:privy:notice-source-upgrade','notice-source-upgrade@example.test');
insert into public.celebrities(id,slug,status,image_url,published_at,fan_count,roles,primary_role)
values('81400000-0000-4000-8000-000000000002','notice-source-upgrade','draft','/notice-source-upgrade.webp',null,0,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
values
  ('81400000-0000-4000-8000-000000000002','ko','댓글 업그레이드','댓글 업그레이드','댓글 업그레이드'),
  ('81400000-0000-4000-8000-000000000002','en','Comment upgrade','Comment upgrade','Comment upgrade');
update public.celebrities set status='published',published_at=clock_timestamp()
where id='81400000-0000-4000-8000-000000000002';
insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at)
values('81400000-0000-4000-8000-000000000003','81400000-0000-4000-8000-000000000002','upgrade-notice','draft',null,null);
insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)
values
  ('81400000-0000-4000-8000-000000000003','ko','업그레이드 공지','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"본문"}]}]}'::jsonb),
  ('81400000-0000-4000-8000-000000000003','en','Upgrade notice','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Body"}]}]}'::jsonb);
update public.celebrity_notices set publication_status='published',published_at=clock_timestamp(),ever_published_at=clock_timestamp()
where id='81400000-0000-4000-8000-000000000003';
insert into public.celebrity_notice_comments(id,notice_id,app_user_id,body,idempotency_key,created_at)
values('81400000-0000-4000-8000-000000000004','81400000-0000-4000-8000-000000000003','81400000-0000-4000-8000-000000000001','업그레이드 전에 작성한 댓글','81400000-0000-4000-8000-000000000005','2026-10-12 00:00:00+00');

insert into public.celebrity_notice_comment_reactions(comment_id,app_user_id,emoji,created_at) values
 ('81400000-0000-4000-8000-000000000004','81400000-0000-4000-8000-000000000001','heart','2026-10-12 00:00:01+00'),
 ('81400000-0000-4000-8000-000000000004','81400000-0000-4000-8000-000000000001','clap','2026-10-12 00:00:02+00');
create table public.notice_source_upgrade_snapshot(kind text primary key,payload jsonb);
insert into public.notice_source_upgrade_snapshot values
 ('comment',(select to_jsonb(comment) from public.celebrity_notice_comments comment where id='81400000-0000-4000-8000-000000000004')),
 ('reactions',(select jsonb_agg(to_jsonb(reaction) order by emoji) from public.celebrity_notice_comment_reactions reaction where comment_id='81400000-0000-4000-8000-000000000004'));

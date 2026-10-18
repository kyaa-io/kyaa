do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='celebrity_notice_comments' and column_name='parent_id'
  ) then raise exception 'notice comment parent_id unexpectedly exists before upgrade'; end if;
  if to_regclass('public.celebrity_notice_comment_reactions') is not null then
    raise exception 'notice comment reactions unexpectedly exist before upgrade';
  end if;
end $$;

insert into public.app_users(id,privy_user_id,verified_email)
values('71400000-0000-4000-8000-000000000001','did:privy:notice-thread-upgrade','notice-thread-upgrade@example.test');
insert into public.celebrities(id,slug,status,image_url,published_at,fan_count,roles,primary_role)
values('71400000-0000-4000-8000-000000000002','notice-thread-upgrade','draft','/notice-thread-upgrade.webp',null,0,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
values
  ('71400000-0000-4000-8000-000000000002','ko','댓글 업그레이드','댓글 업그레이드','댓글 업그레이드'),
  ('71400000-0000-4000-8000-000000000002','en','Comment upgrade','Comment upgrade','Comment upgrade');
update public.celebrities set status='published',published_at=clock_timestamp()
where id='71400000-0000-4000-8000-000000000002';
insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at)
values('71400000-0000-4000-8000-000000000003','71400000-0000-4000-8000-000000000002','upgrade-notice','draft',null,null);
insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)
values
  ('71400000-0000-4000-8000-000000000003','ko','업그레이드 공지','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"본문"}]}]}'::jsonb),
  ('71400000-0000-4000-8000-000000000003','en','Upgrade notice','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Body"}]}]}'::jsonb);
update public.celebrity_notices set publication_status='published',published_at=clock_timestamp(),ever_published_at=clock_timestamp()
where id='71400000-0000-4000-8000-000000000003';
insert into public.celebrity_notice_comments(id,notice_id,app_user_id,body,idempotency_key,created_at)
values('71400000-0000-4000-8000-000000000004','71400000-0000-4000-8000-000000000003','71400000-0000-4000-8000-000000000001','업그레이드 전에 작성한 댓글','71400000-0000-4000-8000-000000000005','2026-10-12 00:00:00+00');

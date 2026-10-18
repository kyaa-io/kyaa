insert into public.app_users(id,privy_user_id,verified_email)
values('5c000000-0000-4000-8000-000000000001','did:privy:event-album-upgrade','event-album-upgrade@example.test');
insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
values('5c000000-0000-4000-8000-000000000002','event-album-upgrade','draft','/upgrade.webp','{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
values('5c000000-0000-4000-8000-000000000002','ko','업그레이드','설명','이미지'),
      ('5c000000-0000-4000-8000-000000000002','en','Upgrade','Summary','Image');
update public.celebrities set status='published',published_at=clock_timestamp()
where id='5c000000-0000-4000-8000-000000000002';
insert into public.mobile_participation_events(
  id,slug,celebrity_id,event_kind,policy_version,state,starts_at,ends_at,title_ko,title_en
)values(
  '5c000000-0000-4000-8000-000000000003','event-album-upgrade-event',
  '5c000000-0000-4000-8000-000000000002','byus_day','upgrade-v1','published',
  clock_timestamp()-interval'1 hour',clock_timestamp()+interval'1 hour','업그레이드 행사','Upgrade event'
);
insert into public.mobile_participation_contexts(
  id,context_type,source_event_id,celebrity_id,slug,policy_version,state,
  opens_at,closes_at,require_checkin,album_kind
)values(
  '5c000000-0000-4000-8000-000000000004','album','5c000000-0000-4000-8000-000000000003',
  '5c000000-0000-4000-8000-000000000002','event-album-upgrade-album','upgrade-v1','published',
  clock_timestamp()-interval'1 hour',clock_timestamp()+interval'1 hour',false,'byus_day'
);
insert into public.mobile_participation_posts(
  id,context_id,app_user_id,kind,body,request_key,payload_hash
)values(
  '5c000000-0000-4000-8000-000000000005','5c000000-0000-4000-8000-000000000004',
  '5c000000-0000-4000-8000-000000000001','memory','기존 기록',
  '5c000000-0000-4000-8000-000000000006',md5('existing')
);

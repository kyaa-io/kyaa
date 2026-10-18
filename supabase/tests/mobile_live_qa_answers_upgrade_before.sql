insert into public.app_users(id,privy_user_id,verified_email)
values('5f100000-0000-4000-8000-000000000001','did:privy:live-qa-upgrade','live-qa-upgrade@example.test');
insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
values('5f100000-0000-4000-8000-000000000002','live-qa-upgrade','draft','/upgrade.webp','{artist}','singer');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values
  ('5f100000-0000-4000-8000-000000000002','ko','업그레이드 아티스트','설명','이미지'),
  ('5f100000-0000-4000-8000-000000000002','en','Upgrade Artist','Summary','Image');
insert into public.mobile_participation_events(
  id,slug,celebrity_id,event_kind,policy_version,state,starts_at,ends_at,title_ko,title_en
)values('5f100000-0000-4000-8000-000000000003','live-qa-upgrade-event',
  '5f100000-0000-4000-8000-000000000002','general','upgrade-v1','published',
  clock_timestamp()-interval'1 hour',clock_timestamp()+interval'1 hour','업그레이드 행사','Upgrade event');
insert into public.mobile_participation_contexts(
  id,context_type,source_event_id,celebrity_id,slug,policy_version,state,opens_at,closes_at,require_checkin
)values('5f100000-0000-4000-8000-000000000004','event','5f100000-0000-4000-8000-000000000003',
  '5f100000-0000-4000-8000-000000000002','live-qa-upgrade-context','upgrade-v1','published',
  clock_timestamp()-interval'1 hour',clock_timestamp()+interval'1 hour',false);
insert into public.mobile_participation_posts(id,context_id,app_user_id,kind,body,request_key,payload_hash)
values('5f100000-0000-4000-8000-000000000005','5f100000-0000-4000-8000-000000000004',
  '5f100000-0000-4000-8000-000000000001','question','기존 질문',
  '5f100000-0000-4000-8000-000000000006',md5('existing-live-question'));

insert into public.app_users(id,privy_user_id,verified_email)
values('58000000-0000-4000-8000-000000000021','did:privy:mobile-benefit-upgrade','mobile-benefit-upgrade@example.test');
insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
values('58000000-0000-4000-8000-000000000022','mobile-benefit-upgrade','draft','/test.webp','{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
('58000000-0000-4000-8000-000000000022','ko','업그레이드','설명','이미지'),
('58000000-0000-4000-8000-000000000022','en','Upgrade','Summary','Image');
update public.celebrities set status='published',published_at=now() where id='58000000-0000-4000-8000-000000000022';
select public.post_fan_ticket_entry(
  '58000000-0000-4000-8000-000000000021','58000000-0000-4000-8000-000000000022','credit',7,
  'mobile_benefit_upgrade','58000000-0000-4000-8000-000000000023','58000000-0000-4000-8000-000000000024',
  (select version from public.reward_policy_versions order by version desc limit 1),null,null
);

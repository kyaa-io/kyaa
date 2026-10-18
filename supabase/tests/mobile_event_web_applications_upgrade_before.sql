do $$begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local byus_clean required';end if;end$$;
insert into public.app_users(id,privy_user_id,verified_email)values('7b200000-0000-4000-8000-000000000001','did:privy:web-upgrade','web-upgrade@example.test');
insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values('7b200000-0000-4000-8000-000000000002','web-upgrade','draft','/upgrade.webp','{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values('7b200000-0000-4000-8000-000000000002','ko','행사','설명','사진'),('7b200000-0000-4000-8000-000000000002','en','Event','Description','Photo');
update public.celebrities set status='published',published_at=clock_timestamp()where id='7b200000-0000-4000-8000-000000000002';
insert into public.mobile_participation_events(id,slug,celebrity_id,event_kind,policy_version,state,starts_at,ends_at,title_ko,title_en,application_url)
values('7b200000-0000-4000-8000-000000000003','web-upgrade','7b200000-0000-4000-8000-000000000002','byus_day','web-v1','published',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days','웹 행사','Web event','https://byus.kr/connect/byus-day');
insert into public.byus_day_rsvps(id,locale,korean_name,english_name,phone_e164,affiliation,occupation,email_normalized,nationality,resident_registration_number_encrypted,ip_hash,payload_hash)
values('7b200000-0000-4000-8000-000000000004','ko','김이전','Legacy Kim','+821055551234','검증','검증','web-upgrade@example.test','KR','v1.'||repeat('a',16)||'.'||repeat('b',22)||'.'||repeat('c',18),repeat('1',64),repeat('2',64));
create table public.mobile_event_web_upgrade_proof as
select to_jsonb(e) as event_row,to_jsonb(r) as rsvp_row,
public.read_owned_mobile_participation_event_v2('7b200000-0000-4000-8000-000000000001',e.id,'ko')->'event' as old_projection
from public.mobile_participation_events e cross join public.byus_day_rsvps r
where e.id='7b200000-0000-4000-8000-000000000003' and r.id='7b200000-0000-4000-8000-000000000004';

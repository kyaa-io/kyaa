-- Persistent pre-upgrade rows in a disposable replay database only.
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='live_survey_options' and column_name='preserve_original') then
    raise exception 'upgrade fixture must run before option translation policy migration';
  end if;
end $$;
insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values
 ('d8800000-0000-4000-8000-000000000001','option-upgrade-artist','draft','/option-upgrade.webp','{artist}','idol');
insert into public.brands(id,slug,status,logo_url,logo_alt) values
 ('d8800000-0000-4000-8000-000000000002','option-upgrade-brand','draft','/option-upgrade.svg','Option upgrade');
insert into public.live_events(id,slug,celebrity_id,brand_id,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,approved_hero_url,fan_code_hash,attendance_valid_from,attendance_valid_until)
values ('d8800000-0000-4000-8000-000000000003','option-upgrade-live','d8800000-0000-4000-8000-000000000001','d8800000-0000-4000-8000-000000000002',now()+interval '2 days',now()+interval '3 days',now()-interval '1 day',now()+interval '1 day',
 'https://www.youtube.com/watch?v=abcdefghijk','/option-upgrade.webp',extensions.crypt('OPTION-UPGRADE',extensions.gen_salt('bf',12)),now()-interval '1 day',now()+interval '4 days');
insert into public.live_surveys(id,live_event_id,version) values
 ('d8800000-0000-4000-8000-000000000004','d8800000-0000-4000-8000-000000000003',1);
insert into public.live_survey_questions(id,survey_id,question_type,is_required,position) values
 ('d8800000-0000-4000-8000-000000000005','d8800000-0000-4000-8000-000000000004','single_choice',true,1);
insert into public.live_survey_options(id,question_id,position) values
 ('d8800000-0000-4000-8000-000000000006','d8800000-0000-4000-8000-000000000005',1),
 ('d8800000-0000-4000-8000-000000000007','d8800000-0000-4000-8000-000000000005',2);
insert into public.live_survey_option_localizations(option_id,locale,label) values
 ('d8800000-0000-4000-8000-000000000006','ko','Dear Moon'),
 ('d8800000-0000-4000-8000-000000000006','en','Dear Moon'),
 ('d8800000-0000-4000-8000-000000000007','ko','오프닝'),
 ('d8800000-0000-4000-8000-000000000007','en','Opening');

-- Run against a disposable database after all migrations. No production writes.
begin;
insert into public.app_users(id,privy_user_id,verified_email,status) values
 ('d8700000-0000-4000-8000-000000000001','did:privy:option-policy-admin','option-policy@byus.test','active');
insert into public.admin_allowlist(id,email,role,active) values
 ('d8700000-0000-4000-8000-000000000002','option-policy@byus.test','admin',true);
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
 ('d8700000-0000-4000-8000-000000000003','option-policy-artist','published','/option-policy.webp',now(),'{artist}','idol');
insert into public.brands(id,slug,status,logo_url,logo_alt,published_at) values
 ('d8700000-0000-4000-8000-000000000004','option-policy-brand','published','/option-policy.svg','Option policy',now());
insert into public.live_events(id,slug,celebrity_id,brand_id,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,approved_hero_url,fan_code_hash,publication_status,published_at,attendance_valid_from,attendance_valid_until)
select id,slug,'d8700000-0000-4000-8000-000000000003','d8700000-0000-4000-8000-000000000004',now()+interval '2 days',now()+interval '3 days',now()-interval '1 day',now()+interval '1 day',
 'https://www.youtube.com/watch?v=abcdefghijk','/option-policy.webp',extensions.crypt('OPTION-POLICY',extensions.gen_salt('bf',12)),'published',now(),now()-interval '1 day',now()+interval '4 days'
from (values ('d8700000-0000-4000-8000-000000000005'::uuid,'option-policy-survey'),('d8700000-0000-4000-8000-000000000006'::uuid,'option-policy-mission')) fixture(id,slug);
insert into public.live_reward_setting_revisions(live_event_id,revision,policy_version,lifecycle_status,mission_score,mission_ticket,journey_bonus_ticket,correlation_id,published_at)
select id,2,2,'published',1,0,0,extensions.gen_random_uuid(),now() from public.live_events where slug like 'option-policy-%';

do $$
declare actor uuid:='d8700000-0000-4000-8000-000000000001'; allowlist uuid:='d8700000-0000-4000-8000-000000000002';
 live uuid:='d8700000-0000-4000-8000-000000000005'; mission_live uuid:='d8700000-0000-4000-8000-000000000006';
 doc jsonb; selected jsonb; payload jsonb; source uuid; cloned uuid; option_id uuid; mission_id uuid; legacy jsonb; modern jsonb; rejected boolean;
begin
 if has_function_privilege('anon','public.get_owned_live_survey_v2(uuid,text,public.content_locale)','execute')
  or has_function_privilege('authenticated','public.get_owned_live_missions_v2(uuid,text,public.content_locale)','execute')
  or has_function_privilege('anon','public.admin_write_live_survey_v2(uuid,uuid,uuid,text,jsonb,uuid)','execute')
  or has_function_privilege('authenticated','public.admin_write_live_mission_v2(uuid,uuid,uuid,text,jsonb,uuid)','execute')
  or not has_function_privilege('service_role','public.get_owned_live_survey_v2(uuid,text,public.content_locale)','execute') then
  raise exception 'translation-policy RPC grants are unsafe';
 end if;
 doc:=public.admin_write_live_survey_v2(actor,allowlist,live,'create','{}',extensions.gen_random_uuid());
 source:=(doc->>'selectedSurveyId')::uuid;
 select value into selected from jsonb_array_elements(doc->'versions') where value->>'id'=source::text;
 if selected #>> '{questions,1,options,0,preserveOriginal}' is distinct from 'false' then raise exception 'new canonical options must translate'; end if;
 if (public.get_admin_live_survey(actor,allowlist,live) #> '{versions,0,questions,1,options,0}') ? 'preserveOriginal' then raise exception 'legacy admin projection changed'; end if;
 payload:=jsonb_build_object('surveyId',source,'expectedRevision',selected->'revision','questions',selected->'questions');
 payload:=jsonb_set(payload,'{questions}',(payload->'questions') || jsonb_build_array(jsonb_build_object(
  'type','single_choice','commonKey',null,'required',true,'position',5,'text',jsonb_build_object('ko','어떤 곡인가요?','en','Choose a song'),
  'options',jsonb_build_array(
   jsonb_build_object('position',1,'label',jsonb_build_object('ko','Dear Moon','en','Dear Moon'),'preserveOriginal',true),
   jsonb_build_object('position',2,'label',jsonb_build_object('ko','다음 곡','en','Next song'),'preserveOriginal',false)))));
 doc:=public.admin_write_live_survey_v2(actor,allowlist,live,'edit',payload,extensions.gen_random_uuid());
 select value into selected from jsonb_array_elements(doc->'versions') where value->>'id'=source::text;
 if selected #>> '{questions,4,options,0,preserveOriginal}' is distinct from 'true' or selected #>> '{questions,4,options,1,preserveOriginal}' is distinct from 'false' then raise exception 'mixed policy save failed'; end if;
 payload:=jsonb_build_object('surveyId',source,'expectedRevision',selected->'revision','questions',selected->'questions');
 rejected:=false;
 begin
  perform public.admin_write_live_survey(actor,allowlist,live,'edit',payload #- '{questions,4,options,0,preserveOriginal}',extensions.gen_random_uuid());
 exception when others then rejected:=sqlerrm like '%invalid option translation policy%'; end;
 if not rejected then raise exception 'old survey write silently discarded policy'; end if;
 doc:=public.admin_write_live_survey_v2(actor,allowlist,live,'clone',jsonb_build_object('sourceSurveyId',source),extensions.gen_random_uuid());
 cloned:=(doc->>'selectedSurveyId')::uuid;
 select value into selected from jsonb_array_elements(doc->'versions') where value->>'id'=cloned::text;
 if selected #>> '{questions,4,options,0,preserveOriginal}' is distinct from 'true' or selected #>> '{questions,4,options,1,preserveOriginal}' is distinct from 'false' then raise exception 'clone lost policies'; end if;
 perform public.admin_write_live_survey_v2(actor,allowlist,live,'publish',jsonb_build_object('surveyId',cloned,'expectedRevision',selected->'revision'),extensions.gen_random_uuid());
 legacy:=public.get_owned_live_survey(actor,'option-policy-survey','en');
 modern:=public.get_owned_live_survey_v2(actor,'option-policy-survey','en');
 if (legacy #> '{survey,questions,4,options,0}') ? 'preserveOriginal' then raise exception 'legacy fan survey projection changed'; end if;
 if modern #>> '{survey,questions,4,options,0,preserveOriginal}' is distinct from 'true' or modern #>> '{survey,questions,4,options,1,preserveOriginal}' is distinct from 'false' then raise exception 'fan survey projection lost policies'; end if;
 option_id:=(modern #>> '{survey,questions,4,options,0,id}')::uuid;
 rejected:=false;
 begin update public.live_survey_options set preserve_original=false where id=option_id;
 exception when others then rejected:=sqlerrm like '%immutable%'; end;
 if not rejected then raise exception 'published policy mutation was allowed'; end if;
 payload:=jsonb_build_object('type','vote','attendanceRequirement','not_required','visibleFrom',now()-interval '1 hour','visibleUntil',now()+interval '1 hour',
  'title',jsonb_build_object('ko','작품 투표','en','Artwork vote'),'description',jsonb_build_object('ko','','en',''),
  'questions',jsonb_build_array(jsonb_build_object('position',1,'text',jsonb_build_object('ko','골라 주세요','en','Choose one'),'media',null,'correctPosition',null,
   'options',jsonb_build_array(jsonb_build_object('position',1,'label',jsonb_build_object('ko','Love Rat','en','Love Rat'),'preserveOriginal',true,'displayMode','text','media',null),
    jsonb_build_object('position',2,'label',jsonb_build_object('ko','다음 작품','en','Next artwork'),'preserveOriginal',false,'displayMode','text','media',null)))));
 rejected:=false;
 begin perform public.admin_write_live_mission(actor,allowlist,mission_live,'create',payload #- '{questions,0,options,0,preserveOriginal}',extensions.gen_random_uuid());
 exception when others then rejected:=sqlerrm like '%invalid option translation policy%'; end;
 if not rejected then raise exception 'old mission write silently discarded policy'; end if;
 doc:=public.admin_write_live_mission_v2(actor,allowlist,mission_live,'create',payload,extensions.gen_random_uuid());
 mission_id:=(doc->>'missionId')::uuid;
 perform public.admin_write_live_mission_v2(actor,allowlist,mission_live,'publish',jsonb_build_object('missionId',mission_id),extensions.gen_random_uuid());
 legacy:=public.get_owned_live_missions(actor,'option-policy-mission','en');
 modern:=public.get_owned_live_missions_v2(actor,'option-policy-mission','en');
 if (legacy #> '{0,questions,0,options,0}') ? 'preserveOriginal' then raise exception 'legacy mission projection changed'; end if;
 if modern #>> '{0,questions,0,options,0,preserveOriginal}' is distinct from 'true' or modern #>> '{0,questions,0,options,1,preserveOriginal}' is distinct from 'false' then raise exception 'fan mission projection lost policies'; end if;
 rejected:=false;
 begin perform public.admin_write_live_mission_v2(actor,extensions.gen_random_uuid(),mission_live,'create',payload,extensions.gen_random_uuid());
 exception when others then rejected:=sqlerrm like '%administrator%'; end;
 if not rejected then raise exception 'v2 admin RPC bypassed authorization'; end if;
end $$;
rollback;

\set ON_ERROR_STOP on
begin;

create function pg_temp.policy_questions() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('position',q,'promptKo','질문 '||q,'promptEn','Question '||q,'active',true,
    'options',(select jsonb_agg(jsonb_build_object('position',o,'labelKo',case when o=1 then 'Dear Moon' else '오프닝' end,
      'labelEn',case when o=1 then 'Dear Moon' else 'Opening' end,'isCorrect',o=1,'active',true,'preserveOriginal',o=1) order by o)
      from generate_series(1,4) o)) order by q) from generate_series(1,3) q
$$;

do $$
declare
  actor uuid:='93600000-0000-4000-8000-000000000001';
  artist uuid:='93600000-0000-4000-8000-000000000002';
  owner_id uuid:='93600000-0000-4000-8000-000000000003';
  other_id uuid:='93600000-0000-4000-8000-000000000004';
  quiz uuid; cloned uuid; v_attempt_id uuid; q uuid; answer_id uuid; data jsonb; old_data jsonb; legacy_payload jsonb; changed boolean;
begin
  insert into public.admin_allowlist(id,email,role,active) values(actor,'quiz-policy@example.test','admin',true);
  insert into public.app_users(id,privy_user_id,verified_email) values
    (owner_id,'did:privy:quiz-policy','quiz-policy@example.test'),(other_id,'did:privy:quiz-policy-other','quiz-policy-other@example.test');
  insert into public.celebrities(id,slug,image_url,roles,primary_role) values(artist,'quiz-policy','/test.webp','{artist}','singer');
  perform public.save_admin_quiz_version_v2(actor,extensions.gen_random_uuid(),artist,null,pg_temp.policy_questions());
  select id into strict quiz from public.celebrity_quizzes where celebrity_id=artist;
  data:=public.read_admin_quiz_cms_v2(actor,artist);
  old_data:=public.read_admin_quiz_cms(actor,artist);
  if old_data->0->'questions'->0->'options'->0 ? 'preserveOriginal' then raise exception 'legacy CMS gained policy fields'; end if;
  if data->0->'questions'->0->'options'->0->'preserveOriginal' <> 'true'::jsonb
    or data->0->'questions'->0->'options'->1->'preserveOriginal' <> 'false'::jsonb then
    raise exception 'CMS did not retain mixed option policies';
  end if;
  select jsonb_agg(jsonb_set(question,'{options}',(select jsonb_agg(option-'preserveOriginal') from jsonb_array_elements(question->'options') option)))
    into legacy_payload from jsonb_array_elements(pg_temp.policy_questions()) question;
  changed:=false;
  begin perform public.save_admin_quiz_version(actor,extensions.gen_random_uuid(),artist,quiz,legacy_payload);
  exception when others then changed:=sqlerrm like '%translation policy requires current editor%'; end;
  if not changed then raise exception 'old editor silently discarded explicit policies'; end if;
  perform public.clone_admin_quiz_version(actor,extensions.gen_random_uuid(),artist,quiz);
  select id into strict cloned from public.celebrity_quizzes where celebrity_id=artist and version=2;
  if exists(select 1 from public.celebrity_quiz_options o join public.celebrity_quiz_questions x on x.id=o.question_id
    where x.quiz_id=cloned and o.preserve_original is distinct from (o.position=1)) then
    raise exception 'clone lost option policy';
  end if;
  perform public.publish_admin_quiz_version(actor,extensions.gen_random_uuid(),artist,quiz);
  update public.celebrities set status='published' where id=artist;
  data:=public.start_owned_quiz_attempt_v3(owner_id,'quiz-policy',extensions.gen_random_uuid());
  v_attempt_id:=(data->'attempt'->>'id')::uuid;
  if exists(select 1 from public.quiz_attempt_options o join public.quiz_attempt_questions x on x.id=o.attempt_question_id
    where x.attempt_id=v_attempt_id and o.preserve_original is distinct from (o.position=1))
    or data->'questions'->0->'options'->0->'preserveOriginal' <> 'true'::jsonb
    or data->'questions'->0->'options'->1->'preserveOriginal' <> 'false'::jsonb then
    raise exception 'attempt policy snapshot or new projection changed';
  end if;
  old_data:=public.get_owned_quiz_attempt(owner_id,v_attempt_id);
  if old_data->'questions'->0->'options'->0 ? 'preserveOriginal' then raise exception 'legacy strict client gained new fields'; end if;
  if public.build_owned_quiz_attempt_projection_v2(other_id,v_attempt_id) is not null then raise exception 'option policy leaked between owners'; end if;
  q:=(data->'questions'->0->>'id')::uuid;
  answer_id:=(data->'questions'->0->'options'->0->>'id')::uuid;
  data:=public.save_owned_quiz_answer_v3(owner_id,v_attempt_id,q,answer_id,null);
  if data->'questions'->0->>'selectedOptionId' <> answer_id::text then raise exception 'new answer wrapper did not save'; end if;
  changed:=false;
  begin
    update public.celebrity_quiz_options set preserve_original=false where question_id in(select id from public.celebrity_quiz_questions where quiz_id=quiz);
  exception when others then changed:=sqlerrm like '%published quiz versions are immutable%'; end;
  if not changed then raise exception 'published option policy became mutable'; end if;
  if has_function_privilege('authenticated','public.get_owned_quiz_attempt_v2(uuid,uuid)','execute')
    or has_function_privilege('anon','public.start_owned_quiz_attempt_v3(uuid,text,uuid,text,uuid)','execute')
    or not has_function_privilege('service_role','public.save_owned_quiz_answer_v3(uuid,uuid,uuid,uuid,text)','execute') then
    raise exception 'quiz policy RPC privileges changed';
  end if;
end $$;
rollback;

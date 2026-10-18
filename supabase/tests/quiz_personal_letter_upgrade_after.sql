do $$
begin
  if (select count(*) from public.celebrity_quiz_questions where quiz_id='93300000-0000-4000-8000-000000000003' and response_kind='choice')<>3
    or (select count(*) from public.quiz_attempt_questions where attempt_id='93300000-0000-4000-8000-000000000004' and response_kind='choice')<>3
    or (select count(*) from public.quiz_attempt_answers where attempt_id='93300000-0000-4000-8000-000000000004' and selected_option_id is not null and free_text is null)<>3 then
    raise exception 'quiz letter upgrade changed legacy all-choice rows';
  end if;
  if to_regprocedure('public.save_owned_quiz_answer(uuid,uuid,uuid,uuid)') is null
    or to_regprocedure('public.save_owned_quiz_answer_v2(uuid,uuid,uuid,uuid,text)') is null then
    raise exception 'quiz answer compatibility RPCs missing after upgrade';
  end if;
end $$;

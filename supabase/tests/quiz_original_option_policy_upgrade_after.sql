do $$
declare legacy jsonb; modern jsonb;
begin
  if (select count(*) from public.celebrity_quiz_options where question_id in (select id from public.celebrity_quiz_questions where quiz_id='93500000-0000-4000-8000-000000000003') and preserve_original)<>3
    or (select count(*) from public.quiz_attempt_options where attempt_question_id in (select id from public.quiz_attempt_questions where attempt_id='93500000-0000-4000-8000-000000000004') and preserve_original)<>3 then
    raise exception 'legacy choices were not preserved through policy upgrade';
  end if;
  legacy:=public.get_owned_quiz_attempt('93500000-0000-4000-8000-000000000001','93500000-0000-4000-8000-000000000004');
  modern:=public.get_owned_quiz_attempt_v2('93500000-0000-4000-8000-000000000001','93500000-0000-4000-8000-000000000004');
  if legacy->'questions'->0->'options'->0 ? 'preserveOriginal'
    or modern->'questions'->0->'options'->0->'preserveOriginal' <> 'true'::jsonb
    or legacy->'questions'->0->'options'->0->>'labelKo' <> '정답' then
    raise exception 'legacy RPC compatibility or original spelling changed';
  end if;
end $$;

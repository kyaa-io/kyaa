insert into public.app_users(id,privy_user_id,verified_email)
values('93500000-0000-4000-8000-000000000001','did:privy:quiz-option-policy-upgrade','quiz-option-policy-upgrade@example.test');

insert into public.celebrities(id,slug,status,image_url,roles)
values('93500000-0000-4000-8000-000000000002','quiz-option-policy-upgrade','draft','/test.webp','{artist}');

insert into public.celebrity_quizzes(id,celebrity_id,version,status)
values('93500000-0000-4000-8000-000000000003','93500000-0000-4000-8000-000000000002',1,'draft');

do $$
declare q uuid; option_id uuid; snapshot_q uuid; snapshot_option uuid; i integer;
begin
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key)
  values('93500000-0000-4000-8000-000000000004','93500000-0000-4000-8000-000000000001',
    '93500000-0000-4000-8000-000000000002','93500000-0000-4000-8000-000000000003',1,
    '93500000-0000-4000-8000-000000000005');
  for i in 1..3 loop
    q:=('93501000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    option_id:=('93502000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    snapshot_q:=('93503000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    snapshot_option:=('93504000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    insert into public.celebrity_quiz_questions(id,quiz_id,position,prompt_ko,prompt_en)
      values(q,'93500000-0000-4000-8000-000000000003',i,'질문 '||i,'Question '||i);
    insert into public.celebrity_quiz_options(id,question_id,position,label_ko,label_en,is_correct)
      values(option_id,q,1,'정답','Correct',true);
    insert into public.quiz_attempt_questions(id,attempt_id,quiz_id,source_question_id,position,prompt_ko,prompt_en)
      values(snapshot_q,'93500000-0000-4000-8000-000000000004','93500000-0000-4000-8000-000000000003',q,i,'질문 '||i,'Question '||i);
    insert into public.quiz_attempt_options(id,attempt_question_id,source_question_id,source_option_id,position,label_ko,label_en,is_correct)
      values(snapshot_option,snapshot_q,q,option_id,1,'정답','Correct',true);
    insert into public.quiz_attempt_answers(attempt_id,attempt_question_id,selected_option_id)
      values('93500000-0000-4000-8000-000000000004',snapshot_q,snapshot_option);
  end loop;
end $$;

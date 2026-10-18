\set ON_ERROR_STOP on
begin;

create function pg_temp.expect_error(statement text, expected text) returns void
language plpgsql as $$
declare caught boolean:=false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm)=0 then raise exception 'Unexpected error %, wanted %',sqlerrm,expected; end if;
    caught:=true;
  end;
  if not caught then raise exception 'Expected error was not raised: %',expected; end if;
end $$;

do $$
declare
  owner uuid:='93400000-0000-4000-8000-000000000001';
  other_user uuid:='93400000-0000-4000-8000-000000000002';
  legacy_user uuid:='93400000-0000-4000-8000-000000000003';
  artist uuid:='93400000-0000-4000-8000-000000000004';
  quiz uuid:='93400000-0000-4000-8000-000000000005';
  request_key uuid:='93400000-0000-4000-8000-000000000006';
  v_attempt_id uuid;
  letter_question uuid;
  first_choice_question uuid;
  second_choice_question uuid;
  first_correct uuid;
  second_wrong uuid;
  first_start jsonb;
  second_start jsonb;
  first_submit jsonb;
  second_submit jsonb;
  legacy_attempt uuid;
  legacy_stamp uuid:='93400000-0000-4000-8000-000000000007';
  legacy_answer record;
  i integer;
  q uuid;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (owner,'did:privy:quiz-letter-owner','quiz-letter-owner@example.test'),
    (other_user,'did:privy:quiz-letter-other','quiz-letter-other@example.test'),
    (legacy_user,'did:privy:quiz-letter-legacy','quiz-letter-legacy@example.test');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(legacy_user,91342,'0x'||repeat('9',40),'privy','embedded');
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
    values(artist,'quiz-personal-letter','draft','/test.webp','{artist}','singer');
  insert into public.celebrity_quizzes(id,celebrity_id,version,status)
    values(quiz,artist,1,'draft');

  for i in 1..3 loop
    q:=('93401000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    insert into public.celebrity_quiz_questions(id,quiz_id,position,prompt_ko,prompt_en,response_kind)
      values(q,quiz,i,'질문 '||i,'Question '||i,case when i=3 then 'letter' else 'choice' end);
    if i<3 then
      insert into public.celebrity_quiz_options(id,question_id,position,label_ko,label_en,is_correct) values
        (('93402000-0000-4000-8000-'||lpad((i*2-1)::text,12,'0'))::uuid,q,1,'정답','Correct',true),
        (('93402000-0000-4000-8000-'||lpad((i*2)::text,12,'0'))::uuid,q,2,'오답','Wrong',false);
    end if;
  end loop;
  update public.celebrity_quizzes set status='published',published_at=clock_timestamp() where id=quiz;
  update public.celebrities set status='published' where id=artist;

  first_start:=public.start_owned_quiz_attempt(owner,'quiz-personal-letter',request_key);
  second_start:=public.start_owned_quiz_attempt(owner,'quiz-personal-letter',request_key);
  if first_start->'attempt'->>'id' is distinct from second_start->'attempt'->>'id'
    or (select count(*) from public.quiz_attempts where app_user_id=owner and idempotency_key=request_key)<>1 then
    raise exception 'request-key replay created a different quiz attempt';
  end if;
  v_attempt_id:=(first_start->'attempt'->>'id')::uuid;
  select question.id into strict letter_question from public.quiz_attempt_questions question where question.attempt_id=v_attempt_id and question.response_kind='letter';
  select question.id into strict first_choice_question from public.quiz_attempt_questions question where question.attempt_id=v_attempt_id and question.response_kind='choice' order by question.position limit 1;
  select question.id into strict second_choice_question from public.quiz_attempt_questions question where question.attempt_id=v_attempt_id and question.response_kind='choice' order by question.position offset 1 limit 1;
  select id into strict first_correct from public.quiz_attempt_options where attempt_question_id=first_choice_question and is_correct;
  select id into strict second_wrong from public.quiz_attempt_options where attempt_question_id=second_choice_question and not is_correct limit 1;
  if (select question.position from public.quiz_attempt_questions question where question.id=letter_question)<>3 then
    raise exception 'personal letter was not placed after the two graded choices';
  end if;

  if public.build_owned_quiz_attempt_projection(other_user,v_attempt_id) is not null then
    raise exception 'letter attempt projection leaked to a different owner';
  end if;
  perform pg_temp.expect_error(format('select public.save_owned_quiz_answer_v2(%L,%L,%L,null,null)',owner,v_attempt_id,letter_question),'G2_ANSWER_INPUT_INVALID');
  perform pg_temp.expect_error(format('select public.save_owned_quiz_answer_v2(%L,%L,%L,%L,%L)',owner,v_attempt_id,letter_question,first_correct,'both'),'G2_ANSWER_INPUT_INVALID');
  perform pg_temp.expect_error(format('select public.save_owned_quiz_answer_v2(%L,%L,%L,null,%L)',owner,v_attempt_id,letter_question,repeat('x',201)),'G2_ANSWER_INPUT_INVALID');
  perform pg_temp.expect_error(format('select public.save_owned_quiz_answer_v2(%L,%L,%L,null,%L)',other_user,v_attempt_id,letter_question,'private'),'G2_ATTEMPT_NOT_FOUND');

  perform public.save_owned_quiz_answer(owner,v_attempt_id,first_choice_question,first_correct);
  perform public.save_owned_quiz_answer_v2(owner,v_attempt_id,second_choice_question,second_wrong,null);
  perform public.save_owned_quiz_answer_v2(owner,v_attempt_id,letter_question,null,'  오래 응원할게요.  ');
  if (select stored.free_text from public.quiz_attempt_answers stored where stored.attempt_id=v_attempt_id and stored.attempt_question_id=letter_question)<>'오래 응원할게요.' then
    raise exception 'letter answer was not normalized and stored';
  end if;

  first_submit:=public.submit_owned_quiz_attempt(owner,v_attempt_id,null,null,null,null,null);
  second_submit:=public.submit_owned_quiz_attempt(owner,v_attempt_id,null,null,null,null,null);
  if first_submit is distinct from second_submit
    or first_submit->'attempt'->>'status'<>'failed'
    or (first_submit->'attempt'->>'score')::integer<>1 then
    raise exception 'letter attempt grading or submit replay changed';
  end if;
  perform pg_temp.expect_error(format('select public.save_owned_quiz_answer_v2(%L,%L,%L,null,%L)',owner,v_attempt_id,letter_question,'late'),'G2_ATTEMPT_CLOSED');
  update public.app_users set status='disabled' where id=owner;
  if exists(select 1 from public.quiz_attempt_answers stored where stored.attempt_id=v_attempt_id and stored.free_text is not null)
    or (select count(*) from public.quiz_attempt_answers stored where stored.attempt_id=v_attempt_id)<>2 then
    raise exception 'account disable did not scrub only the private letter';
  end if;

  first_start:=public.start_owned_quiz_attempt(legacy_user,'kara','93400000-0000-4000-8000-000000000008');
  legacy_attempt:=(first_start->'attempt'->>'id')::uuid;
  for legacy_answer in
    select question.id question_id,option.id option_id
    from public.quiz_attempt_questions question
    join public.quiz_attempt_options option on option.attempt_question_id=question.id and option.is_correct
    where question.attempt_id=legacy_attempt
  loop
    perform public.save_owned_quiz_answer(legacy_user,legacy_attempt,legacy_answer.question_id,legacy_answer.option_id);
  end loop;
  first_submit:=public.submit_owned_quiz_attempt(legacy_user,legacy_attempt,legacy_stamp,
    'byus:passport:v1:'||legacy_user::text||':kara','0x'||repeat('a',64),
    'byus:stamp:v1:'||legacy_stamp::text,'0x'||repeat('b',64));
  second_submit:=public.submit_owned_quiz_attempt(legacy_user,legacy_attempt,legacy_stamp,
    'byus:passport:v1:'||legacy_user::text||':kara','0x'||repeat('a',64),
    'byus:stamp:v1:'||legacy_stamp::text,'0x'||repeat('b',64));
  if first_submit is distinct from second_submit
    or first_submit->'attempt'->>'status'<>'passed'
    or (first_submit->'attempt'->>'score')::integer<>3 then
    raise exception 'legacy all-choice pass behavior changed';
  end if;

  if has_table_privilege('authenticated','public.quiz_attempt_answers','SELECT')
    or has_function_privilege('authenticated','public.save_owned_quiz_answer_v2(uuid,uuid,uuid,uuid,text)','EXECUTE') then
    raise exception 'private quiz letter data leaked to browser roles';
  end if;
end $$;

rollback;
select 'Quiz personal letter behavior PASS' as result;

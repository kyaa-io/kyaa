-- Add an ungraded, owner-private personal letter as an optional third quiz response.
-- Existing all-choice quizzes and RPC signatures remain compatible.

alter table public.celebrity_quiz_questions
  add column response_kind text not null default 'choice'
  check (response_kind in ('choice', 'letter'));

alter table public.quiz_attempt_questions
  add column response_kind text not null default 'choice'
  check (response_kind in ('choice', 'letter'));

alter table public.quiz_attempt_answers
  alter column selected_option_id drop not null,
  add column free_text text,
  add constraint quiz_attempt_answers_exactly_one_response check (
    (selected_option_id is not null and free_text is null)
    or (selected_option_id is null and free_text is not null
      and length(free_text) between 1 and 200
      and free_text = pg_catalog.btrim(free_text))
  );

create or replace function public.set_admin_celebrity_publication(p_actor uuid,p_correlation uuid,p_celebrity uuid,p_publish boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare before_row jsonb; result jsonb;
begin
  perform public.require_content_editor(p_actor,true);
  perform 1 from public.celebrities c where id=p_celebrity and archived_at is null for update;
  before_row := public.read_admin_celebrity_cms(p_actor,p_celebrity)->0;
  if before_row is null then raise exception 'content not found'; end if;
  if p_publish then
    if (select count(*) from public.celebrity_quizzes q where q.celebrity_id=p_celebrity and q.status='published') <> 1 then raise exception 'celebrity publication requires exactly one published quiz'; end if;
    if exists(select 1 from public.celebrity_quizzes q where q.celebrity_id=p_celebrity and q.status='published' and ((select count(*) from public.celebrity_quiz_questions x where x.quiz_id=q.id and x.active)<3 or (select count(*) from public.celebrity_quiz_questions x where x.quiz_id=q.id and x.active and x.response_kind='choice')<2 or (select count(*) from public.celebrity_quiz_questions x where x.quiz_id=q.id and x.active and x.response_kind='letter')>1 or exists(select 1 from public.celebrity_quiz_questions x where x.quiz_id=q.id and x.active and ((x.response_kind='choice' and ((select count(*) from public.celebrity_quiz_options o where o.question_id=x.id and o.active)<>4 or (select count(*) from public.celebrity_quiz_options o where o.question_id=x.id and o.active and o.is_correct)<>1)) or (x.response_kind='letter' and exists(select 1 from public.celebrity_quiz_options o where o.question_id=x.id)))))) then raise exception 'celebrity publication requires a complete published quiz'; end if;
  end if;
  update public.celebrities set status=case when p_publish then 'published'::public.content_status else 'draft'::public.content_status end where id=p_celebrity;
  select (public.read_admin_celebrity_cms(p_actor,p_celebrity)->0) into result;
  insert into public.audit_logs(actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary,correlation_id) values(p_actor,case when p_publish then 'celebrity.published' else 'celebrity.unpublished' end,'celebrity',p_celebrity::text,jsonb_build_object('before',before_row,'after',result),p_correlation);
  return result;
end $$;

create or replace function public.read_admin_quiz_cms(p_actor uuid,p_celebrity uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.require_content_editor(p_actor,false);
 return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'version',q.version,'status',q.status,'publishedAt',q.published_at,'everPublishedAt',q.ever_published_at,'retiredAt',q.retired_at,'updatedAt',q.updated_at,'questions',coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'position',z.position,'promptKo',z.prompt_ko,'promptEn',z.prompt_en,'responseKind',z.response_kind,'active',z.active,'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'position',o.position,'labelKo',o.label_ko,'labelEn',o.label_en,'isCorrect',o.is_correct,'active',o.active) order by o.position) from public.celebrity_quiz_options o where o.question_id=z.id),'[]'::jsonb)) order by z.position) from public.celebrity_quiz_questions z where z.quiz_id=q.id),'[]'::jsonb)) order by q.version desc) from public.celebrity_quizzes q where q.celebrity_id=p_celebrity),'[]'::jsonb);
end $$;

create or replace function public.save_admin_quiz_version(p_actor uuid,p_correlation uuid,p_celebrity uuid,p_quiz uuid,p_questions jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid:=p_quiz; question jsonb; option_item jsonb; question_id uuid; result jsonb; before_row jsonb; response_kind text;
begin
 perform public.require_content_editor(p_actor,true);
 perform 1 from public.celebrities where id=p_celebrity and archived_at is null for update;
 if not found then raise exception 'content not found'; end if;
 if target is null then insert into public.celebrity_quizzes(celebrity_id,version) select p_celebrity,coalesce(max(version),0)+1 from public.celebrity_quizzes where celebrity_id=p_celebrity returning id into target;
 else if not exists(select 1 from public.celebrity_quizzes where id=target and celebrity_id=p_celebrity and status='draft' for update) then raise exception 'only draft quiz versions can be edited'; end if; before_row:=public.read_admin_quiz_cms(p_actor,p_celebrity); delete from public.celebrity_quiz_questions where quiz_id=target; end if;
 if jsonb_typeof(p_questions)<>'array' then raise exception 'invalid quiz questions'; end if;
 for question in select value from jsonb_array_elements(p_questions) loop
   response_kind:=coalesce(question->>'responseKind','choice');
   if response_kind not in ('choice','letter') or jsonb_typeof(question->'options')<>'array' then raise exception 'invalid quiz response kind'; end if;
   insert into public.celebrity_quiz_questions(quiz_id,position,prompt_ko,prompt_en,response_kind,active)
   values(target,(question->>'position')::smallint,question->>'promptKo',question->>'promptEn',response_kind,coalesce((question->>'active')::boolean,true)) returning id into question_id;
   if response_kind='choice' and jsonb_array_length(question->'options')<>4 then raise exception 'choice questions require exactly four options'; end if;
   if response_kind='letter' and jsonb_array_length(question->'options')<>0 then raise exception 'letter questions cannot have options'; end if;
   for option_item in select value from jsonb_array_elements(question->'options') loop
     insert into public.celebrity_quiz_options(question_id,position,label_ko,label_en,is_correct,active)
     values(question_id,(option_item->>'position')::smallint,option_item->>'labelKo',option_item->>'labelEn',(option_item->>'isCorrect')::boolean,(option_item->>'active')::boolean);
   end loop;
 end loop;
 result:=public.read_admin_quiz_cms(p_actor,p_celebrity);
 insert into public.audit_logs(actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary,correlation_id) values(p_actor,'quiz.version.saved','celebrity_quiz',target::text,jsonb_build_object('before',before_row,'after',result),p_correlation);
 return result;
end $$;

create or replace function public.clone_admin_quiz_version(p_actor uuid,p_correlation uuid,p_celebrity uuid,p_quiz uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare source public.celebrity_quizzes%rowtype; target uuid; q record; new_q uuid; before_row jsonb; after_row jsonb;
begin
 perform public.require_content_editor(p_actor,true); select * into source from public.celebrity_quizzes where id=p_quiz and celebrity_id=p_celebrity; if not found then raise exception 'quiz not found'; end if; perform 1 from public.celebrities where id=p_celebrity for update; select * into source from public.celebrity_quizzes where id=p_quiz and celebrity_id=p_celebrity for update; before_row:=public.read_admin_quiz_cms(p_actor,p_celebrity);
 insert into public.celebrity_quizzes(celebrity_id,version) select source.celebrity_id,max(version)+1 from public.celebrity_quizzes where celebrity_id=source.celebrity_id returning id into target;
 for q in select * from public.celebrity_quiz_questions where quiz_id=p_quiz order by position loop insert into public.celebrity_quiz_questions(quiz_id,position,prompt_ko,prompt_en,response_kind,active) values(target,q.position,q.prompt_ko,q.prompt_en,q.response_kind,q.active) returning id into new_q; insert into public.celebrity_quiz_options(question_id,position,label_ko,label_en,is_correct,active) select new_q,position,label_ko,label_en,is_correct,active from public.celebrity_quiz_options where question_id=q.id; end loop;
 after_row:=public.read_admin_quiz_cms(p_actor,source.celebrity_id);
 insert into public.audit_logs(actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary,correlation_id) values(p_actor,'quiz.version.cloned','celebrity_quiz',target::text,jsonb_build_object('before',before_row,'after',after_row,'sourceQuizId',p_quiz),p_correlation);
 return after_row;
end $$;

create or replace function public.publish_admin_quiz_version(p_actor uuid,p_correlation uuid,p_celebrity uuid,p_quiz uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.celebrity_quizzes%rowtype; before_row jsonb; after_row jsonb;
begin
 perform public.require_content_editor(p_actor,true); select * into target from public.celebrity_quizzes where id=p_quiz and celebrity_id=p_celebrity and status='draft' and ever_published_at is null; if not found then raise exception 'draft quiz not found'; end if; perform 1 from public.celebrities where id=p_celebrity for update; select * into target from public.celebrity_quizzes where id=p_quiz and celebrity_id=p_celebrity and status='draft' and ever_published_at is null for update; if not found then raise exception 'draft quiz not found'; end if; before_row:=public.read_admin_quiz_cms(p_actor,p_celebrity);
 if (select count(*) from public.celebrity_quiz_questions where quiz_id=p_quiz and active)<3 then raise exception 'published quiz requires at least three active questions'; end if;
 if (select count(*) from public.celebrity_quiz_questions where quiz_id=p_quiz and active and response_kind='choice')<2 or (select count(*) from public.celebrity_quiz_questions where quiz_id=p_quiz and active and response_kind='letter')>1 then raise exception 'published quiz requires at least two graded choices and at most one letter'; end if;
 if exists(select 1 from public.celebrity_quiz_questions q where q.quiz_id=p_quiz and q.active and ((q.response_kind='choice' and ((select count(*) from public.celebrity_quiz_options o where o.question_id=q.id and o.active)<>4 or (select count(*) from public.celebrity_quiz_options o where o.question_id=q.id and o.active and o.is_correct)<>1)) or (q.response_kind='letter' and exists(select 1 from public.celebrity_quiz_options o where o.question_id=q.id)))) then raise exception 'active quiz response configuration is invalid'; end if;
 update public.celebrity_quizzes set status='draft' where celebrity_id=target.celebrity_id and status='published';
 update public.celebrity_quizzes set status='published' where id=p_quiz;
 after_row:=public.read_admin_quiz_cms(p_actor,target.celebrity_id);
 insert into public.audit_logs(actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary,correlation_id) values(p_actor,'quiz.version.published','celebrity_quiz',p_quiz::text,jsonb_build_object('before',before_row,'after',after_row,'version',target.version),p_correlation);
 return after_row;
end $$;

create or replace function public.build_owned_quiz_attempt_projection(
  p_app_user_id uuid,
  p_attempt_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', attempt.id,
      'status', attempt.status,
      'score', attempt.score,
      'submittedAt', attempt.submitted_at
    ),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', question.id,
          'position', question.position,
          'promptKo', question.prompt_ko,
          'promptEn', question.prompt_en,
          'responseKind', question.response_kind,
          'selectedOptionId', answer.selected_option_id,
          'freeText', answer.free_text,
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', option.id,
                'position', option.position,
                'labelKo', option.label_ko,
                'labelEn', option.label_en
              ) order by option.position, option.id
            )
            from public.quiz_attempt_options option
            where option.attempt_question_id = question.id
          ), '[]'::jsonb)
        ) order by question.position, question.id
      )
      from public.quiz_attempt_questions question
      left join public.quiz_attempt_answers answer
        on answer.attempt_id = attempt.id
       and answer.attempt_question_id = question.id
      where question.attempt_id = attempt.id
    ), '[]'::jsonb)
  )
  from public.quiz_attempts attempt
  where attempt.id = p_attempt_id
    and attempt.app_user_id = p_app_user_id;
$$;

create or replace function public.start_owned_quiz_attempt(
  p_app_user_id uuid,
  p_celebrity_slug text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  celebrity_record public.celebrities%rowtype;
  quiz_record public.celebrity_quizzes%rowtype;
  attempt_record public.quiz_attempts%rowtype;
  passport_id uuid;
  inserted_count integer;
begin
  if p_idempotency_key is null then
    raise exception 'G2_QUIZ_UNAVAILABLE' using errcode = '22023';
  end if;

  perform 1 from public.app_users app_user
  where app_user.id = p_app_user_id and app_user.status = 'active'
  for update;
  if not found then
    raise exception 'G2_USER_UNAVAILABLE' using errcode = '42501';
  end if;

  select celebrity.* into celebrity_record
  from public.celebrities celebrity
  where celebrity.slug = p_celebrity_slug
    and celebrity.status = 'published'
  for key share;
  if not found then
    raise exception 'G2_QUIZ_UNAVAILABLE' using errcode = '22023';
  end if;

  select passport.id into passport_id
  from public.fan_passports passport
  where passport.app_user_id = p_app_user_id
    and passport.celebrity_id = celebrity_record.id;
  if found then
    return jsonb_build_object('kind', 'holder', 'passportId', passport_id);
  end if;

  select quiz.* into quiz_record
  from public.celebrity_quizzes quiz
  where quiz.celebrity_id = celebrity_record.id
    and quiz.status = 'published'
  for key share;
  if not found then
    raise exception 'G2_QUIZ_UNAVAILABLE' using errcode = '22023';
  end if;

  select attempt.* into attempt_record
  from public.quiz_attempts attempt
  where attempt.app_user_id = p_app_user_id
    and attempt.celebrity_id = celebrity_record.id
    and attempt.status = 'open'
  for update;
  if found then
    return public.build_owned_quiz_attempt_projection(p_app_user_id, attempt_record.id)
      || jsonb_build_object('kind', 'attempt');
  end if;

  select attempt.* into attempt_record
  from public.quiz_attempts attempt
  where attempt.app_user_id = p_app_user_id
    and attempt.celebrity_id = celebrity_record.id
    and attempt.idempotency_key = p_idempotency_key
  for update;
  if found then
    return public.build_owned_quiz_attempt_projection(p_app_user_id, attempt_record.id)
      || jsonb_build_object('kind', 'attempt');
  end if;

  insert into public.quiz_attempts(
    app_user_id, celebrity_id, quiz_id, quiz_version, idempotency_key
  ) values (
    p_app_user_id, celebrity_record.id, quiz_record.id, quiz_record.version, p_idempotency_key
  )
  on conflict (app_user_id, celebrity_id, idempotency_key) do nothing
  returning * into attempt_record;
  if not found then
    select attempt.* into strict attempt_record
    from public.quiz_attempts attempt
    where attempt.app_user_id = p_app_user_id
      and attempt.celebrity_id = celebrity_record.id
      and attempt.idempotency_key = p_idempotency_key
    for update;
    if attempt_record.quiz_id <> quiz_record.id
       or attempt_record.quiz_version <> quiz_record.version then
      raise exception 'G2_QUIZ_UNAVAILABLE' using errcode = '23514';
    end if;
    return public.build_owned_quiz_attempt_projection(p_app_user_id, attempt_record.id)
      || jsonb_build_object('kind', 'attempt');
  end if;

  with randomized as materialized (
    select source_question.*, random() as random_order
    from public.celebrity_quiz_questions source_question
    where source_question.quiz_id = quiz_record.id
      and source_question.active
    order by case when source_question.response_kind = 'letter' then 0 else 1 end,
      random_order, source_question.id
    limit 3
  )
  insert into public.quiz_attempt_questions(
    attempt_id, quiz_id, source_question_id, position, prompt_ko, prompt_en, response_kind
  )
  select
    attempt_record.id,
    quiz_record.id,
    randomized.id,
    row_number() over (
      order by case when randomized.response_kind = 'letter' then 1 else 0 end,
        randomized.random_order, randomized.id
    )::smallint,
    randomized.prompt_ko,
    randomized.prompt_en,
    randomized.response_kind
  from randomized;
  get diagnostics inserted_count = row_count;
  if inserted_count <> 3 then
    raise exception 'G2_QUIZ_UNAVAILABLE' using errcode = '23514';
  end if;

  insert into public.quiz_attempt_options(
    attempt_question_id,
    source_question_id,
    source_option_id,
    position,
    label_ko,
    label_en,
    is_correct
  )
  select
    snapshot_question.id,
    snapshot_question.source_question_id,
    source_option.id,
    source_option.position,
    source_option.label_ko,
    source_option.label_en,
    source_option.is_correct
  from public.quiz_attempt_questions snapshot_question
  join public.celebrity_quiz_options source_option
    on source_option.question_id = snapshot_question.source_question_id
   and source_option.active
  where snapshot_question.attempt_id = attempt_record.id
  order by snapshot_question.position, source_option.position, source_option.id;

  if (select count(*) from public.quiz_attempt_questions q
      where q.attempt_id = attempt_record.id and q.response_kind = 'choice') < 2
     or (select count(*) from public.quiz_attempt_questions q
      where q.attempt_id = attempt_record.id and q.response_kind = 'letter') > 1
     or exists (
       select 1 from public.quiz_attempt_questions snapshot_question
       where snapshot_question.attempt_id = attempt_record.id
         and ((snapshot_question.response_kind = 'choice' and (
           select count(*) from public.quiz_attempt_options snapshot_option
           where snapshot_option.attempt_question_id = snapshot_question.id
         ) < 2)
         or (snapshot_question.response_kind = 'letter' and exists (
           select 1 from public.quiz_attempt_options snapshot_option
           where snapshot_option.attempt_question_id = snapshot_question.id
         )))
     ) then
    raise exception 'G2_QUIZ_UNAVAILABLE' using errcode = '23514';
  end if;

  return public.build_owned_quiz_attempt_projection(p_app_user_id, attempt_record.id)
    || jsonb_build_object('kind', 'attempt');
end;
$$;



create or replace function public.save_owned_quiz_answer_v2(
  p_app_user_id uuid,
  p_attempt_id uuid,
  p_attempt_question_id uuid,
  p_selected_option_id uuid default null,
  p_free_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_status public.quiz_attempt_status;
  response_kind text;
  normalized_text text := pg_catalog.btrim(p_free_text);
begin
  if (p_selected_option_id is null) = (p_free_text is null) then
    raise exception 'G2_ANSWER_INPUT_INVALID' using errcode = '22023';
  end if;
  perform 1 from public.app_users app_user
  where app_user.id = p_app_user_id and app_user.status = 'active'
  for update;
  if not found then raise exception 'G2_USER_UNAVAILABLE' using errcode = '42501'; end if;

  select attempt.status into attempt_status
  from public.quiz_attempts attempt
  where attempt.id = p_attempt_id and attempt.app_user_id = p_app_user_id
  for update;
  if not found then raise exception 'G2_ATTEMPT_NOT_FOUND' using errcode = 'P0002'; end if;
  if attempt_status <> 'open' then raise exception 'G2_ATTEMPT_CLOSED' using errcode = '55000'; end if;

  select question.response_kind into response_kind
  from public.quiz_attempt_questions question
  where question.id = p_attempt_question_id and question.attempt_id = p_attempt_id
  for key share;
  if not found then raise exception 'G2_ANSWER_SELECTION_INVALID' using errcode = '22023'; end if;

  if response_kind = 'choice' then
    if p_free_text is not null or not exists (
      select 1 from public.quiz_attempt_options option
      where option.attempt_question_id = p_attempt_question_id and option.id = p_selected_option_id
    ) then raise exception 'G2_ANSWER_SELECTION_INVALID' using errcode = '22023'; end if;
  elsif response_kind = 'letter' then
    if p_selected_option_id is not null or normalized_text is null
       or length(normalized_text) not between 1 and 200 then
      raise exception 'G2_ANSWER_INPUT_INVALID' using errcode = '22023';
    end if;
  else
    raise exception 'G2_ANSWER_INPUT_INVALID' using errcode = '22023';
  end if;

  insert into public.quiz_attempt_answers(attempt_id,attempt_question_id,selected_option_id,free_text)
  values(p_attempt_id,p_attempt_question_id,p_selected_option_id,
    case when response_kind='letter' then normalized_text else null end)
  on conflict(attempt_id,attempt_question_id) do update
    set selected_option_id=excluded.selected_option_id,free_text=excluded.free_text;
  return public.build_owned_quiz_attempt_projection(p_app_user_id,p_attempt_id);
end;
$$;

create or replace function public.enforce_open_attempt_snapshot_mutation()
returns trigger language plpgsql set search_path = '' as $$
declare old_attempt_id uuid; new_attempt_id uuid;
begin
  if tg_table_name = 'quiz_attempt_questions' then
    if tg_op <> 'INSERT' then old_attempt_id := old.attempt_id; end if;
    if tg_op <> 'DELETE' then new_attempt_id := new.attempt_id; end if;
  elsif tg_table_name = 'quiz_attempt_options' then
    if tg_op <> 'INSERT' then select attempt_id into old_attempt_id from public.quiz_attempt_questions where id=old.attempt_question_id; end if;
    if tg_op <> 'DELETE' then select attempt_id into new_attempt_id from public.quiz_attempt_questions where id=new.attempt_question_id; end if;
  else
    if tg_op <> 'INSERT' then old_attempt_id := old.attempt_id; end if;
    if tg_op <> 'DELETE' then new_attempt_id := new.attempt_id; end if;
    if tg_op='DELETE' and old.free_text is not null
       and exists(select 1 from public.quiz_attempts a join public.app_users u on u.id=a.app_user_id
         where a.id=old.attempt_id and u.status='disabled') then return old; end if;
  end if;
  if (old_attempt_id is not null and not exists(select 1 from public.quiz_attempts where id=old_attempt_id and status='open'))
     or (new_attempt_id is not null and not exists(select 1 from public.quiz_attempts where id=new_attempt_id and status='open'))
  then raise exception 'quiz snapshot is immutable after attempt submission'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end;
$$;

create function public.scrub_quiz_letters_on_account_disable()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='active' and new.status='disabled' then
    delete from public.quiz_attempt_answers answer
    using public.quiz_attempts attempt
    where attempt.id=answer.attempt_id and attempt.app_user_id=new.id and answer.free_text is not null;
  end if;
  return new;
end;
$$;
create trigger app_users_scrub_quiz_letters after update of status on public.app_users
for each row execute function public.scrub_quiz_letters_on_account_disable();

revoke all on function public.save_owned_quiz_answer_v2(uuid,uuid,uuid,uuid,text),
  public.scrub_quiz_letters_on_account_disable() from public,anon,authenticated,service_role;
grant execute on function public.save_owned_quiz_answer_v2(uuid,uuid,uuid,uuid,text) to service_role;


create or replace function public.submit_owned_quiz_attempt(
  p_app_user_id uuid,
  p_attempt_id uuid,
  p_stamp_id uuid,
  p_passport_operation_key text,
  p_passport_credential_id text,
  p_stamp_operation_key text,
  p_stamp_issuance_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_record public.quiz_attempts%rowtype;
  celebrity_slug text;
  recipient text;
  question_count integer;
  answer_count integer;
  graded_count integer;
  correct_count integer;
  pass_threshold integer;
  expected_passport_operation_key text;
  expected_stamp_operation_key text;
  v_pass_id uuid := extensions.gen_random_uuid();
  v_passport_id uuid := extensions.gen_random_uuid();
  v_passport_job_id uuid := extensions.gen_random_uuid();
  v_activity_id uuid := extensions.gen_random_uuid();
  v_stamp_job_id uuid := extensions.gen_random_uuid();
  job_record public.blockchain_jobs%rowtype;
  passport_record public.fan_passports%rowtype;
  stamp_record public.stamps%rowtype;
  expected_payload jsonb;
  recovered_passport_job boolean := false;
  v_native boolean := false;
  v_outbox_id uuid;
  v_occurred_at timestamptz := clock_timestamp();
begin
  perform 1 from public.app_users app_user
  where app_user.id = p_app_user_id and app_user.status = 'active'
  for update;
  if not found then
    raise exception 'G2_USER_UNAVAILABLE' using errcode = '42501';
  end if;

  select attempt.* into attempt_record
  from public.quiz_attempts attempt
  where attempt.id = p_attempt_id
    and attempt.app_user_id = p_app_user_id
  for update;
  if not found then
    raise exception 'G2_ATTEMPT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if attempt_record.status <> 'open' then
    return public.build_owned_quiz_submit_result(p_app_user_id, p_attempt_id);
  end if;

  select
    count(distinct question.id),
    count(answer.attempt_question_id) filter (where
      (question.response_kind = 'choice' and answer.selected_option_id is not null and answer.free_text is null)
      or (question.response_kind = 'letter' and answer.selected_option_id is null and answer.free_text is not null)),
    count(*) filter (where question.response_kind = 'choice'),
    count(*) filter (where question.response_kind = 'choice' and option.is_correct)
  into question_count, answer_count, graded_count, correct_count
  from public.quiz_attempt_questions question
  left join public.quiz_attempt_answers answer
    on answer.attempt_id = attempt_record.id
   and answer.attempt_question_id = question.id
  left join public.quiz_attempt_options option
    on option.id = answer.selected_option_id
   and option.attempt_question_id = question.id
  where question.attempt_id = attempt_record.id;
  pass_threshold := least(2, graded_count);
  if question_count <> 3 or answer_count <> 3 or graded_count < 2 or pass_threshold < 1 then
    raise exception 'G2_ATTEMPT_INCOMPLETE' using errcode = '55000';
  end if;

  if correct_count < pass_threshold then
    update public.quiz_attempts
    set status = 'failed', score = correct_count, submitted_at = now()
    where id = attempt_record.id;
    return public.build_owned_quiz_submit_result(p_app_user_id, p_attempt_id);
  end if;

  select celebrity.slug into strict celebrity_slug
  from public.celebrities celebrity
  where celebrity.id = attempt_record.celebrity_id
  for key share;

  select wallet.address into recipient
  from public.user_wallets wallet
  where wallet.app_user_id = p_app_user_id
    and wallet.chain_id = 91342
    and wallet.provider = 'privy'
    and wallet.wallet_type = 'embedded'
  for key share;
  if not found then
    raise exception 'G2_WALLET_NOT_READY' using errcode = '55000';
  end if;

  expected_passport_operation_key :=
    'byus:passport:v1:' || p_app_user_id::text || ':' || celebrity_slug;
  expected_stamp_operation_key := 'byus:stamp:v1:' || p_stamp_id::text;
  if p_stamp_id is null
     or p_passport_operation_key is distinct from expected_passport_operation_key
     or p_stamp_operation_key is distinct from expected_stamp_operation_key
     or p_passport_credential_id is null
     or p_stamp_issuance_id is null
     or p_passport_credential_id !~ '^0x[0-9a-f]{64}$'
     or p_stamp_issuance_id !~ '^0x[0-9a-f]{64}$' then
    raise exception 'G2_ISSUANCE_INPUT_INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.quiz_passes pass
    where pass.app_user_id = p_app_user_id
      and pass.celebrity_id = attempt_record.celebrity_id
  ) or exists (
    select 1 from public.fan_passports passport
    where passport.app_user_id = p_app_user_id
      and passport.celebrity_id = attempt_record.celebrity_id
  ) then
    raise exception 'G2_ISSUANCE_CONFLICT' using errcode = '23514';
  end if;

  update public.quiz_attempts
  set status = 'passed', score = correct_count, submitted_at = v_occurred_at
  where id = attempt_record.id;

  insert into public.quiz_passes(
    id, app_user_id, celebrity_id, winning_attempt_id, passed_at
  ) values (
    v_pass_id, p_app_user_id, attempt_record.celebrity_id, attempt_record.id, v_occurred_at
  )
  on conflict (app_user_id, celebrity_id) do nothing;
  if not exists (
    select 1 from public.quiz_passes pass
    where pass.id = v_pass_id
      and pass.app_user_id = p_app_user_id
      and pass.celebrity_id = attempt_record.celebrity_id
      and pass.winning_attempt_id = attempt_record.id
  ) then
    raise exception 'G2_ISSUANCE_CONFLICT' using errcode = '23514';
  end if;

  expected_payload := jsonb_build_object(
    'recipient', recipient,
    'celebritySlug', celebrity_slug,
    'passportId', p_passport_credential_id
  );

  v_native:=public.fan_action_native_enabled(1);
  if v_native then
    v_outbox_id:=public.enqueue_fan_action_source('quiz_passes',v_pass_id::text,p_app_user_id,
      attempt_record.celebrity_id,null,v_occurred_at,1,jsonb_build_array(
        jsonb_build_object('entityType','passport','entityId',v_passport_id,'kind',0,
          'issuanceKey',p_passport_credential_id,'operationKey',p_passport_operation_key,'legacyPayload',expected_payload),
        jsonb_build_object('entityType','stamp','entityId',p_stamp_id,'kind',1,
          'issuanceKey',p_stamp_issuance_id,'operationKey',p_stamp_operation_key,
          'legacyPayload',jsonb_build_object('recipient',recipient,'celebritySlug',celebrity_slug,
            'issuanceId',p_stamp_issuance_id,'stampType','Knowledge'))));
    insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id,fan_action_outbox_id)
      values(v_passport_id,p_app_user_id,attempt_record.celebrity_id,v_pass_id,null,v_outbox_id);
  else
    -- Older flows could finish the on-chain Passport job without retaining the
    -- relational Passport. Reconcile only a completed, exact canonical job.
    select * into job_record
    from public.blockchain_jobs job
    where job.operation_key = p_passport_operation_key
    for update;

    if found then
      if job_record.entity_type <> 'passport'
         or job_record.payload_version <> 1
         or (job_record.payload - 'workerSubmission') - 'recipient' <> expected_payload - 'recipient'
         or lower(job_record.payload ->> 'recipient') is distinct from lower(expected_payload ->> 'recipient')
         or job_record.status <> 'COMPLETED'
         or job_record.tx_hash is null
         or job_record.tx_hash !~ '^0x[0-9a-fA-F]{64}$'
         or job_record.token_id is null
         or job_record.token_id <= 0
         or exists (
           select 1 from public.fan_passports existing
           where existing.id = job_record.entity_id
              or existing.blockchain_job_id = job_record.id
         ) then
        raise exception 'G2_ISSUANCE_CONFLICT' using errcode = '23514';
      end if;
      recovered_passport_job := true;
      v_passport_id := job_record.entity_id;
      v_passport_job_id := job_record.id;
    else
      insert into public.blockchain_jobs(
        id, entity_type, entity_id, operation_key, payload_version, payload
      ) values (
        v_passport_job_id, 'passport', v_passport_id,
        p_passport_operation_key, 1, expected_payload
      );

      select * into job_record from public.blockchain_jobs job
      where job.id = v_passport_job_id
      for update;
      if not found
         or job_record.entity_type <> 'passport'
         or job_record.entity_id <> v_passport_id
         or job_record.payload_version <> 1
         or job_record.payload <> expected_payload
         or job_record.status <> 'PENDING' then
        raise exception 'G2_ISSUANCE_CONFLICT' using errcode = '23514';
      end if;
    end if;

    insert into public.fan_passports(
      id, app_user_id, celebrity_id, quiz_pass_id, blockchain_job_id,
      mint_status, tx_hash, token_id
    ) values (
      v_passport_id, p_app_user_id, attempt_record.celebrity_id, v_pass_id, v_passport_job_id,
      case when recovered_passport_job then 'minted'::public.credential_mint_status
           else 'queued'::public.credential_mint_status end,
      case when recovered_passport_job then job_record.tx_hash end,
      case when recovered_passport_job then job_record.token_id end
    )
    on conflict (app_user_id, celebrity_id) do nothing;
    select * into passport_record from public.fan_passports passport
    where passport.app_user_id = p_app_user_id
      and passport.celebrity_id = attempt_record.celebrity_id
    for update;
    if not found
       or passport_record.id <> v_passport_id
       or passport_record.quiz_pass_id <> v_pass_id
       or passport_record.blockchain_job_id <> v_passport_job_id
       or passport_record.mint_status <> (
         case when recovered_passport_job then 'minted'::public.credential_mint_status
              else 'queued'::public.credential_mint_status end
       )
       or passport_record.tx_hash is distinct from (
         case when recovered_passport_job then job_record.tx_hash end
       )
       or passport_record.token_id is distinct from (
         case when recovered_passport_job then job_record.token_id end
       ) then
      raise exception 'G2_ISSUANCE_CONFLICT' using errcode = '23514';
    end if;
  end if;

  select * into passport_record from public.fan_passports passport
  where passport.app_user_id=p_app_user_id and passport.celebrity_id=attempt_record.celebrity_id for update;
  if not found or passport_record.id<>v_passport_id or passport_record.quiz_pass_id<>v_pass_id
    or (v_native and (passport_record.fan_action_outbox_id<>v_outbox_id or passport_record.blockchain_job_id is not null))
    or (not v_native and passport_record.blockchain_job_id<>v_passport_job_id) then
    raise exception 'G2_ISSUANCE_CONFLICT' using errcode='23514';
  end if;

  insert into public.fan_activities(
    id, app_user_id, celebrity_id, activity_type, source_type, source_id
  ) values (
    v_activity_id, p_app_user_id, attempt_record.celebrity_id,
    'knowledge', 'quiz_pass', v_pass_id
  )
  on conflict (activity_type, source_type, source_id) do nothing;
  if not exists (
    select 1 from public.fan_activities activity
    where activity.id = v_activity_id
      and activity.app_user_id = p_app_user_id
      and activity.celebrity_id = attempt_record.celebrity_id
      and activity.activity_type = 'knowledge'
      and activity.source_type = 'quiz_pass'
      and activity.source_id = v_pass_id
  ) then
    raise exception 'G2_ISSUANCE_CONFLICT' using errcode = '23514';
  end if;

  insert into public.fan_score_ledger(
    activity_id, app_user_id, celebrity_id, points
  ) values (
    v_activity_id, p_app_user_id, attempt_record.celebrity_id, 1
  )
  on conflict (activity_id) do nothing;
  if not exists (
    select 1 from public.fan_score_ledger score
    where score.activity_id = v_activity_id
      and score.app_user_id = p_app_user_id
      and score.celebrity_id = attempt_record.celebrity_id
      and score.points = 1
  ) then
    raise exception 'G2_ISSUANCE_CONFLICT' using errcode = '23514';
  end if;

  expected_payload := jsonb_build_object(
    'recipient', recipient,
    'celebritySlug', celebrity_slug,
    'issuanceId', p_stamp_issuance_id,
    'stampType', 'Knowledge'
  );
  if v_native then
    insert into public.stamps(id,app_user_id,celebrity_id,passport_id,activity_id,stamp_type,blockchain_job_id,fan_action_outbox_id)
      values(p_stamp_id,p_app_user_id,attempt_record.celebrity_id,v_passport_id,v_activity_id,'knowledge',null,v_outbox_id)
      on conflict(passport_id,activity_id,stamp_type) do nothing;
  else
    insert into public.blockchain_jobs(
      id, entity_type, entity_id, operation_key, payload_version, payload
    ) values (
      v_stamp_job_id, 'stamp', p_stamp_id,
      p_stamp_operation_key, 1, expected_payload
    )
    on conflict (operation_key) do nothing;
    select * into job_record from public.blockchain_jobs job
    where job.operation_key = p_stamp_operation_key
    for update;
    if not found
       or job_record.id <> v_stamp_job_id
       or job_record.entity_type <> 'stamp'
       or job_record.entity_id <> p_stamp_id
       or job_record.payload_version <> 1
       or job_record.payload <> expected_payload
       or job_record.status <> 'PENDING' then
      raise exception 'G2_ISSUANCE_CONFLICT' using errcode = '23514';
    end if;

    insert into public.stamps(
      id, app_user_id, celebrity_id, passport_id, activity_id,
      stamp_type, blockchain_job_id
    ) values (
      p_stamp_id, p_app_user_id, attempt_record.celebrity_id,
      v_passport_id, v_activity_id, 'knowledge', v_stamp_job_id
    )
    on conflict (passport_id, activity_id, stamp_type) do nothing;
    select * into stamp_record from public.stamps stamp
    where stamp.passport_id = v_passport_id
      and stamp.activity_id = v_activity_id
      and stamp.stamp_type = 'knowledge'
    for update;
    if not found
       or stamp_record.id <> p_stamp_id
       or stamp_record.app_user_id <> p_app_user_id
       or stamp_record.celebrity_id <> attempt_record.celebrity_id
       or stamp_record.blockchain_job_id <> v_stamp_job_id
       or stamp_record.mint_status <> 'queued' then
      raise exception 'G2_ISSUANCE_CONFLICT' using errcode = '23514';
    end if;
  end if;
  select * into stamp_record from public.stamps stamp where stamp.passport_id=v_passport_id
    and stamp.activity_id=v_activity_id and stamp.stamp_type='knowledge' for update;
  if not found or stamp_record.id<>p_stamp_id or stamp_record.app_user_id<>p_app_user_id
    or stamp_record.celebrity_id<>attempt_record.celebrity_id
    or (v_native and (stamp_record.fan_action_outbox_id<>v_outbox_id or stamp_record.blockchain_job_id is not null))
    or (not v_native and stamp_record.blockchain_job_id<>v_stamp_job_id)
    or stamp_record.mint_status<>'queued' then
    raise exception 'G2_ISSUANCE_CONFLICT' using errcode='23514';
  end if;

  return public.build_owned_quiz_submit_result(p_app_user_id, p_attempt_id);
end;
$$;

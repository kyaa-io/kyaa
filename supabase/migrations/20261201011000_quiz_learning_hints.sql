-- MIGRATION: optional learning hints; no existing issuance or answers are changed.
alter table public.celebrity_quiz_questions add column hint text check (char_length(hint) <= 1000);

do $migration$
declare definition text; updated text;
begin
  definition := pg_get_functiondef('public.save_admin_quiz_version(uuid,uuid,uuid,uuid,jsonb)'::regprocedure);
  updated := replace(definition, 'prompt_en,response_kind,active)', 'prompt_en,response_kind,active,hint)');
  updated := replace(updated, 'response_kind,coalesce((question->>''active'')::boolean,true))', 'response_kind,coalesce((question->>''active'')::boolean,true),nullif(btrim(question->>''hint''),''''))');
  if updated = definition then raise exception 'quiz save definition changed'; end if;
  execute updated;
  definition := pg_get_functiondef('public.clone_admin_quiz_version(uuid,uuid,uuid,uuid)'::regprocedure);
  updated := replace(definition, 'prompt_en,response_kind,active)', 'prompt_en,response_kind,active,hint)');
  updated := replace(updated, 'q.prompt_en,q.response_kind,q.active)', 'q.prompt_en,q.response_kind,q.active,q.hint)');
  if updated = definition then raise exception 'quiz clone definition changed'; end if;
  execute updated;
  definition := pg_get_functiondef('public.read_admin_quiz_cms_v2(uuid,uuid)'::regprocedure);
  updated := replace(definition, 'jsonb_set(question.value,''{options}''', 'jsonb_set(question.value || jsonb_build_object(''hint'',(select hint from public.celebrity_quiz_questions where id=(question.value->>''id'')::uuid)),''{options}''');
  if updated = definition then raise exception 'quiz read definition changed'; end if;
  execute updated;
end;
$migration$;

create function public.get_owned_quiz_attempt_v3(p_app_user_id uuid,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare projection jsonb;
begin
  projection := public.get_owned_quiz_attempt_v2(p_app_user_id,p_attempt_id);
  if projection->'attempt'->>'status' not in ('failed','passed') then return projection; end if;
  return jsonb_set(projection,'{questions}',(
    select jsonb_agg(item.value || case when snapshot.response_kind='choice' and not coalesce(selected.is_correct,false)
      then jsonb_build_object('learning',jsonb_build_object('hint',source.hint,'links',coalesce((
        select jsonb_agg(jsonb_build_object('title',social.platform::text,'url',social.url) order by social.position)
        from public.celebrity_social_links social join public.quiz_attempts attempt on attempt.celebrity_id=social.celebrity_id
        where attempt.id=p_attempt_id and social.active and social.url ~ '^https?://'
      ),'[]'::jsonb))) else '{}'::jsonb end order by item.ordinality)
    from jsonb_array_elements(projection->'questions') with ordinality item(value,ordinality)
    join public.quiz_attempt_questions snapshot on snapshot.id=(item.value->>'id')::uuid
    join public.celebrity_quiz_questions source on source.id=snapshot.source_question_id
    left join public.quiz_attempt_answers answer on answer.attempt_question_id=snapshot.id
    left join public.quiz_attempt_options selected on selected.id=answer.selected_option_id
  ));
end;
$$;
revoke all on function public.get_owned_quiz_attempt_v3(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_owned_quiz_attempt_v3(uuid,uuid) to service_role;

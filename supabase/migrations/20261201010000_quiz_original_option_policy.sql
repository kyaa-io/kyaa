-- Unknown legacy labels keep their registered spelling; editors opt ordinary text into translation.
alter table public.celebrity_quiz_options add column preserve_original boolean not null default true;
alter table public.quiz_attempt_options add column preserve_original boolean not null default true;

-- Keep the established editor authorization, audit and immutable-version checks intact.
do $migration$
declare definition text; updated text;
begin
  definition := pg_get_functiondef('public.save_admin_quiz_version(uuid,uuid,uuid,uuid,jsonb)'::regprocedure);
  updated := replace(definition,
    'before_row:=public.read_admin_quiz_cms(p_actor,p_celebrity); delete from public.celebrity_quiz_questions where quiz_id=target;',
    'if p_quiz is not null
   and exists(select 1 from public.celebrity_quiz_options o join public.celebrity_quiz_questions q on q.id=o.question_id where q.quiz_id=p_quiz and not o.preserve_original)
   and exists(select 1 from jsonb_array_elements(p_questions) payload_question(value) cross join lateral jsonb_array_elements(payload_question.value->''options'') payload_option(value) where not (payload_option.value ? ''preserveOriginal''))
 then raise exception ''quiz option translation policy requires current editor''; end if;
 before_row:=public.read_admin_quiz_cms(p_actor,p_celebrity); delete from public.celebrity_quiz_questions where quiz_id=target;');
  if updated = definition then raise exception 'quiz CMS save locked edit definition changed'; end if;
  definition := updated;
  updated := replace(definition,
    'insert into public.celebrity_quiz_options(question_id,position,label_ko,label_en,is_correct,active)',
    'insert into public.celebrity_quiz_options(question_id,position,label_ko,label_en,is_correct,active,preserve_original)');
  if updated = definition then raise exception 'quiz CMS save columns changed'; end if;
  definition := updated;
  updated := replace(definition,
    '(option_item->>''isCorrect'')::boolean,(option_item->>''active'')::boolean);',
    '(option_item->>''isCorrect'')::boolean,(option_item->>''active'')::boolean,coalesce((option_item->>''preserveOriginal'')::boolean,true));');
  if updated = definition then raise exception 'quiz CMS save values changed'; end if;
  execute updated;

  definition := pg_get_functiondef('public.clone_admin_quiz_version(uuid,uuid,uuid,uuid)'::regprocedure);
  updated := replace(definition,
    'insert into public.celebrity_quiz_options(question_id,position,label_ko,label_en,is_correct,active) select new_q,position,label_ko,label_en,is_correct,active',
    'insert into public.celebrity_quiz_options(question_id,position,label_ko,label_en,is_correct,active,preserve_original) select new_q,position,label_ko,label_en,is_correct,active,preserve_original');
  if updated = definition then raise exception 'quiz CMS clone definition changed'; end if;
  execute updated;
end;
$migration$;

create function public.read_admin_quiz_cms_v2(p_actor uuid,p_celebrity uuid)
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_set(quiz.value,'{questions}',(
    select coalesce(jsonb_agg(jsonb_set(question.value,'{options}',(
      select coalesce(jsonb_agg(option.value || jsonb_build_object('preserveOriginal',source_option.preserve_original) order by option.ordinality),'[]'::jsonb)
      from jsonb_array_elements(question.value->'options') with ordinality option(value,ordinality)
      join public.celebrity_quiz_options source_option on source_option.question_id=(question.value->>'id')::uuid
        and source_option.position=(option.value->>'position')::smallint
    )) order by question.ordinality),'[]'::jsonb)
    from jsonb_array_elements(quiz.value->'questions') with ordinality question(value,ordinality)
  )) order by quiz.ordinality),'[]'::jsonb)
  from jsonb_array_elements(public.read_admin_quiz_cms(p_actor,p_celebrity)) with ordinality quiz(value,ordinality);
$$;

create function public.save_admin_quiz_version_v2(p_actor uuid,p_correlation uuid,p_celebrity uuid,p_quiz uuid,p_questions jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.save_admin_quiz_version(p_actor,p_correlation,p_celebrity,p_quiz,p_questions);
  return public.read_admin_quiz_cms_v2(p_actor,p_celebrity);
end;
$$;

create function public.snapshot_quiz_option_translation_policy()
returns trigger language plpgsql set search_path='' as $$
begin
  select option.preserve_original into strict new.preserve_original
  from public.celebrity_quiz_options option where option.id=new.source_option_id;
  return new;
end;
$$;
create trigger quiz_attempt_options_translation_policy before insert on public.quiz_attempt_options
for each row execute function public.snapshot_quiz_option_translation_policy();

-- Older servers validate the original RPC JSON strictly. Only versioned RPCs expose the new field.
create function public.build_owned_quiz_attempt_projection_v2(p_app_user_id uuid,p_attempt_id uuid)
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_set(projection, '{questions}', (
    select jsonb_agg(jsonb_set(question.value,'{options}',(
      select coalesce(jsonb_agg(option.value || jsonb_build_object('preserveOriginal',snapshot.preserve_original) order by option.ordinality),'[]'::jsonb)
      from jsonb_array_elements(question.value->'options') with ordinality option(value,ordinality)
      join public.quiz_attempt_options snapshot on snapshot.id=(option.value->>'id')::uuid
    )) order by question.ordinality)
    from jsonb_array_elements(projection->'questions') with ordinality question(value,ordinality)
  ))
  from (select public.build_owned_quiz_attempt_projection(p_app_user_id,p_attempt_id) projection) owned
  where projection is not null;
$$;

create function public.get_owned_quiz_attempt_v2(p_app_user_id uuid,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=public.build_owned_quiz_attempt_projection_v2(p_app_user_id,p_attempt_id);
  if result is null then raise exception 'G2_ATTEMPT_NOT_FOUND' using errcode='P0002'; end if;
  return result;
end;
$$;

create function public.start_owned_quiz_attempt_v3(
  p_app_user_id uuid,p_celebrity_slug text,p_idempotency_key uuid,
  p_source_type text default null,p_source_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=public.start_owned_quiz_attempt_v2(p_app_user_id,p_celebrity_slug,p_idempotency_key,p_source_type,p_source_id);
  if result->>'kind'='holder' then return result; end if;
  return public.build_owned_quiz_attempt_projection_v2(p_app_user_id,(result->'attempt'->>'id')::uuid)
    || jsonb_build_object('kind','attempt');
end;
$$;

create function public.save_owned_quiz_answer_v3(
  p_app_user_id uuid,p_attempt_id uuid,p_attempt_question_id uuid,p_selected_option_id uuid,p_free_text text
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.save_owned_quiz_answer_v2(p_app_user_id,p_attempt_id,p_attempt_question_id,p_selected_option_id,p_free_text);
  return public.build_owned_quiz_attempt_projection_v2(p_app_user_id,p_attempt_id);
end;
$$;

revoke all on function public.read_admin_quiz_cms_v2(uuid,uuid),
  public.save_admin_quiz_version_v2(uuid,uuid,uuid,uuid,jsonb),
  public.snapshot_quiz_option_translation_policy(),
  public.build_owned_quiz_attempt_projection_v2(uuid,uuid),
  public.get_owned_quiz_attempt_v2(uuid,uuid),
  public.start_owned_quiz_attempt_v3(uuid,text,uuid,text,uuid),
  public.save_owned_quiz_answer_v3(uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.read_admin_quiz_cms_v2(uuid,uuid),
  public.save_admin_quiz_version_v2(uuid,uuid,uuid,uuid,jsonb),
  public.get_owned_quiz_attempt_v2(uuid,uuid),
  public.start_owned_quiz_attempt_v3(uuid,text,uuid,text,uuid),
  public.save_owned_quiz_answer_v3(uuid,uuid,uuid,uuid,text) to service_role;

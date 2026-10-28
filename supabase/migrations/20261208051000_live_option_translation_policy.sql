-- Existing choices are unclassified. Protect their registered wording until an
-- administrator explicitly marks a new draft choice as translatable.
alter table public.live_survey_options
  add column preserve_original boolean not null default true;

create or replace function public.get_admin_live_survey_v2(
  p_actor_app_user_id uuid, p_actor_allowlist_id uuid, p_live_event_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.admin_assert_active_survey_actor(p_actor_app_user_id, p_actor_allowlist_id, false);
  if not exists (select 1 from public.live_events where id = p_live_event_id) then raise exception 'live event not found'; end if;
  select jsonb_build_object(
    'liveEvent', jsonb_build_object('id', live.id, 'slug', live.slug, 'status', live.publication_status),
    'versions', coalesce(jsonb_agg(jsonb_build_object(
      'id', survey.id, 'version', survey.version, 'revision', survey.revision, 'status', survey.lifecycle_status,
      'publishedAt', survey.published_at, 'closedAt', survey.closed_at, 'archivedAt', survey.archived_at,
      'sourceSurveyId', survey.source_survey_id,
      'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', question.id, 'type', question.question_type, 'commonKey', question.common_key,
        'required', question.is_required, 'position', question.position,
        'text', jsonb_build_object(
          'ko', (select ql.question_text from public.live_survey_question_localizations ql where ql.question_id=question.id and ql.locale='ko'),
          'en', (select ql.question_text from public.live_survey_question_localizations ql where ql.question_id=question.id and ql.locale='en')
        ), 'options', coalesce((select jsonb_agg(jsonb_build_object(
          'id', option.id, 'position', option.position, 'preserveOriginal', option.preserve_original,
          'label', jsonb_build_object(
            'ko', (select ol.label from public.live_survey_option_localizations ol where ol.option_id=option.id and ol.locale='ko'),
            'en', (select ol.label from public.live_survey_option_localizations ol where ol.option_id=option.id and ol.locale='en')
          )) order by option.position) from public.live_survey_options option where option.question_id=question.id), '[]'::jsonb)
      ) order by question.position) from public.live_survey_questions question where question.survey_id=survey.id), '[]'::jsonb)
    ) order by survey.version desc) filter (where survey.id is not null), '[]'::jsonb)
  ) into result from public.live_events live left join public.live_surveys survey on survey.live_event_id=live.id
  where live.id=p_live_event_id group by live.id;
  return result;
end;
$$;

create or replace function public.admin_write_live_survey(
  p_actor_app_user_id uuid, p_actor_allowlist_id uuid, p_live_event_id uuid,
  p_command text, p_payload jsonb, p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare survey_record public.live_surveys%rowtype; source_record public.live_surveys%rowtype;
  target_survey_id uuid; next_version integer; item jsonb; option_item jsonb; question_id uuid; option_id uuid;
  question_count integer; common_count integer; expected_revision integer; before_summary jsonb := '{}'::jsonb; after_summary jsonb; result jsonb;
begin
  if p_correlation_id is null then raise exception 'correlation id is required'; end if;
  perform public.admin_assert_active_survey_actor(p_actor_app_user_id, p_actor_allowlist_id, true);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('g5:survey:'||p_live_event_id::text,0));
  perform 1 from public.live_events where id=p_live_event_id and archived_at is null for update;
  if not found then raise exception 'live event not found or archived'; end if;

  if p_command in ('create','clone') then
    select coalesce(max(version),0)+1 into next_version from public.live_surveys where live_event_id=p_live_event_id;
    if p_command='clone' then
      select * into source_record from public.live_surveys where id=(p_payload->>'sourceSurveyId')::uuid and live_event_id=p_live_event_id;
      if not found then raise exception 'source survey not found'; end if;
    end if;
    insert into public.live_surveys(live_event_id,version,source_survey_id) values(p_live_event_id,next_version,source_record.id) returning * into survey_record;
    target_survey_id := survey_record.id;
    if p_command='create' then
      insert into public.live_survey_questions(survey_id,question_type,common_key,is_required,position) values
        (target_survey_id,'rating_1_5','overall_satisfaction',true,1),
        (target_survey_id,'single_choice','purchase_intent',true,2),
        (target_survey_id,'single_choice','future_interest',true,3),
        (target_survey_id,'free_text','free_comment',false,4);
      insert into public.live_survey_question_localizations(question_id,locale,question_text)
      select q.id,l.locale,l.text from public.live_survey_questions q cross join lateral (values
        ('ko'::public.content_locale,case q.common_key when 'overall_satisfaction' then '이번 라이브는 전반적으로 만족스러웠나요?' when 'purchase_intent' then '소개된 상품을 구매할 의향이 있나요?' when 'future_interest' then '다음 라이브에도 참여하고 싶나요?' else '라이브에 대한 의견을 남겨주세요.' end),
        ('en'::public.content_locale,case q.common_key when 'overall_satisfaction' then 'How satisfied were you with this live?' when 'purchase_intent' then 'Would you consider purchasing the featured product?' when 'future_interest' then 'Would you join a future live?' else 'Share any feedback about the live.' end)
      ) l(locale,text) where q.survey_id=target_survey_id;
      insert into public.live_survey_options(question_id,position,preserve_original)
      select q.id,p,false from public.live_survey_questions q cross join generate_series(1,2) p
      where q.survey_id=target_survey_id and q.question_type='single_choice';
      insert into public.live_survey_option_localizations(option_id,locale,label)
      select o.id,l.locale,case when o.position=1 then l.yes_label else l.no_label end
      from public.live_survey_options o join public.live_survey_questions q on q.id=o.question_id
      cross join lateral (values ('ko'::public.content_locale,'예','아니요'),('en'::public.content_locale,'Yes','No')) l(locale,yes_label,no_label)
      where q.survey_id=target_survey_id;
    elsif p_command='clone' then
      insert into public.live_survey_questions(id,survey_id,question_type,common_key,is_required,position)
      select extensions.gen_random_uuid(),target_survey_id,question_type,common_key,is_required,position from public.live_survey_questions where survey_id=source_record.id;
      insert into public.live_survey_question_localizations(question_id,locale,question_text)
      select nq.id,ql.locale,ql.question_text from public.live_survey_questions oq join public.live_survey_questions nq
        on nq.survey_id=target_survey_id and nq.position=oq.position join public.live_survey_question_localizations ql on ql.question_id=oq.id where oq.survey_id=source_record.id;
      insert into public.live_survey_options(id,question_id,position,preserve_original)
      select extensions.gen_random_uuid(),nq.id,oo.position,oo.preserve_original from public.live_survey_questions oq join public.live_survey_questions nq
        on nq.survey_id=target_survey_id and nq.position=oq.position join public.live_survey_options oo on oo.question_id=oq.id where oq.survey_id=source_record.id;
      insert into public.live_survey_option_localizations(option_id,locale,label)
      select no.id,ol.locale,ol.label from public.live_survey_questions oq join public.live_survey_questions nq
        on nq.survey_id=target_survey_id and nq.position=oq.position join public.live_survey_options oo on oo.question_id=oq.id
        join public.live_survey_options no on no.question_id=nq.id and no.position=oo.position join public.live_survey_option_localizations ol on ol.option_id=oo.id
        where oq.survey_id=source_record.id;
    end if;
    perform public.assert_canonical_live_survey_schema(target_survey_id);
  else
    target_survey_id := (p_payload->>'surveyId')::uuid;
    select * into survey_record from public.live_surveys where id=target_survey_id and live_event_id=p_live_event_id for update;
    if not found then raise exception 'survey not found'; end if;
    before_summary := jsonb_build_object('surveyId',target_survey_id,'version',survey_record.version,'status',survey_record.lifecycle_status);
  end if;

  if p_command in ('publish','archive') then
    begin expected_revision := (p_payload->>'expectedRevision')::integer;
    exception when others then raise exception 'expected revision is required'; end;
    if expected_revision is null then raise exception 'expected revision is required'; end if;
    if expected_revision <> survey_record.revision then raise exception 'stale survey revision'; end if;
  end if;

  if p_command in ('edit','order') then
    if survey_record.lifecycle_status <> 'draft' then raise exception 'only draft surveys are editable'; end if;
    begin expected_revision := (p_payload->>'expectedRevision')::integer;
    exception when others then raise exception 'expected revision is required'; end;
    if expected_revision is null then raise exception 'expected revision is required'; end if;
    if expected_revision <> survey_record.revision then raise exception 'stale survey revision'; end if;
    if jsonb_typeof(p_payload->'questions') <> 'array' then raise exception 'questions are required'; end if;
    delete from public.live_survey_option_localizations localization where localization.option_id in (select o.id from public.live_survey_options o join public.live_survey_questions q on q.id=o.question_id where q.survey_id=target_survey_id);
    delete from public.live_survey_options option_row where option_row.question_id in (select id from public.live_survey_questions q where q.survey_id=target_survey_id);
    delete from public.live_survey_question_localizations localization where localization.question_id in (select id from public.live_survey_questions q where q.survey_id=target_survey_id);
    delete from public.live_survey_questions q where q.survey_id=target_survey_id;
    for item in select value from jsonb_array_elements(p_payload->'questions') value loop
      if item->>'type' not in ('single_choice','multiple_choice','rating_1_5','free_text') then raise exception 'invalid question type'; end if;
      insert into public.live_survey_questions(survey_id,question_type,common_key,is_required,position)
      values(target_survey_id,(item->>'type')::public.live_survey_question_type,nullif(item->>'commonKey','')::public.live_survey_common_question_key,
        coalesce((item->>'required')::boolean,false),(item->>'position')::smallint) returning id into question_id;
      insert into public.live_survey_question_localizations(question_id,locale,question_text) values
        (question_id,'ko',item->'text'->>'ko'),(question_id,'en',item->'text'->>'en');
      if item->>'type' in ('single_choice','multiple_choice') then
        for option_item in select value from jsonb_array_elements(coalesce(item->'options','[]'::jsonb)) value loop
          if jsonb_typeof(option_item->'preserveOriginal') is distinct from 'boolean' then raise exception 'invalid option translation policy'; end if;
          insert into public.live_survey_options(question_id,position,preserve_original) values(question_id,(option_item->>'position')::smallint,coalesce((option_item->>'preserveOriginal')::boolean,true)) returning id into option_id;
          insert into public.live_survey_option_localizations(option_id,locale,label) values
            (option_id,'ko',option_item->'label'->>'ko'),(option_id,'en',option_item->'label'->>'en');
        end loop;
      end if;
    end loop;
    perform public.assert_canonical_live_survey_schema(target_survey_id);
    update public.live_surveys set revision=revision+1 where id=target_survey_id;
  elsif p_command='publish' then
    if survey_record.lifecycle_status <> 'draft' then raise exception 'only draft surveys can be published'; end if;
    perform public.assert_canonical_live_survey_schema(target_survey_id);
    select count(*),count(*) filter(where common_key is not null) into question_count,common_count from public.live_survey_questions q where q.survey_id=target_survey_id;
    if question_count not between 4 and 6 or common_count<>4 then raise exception 'survey requires exact four common and zero to two custom questions'; end if;
    update public.live_surveys set publication_status='published',lifecycle_status='published',published_at=now(),ever_published_at=now(),revision=revision+1 where id=target_survey_id;
  elsif p_command='close' then
    if survey_record.lifecycle_status <> 'published' then raise exception 'only published surveys can be closed'; end if;
    update public.live_surveys set publication_status='draft',lifecycle_status='closed',published_at=null,closed_at=now(),revision=revision+1 where id=target_survey_id;
  elsif p_command='archive' then
    if survey_record.lifecycle_status not in ('draft','closed') then raise exception 'only draft or closed surveys can be archived'; end if;
    update public.live_surveys set publication_status='draft',lifecycle_status='archived',published_at=null,archived_at=now(),revision=revision+1 where id=target_survey_id;
  elsif p_command not in ('create','clone') then raise exception 'unsupported survey command'; end if;

  select jsonb_build_object('surveyId',id,'version',version,'revision',revision,'status',lifecycle_status) into after_summary from public.live_surveys where id=target_survey_id;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary,correlation_id)
  values(p_actor_app_user_id,p_actor_allowlist_id,'admin.survey.'||p_command,'live_survey',target_survey_id,
    jsonb_build_object('before',before_summary,'after',after_summary),p_correlation_id);
  result := public.get_admin_live_survey(p_actor_app_user_id,p_actor_allowlist_id,p_live_event_id);
  return result || jsonb_build_object('selectedSurveyId',target_survey_id);
end;
$$;

create or replace function public.admin_write_live_mission(
  p_actor_app_user_id uuid,p_actor_allowlist_id uuid,p_live_event_id uuid,p_command text,p_payload jsonb,p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare mission_id uuid; next_version integer; question_item jsonb; option_item jsonb; question_id uuid; option_id uuid; correct_position integer;
  v_visible_from timestamptz; v_visible_until timestamptz; v_display_mode text;
begin
  perform public.admin_assert_active_survey_actor(p_actor_app_user_id,p_actor_allowlist_id,true);
  if p_correlation_id is null then raise exception 'correlation id is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase2:mission:admin:'||p_live_event_id::text,0));
  if p_command in ('create','update') then
    if p_payload->>'type' not in ('quiz','survey','vote') or p_payload->>'attendanceRequirement' not in ('required','not_required') then raise exception 'invalid mission contract'; end if;
    v_visible_from:=(p_payload->>'visibleFrom')::timestamptz; v_visible_until:=(p_payload->>'visibleUntil')::timestamptz;
    if v_visible_from is null or v_visible_until is null or v_visible_from>=v_visible_until then raise exception 'invalid mission visibility window'; end if;
    if p_command='create' then
      select coalesce(max(version),0)+1 into next_version from public.live_surveys where live_event_id=p_live_event_id;
      insert into public.live_surveys(live_event_id,version,mission_type,legacy_contract,attendance_requirement,visible_from,visible_until)
      values(p_live_event_id,next_version,p_payload->>'type',false,p_payload->>'attendanceRequirement',v_visible_from,v_visible_until) returning id into mission_id;
    else
      mission_id:=(p_payload->>'missionId')::uuid;
      perform 1 from public.live_surveys where id=mission_id and live_event_id=p_live_event_id and not legacy_contract and lifecycle_status='draft' for update;
      if not found then raise exception 'draft mission not found'; end if;
      update public.live_survey_questions set correct_option_id=null where survey_id=mission_id;
      delete from public.live_survey_option_localizations where option_id in (select o.id from public.live_survey_options o join public.live_survey_questions q on q.id=o.question_id where q.survey_id=mission_id);
      delete from public.live_survey_options where question_id in (select id from public.live_survey_questions where survey_id=mission_id);
      delete from public.live_survey_question_localizations where question_id in (select id from public.live_survey_questions where survey_id=mission_id);
      delete from public.live_survey_questions where survey_id=mission_id;
      delete from public.live_survey_localizations where survey_id=mission_id;
      update public.live_surveys set mission_type=p_payload->>'type',attendance_requirement=p_payload->>'attendanceRequirement',visible_from=v_visible_from,visible_until=v_visible_until,revision=revision+1 where id=mission_id;
    end if;
    insert into public.live_survey_localizations(survey_id,locale,title,description) values
      (mission_id,'ko',p_payload->'title'->>'ko',coalesce(p_payload->'description'->>'ko','')),(mission_id,'en',p_payload->'title'->>'en',coalesce(p_payload->'description'->>'en',''));
    for question_item in select value from jsonb_array_elements(p_payload->'questions') loop
      insert into public.live_survey_questions(survey_id,question_type,is_required,position,media_type,media_url)
      values(mission_id,'single_choice',true,(question_item->>'position')::smallint,question_item->'media'->>'type',question_item->'media'->>'url') returning id into question_id;
      insert into public.live_survey_question_localizations(question_id,locale,question_text) values (question_id,'ko',question_item->'text'->>'ko'),(question_id,'en',question_item->'text'->>'en');
      correct_position:=nullif(question_item->>'correctPosition','')::integer;
      for option_item in select value from jsonb_array_elements(question_item->'options') loop
        if jsonb_typeof(option_item->'preserveOriginal') is distinct from 'boolean' then raise exception 'invalid option translation policy'; end if;
        v_display_mode:=option_item->>'displayMode';
        if v_display_mode not in ('text','media','text_media') then raise exception 'invalid mission option display mode'; end if;
        insert into public.live_survey_options(question_id,position,display_mode,media_type,media_url,preserve_original)
        values(question_id,(option_item->>'position')::smallint,v_display_mode,option_item->'media'->>'type',option_item->'media'->>'url',coalesce((option_item->>'preserveOriginal')::boolean,true)) returning id into option_id;
        insert into public.live_survey_option_localizations(option_id,locale,label) values (option_id,'ko',option_item->'label'->>'ko'),(option_id,'en',option_item->'label'->>'en');
        if (option_item->>'position')::integer=correct_position then update public.live_survey_questions set correct_option_id=option_id where id=question_id; end if;
      end loop;
    end loop;
    perform public.validate_phase2_mission_contract(mission_id);
  elsif p_command='publish' then
    mission_id:=(p_payload->>'missionId')::uuid; perform public.validate_phase2_mission_contract(mission_id);
    update public.live_surveys set publication_status='published',lifecycle_status='published',published_at=now(),ever_published_at=coalesce(ever_published_at,now()),revision=revision+1
    where id=mission_id and live_event_id=p_live_event_id and not legacy_contract and lifecycle_status='draft';
    if not found then raise exception 'publishable mission not found'; end if;
  else raise exception 'unsupported mission command'; end if;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary,correlation_id)
  values(p_actor_app_user_id,p_actor_allowlist_id,'admin.mission.'||p_command,'live_survey',mission_id::text,jsonb_build_object('missionId',mission_id,'command',p_command),p_correlation_id);
  return jsonb_build_object('missionId',mission_id);
end $$;

create function public.admin_write_live_survey_v2(
  p_actor_app_user_id uuid,p_actor_allowlist_id uuid,p_live_event_id uuid,p_command text,p_payload jsonb,p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=public.admin_write_live_survey(p_actor_app_user_id,p_actor_allowlist_id,p_live_event_id,p_command,p_payload,p_correlation_id);
  return public.get_admin_live_survey_v2(p_actor_app_user_id,p_actor_allowlist_id,p_live_event_id)
    || jsonb_build_object('selectedSurveyId',result->'selectedSurveyId');
end $$;

create function public.admin_write_live_mission_v2(
  p_actor_app_user_id uuid,p_actor_allowlist_id uuid,p_live_event_id uuid,p_command text,p_payload jsonb,p_correlation_id uuid
) returns jsonb language sql security definer set search_path='' as $$
  select public.admin_write_live_mission(p_actor_app_user_id,p_actor_allowlist_id,p_live_event_id,p_command,p_payload,p_correlation_id);
$$;

revoke all on function public.get_admin_live_survey_v2(uuid,uuid,uuid),
  public.admin_write_live_survey_v2(uuid,uuid,uuid,text,jsonb,uuid),
  public.admin_write_live_mission_v2(uuid,uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.get_admin_live_survey_v2(uuid,uuid,uuid),
  public.admin_write_live_survey_v2(uuid,uuid,uuid,text,jsonb,uuid),
  public.admin_write_live_mission_v2(uuid,uuid,uuid,text,jsonb,uuid) to service_role;

-- Keep the original projections unchanged for deployed strict-schema consumers.
-- Only the new web repositories request these versioned projections.
create function public.get_owned_live_survey_v2(p_app_user_id uuid,p_live_slug text,p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
  select case when result is null then null else jsonb_set(result,'{survey,questions}',
    coalesce((select jsonb_agg(jsonb_set(question,'{options}',
      coalesce((select jsonb_agg(choice || jsonb_build_object('preserveOriginal',coalesce(policy.preserve_original,true)) order by option_order)
        from jsonb_array_elements(question->'options') with ordinality as options(choice,option_order)
        left join public.live_survey_options policy on policy.id=(choice->>'id')::uuid),'[]'::jsonb)) order by question_order)
      from jsonb_array_elements(result->'survey'->'questions') with ordinality as questions(question,question_order)),'[]'::jsonb)) end
  from (select public.get_owned_live_survey(p_app_user_id,p_live_slug,p_locale) result) projection;
$$;

create function public.get_owned_live_missions_v2(p_app_user_id uuid,p_live_slug text,p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_set(mission,'{questions}',
    coalesce((select jsonb_agg(jsonb_set(question,'{options}',
      coalesce((select jsonb_agg(choice || jsonb_build_object('preserveOriginal',coalesce(policy.preserve_original,true)) order by option_order)
        from jsonb_array_elements(question->'options') with ordinality as options(choice,option_order)
        left join public.live_survey_options policy on policy.id=(choice->>'id')::uuid),'[]'::jsonb)) order by question_order)
      from jsonb_array_elements(mission->'questions') with ordinality as questions(question,question_order)),'[]'::jsonb)) order by mission_order),'[]'::jsonb)
  from jsonb_array_elements(public.get_owned_live_missions(p_app_user_id,p_live_slug,p_locale)) with ordinality as missions(mission,mission_order);
$$;

revoke all on function public.get_owned_live_survey_v2(uuid,text,public.content_locale),
  public.get_owned_live_missions_v2(uuid,text,public.content_locale) from public,anon,authenticated;
grant execute on function public.get_owned_live_survey_v2(uuid,text,public.content_locale),
  public.get_owned_live_missions_v2(uuid,text,public.content_locale) to service_role;

notify pgrst, 'reload schema';

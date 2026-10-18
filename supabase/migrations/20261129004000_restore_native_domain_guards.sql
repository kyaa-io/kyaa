begin;

-- Restore actor canary and verified-creator scope after the personal-letter
-- producer replacement. Preserve its surrounding reward, XP and letter logic.
do $$
declare
  signature regprocedure := 'public.submit_owned_quiz_attempt(uuid,uuid,uuid,text,text,text,text)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(signature);
  needle text := 'public.fan_action_native_enabled(1)';
  replacement text := 'public.fan_action_native_enabled(1,p_app_user_id,attempt_record.celebrity_id)';
begin
  if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1
    or position('v_native:='||needle in definition) = 0
    or position('attempt_record public.quiz_attempts%rowtype' in definition) = 0
    or position('public.enqueue_fan_action_source(''quiz_passes''' in definition) = 0 then
    raise exception 'QUIZ_NATIVE_REWARD_SCOPE_SHAPE_CHANGED';
  end if;
  execute replace(definition,needle,replacement);
end $$;

-- Keep letter-aware quiz completeness while restoring the existing brand
-- exception and mandatory profile fields removed by the same replacement.
do $$
declare
  signature regprocedure := 'public.set_admin_celebrity_publication(uuid,uuid,uuid,boolean)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(signature);
  publish_needle text := 'if p_publish then';
  count_needle text := 'if (select count(*) from public.celebrity_quizzes q where q.celebrity_id=p_celebrity and q.status=''published'') <> 1 then';
  completeness_needle text := 'if exists(select 1 from public.celebrity_quizzes q where q.celebrity_id=p_celebrity and q.status=''published'' and (';
  brand_gate text := '(select primary_role from public.celebrities where id=p_celebrity) <> ''brand'' and ';
begin
  if (length(definition)-length(replace(definition,publish_needle,'')))/length(publish_needle) <> 1
    or (length(definition)-length(replace(definition,count_needle,'')))/length(count_needle) <> 1
    or (length(definition)-length(replace(definition,completeness_needle,'')))/length(completeness_needle) <> 1
    or position('x.response_kind=''letter''' in definition) = 0 then
    raise exception 'CELEBRITY_PUBLICATION_DOMAIN_GUARDS_SHAPE_CHANGED';
  end if;
  definition := replace(definition,publish_needle,publish_needle||E'\n'
    ||'    if (select primary_role from public.celebrities where id=p_celebrity) is null then raise exception ''celebrity publication requires a primary role''; end if;'
    ||E'\n'||'    if (select fan_count from public.celebrities where id=p_celebrity) is null then raise exception ''celebrity publication requires fan count''; end if;');
  definition := replace(definition,count_needle,'if '||brand_gate||substring(count_needle from 4));
  definition := replace(definition,completeness_needle,'if '||brand_gate||substring(completeness_needle from 4));
  execute definition;
end $$;

-- The media attachment projection must keep the existing public-avatar privacy
-- helper instead of rebuilding a character-only URL from private avatar state.
do $$
declare
  signature regprocedure := 'public.fan_web_post_json(uuid,uuid,public.content_locale)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(signature);
  needle text := $old$'/images/avatars/'||coalesce(a.selected_character_id,'star-pink')||'.webp'$old$;
begin
  if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1
    or position('public.mobile_media_assets' in definition) = 0
    or position('public.fan_web_content_visible(p_app_user_id,''fan_post'',p.id)' in definition) = 0 then
    raise exception 'FAN_POST_PUBLIC_AVATAR_GUARD_SHAPE_CHANGED';
  end if;
  execute replace(definition,needle,'public.public_fan_avatar_url(p.app_user_id)');
end $$;

-- Official notice authors keep their creator image; ordinary fan authors keep
-- the existing public-avatar identity/revision and active-account safeguards.
do $$
declare
  signature regprocedure := 'public.read_celebrity_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(signature);
  needle text := $old$'/images/avatars/'||coalesce(avatar.selected_character_id,'star-pink')||'.webp'$old$;
begin
  if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1
    or position('case when v.is_official then v.celebrity_image_url' in definition) = 0
    or position('public.fan_web_content_target(p_app_user_id,''notice_comment''' in definition) = 0 then
    raise exception 'NOTICE_FAN_PUBLIC_AVATAR_GUARD_SHAPE_CHANGED';
  end if;
  execute replace(definition,needle,'public.public_fan_avatar_url(v.app_user_id)');
end $$;

-- Apply the same established public-avatar projection to the newer clip DTO
-- and clip comments without changing clip visibility, reactions or media.
do $$
declare
  target record;
  definition text;
  needle text := $old$'/images/avatars/'||coalesce(avatar.selected_character_id,'star-pink')||'.webp'$old$;
begin
  for target in select * from (values
    ('public.mobile_content_clip_json_before_author_profile(uuid,uuid,public.content_locale)'::regprocedure,'public.public_fan_avatar_url(c.app_user_id)'),
    ('public.read_mobile_content_clip_comments(uuid,uuid,timestamptz,uuid,integer,public.content_locale)'::regprocedure,'public.public_fan_avatar_url(x.app_user_id)')
  ) projections(signature,replacement) loop
    definition := pg_catalog.pg_get_functiondef(target.signature);
    if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1
      or position('public.fan_web_content_visible(' in definition) = 0
      or position('public.fan_clip_comments' in definition) = 0 then
      raise exception 'CLIP_PUBLIC_AVATAR_GUARD_SHAPE_CHANGED: %',target.signature;
    end if;
    execute replace(definition,needle,target.replacement);
  end loop;
end $$;

commit;

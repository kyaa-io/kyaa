-- Rollback of 20261220000000_content_translation_slots.sql: title/article translation rows are deleted (they cost one re-translation per post after
-- a redeploy), the three slot functions are dropped, the two whole-text functions return to their 20260926012500 bodies, and the table is back to
-- its original primary key without the slot column.
-- Run only after (1) the previous app version serves all traffic and (2) requests of the new app have ended (at least 60 seconds after the switch,
-- or after the new instances are confirmed stopped). Earlier, the new app could call a dropped function (5xx) or write a slot row again after the
-- delete, and the primary key could not be restored.
begin;
set local lock_timeout = '5s';
lock table public.content_translations in access exclusive mode;

delete from public.content_translations where slot <> 'whole';

drop function public.save_content_translation_slots(uuid,text,uuid,text,public.content_locale,integer,text,jsonb,text);
drop function public.read_content_translation_slots(uuid,text,uuid,text,public.content_locale);
drop function public.content_translation_expected_slots(text);

alter table public.content_translations
  drop constraint content_translations_pkey,
  add primary key (target_type, target_id, source_revision, source_hash, source_locale, target_locale);
alter table public.content_translations drop column slot;

create or replace function public.read_content_translation(p_app_user_id uuid,p_target_type text,p_target_id uuid,p_target_locale text,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_target jsonb; v_result jsonb;
begin
  v_target:=public.fan_web_content_target(p_app_user_id,p_target_type,p_target_id,p_locale);
  if v_target is null then raise exception 'FAN_WEB_NOT_FOUND' using errcode='P0002'; end if;
  select jsonb_build_object('targetType',t.target_type,'targetId',t.target_id,'targetLocale',t.target_locale,'translatedText',t.translated_text,'sourceRevision',t.source_revision,'cached',true)
    into v_result from public.content_translations t where t.target_type=p_target_type and t.target_id=p_target_id and t.target_locale=p_target_locale
      and t.source_revision=(v_target->>'revision')::integer and t.source_hash=v_target->>'sourceHash' and t.source_locale=v_target->>'sourceLocale';
  return v_result;
end $$;
create or replace function public.save_content_translation(p_app_user_id uuid,p_target_type text,p_target_id uuid,p_target_locale text,p_locale public.content_locale,p_source_revision integer,p_source_hash text,p_translated_text text,p_detected_source_locale text)
returns void language plpgsql security definer set search_path='' as $$
declare v_target jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  v_target:=public.fan_web_content_target(p_app_user_id,p_target_type,p_target_id,p_locale);
  if v_target is null then raise exception 'FAN_WEB_NOT_FOUND' using errcode='P0002'; end if;
  if (v_target->>'revision')::integer<>p_source_revision or v_target->>'sourceHash'<>p_source_hash then raise exception 'FAN_WEB_CONFLICT' using errcode='23514'; end if;
  if p_translated_text is null or length(btrim(p_translated_text)) not between 1 and 100000 then raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023'; end if;
  insert into public.content_translations(target_type,target_id,source_revision,source_hash,source_locale,target_locale,source_app_user_id,celebrity_id,translated_text,detected_source_locale)
    values(p_target_type,p_target_id,p_source_revision,p_source_hash,v_target->>'sourceLocale',p_target_locale,(v_target->>'appUserId')::uuid,(v_target->>'celebrityId')::uuid,p_translated_text,p_detected_source_locale)
    on conflict(target_type,target_id,source_revision,source_hash,source_locale,target_locale) do nothing;
end $$;

notify pgrst, 'reload schema';
commit;

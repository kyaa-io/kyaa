-- Board post title translation: the translation cache gets a slot. A board post's title is the first line of fan_posts.body and the article is the
-- rest; each gets its own row (slot 'title' / 'article'). Every earlier row and every whole-text translation stays slot 'whole', and the slot
-- functions never read a 'whole' row. The slots are always cut from the source text, never from a translation. The slot rule lives in
-- content_translation_expected_slots; the save function accepts exactly that set and drops any other title/article rows of the same source.
begin;

alter table public.content_translations
  add column slot text not null default 'whole' check (slot in ('whole', 'title', 'article'));
alter table public.content_translations
  drop constraint content_translations_pkey,
  add primary key (target_type, target_id, source_revision, source_hash, source_locale, target_locale, slot);

-- Whole-text cache: same behavior as before, now explicitly the 'whole' slot.
create or replace function public.read_content_translation(p_app_user_id uuid,p_target_type text,p_target_id uuid,p_target_locale text,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_target jsonb; v_result jsonb;
begin
  v_target:=public.fan_web_content_target(p_app_user_id,p_target_type,p_target_id,p_locale);
  if v_target is null then raise exception 'FAN_WEB_NOT_FOUND' using errcode='P0002'; end if;
  select jsonb_build_object('targetType',t.target_type,'targetId',t.target_id,'targetLocale',t.target_locale,'translatedText',t.translated_text,'sourceRevision',t.source_revision,'cached',true)
    into v_result from public.content_translations t where t.target_type=p_target_type and t.target_id=p_target_id and t.target_locale=p_target_locale
      and t.source_revision=(v_target->>'revision')::integer and t.source_hash=v_target->>'sourceHash' and t.source_locale=v_target->>'sourceLocale'
      and t.slot='whole';
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
    on conflict(target_type,target_id,source_revision,source_hash,source_locale,target_locale,slot) do nothing;
end $$;

-- The slot rule, the only definition: cut the source at its first LF; the part before is the title candidate and the part after is the article
-- candidate (CR stays in the text). A candidate that is not all whitespace is a slot. The whitespace set is the one String.prototype.trim uses:
-- TAB LF VT FF CR SPACE NBSP U+1680 U+2000-200A U+2028 U+2029 U+202F U+205F U+3000 U+FEFF.
create function public.content_translation_expected_slots(p_body text) returns text[]
language sql immutable set search_path='' as $$
  select coalesce(array_remove(array[
    case when pg_catalog.split_part(coalesce(p_body,''),E'\n',1) !~ '^[\t\n\v\f\r    -     　﻿]*$' then 'title' end,
    case when pg_catalog.strpos(coalesce(p_body,''),E'\n')>0
      and pg_catalog.substr(p_body,pg_catalog.strpos(p_body,E'\n')+1) !~ '^[\t\n\v\f\r    -     　﻿]*$' then 'article' end
  ],null),'{}'::text[]);
$$;

-- Cached title/article translations of a board post. Null unless every slot the source needs is cached. Only slots inside the expected set count.
create function public.read_content_translation_slots(p_app_user_id uuid,p_target_type text,p_target_id uuid,p_target_locale text,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_target jsonb; v_expected text[]; v_slots jsonb; v_found integer;
begin
  if p_target_type is distinct from 'fan_post' then raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023'; end if;
  v_target:=public.fan_web_content_target(p_app_user_id,p_target_type,p_target_id,p_locale);
  if v_target is null then raise exception 'FAN_WEB_NOT_FOUND' using errcode='P0002'; end if;
  v_expected:=public.content_translation_expected_slots(v_target->>'body');
  if cardinality(v_expected)=0 then return null; end if;
  select jsonb_object_agg(t.slot,t.translated_text),count(*) into v_slots,v_found
    from public.content_translations t where t.target_type=p_target_type and t.target_id=p_target_id and t.target_locale=p_target_locale
      and t.source_revision=(v_target->>'revision')::integer and t.source_hash=v_target->>'sourceHash' and t.source_locale=v_target->>'sourceLocale'
      and t.slot=any(v_expected);
  if v_found<>cardinality(v_expected) then return null; end if;
  return jsonb_build_object('targetType',p_target_type,'targetId',p_target_id,'targetLocale',p_target_locale,'sourceRevision',(v_target->>'revision')::integer,'cached',true,'slots',v_slots);
end $$;

-- Stores title/article translations. p_slots must have exactly the keys the source needs. Title/article rows of this source outside that set are
-- removed first, so a wrong earlier set is corrected by the next save. Existing rows in the set keep their value (first writer wins).
create function public.save_content_translation_slots(p_app_user_id uuid,p_target_type text,p_target_id uuid,p_target_locale text,p_locale public.content_locale,p_source_revision integer,p_source_hash text,p_slots jsonb,p_detected_source_locale text)
returns void language plpgsql security definer set search_path='' as $$
declare v_target jsonb; v_expected text[]; v_key text; v_value jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_target_type is distinct from 'fan_post' then raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023'; end if;
  v_target:=public.fan_web_content_target(p_app_user_id,p_target_type,p_target_id,p_locale);
  if v_target is null then raise exception 'FAN_WEB_NOT_FOUND' using errcode='P0002'; end if;
  if (v_target->>'revision')::integer<>p_source_revision or v_target->>'sourceHash'<>p_source_hash then raise exception 'FAN_WEB_CONFLICT' using errcode='23514'; end if;
  v_expected:=public.content_translation_expected_slots(v_target->>'body');
  if cardinality(v_expected)=0 or p_slots is null or jsonb_typeof(p_slots)<>'object'
    or (select count(*) from jsonb_object_keys(p_slots))<>cardinality(v_expected)
    or exists(select 1 from jsonb_object_keys(p_slots) k where k<>all(v_expected)) then raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023'; end if;
  foreach v_key in array v_expected loop
    v_value:=p_slots->v_key;
    if jsonb_typeof(v_value)<>'string' or length(btrim(v_value#>>'{}')) not between 1 and 100000 then raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023'; end if;
  end loop;
  delete from public.content_translations t where t.target_type=p_target_type and t.target_id=p_target_id and t.target_locale=p_target_locale
    and t.source_revision=p_source_revision and t.source_hash=p_source_hash and t.source_locale=v_target->>'sourceLocale'
    and t.slot in ('title','article') and t.slot<>all(v_expected);
  insert into public.content_translations(target_type,target_id,source_revision,source_hash,source_locale,target_locale,source_app_user_id,celebrity_id,translated_text,detected_source_locale,slot)
    select p_target_type,p_target_id,p_source_revision,p_source_hash,v_target->>'sourceLocale',p_target_locale,(v_target->>'appUserId')::uuid,(v_target->>'celebrityId')::uuid,p_slots->>s,p_detected_source_locale,s
    from unnest(v_expected) s
    on conflict(target_type,target_id,source_revision,source_hash,source_locale,target_locale,slot) do nothing;
end $$;

revoke all on function public.content_translation_expected_slots(text),
  public.read_content_translation_slots(uuid,text,uuid,text,public.content_locale),
  public.save_content_translation_slots(uuid,text,uuid,text,public.content_locale,integer,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.read_content_translation_slots(uuid,text,uuid,text,public.content_locale) to service_role;
grant execute on function public.save_content_translation_slots(uuid,text,uuid,text,public.content_locale,integer,text,jsonb,text) to service_role;

notify pgrst, 'reload schema';
commit;

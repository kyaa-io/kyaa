begin;

-- App language preferences and translation targets add Mongolian; source content stays KO/EN.
alter table public.app_users drop constraint app_users_preferred_locale_supported;
alter table public.app_users add constraint app_users_preferred_locale_supported
  check(preferred_locale is null or preferred_locale in('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru','mn'));
alter table public.content_translations drop constraint content_translations_target_locale_check;
alter table public.content_translations add constraint content_translations_target_locale_check
  check(target_locale in('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru','mn'));
alter table public.native_apple_reauth_handoffs drop constraint native_apple_reauth_handoffs_locale_check;
alter table public.native_apple_reauth_handoffs add constraint native_apple_reauth_handoffs_locale_check
  check(locale in('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru','mn'));
alter table public.mobile_installations drop constraint mobile_installations_locale_check;
alter table public.mobile_installations add constraint mobile_installations_locale_check
  check(locale in('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru','mn'));

alter table public.display_translations drop constraint display_translations_target_locale_check;
alter table public.display_translations add constraint display_translations_target_locale_check
  check(target_locale in('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru','mn'));
alter table public.shared_translation_cache drop constraint shared_translation_cache_target_locale_check;
alter table public.shared_translation_cache add constraint shared_translation_cache_target_locale_check
  check(target_locale in('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru','mn'));

-- Preserve the current security, ownership and version checks while widening only locale validation.
do $migration$
declare signature regprocedure; definition text; patched text;
begin
  foreach signature in array array[
    'public.initialize_owned_preferred_locale(uuid,text)'::regprocedure,
    'public.set_owned_preferred_locale(uuid,text)'::regprocedure,
    'public.mobile_patch_owned_settings(uuid,bigint,jsonb)'::regprocedure,
    'public.mobile_register_owned_installation(uuid,uuid,text,text,text,text,text,bigint,uuid)'::regprocedure
  ] loop
    definition:=pg_catalog.pg_get_functiondef(signature);
    patched:=regexp_replace(definition,$pattern$'pt'\s*,\s*'fr'\s*,\s*'ru'$pattern$,$replacement$'pt','fr','ru','mn'$replacement$,'g');
    if patched=definition then raise exception 'Mongolian locale validation update missing: %',signature; end if;
    execute patched;
  end loop;
end $migration$;

commit;

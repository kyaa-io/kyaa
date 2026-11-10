-- Shared display-translation cache: one row per (sha256 of normalized source text, target locale, translator version).
-- It holds only display translations and never touches source or CMS text. A changed source text hashes differently, so it is retranslated.
-- Service role only: no policy exists for anon/authenticated and every privilege is revoked from them.
create table public.shared_translation_cache (
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  target_locale text not null check(target_locale in ('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru')),
  translator_version text not null check(length(translator_version) between 1 and 64),
  translated_text text not null check(length(btrim(translated_text)) between 1 and 100000),
  detected_source_locale text check(detected_source_locale is null or length(detected_source_locale) between 2 and 32),
  created_at timestamptz not null default clock_timestamp(),
  primary key(source_hash,target_locale,translator_version)
);
create index shared_translation_cache_created on public.shared_translation_cache(created_at);
alter table public.shared_translation_cache enable row level security;
revoke all on public.shared_translation_cache from public,anon,authenticated;
grant all on public.shared_translation_cache to service_role;

create function public.read_shared_translations(p_source_hashes text[],p_target_locale text,p_translator_version text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_source_hashes is null or cardinality(p_source_hashes) not between 1 and 128 or exists(select 1 from unnest(p_source_hashes) h where h !~ '^[a-f0-9]{64}$') then raise exception 'TRANSLATION_INVALID_INPUT'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('sourceHash',source_hash,'translatedText',translated_text,'detectedSourceLocale',detected_source_locale))
    from public.shared_translation_cache where source_hash=any(p_source_hashes) and target_locale=p_target_locale and translator_version=p_translator_version),'[]'::jsonb);
end $$;

-- p_items: [{sourceHash, translatedText, detectedSourceLocale?}]. The first stored value wins; concurrent misses never overwrite it.
create function public.save_shared_translations(p_items jsonb,p_target_locale text,p_translator_version text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 128 then raise exception 'TRANSLATION_INVALID_INPUT'; end if;
  insert into public.shared_translation_cache(source_hash,target_locale,translator_version,translated_text,detected_source_locale)
  select i->>'sourceHash',p_target_locale,p_translator_version,i->>'translatedText',nullif(i->>'detectedSourceLocale','')
  from jsonb_array_elements(p_items) i
  on conflict(source_hash,target_locale,translator_version) do nothing;
  delete from public.shared_translation_cache where created_at < clock_timestamp()-interval '180 days';
end $$;
revoke all on function public.read_shared_translations(text[],text,text),public.save_shared_translations(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.read_shared_translations(text[],text,text),public.save_shared_translations(jsonb,text,text) to service_role;

drop function if exists public.save_shared_translations(jsonb,text,text);
drop function if exists public.read_shared_translations(text[],text,text);
drop table if exists public.shared_translation_cache;

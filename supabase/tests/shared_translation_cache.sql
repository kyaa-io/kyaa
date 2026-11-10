-- Disposable clean-chain DB only; all fixture changes roll back.
\set ON_ERROR_STOP on
begin;
do $$
declare h text:=repeat('a',64);r jsonb;
begin
  if current_database()<>'byus_clean' then raise exception 'disposable database required';end if;
  if has_table_privilege('anon','public.shared_translation_cache','insert') or has_table_privilege('authenticated','public.shared_translation_cache','insert')
    or has_table_privilege('anon','public.shared_translation_cache','select') or has_table_privilege('authenticated','public.shared_translation_cache','update')
    or has_table_privilege('authenticated','public.shared_translation_cache','delete')
    or has_function_privilege('anon','public.save_shared_translations(jsonb,text,text)','execute') or has_function_privilege('authenticated','public.save_shared_translations(jsonb,text,text)','execute')
    or has_function_privilege('authenticated','public.read_shared_translations(text[],text,text)','execute') then raise exception 'shared translation cache public ACL leak';end if;
  if not has_function_privilege('service_role','public.save_shared_translations(jsonb,text,text)','execute') then raise exception 'service role cannot write';end if;
  if not (select relrowsecurity from pg_class where oid='public.shared_translation_cache'::regclass) then raise exception 'RLS disabled';end if;
  perform public.save_shared_translations(jsonb_build_array(jsonb_build_object('sourceHash',h,'translatedText','Hello','detectedSourceLocale','ko')),'en','v1');
  perform public.save_shared_translations(jsonb_build_array(jsonb_build_object('sourceHash',h,'translatedText','Changed')),'en','v1');
  r:=public.read_shared_translations(array[h],'en','v1');
  if jsonb_array_length(r)<>1 or r->0->>'translatedText'<>'Hello' then raise exception 'first value must win';end if;
  if jsonb_array_length(public.read_shared_translations(array[h],'ja','v1'))<>0 or jsonb_array_length(public.read_shared_translations(array[h],'en','v2'))<>0 or jsonb_array_length(public.read_shared_translations(array[repeat('b',64)],'en','v1'))<>0 then raise exception 'locale/version/hash isolation failed';end if;
  raise notice 'SHARED_TRANSLATION_CACHE_PASS service-only ACL, RLS, first-write-wins, hash/locale/version isolation';
end $$;
rollback;

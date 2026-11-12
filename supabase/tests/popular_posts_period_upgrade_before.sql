do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'disposable local database required'; end if;
  if to_regprocedure('public.read_public_popular_posts_period(uuid,public.content_locale,integer,boolean,text,text)') is not null then raise exception 'period RPC existed before migration'; end if;
  if not has_function_privilege('service_role','public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)','EXECUTE')
    or has_function_privilege('anon','public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)','EXECUTE')
    or has_function_privilege('authenticated','public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)','EXECUTE') then raise exception 'old ACL changed before migration'; end if;
end $$;

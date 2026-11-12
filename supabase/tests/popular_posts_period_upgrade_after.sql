\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'disposable local database required'; end if;
  if to_regprocedure('public.read_public_popular_posts_period(uuid,public.content_locale,integer,boolean,text,text)') is null then raise exception 'period RPC missing after apply'; end if;
end $$;
begin;
do $$
declare
  creator constant uuid := '92100000-0000-4000-8000-000000000001';
  author constant uuid := '92100000-0000-4000-8000-000000000002';
  ids uuid[] := array(select ('92100000-0000-4000-8000-0000000001'||lpad(n::text,2,'0'))::uuid from generate_series(1,6) n);
  midnight timestamptz := date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  dates timestamptz[];
  result jsonb;
  got text[];
  old_def text;
  old_owner text;
  i integer;
begin
  select pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner) into old_def,old_owner from pg_proc p
    where p.oid='public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)'::regprocedure;
  if old_def is null then raise exception 'old RPC missing'; end if;
  if (select pg_get_userbyid(proowner) from pg_proc where oid='public.read_public_popular_posts_period(uuid,public.content_locale,integer,boolean,text,text)'::regprocedure)<>old_owner then raise exception 'new owner differs'; end if;
  if not has_function_privilege('service_role','public.read_public_popular_posts_period(uuid,public.content_locale,integer,boolean,text,text)','EXECUTE')
    or has_function_privilege('anon','public.read_public_popular_posts_period(uuid,public.content_locale,integer,boolean,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.read_public_popular_posts_period(uuid,public.content_locale,integer,boolean,text,text)','EXECUTE') then raise exception 'new ACL changed'; end if;
  if not has_function_privilege('service_role','public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)','EXECUTE')
    or has_function_privilege('anon','public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)','EXECUTE')
    or has_function_privilege('authenticated','public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)','EXECUTE') then raise exception 'old ACL changed'; end if;

  set local session_replication_role=replica;
  insert into public.app_users(id,privy_user_id,verified_email) values(author,'did:privy:period-author','period-author@example.test');
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(creator,'period-boundary-qa','published','/period.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(creator,'ko','기간 경계 검사','소개','사진');
  set local session_replication_role=origin;
  dates:=array[midnight,midnight-interval '1 microsecond',now()-interval '7 days',now()-interval '7 days'-interval '1 microsecond',now()-interval '30 days',now()-interval '30 days'-interval '1 microsecond'];
  for i in 1..6 loop
    insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at,updated_at)
    values(ids[i],creator,author,'boundary '||i,'public',extensions.gen_random_uuid(),repeat('a',64),dates[i],dates[i]);
  end loop;
  result:=public.read_public_popular_posts_period(null,'ko',1,false,'latest','today');
  select array_agg(item->>'id' order by ordinality) into got from jsonb_array_elements(result->'items') with ordinality t(item,ordinality);
  if got is distinct from array[ids[1]::text] then raise exception 'today midnight boundary: %',got; end if;
  result:=public.read_public_popular_posts_period(null,'ko',1,false,'latest','week');
  select array_agg(item->>'id' order by ordinality) into got from jsonb_array_elements(result->'items') with ordinality t(item,ordinality);
  if got is distinct from array[ids[1]::text,ids[2]::text,ids[3]::text] then raise exception '7-day boundary: %',got; end if;
  result:=public.read_public_popular_posts_period(null,'ko',1,false,'latest','month');
  select array_agg(item->>'id' order by ordinality) into got from jsonb_array_elements(result->'items') with ordinality t(item,ordinality);
  if got is distinct from array[ids[1]::text,ids[2]::text,ids[3]::text,ids[4]::text,ids[5]::text] then raise exception '30-day boundary: %',got; end if;
  if (select pg_get_functiondef(oid) from pg_proc where oid='public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)'::regprocedure)<>old_def then raise exception 'old RPC definition changed'; end if;
  raise notice 'PASS apply, today KST midnight, 7-day and 30-day inclusive/exclusive boundaries, owner and ACL';
end $$;
\i supabase/rollback/20261224020000_popular_posts_period.sql
do $$ begin
  if to_regprocedure('public.read_public_popular_posts_period(uuid,public.content_locale,integer,boolean,text,text)') is not null then raise exception 'rollback left period RPC'; end if;
  if to_regprocedure('public.read_public_popular_posts_sorted(uuid,public.content_locale,integer,boolean,text)') is null then raise exception 'rollback removed old RPC'; end if;
  raise notice 'PASS rollback preserves old RPC';
end $$;
\i supabase/migrations/20261224020000_popular_posts_period.sql
do $$ begin
  if to_regprocedure('public.read_public_popular_posts_period(uuid,public.content_locale,integer,boolean,text,text)') is null then raise exception 'reapply failed'; end if;
  raise notice 'PASS reapply after rollback';
end $$;
rollback;

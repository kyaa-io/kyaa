-- Run on a disposable latest-chain database. All fixtures roll back.
do $$ begin
  if current_database() <> 'byus_clean' or inet_server_addr() is not null then
    raise exception 'Fan post popular-sort tests require disposable local byus_clean';
  end if;
end $$;

begin;
create or replace function pg_temp.expect_error(p_sql text,p_message text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error %',p_message;
exception when others then
  if sqlerrm='expected error '||p_message or position(p_message in sqlerrm)=0 then raise; end if;
end $$;

do $$
declare
  creator constant uuid := '91500000-0000-4000-8000-000000000001';
  author constant uuid := '91500000-0000-4000-8000-000000000002';
  liker1 constant uuid := '91500000-0000-4000-8000-000000000003';
  liker2 constant uuid := '91500000-0000-4000-8000-000000000004';
  liker3 constant uuid := '91500000-0000-4000-8000-000000000005';
  popular_old constant uuid := '91500000-0000-4000-8000-000000000101';
  tied_lower_id constant uuid := '91500000-0000-4000-8000-000000000102';
  tied_higher_id constant uuid := '91500000-0000-4000-8000-000000000103';
  latest_low constant uuid := '91500000-0000-4000-8000-000000000104';
  result jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (author,'did:privy:popular-author','popular-author@example.test'),
    (liker1,'did:privy:popular-liker-1','popular-liker-1@example.test'),
    (liker2,'did:privy:popular-liker-2','popular-liker-2@example.test'),
    (liker3,'did:privy:popular-liker-3','popular-liker-3@example.test');
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
    values(creator,'popular-sort-qa','published','/popular-sort.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (creator,'ko','인기순 검사','소개','사진'),(creator,'en','Popular sort QA','Summary','Photo');

  insert into public.fan_posts(
    id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash,created_at,updated_at
  ) values
    (popular_old,creator,author,'older but popular','public',extensions.gen_random_uuid(),repeat('1',64),'2026-01-01 10:00:00+00','2026-01-01 10:00:00+00'),
    (tied_lower_id,creator,author,'tie lower id','public',extensions.gen_random_uuid(),repeat('2',64),'2026-01-01 12:00:00+00','2026-01-01 12:00:00+00'),
    (tied_higher_id,creator,author,'tie higher id','public',extensions.gen_random_uuid(),repeat('3',64),'2026-01-01 12:00:00+00','2026-01-01 12:00:00+00'),
    (latest_low,creator,author,'latest low score','public',extensions.gen_random_uuid(),repeat('4',64),'2026-01-01 14:00:00+00','2026-01-01 14:00:00+00');
  insert into public.fan_post_likes(post_id,app_user_id) values
    (popular_old,liker1),(popular_old,liker2),(popular_old,liker3),
    (tied_lower_id,liker1),(tied_higher_id,liker1);

  result := public.read_fan_posts(null,'popular-sort-qa',null,null,null,'latest',20,'ko');
  if (select array_agg(item->>'id' order by ordinality)
      from jsonb_array_elements(result->'items') with ordinality as rows(item,ordinality))
     <> array[latest_low::text,tied_higher_id::text,tied_lower_id::text,popular_old::text] then
    raise exception 'latest ordering failed: %',result;
  end if;

  result := public.read_fan_posts(null,'popular-sort-qa',null,null,null,'popular',20,'ko');
  if (select array_agg(item->>'id' order by ordinality)
      from jsonb_array_elements(result->'items') with ordinality as rows(item,ordinality))
     <> array[popular_old::text,tied_higher_id::text,tied_lower_id::text,latest_low::text] then
    raise exception 'popular score/time/id ordering failed: %',result;
  end if;

  result := public.read_fan_posts(
    null,'popular-sort-qa','2026-01-01 12:00:00+00',tied_higher_id,1,'popular',20,'ko'
  );
  if (select array_agg(item->>'id' order by ordinality)
      from jsonb_array_elements(result->'items') with ordinality as rows(item,ordinality))
     <> array[tied_lower_id::text,latest_low::text] then
    raise exception 'popular tie cursor failed: %',result;
  end if;

  if not has_function_privilege('service_role','public.read_fan_posts(uuid,text,timestamptz,uuid,bigint,text,integer,public.content_locale)','EXECUTE')
    or has_function_privilege('authenticated','public.read_fan_posts(uuid,text,timestamptz,uuid,bigint,text,integer,public.content_locale)','EXECUTE')
    or has_function_privilege('anon','public.read_fan_posts(uuid,text,timestamptz,uuid,bigint,text,integer,public.content_locale)','EXECUTE') then
    raise exception 'fan post read ACL changed';
  end if;
  perform pg_temp.expect_error(
    $sql$select public.read_fan_posts(null,'popular-sort-qa',null,null,1,'latest',20,'ko')$sql$,
    'FAN_WEB_INVALID_INPUT'
  );
  perform pg_temp.expect_error(
    $sql$select public.read_fan_posts(null,'popular-sort-qa',null,null,null,'unknown',20,'ko')$sql$,
    'FAN_WEB_INVALID_INPUT'
  );
  raise notice 'PASS fan post latest/popular divergence, score/time/id ties, cursor, validation, and ACL';
end $$;
rollback;

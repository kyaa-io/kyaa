\set ON_ERROR_STOP on
-- Local-only synthetic fixture on the isolated clean-chain database `byus_clean`; all rows roll back.
-- It DELETES every row of the ranking and heart-ledger tables inside the transaction, so it refuses any other database: never run it on a
-- shared or real-data database (Dev, production, the local copy of Dev).
do $guard$ begin
  if current_database() <> 'byus_clean' then
    raise exception 'HOME_RANKING_EXCLUDE_TEST_ONLY_ON_BYUS_CLEAN: refusing to run on database %', current_database();
  end if;
end $guard$;

-- Fans: admin (active allowlist entry; both app_users and admin_allowlist store emails normalized to lower case, so the SQL's lower() is only a safeguard), idle_admin (allowlist
-- entry that is not active), tester (test-*@privy.io), plain (an ordinary fan), fan1, fan2. (app_users.verified_email is NOT NULL and normalized, so a missing email cannot occur; the migration still uses coalesce so a NULL would never drop a fan.) The operator and test accounts hold the most hearts.
begin;
set local session_replication_role = replica;
delete from public.creator_heart_ledger;
delete from public.home_ranking_daily;
delete from public.home_ranking_builds;
delete from public.home_ranking_kind_builds;
delete from public.home_ranking_build_failures;
set local session_replication_role = origin;
create temporary table ex_ids(tag text primary key, id uuid default extensions.gen_random_uuid());
insert into ex_ids(tag) values ('creator'),('admin'),('idle_admin'),('tester'),('plain'),('fan1'),('fan2');
create function pg_temp.ex_id(t text) returns uuid language sql as $$ select id from ex_ids where tag=t $$;
create function pg_temp.ex_rank(f text, metric text) returns int language sql as $$
  select (r->>'rank')::int from jsonb_array_elements(public.read_home_fan_ranking_v2(null,metric,50)->'rows') r where r->>'nickname'='ex_'||f
$$;
create function pg_temp.ex_period_rank(f text, period text) returns int language sql as $$
  select (r->>'rank')::int from jsonb_array_elements(public.read_home_fan_ranking_period(null,period,50)->'rows') r where r->>'nickname'='ex_'||f
$$;
do $$ declare f text; begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(pg_temp.ex_id('creator'),'ex-fixture','published','/fixture.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(pg_temp.ex_id('creator'),'ko','Ex fixture','fixture','fixture');
  insert into public.group_pages(kind,celebrity_id,name) values('fan',pg_temp.ex_id('creator'),'Ex fixture');
  foreach f in array array['admin','idle_admin','tester','plain','fan1','fan2'] loop
    insert into public.app_users(id,privy_user_id,verified_email) values(pg_temp.ex_id(f),'did:privy:ex-'||f,
      case f when 'tester' then 'test-qa@privy.io' else f||'@ex-rank.example.test' end);
    insert into public.user_profiles(app_user_id,nickname,nickname_normalized) values(pg_temp.ex_id(f),'ex_'||f,'ex_'||f);
  end loop;
  set local session_replication_role = replica;
  -- yesterday (the base of the day gain): fan2 only, so the base build exists
  insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id,created_at)
  select pg_temp.ex_id('creator'),pg_temp.ex_id('fan2'),1,'passport_page_claim',extensions.gen_random_uuid(),'2099-11-09 23:59:00+09' from generate_series(1,5);
  -- today
  insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id,created_at)
  select pg_temp.ex_id('creator'),pg_temp.ex_id(v.who),1,'passport_page_claim',extensions.gen_random_uuid(),'2099-11-10 23:59:00+09'
    from generate_series(1,100) g(i), (values ('admin',60),('tester',50),('plain',40),('idle_admin',30),('fan1',20),('fan2',10)) v(who,n) where g.i <= v.n;
  set local session_replication_role = origin;
  perform public.refresh_home_rankings('2099-11-09 14:59:59+00');
  perform public.refresh_home_rankings('2099-11-10 14:59:59+00');
end $$;

-- Before the allowlist entry: only the test account is out (rule 2). A fan with no email is listed.
do $$ begin
  if pg_temp.ex_rank('tester','hearts') is not null then raise exception 'test-*@privy.io account is listed'; end if;
  if pg_temp.ex_rank('plain','hearts') is null then raise exception 'an ordinary fan vanished from the cumulative list'; end if;
  if pg_temp.ex_rank('admin','hearts') <> 1 then raise exception 'precondition: admin should lead before allowlisting'; end if;
end $$;

insert into public.admin_allowlist(email,role,active) values ('admin@ex-rank.example.test','admin',true), ('idle_admin@ex-rank.example.test','admin',false);

-- After: the active, differently-cased admin and the test account are out of every reader; the rest rank up without gaps; the inactive allowlist entry and the no-email fan stay.
do $$ declare m text; p text; begin
  foreach m in array array['hearts'] loop
    if pg_temp.ex_rank('admin',m) is not null then raise exception 'allowlisted admin is listed in %', m; end if;
    if pg_temp.ex_rank('tester',m) is not null then raise exception 'test account is listed in %', m; end if;
    if pg_temp.ex_rank('plain',m) <> 1 or pg_temp.ex_rank('idle_admin',m) <> 2 or pg_temp.ex_rank('fan1',m) <> 3 or pg_temp.ex_rank('fan2',m) <> 4 then
      raise exception 'cumulative ranks did not close up: plain %, idle_admin %, fan1 %, fan2 %', pg_temp.ex_rank('plain',m), pg_temp.ex_rank('idle_admin',m), pg_temp.ex_rank('fan1',m), pg_temp.ex_rank('fan2',m);
    end if;
  end loop;
  foreach p in array array['day','week'] loop
    if pg_temp.ex_period_rank('admin',p) is not null or pg_temp.ex_period_rank('tester',p) is not null then raise exception 'operator or test account is listed in the % list', p; end if;
    if pg_temp.ex_period_rank('plain',p) <> 1 or pg_temp.ex_period_rank('idle_admin',p) <> 2 or pg_temp.ex_period_rank('fan1',p) <> 3 then
      raise exception '% gain ranks did not close up: plain %, idle_admin %, fan1 %', p, pg_temp.ex_period_rank('plain',p), pg_temp.ex_period_rank('idle_admin',p), pg_temp.ex_period_rank('fan1',p);
    end if;
  end loop;
end $$;

-- Hearts, points and stored ranks are untouched (read-time filter only).
do $$ begin
  if (select count(*) from public.home_ranking_daily where kind = 'fan_hearts' and day = (select max(day) from public.home_ranking_daily)) < 6 then raise exception 'stored ranking rows were changed'; end if;
  if (select sum(amount) from public.creator_heart_ledger) <> 215 then raise exception 'ledger changed'; end if;
end $$;

-- Owner and ACL of the two patched readers stay as the untouched sibling reader's: security definer, not owned by an API role, same grants.
do $$ declare f text; begin
  foreach f in array array['public.read_home_fan_ranking_v2(uuid,text,integer)','public.read_home_fan_ranking_period(uuid,text,integer)'] loop
    if not (select prosecdef from pg_proc where oid = f::regprocedure) then raise exception '% is not security definer', f; end if;
    if (select pg_get_userbyid(proowner) from pg_proc where oid = f::regprocedure) in ('anon','authenticated','service_role') then raise exception '% is owned by an API role', f; end if;
    if has_function_privilege('anon', f, 'execute') <> has_function_privilege('anon', 'public.read_home_creator_ranking_v2(text,text,integer)', 'execute')
       or has_function_privilege('authenticated', f, 'execute') <> has_function_privilege('authenticated', 'public.read_home_creator_ranking_v2(text,text,integer)', 'execute')
       or has_function_privilege('service_role', f, 'execute') <> has_function_privilege('service_role', 'public.read_home_creator_ranking_v2(text,text,integer)', 'execute') then
      raise exception '% grants differ from the creator reader', f;
    end if;
  end loop;
end $$;
rollback;

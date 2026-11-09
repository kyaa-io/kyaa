-- B3 review F1: before 20261220034000, 5,200 members with one passport each (no tier history), so the install catch-up runs over more
-- passports than one transaction could hold per-member locks for. Disposable clean-chain database only; the rows stay for the after file.
\set ON_ERROR_STOP on
do $$ begin if current_database() not like 'b3%' and current_database() <> 'byus_clean' or inet_server_addr() is not null then
  raise exception 'Disposable Unixsocket clean-chain database required'; end if; end $$;
begin;
update public.reward_policy_activation set policy_version = 3 where singleton;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values('b3f00000-0000-4000-8000-000000000001','b3-install-scale','draft','/d.webp',null,'{artist}','idol');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values('b3f00000-0000-4000-8000-000000000001','ko','규모','b3','b3'),('b3f00000-0000-4000-8000-000000000001','en','Scale','b3','b3');
update public.celebrities set status='published' where id='b3f00000-0000-4000-8000-000000000001';
set local session_replication_role = replica;
insert into public.app_users(id,privy_user_id,verified_email,status)
  select ('b3f10000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'did:privy:b3f-' || n, 'b3f-' || n || '@byus.test', 'active' from generate_series(1, 5200) n;
insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)
  select ('b3f20000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, ('b3f10000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
    'b3f00000-0000-4000-8000-000000000001', extensions.gen_random_uuid(), extensions.gen_random_uuid() from generate_series(1, 5200) n;
-- every tenth one already at Gold (one heart), so the catch-up writes baselines too
insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id)
  select 'b3f00000-0000-4000-8000-000000000001', ('b3f10000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 1, 'passport_page_claim', extensions.gen_random_uuid()
  from generate_series(10, 5200, 10) n;
commit;

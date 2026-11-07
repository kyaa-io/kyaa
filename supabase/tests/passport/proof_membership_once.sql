-- 261107-2 review fixes: membership approved once on the proof path (list, submit, review), popular-post views under an ordinary owner,
-- creator fan-count ranking leaves unlisted creators out. Disposable clean-chain DB only; everything rolls back.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required'; end if; end $$;
begin;

create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
declare caught boolean := false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm) = 0 then raise exception 'Unexpected error %, wanted %', sqlerrm, expected; end if;
    caught := true;
  end;
  if not caught then raise exception 'Expected error was not raised: %', expected; end if;
end $$;

create function pg_temp.mkuser(u uuid, n integer) returns void language plpgsql as $$
begin
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:p3-'||n,'p3-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0xdddddddddddddddddddddddddddddddddddd'||lpad(n::text,4,'0'),'privy','embedded');
end $$;

create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'p3-pass-'||p,1,jsonb_build_object('recipient','0xdddddddddddddddddddddddddddddddddddd0001','celebritySlug','p3','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  return p;
end $$;

-- upload row owned by u for mission m (path unique per id)
create function pg_temp.mkupload(id uuid, u uuid, c uuid, m uuid, expires timestamptz default now() + interval '1 hour') returns uuid language plpgsql as $$
begin
  insert into public.certification_uploads(id,app_user_id,celebrity_id,mission_id,object_path,content_type,byte_size,width,height,sha256,expires_at)
    values(id,u,c,m,u||'/'||m||'/'||id||'.webp','image/webp',100,10,10,repeat('a',64),expires);
  return id;
end $$;
update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  c1 uuid := 'f3400000-0000-4000-8000-000000000001';
  adm uuid := 'f3400000-0000-4000-8000-000000000010'; adm_al uuid := 'f3400000-0000-4000-8000-000000000011';
  ua uuid := 'f3400000-0000-4000-8000-000000000021'; ub uuid := 'f3400000-0000-4000-8000-000000000022';
  m_ig uuid := 'f3400000-0000-4000-8000-0000000000a1';
  r jsonb; sa uuid; sb uuid; h text := repeat('c',64); raised text;
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c1,'p3m-1','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c1,'ko','P3M','P3M','P3M'),(c1,'en','P3M','P3M','P3M');
  update public.celebrities set status='published' where id=c1;
  perform pg_temp.mkuser(adm,40); perform pg_temp.mkuser(ua,41); perform pg_temp.mkuser(ub,42);
  insert into public.admin_allowlist(id,email,role,active) values(adm_al,'p3-40@byus.test','admin',true);
  perform pg_temp.mkpass(ua,c1); perform pg_temp.mkpass(ub,c1);
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;
  insert into public.certification_missions(id,celebrity_id,immutable_key,status,category,title_ko,title_en,description_ko,description_en,instructions_ko,instructions_en,opens_at,closes_at,activated_at,proof_type,proof_platform,membership_platform)
    values(m_ig,c1,'p3m-ig','active','멤버십','인스타 멤버십','Instagram membership','설명','Description','지침','Instructions',now()-interval '1 hour',now()+interval '30 days',now(),'membership','instagram','instagram');
  insert into public.certification_reward_revisions(id,mission_id,revision,policy_version,score_points,ticket_amount,actor_app_user_id,actor_admin_allowlist_id,correlation_id)
    values(extensions.gen_random_uuid(),m_ig,1,1,10,0,adm,adm_al,extensions.gen_random_uuid());

  -- The membership mission is listed and open before anything is approved.
  r := public.list_proof_missions(ua,c1,now()-interval '1 year');
  if not exists (select 1 from jsonb_array_elements(r->'missions') e where e->>'id' = m_ig::text) or jsonb_array_length(r->'approvedMissionIds') <> 0 then raise exception 'membership mission not listed %', r; end if;

  -- Same member: approved once, then the list marks it done and a new proof is refused with a fixed code.
  perform pg_temp.mkupload('f3400000-0000-4000-8000-0000000000e1',ua,c1,m_ig);
  r := public.submit_certification_proof(ua,c1,'membership','f3400000-0000-4000-8000-0000000000e1',false,null,array['1111111111111111'],extensions.gen_random_uuid(),h); sa := (r->>'id')::uuid;
  r := public.review_certification_proof(adm,sa,1,'approved');
  if r->>'status' <> 'approved' then raise exception 'membership proof not approved %', r; end if;
  r := public.list_proof_missions(ua,c1,now()-interval '1 year');
  if not (r->'approvedMissionIds' ? m_ig::text) then raise exception 'approved membership not marked %', r; end if;
  perform pg_temp.mkupload('f3400000-0000-4000-8000-0000000000e2',ua,c1,m_ig);
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,''membership'',''f3400000-0000-4000-8000-0000000000e2'',false,null,array[''2222222222222222''],extensions.gen_random_uuid(),%L)',ua,c1,h),'PROOF_ALREADY_APPROVED');

  -- Another member has a proof pending when a legacy-flow approval (proof_type null) for the same platform lands: approving the proof is
  -- refused with the fixed code instead of the unique index's 23505, the row stays pending, and a later proof is refused at submit.
  perform pg_temp.mkupload('f3400000-0000-4000-8000-0000000000e3',ub,c1,m_ig);
  r := public.submit_certification_proof(ub,c1,'membership','f3400000-0000-4000-8000-0000000000e3',false,null,array['3333333333333333'],extensions.gen_random_uuid(),h); sb := (r->>'id')::uuid;
  set local session_replication_role = replica;
  insert into public.certification_submissions(app_user_id,celebrity_id,mission_id,mission_revision,reward_revision_id,reward_revision,reward_policy_version,reward_score_points,reward_ticket_amount,attempt_number,idempotency_key,request_hash,status,membership_platform,review_source,reviewed_by_app_user_id,reviewed_by_admin_allowlist_id,reviewed_at)
    select ub,c1,m_ig,1,rr.id,1,1,10,0,9,extensions.gen_random_uuid(),h,'approved','instagram','admin_web',adm,adm_al,now() from public.certification_reward_revisions rr where rr.mission_id=m_ig;
  set local session_replication_role = origin;
  raised := null;
  begin perform public.review_certification_proof(adm,sb,1,'approved'); exception when others then raised := sqlerrm; end;
  if raised is distinct from 'PROOF_ALREADY_APPROVED' then raise exception 'approval after legacy approval: wanted PROOF_ALREADY_APPROVED, got %', raised; end if;
  if (select status::text from public.certification_submissions where id=sb) <> 'pending' then raise exception 'refused approval changed the row'; end if;
  r := public.list_proof_missions(ub,c1,now()-interval '1 year');
  if not (r->'approvedMissionIds' ? m_ig::text) then raise exception 'legacy approval not marked %', r; end if;
  perform public.review_certification_proof(adm,sb,1,'rejected','이미 받은 멤버십이에요');
  perform pg_temp.mkupload('f3400000-0000-4000-8000-0000000000e4',ub,c1,m_ig);
  perform pg_temp.expect_error(format('select public.submit_certification_proof(%L,%L,''membership'',''f3400000-0000-4000-8000-0000000000e4'',false,null,array[''4444444444444444''],extensions.gen_random_uuid(),%L)',ub,c1,h),'PROOF_ALREADY_APPROVED');
  raise notice 'PASS membership approved once on the proof path';
end $$;

-- Popular-post views under an ordinary owner: forced row security without the access step answers 0, with it the real count.
create role popular_views_owner nologin nosuperuser nobypassrls;
grant usage on schema public, extensions to popular_views_owner;
do $$
declare post uuid := extensions.gen_random_uuid(); n bigint;
begin
  set local session_replication_role = replica;
  insert into public.fan_post_views(post_id,app_user_id) values(post,extensions.gen_random_uuid()),(post,extensions.gen_random_uuid());
  set local session_replication_role = origin;
  create function pg_temp.views_as_owner(p uuid) returns bigint language sql security definer set search_path = '' as $f$ select count(*) from public.fan_post_views v where v.post_id = p $f$;
  alter function pg_temp.views_as_owner(uuid) owner to popular_views_owner;
  alter function public.read_public_popular_posts_page(uuid,public.content_locale,integer,boolean) owner to popular_views_owner;
  begin n := pg_temp.views_as_owner(post); exception when insufficient_privilege then n := -1; end;
  if n > 0 then raise exception 'ordinary owner read views before the access step'; end if;
  perform public.popular_posts_view_owner_access();
  n := pg_temp.views_as_owner(post);
  if n <> 2 then raise exception 'ordinary owner counted % views, wanted 2', n; end if;
  -- Only the newly read table is covered here; the other tables this function read before 20261214041000 keep their own owner setup.
  raise notice 'PASS popular views under an ordinary owner';
end $$;

-- Unlisted creators stay out of the creator fan-count ranking.
do $$
declare def text := pg_catalog.pg_get_functiondef('public.read_creator_fan_ranking(text,integer)'::regprocedure);
begin
  if position('public.creator_listed(c.id)' in def) = 0 then raise exception 'creator fan ranking does not filter listed'; end if;
  raise notice 'PASS creator fan ranking filters listed';
end $$;
rollback;

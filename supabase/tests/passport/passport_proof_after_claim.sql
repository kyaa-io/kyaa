-- Proof approval after page 1 was claimed (title already held without a proof link). Disposable clean-chain DB only; everything rolls back.
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
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:p3c-'||n,'p3c-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'||lpad(n::text,4,'0'),'privy','embedded');
end $$;

create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'p3c-pass-'||p,1,jsonb_build_object('recipient','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0001','celebritySlug','p3c','passportId','0x'||repeat('1',64)));
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(p,u,c,extensions.gen_random_uuid(),j);
  set local session_replication_role = origin;
  return p;
end $$;

create function pg_temp.mkupload(id uuid, u uuid, c uuid, m uuid) returns uuid language plpgsql as $$
begin
  insert into public.certification_uploads(id,app_user_id,celebrity_id,mission_id,object_path,content_type,byte_size,width,height,sha256,expires_at)
    values(id,u,c,m,u||'/'||m||'/'||id||'.webp','image/webp',100,10,10,repeat('a',64),now() + interval '1 hour');
  return id;
end $$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  c1 uuid := 'f3400000-0000-4000-8000-000000000001';
  adm uuid := 'f3400000-0000-4000-8000-000000000010'; adm_al uuid := 'f3400000-0000-4000-8000-000000000011';
  ua uuid := 'f3400000-0000-4000-8000-000000000021'; ub uuid := 'f3400000-0000-4000-8000-000000000022';
  m1 uuid := 'f3400000-0000-4000-8000-0000000000a1'; rr1 uuid := 'f3400000-0000-4000-8000-0000000000b1';
  pa uuid; pb uuid; r jsonb; r2 jsonb; sa uuid; sb uuid; k integer := 0;
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c1,'p3c-1','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c1,'ko','P3C','P3C','P3C'),(c1,'en','P3C','P3C','P3C');
  update public.celebrities set status='published' where id=c1;
  perform pg_temp.mkuser(adm,10); perform pg_temp.mkuser(ua,21); perform pg_temp.mkuser(ub,22);
  insert into public.admin_allowlist(id,email,role,active) values(adm_al,'p3c-10@byus.test','admin',true);
  pa := pg_temp.mkpass(ua,c1); pb := pg_temp.mkpass(ub,c1);
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;
  insert into public.certification_missions(id,celebrity_id,immutable_key,status,category,title_ko,title_en,description_ko,description_en,instructions_ko,instructions_en,opens_at,closes_at,activated_at,proof_type)
    values(m1,c1,'p3c-receipt','active','영수증','영수증 인증','Receipt proof','설명','Description','지침','Instructions',now()-interval '1 hour',now()+interval '30 days',now(),'receipt');
  insert into public.certification_reward_revisions(id,mission_id,revision,policy_version,score_points,ticket_amount,actor_app_user_id,actor_admin_allowlist_id,correlation_id)
    values(rr1,m1,1,1,0,0,adm,adm_al,extensions.gen_random_uuid());

  -- both members already hold the jjinfan title without a proof link (page 1 claimed first)
  insert into public.jjinfan_titles(app_user_id, celebrity_id) values (ua, c1), (ub, c1);

  perform pg_temp.mkupload('f3400000-0000-4000-8000-0000000000c1',ua,c1,m1);
  perform pg_temp.mkupload('f3400000-0000-4000-8000-0000000000c2',ub,c1,m1);
  r := public.submit_certification_proof(ua,c1,'receipt','f3400000-0000-4000-8000-0000000000c1',true,true,array['0123456789abcdef'],'f3400000-0000-4000-8000-0000000000d1',repeat('1',64),false,'영수증 인증해요');
  sa := (r->>'id')::uuid;
  r2 := public.submit_certification_proof(ub,c1,'receipt','f3400000-0000-4000-8000-0000000000c2',false,false,array['1111111111111111'],'f3400000-0000-4000-8000-0000000000d2',repeat('2',64));
  sb := (r2->>'id')::uuid;

  -- consented approval: succeeds, one public post, title linked to the proof
  r := public.review_certification_proof(adm,sa,(r->>'revision')::bigint,'approved','완료');
  if r->>'status' <> 'approved' or r->>'postId' is null then raise exception 'consented approval after claim wrong %', r; end if;
  if (select count(*) from public.fan_posts where source_type='certification_submission' and source_id=sa) <> 1 then raise exception 'post must exist exactly once'; end if;
  if (select proof_submission_id from public.jjinfan_titles where app_user_id=ua and celebrity_id=c1) is distinct from sa then raise exception 'title not linked'; end if;
  if (select public_post_id from public.certification_submissions where id=sa) is distinct from (r->>'postId')::uuid then raise exception 'public_post_id missing'; end if;
  k := k + 1;

  -- replay: no second post, no second payout
  r2 := public.review_certification_proof(adm,sa,(r->>'revision')::bigint - 1,'approved');
  if not (r2->>'replayed')::boolean or r2->>'postId' is distinct from r->>'postId' then raise exception 'replay wrong %', r2; end if;
  if (select count(*) from public.fan_posts where source_type='certification_submission' and source_id=sa) <> 1 then raise exception 'replay made a second post'; end if;
  if (select count(*) from public.dukjil_action_log where app_user_id=ua and action_key='proof' and source_key=sa::text) <> 1 then raise exception 'replay paid twice'; end if;
  k := k + 1;

  -- no consent: approved, linked, not published
  select public.review_certification_proof(adm,sb,review_revision,'approved') into r2 from public.certification_submissions where id=sb;
  if r2->>'status' <> 'approved' or r2->>'postId' is not null then raise exception 'consent-less approval wrong %', r2; end if;
  if exists (select 1 from public.fan_posts where source_type='certification_submission' and source_id=sb) then raise exception 'consent-less proof was published'; end if;
  if (select proof_submission_id from public.jjinfan_titles where app_user_id=ub and celebrity_id=c1) is distinct from sb then raise exception 'title not linked (consent-less)'; end if;
  k := k + 1;

  -- the guard still protects everything else
  perform pg_temp.expect_error(format('update public.jjinfan_titles set proof_submission_id=%L where app_user_id=%L',extensions.gen_random_uuid(),ua),'PASSPORT_TABLE_IMMUTABLE');
  perform pg_temp.expect_error(format('update public.jjinfan_titles set claim_page_no=2 where app_user_id=%L',ub),'PASSPORT_TABLE_IMMUTABLE');
  perform pg_temp.expect_error(format('delete from public.jjinfan_titles where app_user_id=%L',ub),'PASSPORT_TABLE_IMMUTABLE');
  k := k + 1;

  raise notice 'passport proof after claim: % assertion groups passed', k;
end $$;

select 'passport proof after claim verification passed' as result;
rollback;

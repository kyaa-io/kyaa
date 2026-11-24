do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required'; end if; end $$;
begin;
create function pg_temp.mkuser(u uuid, n integer) returns void language plpgsql as $$
begin
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:r15-'||n,'r15-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'||lpad(n::text,4,'0'),'privy','embedded');
end $$;

create function pg_temp.mkpass(u uuid, c uuid) returns uuid language plpgsql as $$
declare j uuid := extensions.gen_random_uuid(); p uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
    values(j,'passport',p,'r15-pass-'||p,1,jsonb_build_object('recipient','0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0001','celebritySlug','r15','passportId','0x'||repeat('1',64)));
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
  c1 uuid := 'f1500000-0000-4000-8000-000000000001';
  adm uuid := 'f1500000-0000-4000-8000-000000000010'; adm_al uuid := 'f1500000-0000-4000-8000-000000000011';
  ua uuid := 'f1500000-0000-4000-8000-000000000021'; ub uuid := 'f1500000-0000-4000-8000-000000000022';
  m1 uuid := 'f1500000-0000-4000-8000-0000000000a1'; rr1 uuid := 'f1500000-0000-4000-8000-0000000000b1';
  u uuid; upload uuid; submission uuid; review jsonb; revision bigint; expected text; balance_before bigint;
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c1,'r15-1','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c1,'ko','R15','R15','R15'),(c1,'en','R15','R15','R15');
  update public.celebrities set status='published' where id=c1;
  perform pg_temp.mkuser(adm,10); perform pg_temp.mkuser(ua,21); perform pg_temp.mkuser(ub,22);
  insert into public.admin_allowlist(id,email,role,active) values(adm_al,'r15-10@byus.test','admin',true);
  perform pg_temp.mkpass(ua,c1); perform pg_temp.mkpass(ub,c1);
  perform public.activate_reward_policy(3,now()-interval '1 second',adm,'proof reward test');
  insert into public.dukjil_policy_versions(version,rules,mission_book,note)
    select 987, jsonb_set(rules #- '{actions,proof,firstPoints}' #- '{actions,proof,pointCap}','{actions,proof,points}','1000'), mission_book,'test'
    from public.dukjil_policy_versions where version=1;
  update public.dukjil_policy_versions set status='active',effective_from=now()-interval '1 hour', activated_at=now() where version=987;
  insert into public.certification_missions(id,celebrity_id,immutable_key,status,category,title_ko,title_en,description_ko,description_en,instructions_ko,instructions_en,opens_at,closes_at,activated_at,proof_type)
    values(m1,c1,'r15-receipt','active','영수증','영수증 인증','Receipt proof','설명','Description','지침','Instructions',now()-interval '1 hour',now()+interval '30 days',now(),'receipt');
  insert into public.certification_reward_revisions(id,mission_id,revision,policy_version,score_points,ticket_amount,actor_app_user_id,actor_admin_allowlist_id,correlation_id)
    values(rr1,m1,1,1,0,0,adm,adm_al,extensions.gen_random_uuid());
  insert into public.fan_heart_conversions(app_user_id,celebrity_id,stamps_counted,hearts,remainder,cutoff_at)
    values(ub,c1,252,28,0,now());
  foreach u in array array[ua,ua,ub] loop
    expected := case when u=ua and public.proof_reward_stage(u,c1) is null then 'silver-1' when u=ua then 'silver-2' else 'diamond-1' end;
    balance_before := public.group_wallet_balance(u,'fan_point');
    upload := pg_temp.mkupload(extensions.gen_random_uuid(),u,c1,m1);
    review := public.submit_certification_proof(u,c1,'receipt',upload,false,false,array['0123456789abcdef'],extensions.gen_random_uuid(),repeat('1',64));
    submission := (review->>'id')::uuid;
    revision := (review->>'revision')::bigint;
    review := public.review_certification_proof(adm,submission,revision,'approved');
    assert review->>'points'='1000';
    assert public.get_fan_passport_stage(u,c1)->>'stageKey'=expected;
    review := public.review_certification_proof(adm,submission,revision,'approved');
    assert (review->>'replayed')::boolean;
    assert public.group_wallet_balance(u,'fan_point')=balance_before+1000;
    assert public.get_fan_passport_stage(u,c1)->>'stageKey'=expected;
    if expected='silver-2' then
      perform public.void_passport_stamp(adm,(select stamp_id from public.dukjil_action_log where source_key=submission::text and action_key='proof'),'proof reward test',false,'reward-test-void');
      assert public.get_fan_passport_stage(u,c1)->>'stageKey'='silver-1';
      assert public.group_wallet_balance(u,'fan_point')=balance_before;
    end if;
  end loop;
end $$;
rollback;

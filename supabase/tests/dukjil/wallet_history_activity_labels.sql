-- Replay check for 20261211300000_wallet_history_activity_labels.sql: the wallet history names the activity of a dukjil row and why a correction took points back.
-- Disposable clean-chain DB only; everything rolls back. Run (own temporary PostgreSQL, applies every migration first):
--   BYUS_CLEAN_DB_PORT=55481 BYUS_CLEAN_DB_ASSERTION_FILE=$PWD/supabase/tests/dukjil/wallet_history_activity_labels.sql bash scripts/verify-clean-migration-chain.sh
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

-- A post/comment row plus the grant exactly as the real award writes it: the ledger row's source_id is the action log row's id.
create function pg_temp.mkpost(u uuid, c uuid, stamped boolean) returns uuid language plpgsql as $$
declare p uuid := extensions.gen_random_uuid(); s uuid; lid uuid; lg uuid := extensions.gen_random_uuid();
begin
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash) values(p,c,u,'cdel post body '||p,extensions.gen_random_uuid(),'h');
  lid := public.group_wallet_post(u,'fan_point',20::bigint,'dukjil_action',lg);
  if stamped then s := pg_temp.mkstamp(u,c,'post','cdel-post-'||p); end if;
  insert into public.dukjil_action_log(id,app_user_id,celebrity_id,action_key,source_key,request_key,points,stamp_id,ledger_id,capped,reason,policy_version,kst_date)
    values(lg,u,c,'post',p::text,extensions.gen_random_uuid(),20,s,lid,not stamped,case when stamped then null else 'STAMP_CAP' end,1,public.dukjil_kst_date());
  return p;
end $$;

create function pg_temp.mkcomment(u uuid, c uuid, post uuid) returns uuid language plpgsql as $$
declare k uuid := extensions.gen_random_uuid(); lid uuid; lg uuid := extensions.gen_random_uuid();
begin
  insert into public.fan_post_comments(id,post_id,app_user_id,body,idempotency_key) values(k,post,u,'cdel comment',extensions.gen_random_uuid());
  lid := public.group_wallet_post(u,'fan_point',3::bigint,'dukjil_action',lg);
  insert into public.dukjil_action_log(id,app_user_id,celebrity_id,action_key,source_key,request_key,points,ledger_id,capped,policy_version,kst_date)
    values(lg,u,c,'comment',k::text,extensions.gen_random_uuid(),3,lid,false,1,public.dukjil_kst_date());
  return k;
end $$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('b',64), rewards_start_on = current_date;

do $$
declare
  c1 uuid := 'd9200000-0000-4000-8000-000000000001';
  uo uuid := 'd9200000-0000-4000-8000-000000000011'; other uuid := 'd9200000-0000-4000-8000-000000000012';
  p_keep uuid; p_del uuid; k1 uuid; k2 uuid; att uuid := extensions.gen_random_uuid(); att_other uuid := extensions.gen_random_uuid(); inv uuid := extensions.gen_random_uuid(); lid uuid; h jsonb; e jsonb; n integer; i integer; before_rows jsonb;
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c1,'whl-c1','draft','/d.webp',null,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c1,'ko','이력','이력','이력'),(c1,'en','Whl','Whl','Whl');
  update public.celebrities set status='published' where id=c1;
  for i in 1..2 loop
    insert into public.app_users(id,privy_user_id,verified_email,status) values((array[uo,other])[i],'did:privy:whl-'||i,'whl-'||i||'@byus.test','active');
    insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
      values((array[uo,other])[i],91342,'0xdddddddddddddddddddddddddddddddddddd'||lpad(i::text,4,'0'),'privy','embedded');
  end loop;
  update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;

  -- grants: two posts (one stays, one is deleted), two comments (one is hidden), one legacy-style row without an action log
  p_keep := pg_temp.mkpost(uo,c1,false);
  p_del  := pg_temp.mkpost(uo,c1,false);
  k1 := pg_temp.mkcomment(uo,c1,p_keep);
  k2 := pg_temp.mkcomment(uo,c1,p_keep);
  perform public.group_wallet_post(uo,'fan_point',7::bigint,'dukjil_action',extensions.gen_random_uuid());
  perform public.group_wallet_post(other,'fan_point',20::bigint,'dukjil_action',extensions.gen_random_uuid());
  -- check-in grant exactly as attend_creator posts it: 'dukjil_action' whose source_id is the attendance row (not an action log row).
  -- The policy's check-in is 2 P (checkin.points), so the +2 P rows seen as "활동 참여" are these; a 7-day streak pays 2 + 10 in one row.
  lid := public.group_wallet_post(uo,'fan_point',2::bigint,'dukjil_action',att);
  insert into public.group_creator_attendance(id,app_user_id,celebrity_id,attendance_date,streak,points,stamp_id,ledger_id,request_key,policy_version)
    values(att,uo,c1,public.dukjil_kst_date(),1,2,null,lid,extensions.gen_random_uuid(),1);
  -- another owner's attendance id used as the source of this owner's row must not be read as a check-in
  lid := public.group_wallet_post(other,'fan_point',10::bigint,'dukjil_action',att_other);
  insert into public.group_creator_attendance(id,app_user_id,celebrity_id,attendance_date,streak,points,stamp_id,ledger_id,request_key,policy_version)
    values(att_other,other,c1,public.dukjil_kst_date(),1,10,null,lid,extensions.gen_random_uuid(),1);
  perform public.group_wallet_post(uo,'fan_point',9::bigint,'dukjil_action',att_other);
  -- the invited friend's own reward (action_key invite_friend, no creator)
  lid := public.group_wallet_post(uo,'fan_point',100::bigint,'dukjil_action',inv);
  insert into public.dukjil_action_log(id,app_user_id,celebrity_id,action_key,source_key,request_key,points,ledger_id,capped,policy_version,kst_date)
    values(inv,uo,null,'invite_friend','whl-invite',extensions.gen_random_uuid(),100,lid,false,1,public.dukjil_kst_date());
  perform public.remove_fan_post(uo,p_del);
  perform public.dukjil_correct_content_grant(uo,uo,'comment',k2::text,'content_hidden');

  h := public.read_owned_group_wallet_history(uo,30)->'entries';
  select count(*) into n from jsonb_array_elements(h);
  if n < 10 then raise exception 'history rows %', n; end if;

  -- base columns are unchanged and every row has the two new keys
  for e in select * from jsonb_array_elements(h) loop
    if not (e ?& array['id','asset','amount','sourceType','sourceId','celebrityId','createdAt','actionKey','correctionReason']) then raise exception 'row keys %', e; end if;
  end loop;

  -- named activities
  if (select count(*) from jsonb_array_elements(h) x where x->>'sourceType'='dukjil_action' and x->>'actionKey'='post' and (x->>'amount')::int=20) <> 2 then raise exception 'post grants not named'; end if;
  if (select count(*) from jsonb_array_elements(h) x where x->>'sourceType'='dukjil_action' and x->>'actionKey'='comment' and (x->>'amount')::int=3) <> 2 then raise exception 'comment grants not named'; end if;
  if (select count(*) from jsonb_array_elements(h) x where x->>'sourceType'='dukjil_action' and x->>'actionKey'='invite_friend' and (x->>'amount')::int=100) <> 1 then raise exception 'invite_friend grant not named'; end if;
  -- the 2 P check-in grant is named 'checkin'; a row pointing at someone else's attendance stays unnamed
  if (select count(*) from jsonb_array_elements(h) x where x->>'sourceType'='dukjil_action' and x->>'actionKey'='checkin' and (x->>'amount')::int=2) <> 1 then raise exception 'check-in grant not named'; end if;
  if (select count(*) from jsonb_array_elements(h) x where x->>'sourceType'='dukjil_action' and (x->>'amount')::int=9 and x->'actionKey'='null'::jsonb) <> 1 then raise exception 'foreign attendance source must stay unnamed'; end if;
  -- a row without an action log keeps no activity (the screen shows its generic name)
  if (select count(*) from jsonb_array_elements(h) x where x->>'sourceType'='dukjil_action' and (x->>'amount')::int=7 and x->'actionKey'='null'::jsonb) <> 1 then raise exception 'legacy row must have a null actionKey'; end if;
  -- corrections: deleted post, hidden comment
  if (select count(*) from jsonb_array_elements(h) x where x->>'sourceType'='dukjil_correction' and x->>'actionKey'='post' and x->>'correctionReason'='content_deleted' and (x->>'amount')::int=-20) <> 1 then raise exception 'deleted-post correction not named'; end if;
  if (select count(*) from jsonb_array_elements(h) x where x->>'sourceType'='dukjil_correction' and x->>'actionKey'='comment' and x->>'correctionReason'='content_hidden' and (x->>'amount')::int=-3) <> 1 then raise exception 'hidden-comment correction not named'; end if;
  -- non-correction rows never carry a correction reason
  if exists(select 1 from jsonb_array_elements(h) x where x->>'sourceType'<>'dukjil_correction' and x->'correctionReason'<>'null'::jsonb) then raise exception 'reason on a non-correction row'; end if;

  -- isolation: the other owner's rows are not mixed in, and the amounts match the ledger
  if (select count(*) from jsonb_array_elements(public.read_owned_group_wallet_history(other,30)->'entries')) <> 2 then raise exception 'other owner history'; end if;
  if (select coalesce(sum((x->>'amount')::bigint),0) from jsonb_array_elements(h) x where x->>'asset'='fan_point') <> public.group_wallet_balance(uo,'fan_point') then raise exception 'history amounts do not add up to the balance'; end if;

  -- limit contract and privileges are unchanged
  perform pg_temp.expect_error(format('select public.read_owned_group_wallet_history(%L,0)',uo),'GROUP_WALLET_INVALID');
  perform pg_temp.expect_error(format('select public.read_owned_group_wallet_history(%L,101)',uo),'GROUP_WALLET_INVALID');
  if not has_function_privilege('service_role','public.read_owned_group_wallet_history(uuid,integer)','execute')
     or has_function_privilege('anon','public.read_owned_group_wallet_history(uuid,integer)','execute')
     or has_function_privilege('authenticated','public.read_owned_group_wallet_history(uuid,integer)','execute') then raise exception 'history reader privileges'; end if;
  raise notice 'PASS wallet history activity labels';
end $$;
rollback;

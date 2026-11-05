-- PASSPORT-RENEWAL FIX3 assertions. Disposable clean-chain DB only; everything rolls back.
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
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FIX3 assertion failed: %', label; end if; end $$;

create function pg_temp.mkuser(n integer) returns uuid language plpgsql as $$
declare u uuid := ('f3300000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
begin
  insert into public.app_users(id,privy_user_id,verified_email,status) values(u,'did:privy:fix3-'||n,'fix3-'||n||'@byus.test','active');
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
    values(u,91342,'0x'||lpad(n::text,40,'e'),'privy','embedded');
  return u;
end $$;

create function pg_temp.mkcel(n integer, with_quiz boolean) returns uuid language plpgsql as $$
declare c uuid := ('f3310000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid; qz uuid := extensions.gen_random_uuid(); q uuid; i integer;
begin
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values(c,'fix3-cel-'||n,'draft','/d.webp','{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
    values(c,'ko','수정'||n,'수정','수정'),(c,'en','Fix'||n,'Fix','Fix');
  if with_quiz then
    insert into public.celebrity_quizzes(id,celebrity_id,version,status) values(qz,c,1,'draft');
    for i in 1..3 loop
      q := extensions.gen_random_uuid();
      insert into public.celebrity_quiz_questions(id,quiz_id,position,prompt_ko,prompt_en,response_kind) values(q,qz,i,'질문 '||i,'Question '||i,'choice');
      insert into public.celebrity_quiz_options(id,question_id,position,label_ko,label_en,is_correct)
        values(extensions.gen_random_uuid(),q,1,'정답','Correct',true),(extensions.gen_random_uuid(),q,2,'오답','Wrong',false);
    end loop;
    update public.celebrity_quizzes set status='published',published_at=clock_timestamp() where id=qz;
  end if;
  update public.celebrities set status='published',published_at=coalesce(published_at,clock_timestamp()) where id=c;
  return c;
end $$;

-- A real entry-screening pass through the product RPC. Returns the submit result.
create function pg_temp.pass_quiz(u uuid, cel uuid) returns jsonb language plpgsql as $$
declare slug text; att jsonb; aid uuid; r record; s uuid := extensions.gen_random_uuid();
begin
  select c.slug into strict slug from public.celebrities c where c.id=cel;
  att := public.start_owned_quiz_attempt(u,slug,extensions.gen_random_uuid());
  aid := (att->'attempt'->>'id')::uuid;
  for r in select qq.id qid, o.id oid from public.quiz_attempt_questions qq
           join public.quiz_attempt_options o on o.attempt_question_id=qq.id and o.is_correct where qq.attempt_id=aid
  loop perform public.save_owned_quiz_answer(u,aid,r.qid,r.oid); end loop;
  return public.submit_owned_quiz_attempt(u,aid,s,'byus:passport:v1:'||u::text||':'||slug,'0x'||repeat('a',64),'byus:stamp:v1:'||s::text,'0x'||repeat('b',64));
end $$;

-- A pending general-fan referral (inviter -> friend). Replica mode only for the fixture rows; the pass itself runs for real.
create function pg_temp.pending_rel(inviter uuid, friend uuid) returns uuid language plpgsql as $$
declare rid uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  insert into public.community_stamp_invite_codes(app_user_id,code) values(inviter,upper(substr(md5(inviter::text),1,24))) on conflict do nothing;
  insert into public.community_stamp_invite_redemptions(id,inviter_app_user_id,invitee_app_user_id,invite_code)
    values(rid,inviter,friend,upper(substr(md5(inviter::text),1,24)));
  insert into public.community_stamp_invitation_relations(redemption_id,inviter_app_user_id,invitee_app_user_id,policy_version)
    values(rid,inviter,friend,(select min(version) from public.community_stamp_invitation_policy_versions));
  set local session_replication_role = origin;
  return rid;
end $$;

-- A qualified relation made by direct state change (fires the wire trigger without a quiz RPC).
create function pg_temp.qualify_rel(inviter uuid, friend uuid, cel uuid, fire boolean) returns uuid language plpgsql as $$
declare qp uuid := extensions.gen_random_uuid(); rid uuid := extensions.gen_random_uuid();
begin
  set local session_replication_role = replica;
  select id into qp from public.quiz_passes where app_user_id=friend and celebrity_id=cel;
  if qp is null then qp := extensions.gen_random_uuid();
    insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values(qp,friend,cel,extensions.gen_random_uuid()); end if;
  insert into public.community_stamp_invite_codes(app_user_id,code) values(inviter,upper(substr(md5(inviter::text),1,24))) on conflict do nothing;
  insert into public.community_stamp_invite_redemptions(id,inviter_app_user_id,invitee_app_user_id,invite_code)
    values(rid,inviter,friend,upper(substr(md5(inviter::text),1,24)));
  insert into public.community_stamp_invitation_relations(redemption_id,inviter_app_user_id,invitee_app_user_id,policy_version)
    values(rid,inviter,friend,(select min(version) from public.community_stamp_invitation_policy_versions));
  if not fire then
    update public.community_stamp_invitation_relations set status='qualified',qualifying_quiz_pass_id=qp,qualified_at=now(),
      qualified_sequence=(select coalesce(max(qualified_sequence),0)+1 from public.community_stamp_invitation_relations where inviter_app_user_id=inviter)
      where redemption_id=rid;
    return rid;
  end if;
  set local session_replication_role = origin;
  update public.community_stamp_invitation_relations set status='qualified',qualifying_quiz_pass_id=qp,qualified_at=now(),
    qualified_sequence=(select coalesce(max(qualified_sequence),0)+1 from public.community_stamp_invitation_relations where inviter_app_user_id=inviter)
    where redemption_id=rid;
  return rid;
end $$;

update public.group_wallet_release set enabled = true, write_fenced = false, legacy_writers_verified = true,
  migration_evidence_sha256 = repeat('c',64), rewards_start_on = current_date;

-- ===== Item 1 (draft policy): wallet sources survive; mission approval, raffle entry and refund still work.
do $$
declare
  owner uuid := pg_temp.mkuser(1); member uuid := pg_temp.mkuser(2);
  adm uuid := extensions.gen_random_uuid(); page uuid := extensions.gen_random_uuid();
  mission uuid; submission uuid; res jsonb; def text; lit text;
begin
  perform pg_temp.assert(not public.dukjil_policy_replaces_earning(clock_timestamp()), 'policy is draft for the item 1 block');
  select pg_get_functiondef(oid) into strict def from pg_proc where pronamespace='public'::regnamespace and proname='group_wallet_post';
  foreach lit in array array['group_support','group_mission','group_raffle_entry','group_raffle_refund','group_exchange','dukjil_action','dukjil_streak','dukjil_proof','dukjil_correction'] loop
    perform pg_temp.assert(position(''''||lit||'''' in def)>0, 'group_wallet_post keeps source '||lit);
  end loop;
  insert into public.admin_allowlist(id,email,role,active) values(adm,'fix3-1@byus.test','admin',true);
  insert into public.group_pages(id,kind,name) values(page,'hobby','Fix3 fixture');
  insert into public.group_memberships(page_id,app_user_id,role) values(page,owner,'owner'),(page,member,'member');
  res := public.group_activities_dispatch('mission-save',owner,page,null,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'title','Fix3 mission','instructions','Do it','imageUrl',null,'state','published'));
  mission := (res#>>'{mission,id}')::uuid;
  perform public.group_activities_dispatch('mission-reward-policy',owner,page,mission,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'rewardPoints',50,'budgetPoints',50),adm);
  res := public.group_activities_dispatch('mission-submit',member,page,mission,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'body','proof'));
  submission := (res->>'id')::uuid;
  perform public.group_activities_dispatch('mission-review',owner,page,mission,submission,jsonb_build_object('requestId',extensions.gen_random_uuid(),'action','approve','expectedSubmissionRevision',1));
  perform pg_temp.assert(public.group_wallet_balance(member,'fan_point')=50, 'draft-policy mission approval pays 50');
  perform public.group_wallet_post(member,'ticket',3,'group_exchange',extensions.gen_random_uuid());
  perform public.group_wallet_post(member,'ticket',-1,'group_raffle_entry',extensions.gen_random_uuid());
  perform pg_temp.assert(public.group_wallet_balance(member,'ticket')=2, 'raffle entry debits one ticket');
  perform public.group_wallet_refund(member,1,extensions.gen_random_uuid());
  perform pg_temp.assert(public.group_wallet_balance(member,'ticket')=3, 'raffle refund returns the ticket');
  -- earnings still read in the draft state (ledger row linked by the approval RPC itself)
  res := public.read_owned_group_earning(member,page,'mission:'||submission);
  perform pg_temp.assert(res#>>'{entry,status}'='credited', 'draft earnings detail credited');
end $$;

-- ===== activate the policy for everything below
update public.dukjil_policy_versions set status='active', effective_from=now()-interval '1 hour', activated_at=now() where version=1;

-- ===== Items 2, 3, 4, 5: real screening, one payout, referral hook, per-friend key
do $$
declare
  cel uuid := pg_temp.mkcel(10, true); cel2 uuid := pg_temp.mkcel(11, true);
  m uuid := pg_temp.mkuser(20); inv uuid := pg_temp.mkuser(21); friend uuid := pg_temp.mkuser(22); inv2 uuid := pg_temp.mkuser(23);
  r1 jsonb; r2 jsonb; n integer; bal bigint; b0 bigint; rid uuid; i integer; f uuid;
begin
  -- Item 2: a passport-less member passes the real screening: exactly one 20P quiz payout and a quiz stamp, repeat pays nothing.
  perform pg_temp.assert(not exists(select 1 from public.fan_passports where app_user_id=m), 'member has no passport yet');
  r1 := pg_temp.pass_quiz(m, cel);
  perform pg_temp.assert(r1->'attempt'->>'status'='passed', 'screening passed');
  perform pg_temp.assert(exists(select 1 from public.fan_passports where app_user_id=m and celebrity_id=cel), 'passport created by the same screening');
  perform pg_temp.assert((select count(*) from public.dukjil_action_log where app_user_id=m and action_key='quiz')=1, 'exactly one quiz payout row');
  perform pg_temp.assert(public.group_wallet_balance(m,'fan_point')=20, 'quiz pays 20P');
  perform pg_temp.assert((select count(*) from public.community_stamps where app_user_id=m and kind='quiz' and celebrity_id=cel)=1, 'quiz stamp issued');
  -- repeat: replaying the closed attempt returns its result without paying again
  r2 := public.submit_owned_quiz_attempt(m,(r1->'attempt'->>'id')::uuid,extensions.gen_random_uuid(),'x','x','x','x');
  perform pg_temp.assert((select count(*) from public.dukjil_action_log where app_user_id=m and action_key='quiz')=1, 'repeat screening adds no payout row');
  perform pg_temp.assert(public.group_wallet_balance(m,'fan_point')=20, 'repeat screening pays nothing more');
  perform pg_temp.assert((select count(*) from public.dukjil_wire_failures where app_user_id=m)=0, 'no wire failure rows for the screening');

  -- Item 3 + 4: friend joined with a pending referral, then passes the real screening.
  perform pg_temp.mkuser(24); -- unused filler keeps ids stable
  perform pg_temp.pass_quiz(inv, cel);
  rid := pg_temp.pending_rel(inv, friend);
  perform pg_temp.pass_quiz(friend, cel2);
  perform pg_temp.assert((select status from public.community_stamp_invitation_relations where redemption_id=rid)='qualified', 'referral qualified by the real screening');
  perform pg_temp.assert((select count(*) from public.dukjil_action_log where app_user_id=friend and action_key='invite_friend')=1, 'friend 100P paid once');
  perform pg_temp.assert((select count(*) from public.dukjil_action_log where app_user_id=inv and action_key='invite')=1, 'inviter 200P paid once');
  perform pg_temp.assert(public.group_wallet_balance(friend,'fan_point')=120, 'friend has quiz 20 + invite_friend 100');
  perform pg_temp.assert(public.group_wallet_balance(inv,'fan_point')=220, 'inviter has quiz 20 + invite 200');
  perform pg_temp.assert((select count(*) from public.community_stamps where app_user_id=inv and kind='invite' and policy_version is not null and celebrity_id=cel2)=1,
    'invite stamp records the page where the friend passed the screening');
  perform pg_temp.assert(not exists(select 1 from public.community_stamps where app_user_id=inv and kind='invite' and policy_version is null), 'legacy inviter stamp skipped after activation');

  -- Item 5a: a second inviter cannot claim the same friend (one inviter per friend), and a direct call pays nothing.
  perform pg_temp.pass_quiz(inv2, cel);
  perform pg_temp.expect_error(format('select pg_temp.pending_rel(%L,%L)', inv2, friend), 'duplicate key');
  b0 := public.group_wallet_balance(inv2,'fan_point');
  perform public.dukjil_wire_invite(inv2, friend);
  perform pg_temp.assert(public.group_wallet_balance(inv2,'fan_point')=b0, 'second inviter gets no 200P');
  perform pg_temp.assert((select count(*) from public.dukjil_action_log where app_user_id=friend and action_key='invite_friend')=1, 'friend 100P still once');

  -- Item 5b: first inviter at the monthly cap. 6 friends, stamps stay 3, no hand-off, friend still gets 100P once, no failure rows.
  for i in 1..6 loop
    f := pg_temp.mkuser(40+i);
    perform pg_temp.pass_quiz(f, cel);
    perform pg_temp.qualify_rel(inv2, f, cel, true);
    perform pg_temp.assert((select count(*) from public.dukjil_action_log where app_user_id=f and action_key='invite_friend')=1, 'capped inviter: friend 100P once (friend '||i||')');
  end loop;
  perform pg_temp.assert((select count(*) from public.community_stamps where app_user_id=inv2 and kind='invite' and policy_version is not null)=3, 'invite stamps cap at 3 per month');
  perform pg_temp.assert((select count(*) from public.dukjil_action_log where app_user_id=inv2 and action_key='invite')=5, 'inviter pointCap 5 per month');
  perform pg_temp.assert((select count(*) from public.dukjil_wire_failures where app_user_id in (inv2) and resolved_at is null)=0, 'cap is a normal rejection, no failure row');
end $$;

-- ===== Item 5c: lock failure then retry pays once
do $$
declare
  cel uuid := pg_temp.mkcel(12, false); inv uuid := pg_temp.mkuser(60); f uuid := pg_temp.mkuser(61); src text; n integer;
begin
  -- passports are required for payouts: create both through the replica-bypassed table, then wire the relation without firing.
  set local session_replication_role = replica;
  insert into public.fan_passports(app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)
    select u,cel,extensions.gen_random_uuid(),extensions.gen_random_uuid() from unnest(array[inv,f]) u;
  set local session_replication_role = origin;
  perform pg_temp.qualify_rel(inv, f, cel, false);
  src := 'invite:' || md5('friend:' || f)::uuid::text;
  insert into public.dukjil_wire_failures(wire,app_user_id,celebrity_id,action_key,source_key,params,error_state,error_message)
    values('invite',inv,cel,'invite',src,'{}','55P03','DUKJIL_WIRE_LOCK_BUSY'),
          ('invite_friend',f,null,'invite_friend',src,'{}','55P03','DUKJIL_WIRE_LOCK_BUSY');
  perform public.retry_dukjil_wire_failures(10);
  perform pg_temp.assert((select count(*) from public.dukjil_action_log where app_user_id=f and action_key='invite_friend')=1, 'retry pays friend 100P once');
  perform pg_temp.assert((select count(*) from public.dukjil_action_log where app_user_id=inv and action_key='invite')=1, 'retry pays inviter 200P once');
  perform public.retry_dukjil_wire_failures(10);
  perform pg_temp.assert((select count(*) from public.dukjil_action_log where app_user_id=f and action_key='invite_friend')=1, 'second retry run pays nothing');
  perform pg_temp.assert((select count(*) from public.dukjil_wire_failures where resolved_at is null and app_user_id in (inv,f))=0, 'failures resolved');
end $$;

-- ===== Item 7: non-published or archived creator is rejected for score-only actions
do $$
declare u uuid := pg_temp.mkuser(70); draft uuid; arch uuid := pg_temp.mkcel(71, false);
begin
  draft := ('f3310000-0000-4000-8000-' || lpad('72',12,'0'))::uuid;
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values(draft,'fix3-cel-72','draft','/d.webp','{artist}','idol');
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,%L,%L,%L,%L)',u,draft,'share','src-draft',extensions.gen_random_uuid(),'{}'::jsonb),'COMMUNITY_STAMP_NOT_FOUND');
  insert into public.admin_allowlist(id,email,role,active) values('f3320000-0000-4000-8000-000000000001','fix3-arch@byus.test','admin',true);
  update public.celebrities set archived_at=now(),archived_by_admin_allowlist_id='f3320000-0000-4000-8000-000000000001',archive_reason='fix3 archived for the test' where id=arch;
  perform pg_temp.expect_error(format('select public.record_dukjil_action(%L,%L,%L,%L,%L,%L)',u,arch,'share','src-arch',extensions.gen_random_uuid(),'{}'::jsonb),'COMMUNITY_STAMP_NOT_FOUND');
end $$;

-- ===== Item 6: mission earnings after activation, and the pending-payout state
do $$
declare
  cel uuid := pg_temp.mkcel(80, false); owner uuid := pg_temp.mkuser(81); member uuid := pg_temp.mkuser(82);
  adm uuid := extensions.gen_random_uuid(); page uuid := extensions.gen_random_uuid();
  mission uuid; submission uuid; res jsonb; list jsonb;
begin
  insert into public.admin_allowlist(id,email,role,active) values(adm,'fix3-81@byus.test','admin',true);
  insert into public.group_pages(id,kind,celebrity_id,name) values(page,'hobby',cel,'Fix3 mission page')
    on conflict (id) do nothing;
  insert into public.group_memberships(page_id,app_user_id,role) values(page,owner,'owner'),(page,member,'member');
  set local session_replication_role = replica;
  insert into public.fan_passports(app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)
    values(member,cel,extensions.gen_random_uuid(),extensions.gen_random_uuid());
  set local session_replication_role = origin;
  res := public.group_activities_dispatch('mission-save',owner,page,null,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'title','Fix3 earn','instructions','Do it','imageUrl',null,'state','published'));
  mission := (res#>>'{mission,id}')::uuid;
  perform public.group_activities_dispatch('mission-reward-policy',owner,page,mission,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'rewardPoints',50,'budgetPoints',200),adm);
  res := public.group_activities_dispatch('mission-submit',member,page,mission,null,jsonb_build_object('requestId',extensions.gen_random_uuid(),'body','proof'));
  submission := (res->>'id')::uuid;
  perform public.group_activities_dispatch('mission-review',owner,page,mission,submission,jsonb_build_object('requestId',extensions.gen_random_uuid(),'action','approve','expectedSubmissionRevision',1));
  perform pg_temp.assert((select reward_ledger_id from public.group_mission_submissions where id=submission) is not null, 'approved submission is linked to its real ledger row');
  perform pg_temp.assert(public.group_wallet_balance(member,'fan_point')=50, 'mission pays 50 once after activation');
  res := public.read_owned_group_earning(member,page,'mission:'||submission);
  perform pg_temp.assert(res#>>'{entry,status}'='credited' and res#>>'{entry,netAmount}'='50', 'earnings detail credited with amount');
  list := public.read_owned_group_earnings(member,page);
  perform pg_temp.assert(jsonb_array_length(list->'entries')>=1, 'earnings list reads after activation');

  -- Pending retry: completed with points but no ledger row yet.
  set local session_replication_role = replica;
  update public.group_mission_submissions set reward_ledger_id=null where id=submission;
  set local session_replication_role = origin;
  res := public.read_owned_group_earning(member,page,'mission:'||submission);
  perform pg_temp.assert(res#>>'{entry,status}'='pending' and res#>>'{entry,netAmount}' is null, 'pending payout shown without amount');
  list := public.read_owned_group_earnings(member,page);
  perform pg_temp.assert(jsonb_array_length(list->'entries')>=1, 'list does not break while payout pending');
end $$;

rollback;

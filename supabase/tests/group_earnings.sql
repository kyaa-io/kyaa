\set ON_ERROR_STOP on
-- Synthetic fixtures only; never run against a shared or remote database.
do $$begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
\ir group_scope_fixture.sql
create function pg_temp.earnings_assert(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL %',label;end if;raise notice 'PASS %',label;
end $$;
create function pg_temp.earnings_error(statement text,expected text) returns void language plpgsql as $$begin
 begin execute statement;exception when others then if sqlerrm=expected then raise notice 'PASS rejects %',expected;return;end if;raise;end;
 raise exception 'Expected %: %',expected,statement;
end $$;
-- Roll back deliberately corrupted fixtures, including temporary trigger changes.
create function pg_temp.earnings_change_error(change_sql text,read_sql text,expected text default 'GROUP_EARNINGS_INCONSISTENT') returns void language plpgsql as $$begin
 begin execute change_sql;perform pg_temp.earnings_error(read_sql,expected);raise sqlstate 'Z0001';
 exception when sqlstate 'Z0001' then null;end;
end $$;
create function pg_temp.earnings_snapshot() returns jsonb language plpgsql as $$declare t text;fingerprint text;result jsonb:='{}';begin
 foreach t in array array['mobile_fan_economy_ledger','fan_ticket_ledger','mobile_fan_economy_activity_receipts','mobile_fan_reward_corrections','fan_ticket_activity_awards','group_activity_receipts','group_action_receipts','group_mission_submissions','group_raffle_entries','mobile_fan_economy_requests']loop
  execute format('select md5(coalesce(string_agg(to_jsonb(x)::text,''|''order by to_jsonb(x)::text),''''))from public.%I x',t)into fingerprint;
  result:=result||jsonb_build_object(t,fingerprint);
 end loop;return result;
end $$;
do $$declare
 actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();page uuid:=gen_random_uuid();mission uuid:=gen_random_uuid();submission uuid:=gen_random_uuid();admin uuid:=gen_random_uuid();q text;result jsonb;ledger uuid;wave uuid;cursor_value text;
begin
 insert into public.app_users(id,privy_user_id,verified_email) select x,'earnings-'||x,x||'@example.test' from unnest(array[actor,other])x;
 insert into public.admin_allowlist(id,email,role)values(admin,admin||'@example.test','admin');
 insert into public.group_pages(id,kind,name)values(page,'hobby','Earnings fixture');
 insert into public.group_missions(id,page_id,title,instructions,state)values(mission,page,'Fixture mission','Private evidence not returned','published');
 insert into public.group_mission_submissions(id,mission_id,app_user_id,body,status)values(submission,mission,actor,'Private body','completed');
 q:=format('select public.read_owned_group_earnings(%L,%L)',actor,page);
 result:=public.read_owned_group_earning(actor,page,'mission:'||submission);
 perform pg_temp.earnings_assert(result#>>'{entry,status}'='no_reward'and result#>>'{entry,originalAmount}'='0'and result#>'{entry,correctionAmount}'='null'::jsonb,'configured zero completed has no reward');
 perform pg_temp.earnings_change_error(format('update public.group_missions set reward_points=10,reward_budget=10,reward_approved_by=%L where id=%L',admin,mission),q);
 perform pg_temp.earnings_change_error(format('update public.group_mission_submissions set reward_points=10 where id=%L',submission),q);
 update public.group_missions set reward_points=10,reward_budget=100,reward_approved_by=admin where id=mission;
 update public.group_mission_submissions set status='pending'where id=submission;
 result:=public.read_owned_group_earning(actor,page,'mission:'||submission);
 perform pg_temp.earnings_assert(result#>>'{entry,status}'='pending'and result#>'{entry,originalAmount}'='null'::jsonb and result#>'{entry,netAmount}'='null'::jsonb and result#>'{entry,processedAt}'='null'::jsonb,'pending configured positive reward is unpaid and unknown');
 update public.group_mission_submissions set status='rejected',reason='Please resubmit',reviewed_at=clock_timestamp()where id=submission;
 result:=public.read_owned_group_earning(actor,page,'mission:'||submission);
 perform pg_temp.earnings_assert(result#>>'{entry,status}'='rejected'and result#>>'{entry,reason}'='Please resubmit'and result#>'{entry,netAmount}'='null'::jsonb,'rejected is not cancelled and has no invented amount');
 update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date;
 ledger:=public.group_wallet_post(actor,'fan_point',10,'group_mission',submission);
 update public.group_mission_submissions set status='completed',reward_points=10,reward_ledger_id=ledger where id=submission;
 result:=public.read_owned_group_earning(actor,page,'mission:'||submission);
 perform pg_temp.earnings_assert(result#>>'{entry,status}'='credited'and result#>>'{entry,originalAmount}'='10','completed mission validates actual global ledger');
 perform pg_temp.earnings_change_error(format('update public.group_mission_submissions set reward_ledger_id=null where id=%L',submission),q);
 perform pg_temp.earnings_change_error(format('update public.group_mission_submissions set reward_points=11 where id=%L',submission),q);
 perform pg_temp.earnings_change_error(format('alter table public.mobile_fan_economy_ledger disable trigger mobile_fan_economy_ledger_immutable;update public.mobile_fan_economy_ledger set app_user_id=%L where id=%L',other,ledger),q);
 perform pg_temp.earnings_change_error(format('alter table public.mobile_fan_economy_ledger disable trigger mobile_fan_economy_ledger_immutable;update public.mobile_fan_economy_ledger set source_id=%L where id=%L',gen_random_uuid(),ledger),q);
 update public.group_missions set state='draft'where id=mission;
 result:=public.read_owned_group_earning(actor,page,'mission:'||submission);
 perform pg_temp.earnings_assert(result#>'{entry,title}'='null'::jsonb and result#>'{entry,activityHref}'='null'::jsonb and result::text not like '%Private%','private mission title, evidence, and source link redacted');
 insert into public.group_memberships(page_id,app_user_id)values(page,actor);
 delete from public.group_memberships where page_id=page and app_user_id=actor;
 perform pg_temp.earnings_assert(jsonb_array_length(public.read_owned_group_earnings(actor,page)->'entries')=1,'former member retains owned public-group history');
 perform pg_temp.earnings_assert(public.read_owned_group_earnings(other,page)='{"entries":[],"nextCursor":null}'::jsonb,'other owner gets empty scoped history');
 perform pg_temp.earnings_error(format('select public.read_owned_group_earning(%L,%L,%L)',other,page,'mission:'||submission),'GROUP_EARNINGS_NOT_FOUND');
 perform pg_temp.earnings_error(format('select public.read_owned_group_earnings(null,%L)',page),'GROUP_EARNINGS_NOT_FOUND');
 perform pg_temp.earnings_change_error(format('update public.app_users set status=''disabled''where id=%L',actor),q,'GROUP_EARNINGS_NOT_FOUND');
 perform pg_temp.earnings_change_error(format('update public.group_pages set status=''hidden''where id=%L',page),q,'GROUP_EARNINGS_NOT_FOUND');
 wave:=pg_temp.group_scope_fixture(actor,false);
 perform pg_temp.earnings_error(format('select public.read_owned_group_earnings(%L,%L)',actor,wave),'GROUP_EARNINGS_NOT_FOUND');
 perform pg_temp.group_scope_fixture(actor,true);
 perform pg_temp.earnings_assert(jsonb_array_length(public.read_owned_group_earnings(actor,wave)->'entries')=0,'WAVE uses existing checked-in visibility');
 foreach cursor_value in array array['bad','e30=',encode(convert_to(jsonb_build_object('owner',actor,'page',page,'key','mission:'||submission,'at','infinity')::text,'UTF8'),'base64')]loop
  perform pg_temp.earnings_error(format('select public.read_owned_group_earnings(%L,%L,1,%L)',actor,page,cursor_value),'GROUP_EARNINGS_INVALID');
 end loop;
 perform pg_temp.earnings_error(format('select public.read_owned_group_earnings(%L,%L,0)',actor,page),'GROUP_EARNINGS_INVALID');
 perform pg_temp.earnings_error(format('select public.read_owned_group_earnings(%L,%L,101)',actor,page),'GROUP_EARNINGS_INVALID');
end $$;

-- Actual producer-generated creator receipts and corrections, not invented ledgers.
do $$declare
 actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();creator uuid:=gen_random_uuid();other_creator uuid:=gen_random_uuid();page uuid:=gen_random_uuid();other_page uuid:=gen_random_uuid();source uuid;receipt uuid;original uuid;policy uuid;other_policy uuid;correction uuid;result jsonb;rules jsonb;q text;change_value text;snapshot jsonb;balance bigint;first_page jsonb;all_keys jsonb;observed_keys jsonb;next_page jsonb;legacy uuid:=gen_random_uuid();
begin
 insert into public.app_users(id,privy_user_id,verified_email)select x,'earnings-'||x,x||'@example.test'from unnest(array[actor,other])x;
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)select x,'earnings-'||x,'published','/fixture.webp',now(),'{creator}','creator'from unnest(array[creator,other_creator])x;
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)select c,l,'Fixture','Fixture','Fixture'from unnest(array[creator,other_creator])c cross join unnest(enum_range(null::public.content_locale))l;
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'Earnings fixture'),(other_page,'fan',other_creator,'Other fixture');
 insert into public.fan_ticket_activity_policy(celebrity_id,enabled)values(creator,true);
 select jsonb_object_agg(action,3)into rules from unnest(array['verification','reaction','comment','checkin','certification','membership_instagram','membership_tiktok','membership_youtube','share','live_reservation','live_attendance','mission_completion','first_clip','journey_completion','invitation_milestone'])action;
 perform public.activate_mobile_fan_earning(creator,'earnings-v1',rules);
 insert into public.fan_posts(app_user_id,celebrity_id,body,idempotency_key,create_request_hash,first_comment_eligible,created_at)values(actor,creator,'Private original source title and body',gen_random_uuid(),'fixture',true,clock_timestamp())returning id into source;
 select id,point_ledger_id into strict receipt,original from public.mobile_fan_economy_activity_receipts where source_id=source;
 q:=format('select public.read_owned_group_earnings(%L,%L)',actor,page);
 result:=public.read_owned_group_earning(actor,page,'activity:'||receipt);
 perform pg_temp.earnings_assert(result#>>'{entry,status}'='credited'and result#>>'{entry,originalAmount}'='3'and result#>>'{entry,netAmount}'='3'and result#>'{entry,correctionAmount}'='null'::jsonb,'creator award uses linked positive ledger and nullable correction');
 perform pg_temp.earnings_assert(result#>'{entry,title}'='null'::jsonb and result#>'{entry,activityHref}'='null'::jsonb and result::text not like '%Private%','private creator source title/body/link never returned');
 perform pg_temp.earnings_error(format('select public.read_owned_group_earning(%L,%L,%L)',other,page,'activity:'||receipt),'GROUP_EARNINGS_NOT_FOUND');
 perform pg_temp.earnings_error(format('select public.read_owned_group_earning(%L,%L,%L)',actor,other_page,'activity:'||receipt),'GROUP_EARNINGS_NOT_FOUND');
 perform public.request_mobile_fan_reward_correction(actor,source,gen_random_uuid(),'earnings-review','correction-v1');
 result:=public.read_owned_group_earning(actor,page,'activity:'||receipt);
 perform pg_temp.earnings_assert(result#>>'{entry,status}'='correction_review'and result#>'{entry,correctionAmount}'='null'::jsonb and result#>>'{entry,netAmount}'='3','review is not a completed reversal');
 insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at)values(creator,'correction-v1','correction','{"mode":"revoke_unspent_points"}',clock_timestamp())returning id into policy;
 insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at)values(other_creator,'correction-v1','correction','{"mode":"revoke_unspent_points"}',clock_timestamp())returning id into other_policy;
 perform pg_temp.earnings_change_error(format('alter table public.mobile_fan_reward_corrections disable trigger mobile_fan_correction_immutable;update public.mobile_fan_reward_corrections set policy_id=%L where receipt_id=%L',other_policy,receipt),q);
 insert into public.group_missions(page_id,title,instructions,state)select page,'Pagination '||n,'Fixture','published'from generate_series(1,3)n;
 insert into public.group_mission_submissions(mission_id,app_user_id,body,created_at)select id,actor,'Private body',(select occurred_at from public.mobile_fan_economy_activity_receipts where id=receipt)from public.group_missions where page_id=page;
 first_page:=public.read_owned_group_earnings(actor,page,1);
 select jsonb_agg(e->>'entryKey')into all_keys from jsonb_array_elements(public.read_owned_group_earnings(actor,page)->'entries')e;
 perform pg_temp.earnings_error(format('select public.read_owned_group_earnings(%L,%L,1,%L)',other,page,first_page->>'nextCursor'),'GROUP_EARNINGS_INVALID');
 perform pg_temp.earnings_error(format('select public.read_owned_group_earnings(%L,%L,1,%L)',actor,other_page,first_page->>'nextCursor'),'GROUP_EARNINGS_INVALID');
 result:=public.request_mobile_fan_reward_correction(actor,source,gen_random_uuid(),'earnings-correct','correction-v1');
 correction:=(result->>'correction_ledger_id')::uuid;
 perform public.request_mobile_fan_reward_correction(actor,source,gen_random_uuid(),'earnings-later-review','correction-v1');
 result:=public.read_owned_group_earning(actor,page,'activity:'||receipt);
 perform pg_temp.earnings_assert(result#>>'{entry,status}'='corrected'and result#>>'{entry,originalAmount}'='3'and result#>>'{entry,correctionAmount}'='-3'and result#>>'{entry,netAmount}'='0','verified correction dominates later already_corrected review');
 observed_keys:=jsonb_build_array(first_page#>>'{entries,0,entryKey}');next_page:=first_page;
 while next_page->>'nextCursor'is not null loop
  next_page:=public.read_owned_group_earnings(actor,page,1,next_page->>'nextCursor');
  observed_keys:=observed_keys||jsonb_build_array(next_page#>>'{entries,0,entryKey}');
 end loop;
 perform pg_temp.earnings_assert(observed_keys=all_keys,'same-time kind/id pagination has no duplicates or omissions across correction');
 foreach change_value in array array[format('app_user_id=%L',other),format('celebrity_id=%L',other_creator),'asset=''free_vote''','amount=-2','source_type=''activity''',format('source_id=%L',gen_random_uuid()),format('policy_id=%L',other_policy)]loop
  perform pg_temp.earnings_change_error(format('alter table public.mobile_fan_economy_ledger disable trigger mobile_fan_economy_ledger_immutable;update public.mobile_fan_economy_ledger set %s where id=%L',change_value,correction),q);
 end loop;
 foreach change_value in array array[format('app_user_id=%L',other),format('celebrity_id=%L',other_creator),'asset=''free_vote''','amount=-3','source_type=''correction''',format('source_id=%L',gen_random_uuid()),format('policy_id=%L',other_policy)]loop
  perform pg_temp.earnings_change_error(format('alter table public.mobile_fan_economy_ledger disable trigger mobile_fan_economy_ledger_immutable;update public.mobile_fan_economy_ledger set %s where id=%L',change_value,original),q);
 end loop;
 perform pg_temp.earnings_change_error(format('alter table public.mobile_fan_reward_corrections disable trigger mobile_fan_correction_immutable;update public.mobile_fan_reward_corrections set correction_ledger_id=null where receipt_id=%L and status=''corrected''',receipt),q);
 -- Only an exact identity AND ledger match is a proven duplicate.
 insert into public.fan_ticket_activity_awards(id,app_user_id,celebrity_id,action_key,scope_key,source_id,occurred_at,point_ledger_id,backfill)
 select legacy,app_user_id,celebrity_id,action_key,scope_key,source_id,occurred_at,point_ledger_id,false from public.mobile_fan_economy_activity_receipts where id=receipt;
 perform pg_temp.earnings_assert(jsonb_array_length(public.read_owned_group_earnings(actor,page)->'entries')=4,'legacy mirror is deduplicated only with proven source and ledger');
 snapshot:=pg_temp.earnings_snapshot();balance:=public.mobile_fan_economy_balance(actor,creator,'fan_point');
 for n in 1..3 loop perform public.read_owned_group_earnings(actor,page);perform public.read_owned_group_earning(actor,page,'activity:'||receipt);end loop;
 perform pg_temp.earnings_assert(snapshot=pg_temp.earnings_snapshot()and balance=public.mobile_fan_economy_balance(actor,creator,'fan_point'),'repeated list/detail reads preserve receipts, ledgers, submissions and balance');
end $$;

-- Legacy creator credits remain distinct from group raffle tickets and global attendance.
do $$declare
 actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();creator uuid:=gen_random_uuid();page uuid:=gen_random_uuid();raffle uuid:=gen_random_uuid();entry uuid:=gen_random_uuid();request uuid:=gen_random_uuid();ledger uuid;refund uuid;award uuid;result jsonb;q text;change_value text;snapshot jsonb;balance bigint;first_page jsonb;next_page jsonb;before_keys jsonb;after_keys jsonb;
begin
 insert into public.app_users(id,privy_user_id,verified_email)select x,'earnings-'||x,x||'@example.test'from unnest(array[actor,other])x;
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'earnings-'||creator,'published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)select c,l,'Fixture','Fixture','Fixture'from unnest(array[creator])c cross join unnest(enum_range(null::public.content_locale))l;
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'Legacy fixture');
 insert into public.fan_ticket_activity_policy(celebrity_id,enabled)values(creator,true);
 insert into public.fan_posts(app_user_id,celebrity_id,body,idempotency_key,create_request_hash,first_comment_eligible)values(actor,creator,'Private legacy source',gen_random_uuid(),'fixture',true);
 select id into strict award from public.fan_ticket_activity_awards where app_user_id=actor and celebrity_id=creator;
 result:=public.read_owned_group_earning(actor,page,'legacy_activity:'||award);
 perform pg_temp.earnings_assert(result#>>'{entry,asset}'='legacy_free_draw'and result#>>'{entry,originalAmount}'='1'and result#>'{entry,title}'='null'::jsonb,'legacy creator award has proven ledger without source disclosure');
 update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('a',64),rewards_start_on=current_date;
 perform public.group_wallet_post(actor,'fan_point',10,'group_check_in',gen_random_uuid());
 perform pg_temp.earnings_assert(jsonb_array_length(public.read_owned_group_earnings(actor,page)->'entries')=1,'global attendance is never attributed to a creator group');
 perform public.group_wallet_post(actor,'ticket',10,'group_exchange',gen_random_uuid());
 insert into public.group_raffles(id,page_id,title,winner_quantity,per_user_limit,closes_at,submission_days,fulfillment_method,created_by)values(raffle,page,'Raffle fixture',1,3,clock_timestamp()+interval'1 day',7,'digital',actor);
 ledger:=public.group_wallet_post(actor,'ticket',-2,'group_raffle_entry',request);
 insert into public.group_raffle_entries(id,raffle_id,app_user_id,request_key,amount,ledger_id)values(entry,raffle,actor,request,2,ledger);
 q:=format('select public.read_owned_group_earnings(%L,%L)',actor,page);
 result:=public.read_owned_group_earning(actor,page,'raffle:'||entry);
 perform pg_temp.earnings_assert(result#>>'{entry,status}'='entered'and result#>>'{entry,asset}'='ticket'and result#>>'{entry,originalAmount}'='-2'and result#>'{entry,correctionAmount}'='null'::jsonb and result#>>'{entry,netAmount}'='-2','raffle participation is a ticket debit, not an earning');
 first_page:=public.read_owned_group_earnings(actor,page,1);
 select jsonb_agg(e->>'entryKey')into before_keys from jsonb_array_elements(public.read_owned_group_earnings(actor,page)->'entries')e;
 update public.group_raffles set cancelled_at=clock_timestamp()where id=raffle;
 perform pg_temp.earnings_error(q,'GROUP_EARNINGS_INCONSISTENT');
 refund:=public.group_wallet_post(actor,'ticket',2,'group_raffle_refund',entry);
 result:=public.read_owned_group_earning(actor,page,'raffle:'||entry);
 perform pg_temp.earnings_assert(result#>>'{entry,status}'='refunded'and result#>>'{entry,asset}'='ticket'and result#>>'{entry,originalAmount}'='-2'and result#>>'{entry,correctionAmount}'='2'and result#>>'{entry,netAmount}'='0','cancelled raffle requires exact owned ticket refund');
 next_page:=public.read_owned_group_earnings(actor,page,1,first_page->>'nextCursor');
 after_keys:=jsonb_build_array(first_page#>>'{entries,0,entryKey}',next_page#>>'{entries,0,entryKey}');
 perform pg_temp.earnings_assert(before_keys=after_keys and next_page->>'nextCursor'is null,'refund never moves an entry across cursor boundary');
 set constraints all immediate;
 foreach change_value in array array[format('app_user_id=%L',other),format('celebrity_id=%L',creator),'amount=1','source_type=''group_exchange''',format('source_id=%L',gen_random_uuid())]loop
  perform pg_temp.earnings_change_error(format('alter table public.fan_ticket_ledger disable trigger fan_ticket_ledger_append_only;update public.fan_ticket_ledger set %s where id=%L',change_value,refund),q);
 end loop;
 perform pg_temp.earnings_change_error(format('update public.group_raffles set cancelled_at=null where id=%L',raffle),q);
 foreach change_value in array array[format('app_user_id=%L',other),format('celebrity_id=%L',creator),'amount=-1','source_type=''group_exchange''',format('source_id=%L',gen_random_uuid())]loop
  perform pg_temp.earnings_change_error(format('alter table public.fan_ticket_ledger disable trigger fan_ticket_ledger_append_only;update public.fan_ticket_ledger set %s where id=%L',change_value,ledger),q);
 end loop;
 snapshot:=pg_temp.earnings_snapshot();balance:=public.group_wallet_balance(actor,'ticket');
 for n in 1..3 loop perform public.read_owned_group_earnings(actor,page);perform public.read_owned_group_earning(actor,page,'raffle:'||entry);end loop;
 perform pg_temp.earnings_assert(snapshot=pg_temp.earnings_snapshot()and balance=public.group_wallet_balance(actor,'ticket'),'raffle and legacy reads leave all accounting records and balance unchanged');
 set local role service_role;
 perform public.read_owned_group_earnings(actor,page);
 perform public.read_owned_group_earning(actor,page,'raffle:'||entry);
 reset role;
 perform pg_temp.earnings_assert(not has_function_privilege('service_role','public.group_earning_rows(uuid,uuid)','execute'),'internal row helper is not a service RPC');
 begin set local role anon;perform public.read_owned_group_earnings(actor,page);raise exception 'anon read allowed';exception when insufficient_privilege then null;end;
 begin set local role authenticated;perform public.read_owned_group_earning(actor,page,'raffle:'||entry);raise exception 'authenticated read allowed';exception when insufficient_privilege then null;end;
 raise notice 'PASS actual service_role reads; anon/authenticated RPC execution denied';
end $$;
set constraints all immediate;
rollback;

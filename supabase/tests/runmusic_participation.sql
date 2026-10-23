-- Disposable clean-chain database. Fixtures and altered campaign clocks roll back.
begin;
create function pg_temp.rm_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',label;end if;end $$;
create function pg_temp.rm_error(q text,marker text) returns void language plpgsql as $$
begin execute q;raise exception 'expected %',marker;
exception when others then if sqlerrm='expected '||marker or position(marker in sqlerrm)=0 then raise;end if;end $$;
do $$
declare a uuid:=extensions.gen_random_uuid();ad uuid:=extensions.gen_random_uuid();u uuid:=extensions.gen_random_uuid();
 v uuid:=extensions.gen_random_uuid();legacy uuid:=extensions.gen_random_uuid();creator uuid;job uuid:=extensions.gen_random_uuid();reaction uuid:=extensions.gen_random_uuid();
 k uuid:=extensions.gen_random_uuid();contact_key uuid:=extensions.gen_random_uuid();r jsonb;d uuid;seed text;n integer;i integer;owner_id uuid;rec uuid;
begin
 perform pg_temp.rm_assert(not (select auto_publish_enabled from public.runmusic_campaign),'automatic publication disabled by default');
 perform pg_temp.rm_assert((public.runmusic_campaign_json_v2()->>'entryClosesAt')::timestamptz='2026-10-24T14:59:00Z','approved deadline');
 perform pg_temp.rm_assert(not has_function_privilege('anon','public.submit_owned_runmusic_v2(uuid,jsonb)','execute'),'anonymous writes denied');
 perform pg_temp.rm_assert(not has_function_privilege('authenticated','public.process_due_runmusic()','execute'),'client processing denied');
 perform pg_temp.rm_assert(not has_function_privilege('service_role','public.runmusic_publish_locked()','execute'),'internal draw inaccessible');
 perform pg_temp.rm_assert(not has_function_privilege('service_role','public.begin_owned_account_deletion_before_runmusic(text)','execute'),'old deletion wrapper inaccessible');
 perform pg_temp.rm_assert(not has_table_privilege('service_role','public.runmusic_contacts','select'),'contact direct read denied');
 insert into public.app_users(id,privy_user_id,verified_email) values
  (a,'did:privy:rms-admin','rms-admin@example.invalid'),(u,'did:privy:rms-user','rms-user@example.invalid'),
  (v,'did:privy:rms-other','rms-other@example.invalid'),(legacy,'did:privy:rms-legacy','rms-legacy@example.invalid');
 insert into public.admin_allowlist(id,email,role)values(ad,'rms-admin@example.invalid','admin');
 select id into creator from public.celebrities where slug='runmusic';
 if creator is null then insert into public.celebrities(slug,status,image_url,published_at,roles,primary_role)
  values('runmusic','published','/qa.webp',clock_timestamp(),'{creator}','creator')returning id into creator;end if;
 perform pg_temp.rm_error(format('select public.read_owned_runmusic_v2(%L)',u),'RUNMUSIC_NOT_FOUND');
 update public.runmusic_campaign set published=true,registration_opens_at=clock_timestamp()-interval'3 hours',
  registration_closes_at=clock_timestamp()+interval'1 hour',event_starts_at=clock_timestamp()+interval'1 hour',event_ends_at=clock_timestamp()+interval'2 hours',
  entry_closes_at=clock_timestamp()+interval'1 hour',results_at=clock_timestamp()+interval'1 hour';
 perform pg_temp.rm_error(format('select public.submit_owned_runmusic_v2(%L,%L)',u,jsonb_build_object('action','enter','requestKey',k)),'RUNMUSIC_LIKE_REQUIRED');
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)
  values(u,91342,'0x'||repeat('a',40),'privy','embedded');
 perform public.react_to_creator(u,creator,reaction,job,'0x'||repeat('b',64));
 r:=public.submit_owned_runmusic_v2(u,jsonb_build_object('action','enter','requestKey',k));
 perform pg_temp.rm_assert((r->>'entered')::boolean and (r->>'liked')::boolean,'new liked entry succeeds without missions');
 perform public.submit_owned_runmusic_v2(u,jsonb_build_object('action','enter','requestKey',k));
 perform pg_temp.rm_assert((select count(*)=1 from public.runmusic_registrations where app_user_id=u),'entry replay deduplicated');
 insert into public.runmusic_missions(app_user_id,mission)values(legacy,'photo');
 r:=public.submit_owned_runmusic_v2(legacy,jsonb_build_object('action','enter','requestKey',extensions.gen_random_uuid()));
 perform pg_temp.rm_assert((r->>'entered')::boolean and not(r->>'liked')::boolean,'any legacy mission is preserved without retroactive like');
 r:=public.submit_owned_runmusic_v2(u,jsonb_build_object('action','save_contact','requestKey',contact_key,'ciphertext','encrypted-1','masked','ab***','fingerprint','semantic-input-1'));
 perform pg_temp.rm_assert((r#>>'{contact,saved}')::boolean and r::text not like '%encrypted-1%' and r::text not like '%semantic-input-1%','status keeps contact private');
 perform public.submit_owned_runmusic_v2(u,jsonb_build_object('action','save_contact','requestKey',contact_key,'ciphertext','encrypted-randomized-retry','masked','ab***','fingerprint','semantic-input-1'));
 perform pg_temp.rm_assert((select ciphertext='encrypted-1' from public.runmusic_contacts where app_user_id=u),'semantic retry ignores randomized ciphertext');
 perform pg_temp.rm_error(format('select public.submit_owned_runmusic_v2(%L,%L)',u,jsonb_build_object('action','save_contact','requestKey',contact_key,'ciphertext','new','masked','xy***','fingerprint','different')),'RUNMUSIC_CONFLICT');
 perform pg_temp.rm_error(format('select public.submit_owned_runmusic_v2(%L,%L)',u,jsonb_build_object('action','save_contact','requestKey',k,'ciphertext','new','masked','xy***','fingerprint','different')),'RUNMUSIC_CONFLICT');
 perform pg_temp.rm_error(format('select public.submit_owned_runmusic_v2(%L,%L)',v,jsonb_build_object('action','save_contact','requestKey',extensions.gen_random_uuid(),'ciphertext','new','masked','xy***','fingerprint','new')),'RUNMUSIC_ENTRY_REQUIRED');
 perform pg_temp.rm_error(format('select public.submit_owned_runmusic(%L,%L)',v,jsonb_build_object('action','checkin','requestKey',extensions.gen_random_uuid(),'code','anything')),'RUNMUSIC_CLOSED');
 perform pg_temp.rm_error(format('select public.admin_runmusic(%L,%L,%L,''settings'',''{"expectedRevision":1,"resultsPublished":true}''::jsonb)',a,ad,extensions.gen_random_uuid()),'RUNMUSIC_INVALID_REQUEST');
 perform pg_temp.rm_error('select public.runmusic_publish_locked()','RUNMUSIC_CLOSED');
 perform pg_temp.rm_assert(not(public.process_due_runmusic()->>'published')::boolean,'flag disabled never draws');
 update public.app_users set status='disabled' where id=u;
 perform pg_temp.rm_assert(not exists(select 1 from public.runmusic_contacts where app_user_id=u),'disable purges contact immediately');
 perform pg_temp.rm_error(format('select public.read_owned_runmusic_v2(%L)',u),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 update public.app_users set status='active' where id=u;
 -- Each population is isolated; test resets apply only inside this rolled-back fixture.
 foreach n in array array[0,1,14,15,16,164,165,166] loop
  delete from public.runmusic_draw_entries;delete from public.runmusic_missions;delete from public.runmusic_registrations;delete from public.runmusic_contacts;
  update public.runmusic_campaign set draw_id=null,draw_request_key=null,draw_seed=null,drawn_at=null,
   results_published=false,results_at=clock_timestamp()-interval'1 minute',auto_publish_enabled=true;
  for i in 1..n loop
   insert into public.app_users(privy_user_id,verified_email)values('did:privy:rms-'||n||'-'||i,'rms-'||n||'-'||i||'@example.invalid')returning id into owner_id;
   insert into public.runmusic_registrations(app_user_id)values(owner_id);
   -- Duplicate participation sources must not change entry weight or counts.
   insert into public.runmusic_missions(app_user_id,mission)values(owner_id,'quiz');
   insert into public.runmusic_contacts(app_user_id,ciphertext,masked,fingerprint)values(owner_id,'fixture-cipher','m***','fixture');
  end loop;
  r:=public.process_due_runmusic();
  select draw_id,draw_seed into d,seed from public.runmusic_campaign;
  perform pg_temp.rm_assert((r->>'published')::boolean,'due draw publishes');
  perform pg_temp.rm_assert((select count(*)=n and coalesce(bool_and(weight=1),true) from public.runmusic_draw_entries),'deduplicated equal weights');
  perform pg_temp.rm_assert((select count(*)=least(n,15) from public.runmusic_draw_entries where prize_code='andong_yogurt_1l'),'first fifteen yogurt allocation');
  perform pg_temp.rm_assert((select count(*)=least(greatest(n-15,0),150) from public.runmusic_draw_entries where prize_code='starbucks_10000'),'next one hundred fifty voucher allocation');
  perform pg_temp.rm_assert((select count(*)=least(n,165) from public.runmusic_contacts),'loser contacts purged at publication');
  perform public.process_due_runmusic();
  perform public.admin_runmusic_v2(a,ad,extensions.gen_random_uuid(),'draw');
  perform pg_temp.rm_assert((select draw_id=d and draw_seed=seed from public.runmusic_campaign),'draw snapshot never reset');
  r:=public.admin_runmusic_v2(a,ad,extensions.gen_random_uuid(),'read');
  perform pg_temp.rm_assert((r->>'participantCount')::integer=n and jsonb_array_length(r->'winners')=least(n,165),'admin participant dedup and winner list');
  if n>0 then
   select receipt_id into rec from public.runmusic_draw_entries where winner order by rank limit 1;
   r:=public.admin_runmusic_v2(a,ad,extensions.gen_random_uuid(),'receive',jsonb_build_object('receiptId',rec));
   perform pg_temp.rm_assert(not(r->>'replayed')::boolean,'first receipt');
   r:=public.admin_runmusic_v2(a,ad,extensions.gen_random_uuid(),'receive',jsonb_build_object('receiptId',rec));
   perform pg_temp.rm_assert((r->>'replayed')::boolean,'receipt replay');
   select app_user_id into owner_id from public.runmusic_draw_entries where receipt_id=rec;
   update public.runmusic_draw_entries set received_at=clock_timestamp()-interval'31 days' where receipt_id=rec;
   perform public.purge_due_runmusic_contacts();
   perform pg_temp.rm_assert(not exists(select 1 from public.runmusic_contacts where app_user_id=owner_id),'received contact expires after thirty days');
  end if;
  if n=166 then
   select app_user_id into owner_id from public.runmusic_draw_entries where not winner;
   perform pg_temp.rm_error(format('select public.submit_owned_runmusic_v2(%L,%L)',owner_id,jsonb_build_object('action','save_contact','requestKey',extensions.gen_random_uuid(),'ciphertext','new','masked','xy***','fingerprint','new')),'RUNMUSIC_CLOSED');
  end if;
 end loop;
end $$;
rollback;

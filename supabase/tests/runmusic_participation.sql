-- Disposable clean-chain database. Every fixture rolls back.
begin;
create function pg_temp.rm_assert(ok boolean,label text)returns void language plpgsql as $$begin if ok is distinct from true then raise exception '%',label;end if;end$$;
create function pg_temp.rm_error(q text,marker text)returns void language plpgsql as $$begin execute q;raise exception 'expected %',marker;exception when others then if sqlerrm='expected '||marker or position(marker in sqlerrm)=0 then raise;end if;end$$;
do $$declare a uuid:=extensions.gen_random_uuid();u uuid:=extensions.gen_random_uuid();v uuid:=extensions.gen_random_uuid();ad uuid:=extensions.gen_random_uuid();c uuid;src uuid;photo uuid;asset uuid:=extensions.gen_random_uuid();k uuid:=extensions.gen_random_uuid();r jsonb;d uuid;n integer;i integer;rec uuid;before_seed text;
begin
 perform pg_temp.rm_assert(not (public.runmusic_campaign_json()->>'published')::boolean,'initial publication must be false');
 perform pg_temp.rm_assert(not has_function_privilege('anon','public.submit_owned_runmusic(uuid,jsonb)','execute'),'anon write denied');
 perform pg_temp.rm_assert(not has_table_privilege('service_role','public.runmusic_campaign','select'),'secret direct read denied');
 insert into public.app_users(id,privy_user_id,verified_email)values(a,'did:privy:rm-admin','rm-admin@example.invalid'),(u,'did:privy:rm-user','rm-user@example.invalid'),(v,'did:privy:rm-other','rm-other@example.invalid');
 insert into public.admin_allowlist(id,email,role)values(ad,'rm-admin@example.invalid','admin');
 select id into c from public.celebrities where slug='runmusic';
 if c is null then insert into public.celebrities(slug,status,image_url,published_at,roles,primary_role)values('runmusic','published','/qa.webp',clock_timestamp(),'{creator}','creator')returning id into c;end if;
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(c,'ko','런앤뮤직','검증','사진')on conflict do nothing;
 perform pg_temp.rm_error(format('select public.read_owned_runmusic(%L)',u),'RUNMUSIC_NOT_FOUND');
 update public.runmusic_campaign set published=true,registration_opens_at=clock_timestamp()-interval'3 hours',registration_closes_at=clock_timestamp()+interval'1 hour',event_starts_at=clock_timestamp()+interval'1 hour',event_ends_at=clock_timestamp()+interval'2 hours';
 r:=public.submit_owned_runmusic(u,jsonb_build_object('action','register','requestKey',k));
 perform pg_temp.rm_assert((r->>'registered')::boolean,'account without Passport registers');
 perform pg_temp.rm_assert((public.admin_runmusic(a,ad,extensions.gen_random_uuid(),'read')->>'participantCount')::integer=1,'registered-only participant is included in admin count');
 perform public.post_celebrity_lounge_message(u,'runmusic','outside campaign',asset,null,'ko');
 perform pg_temp.rm_error(format('select public.submit_owned_runmusic(%L,%L)',u,jsonb_build_object('action','pre_cheer','requestKey',asset,'body','outside campaign')),'RUNMUSIC_INVALID_SOURCE');
 perform pg_temp.rm_error(format('select public.admin_runmusic(%L,%L,%L,''settings'',''{"expectedRevision":999,"published":true}''::jsonb)',a,ad,extensions.gen_random_uuid()),'RUNMUSIC_CONFLICT');
 perform pg_temp.rm_error(format('select public.submit_owned_runmusic(%L,%L)',u,jsonb_build_object('action','checkin','requestKey',extensions.gen_random_uuid(),'code','bad')),'RUNMUSIC_CLOSED');
 r:=public.submit_owned_runmusic(u,jsonb_build_object('action','pre_cheer','requestKey',extensions.gen_random_uuid(),'body','현장에서 만나요!'));
 select source_id into src from public.runmusic_missions where app_user_id=u and mission='pre_cheer';update public.fan_lounge_messages set created_at=clock_timestamp()-interval'2 hours'where id=src;
 update public.runmusic_campaign set registration_closes_at=clock_timestamp()-interval'1 hour',event_starts_at=clock_timestamp()-interval'1 hour';
 r:=public.submit_owned_runmusic(u,jsonb_build_object('action','register','requestKey',asset));
 perform pg_temp.rm_assert(exists(select 1 from public.runmusic_requests where app_user_id=u and request_key=asset),'completed phase reserves new request key');
 r:=public.submit_owned_runmusic(u,jsonb_build_object('action','register','requestKey',k));perform pg_temp.rm_assert((r->>'registered')::boolean,'completed phase replay after cutoff');
 perform pg_temp.rm_error(format('select public.submit_owned_runmusic(%L,%L)',u,jsonb_build_object('action','quiz','requestKey',k,'answer','안동체육관')),'RUNMUSIC_CONFLICT');
 for i in 1..11 loop r:=public.submit_owned_runmusic(u,jsonb_build_object('action','checkin','requestKey',extensions.gen_random_uuid(),'code','bad'));end loop;
 perform pg_temp.rm_assert(r#>>'{error,code}'='RUNMUSIC_RATE_LIMITED','wrong attempts persist');
 update public.runmusic_attempts set window_at=clock_timestamp()-interval'16 minutes';
 perform public.admin_runmusic(a,ad,extensions.gen_random_uuid(),'rotate-code','{"code":"local-test-qr-code-123"}');
 r:=public.submit_owned_runmusic(u,jsonb_build_object('action','checkin','requestKey',extensions.gen_random_uuid(),'code','local-test-qr-code-123'));
 perform pg_temp.rm_assert((r->>'tickets')::integer=2,'pre-registration plus cheer doubles checkin');
 r:=public.submit_owned_runmusic(u,jsonb_build_object('action','quiz','requestKey',extensions.gen_random_uuid(),'answer','wrong'));perform pg_temp.rm_assert(r#>>'{error,code}'='RUNMUSIC_WRONG_ANSWER','quiz retry allowed');
 r:=public.submit_owned_runmusic(u,jsonb_build_object('action','quiz','requestKey',extensions.gen_random_uuid(),'answer','안동 체육관'));perform pg_temp.rm_assert((r->>'tickets')::integer=4,'quiz completion');
 r:=public.submit_owned_runmusic(u,jsonb_build_object('action','cheer','requestKey',extensions.gen_random_uuid(),'body','좋은 공연 기대합니다'));
 perform pg_temp.rm_error(format('select public.submit_owned_runmusic(%L,%L)',u,jsonb_build_object('action','photo','requestKey',extensions.gen_random_uuid(),'body','image required','assetIds',jsonb_build_array())),'RUNMUSIC_INVALID_SOURCE');
 insert into public.content_assets(id,app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,uploaded_at)values(asset,u,c,'qa/'||asset,100,10,10,repeat('a',64),clock_timestamp());
 r:=public.submit_owned_runmusic(u,jsonb_build_object('action','photo','requestKey',extensions.gen_random_uuid(),'body','오늘의 현장','assetIds',jsonb_build_array(asset)));
 perform pg_temp.rm_assert((r->>'tickets')::integer=8,'all four missions max eight');
 select source_id into photo from public.runmusic_missions where app_user_id=u and mission='photo';
 perform pg_temp.rm_error(format('select public.submit_owned_runmusic(%L,%L)',v,jsonb_build_object('action','photo','requestKey',extensions.gen_random_uuid(),'sourceId',photo)),'RUNMUSIC_CHECKIN_REQUIRED');
 update public.fan_posts set hidden_at=clock_timestamp()where id=photo;
 perform pg_temp.rm_assert((public.read_owned_runmusic(u)->>'tickets')::integer=6,'hidden photo removed');
 update public.fan_posts set hidden_at=null where id=photo;update public.content_assets set deleted_at=clock_timestamp()where id=asset;
 perform pg_temp.rm_assert((public.read_owned_runmusic(u)->>'tickets')::integer=6,'deleted image removed');
 update public.content_assets set deleted_at=null where id=asset;update public.fan_posts set deleted_at=clock_timestamp()where id=photo;
 perform pg_temp.rm_assert((public.read_owned_runmusic(u)->>'tickets')::integer=6,'deleted post removed');
 update public.fan_lounge_messages set removed_at=clock_timestamp()where id=src;
 perform pg_temp.rm_assert((public.read_owned_runmusic(u)->>'multiplier')::integer=1,'removed pre-cheer revokes multiplier');
 update public.runmusic_campaign set event_ends_at=clock_timestamp();
 perform pg_temp.rm_error(format('select public.submit_owned_runmusic(%L,%L)',v,jsonb_build_object('action','quiz','requestKey',extensions.gen_random_uuid(),'answer','안동체육관')),'RUNMUSIC_CLOSED');
 r:=public.submit_owned_runmusic(u,jsonb_build_object('action','quiz','requestKey',extensions.gen_random_uuid(),'answer','ignored'));perform pg_temp.rm_assert((r->>'tickets')::integer=3,'completed mission after close does not duplicate');
 insert into public.content_reports(id,celebrity_id,app_user_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key)
 values(asset,c,v,'fan_post',photo,1,u,'harassment',extensions.gen_random_uuid());
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(u,asset,'moderation fixture test',ad);
 perform pg_temp.rm_error(format('select public.read_owned_runmusic(%L)',u),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 delete from public.app_user_moderation_restrictions where app_user_id=u;
 update public.app_users set status='disabled'where id=u;
 perform pg_temp.rm_error(format('select public.read_owned_runmusic(%L)',u),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 perform public.admin_runmusic(a,ad,extensions.gen_random_uuid(),'draw',jsonb_build_object('requestKey',extensions.gen_random_uuid()));perform pg_temp.rm_assert((select count(*)from public.runmusic_draw_entries)=0,'disabled excluded from draw');
 -- Repeat isolated draws at the significant candidate counts.
 foreach n in array array[0,1,99,100,101]loop
 delete from public.runmusic_draw_entries;delete from public.runmusic_missions;
 update public.runmusic_campaign set draw_id=null,draw_request_key=null,draw_seed=null,drawn_at=null,results_published=false;
 for i in 1..n loop
 insert into public.app_users(privy_user_id,verified_email)values('did:privy:rm-'||n||'-'||i,'rm-'||n||'-'||i||'@example.invalid')returning id into v;
 insert into public.runmusic_missions(app_user_id,mission)values(v,'checkin');
 end loop;
 r:=public.admin_runmusic(a,ad,extensions.gen_random_uuid(),'draw',jsonb_build_object('requestKey',extensions.gen_random_uuid()));
 select draw_id,draw_seed into d,before_seed from public.runmusic_campaign;
 perform pg_temp.rm_assert((select count(*)from public.runmusic_draw_entries)=n,'draw snapshot count');
 perform pg_temp.rm_assert((select count(*)from public.runmusic_draw_entries where winner)=least(n,100),'min winners including 101');
 perform public.admin_runmusic(a,ad,extensions.gen_random_uuid(),'draw',jsonb_build_object('requestKey',extensions.gen_random_uuid()));
 perform pg_temp.rm_assert((select draw_id=d and draw_seed=before_seed from public.runmusic_campaign),'redraw returns immutable snapshot');
 if n>0 then
 perform public.admin_runmusic(a,ad,extensions.gen_random_uuid(),'settings',jsonb_build_object('resultsPublished',true,'expectedRevision',(select revision from public.runmusic_campaign)));
 select receipt_id into rec from public.runmusic_draw_entries where winner order by rank limit 1;
 r:=public.admin_runmusic(a,ad,extensions.gen_random_uuid(),'receive',jsonb_build_object('receiptId',rec));perform pg_temp.rm_assert(not(r->>'replayed')::boolean,'first receipt');
 r:=public.admin_runmusic(a,ad,extensions.gen_random_uuid(),'receive',jsonb_build_object('receiptId',rec));perform pg_temp.rm_assert((r->>'replayed')::boolean,'receipt replay one award');
 end if;
 end loop;
end$$;
-- A fixed seed and independent byte-wise uniform/power ordering make this a
-- reproducible mixed-weight regression, rather than repeating the draw formula.
create function pg_temp.rm_fixed_seed() returns trigger language plpgsql as $$
begin
  if old.draw_id is null and new.draw_id is not null then
    new.draw_seed:=repeat('42',32);
  end if;
  return new;
end$$;
create trigger runmusic_test_fixed_seed before update on public.runmusic_campaign
  for each row execute function pg_temp.rm_fixed_seed();
do $$
declare
  actor uuid;
  admin_id uuid;
  creator uuid;
  owner_id uuid;
  image_id uuid;
  weight integer;
  response jsonb;
  stored_seed text;
  actual_order integer[];
begin
  select id into actor from public.app_users where privy_user_id='did:privy:rm-admin';
  select id into admin_id from public.admin_allowlist where email='rm-admin@example.invalid';
  select id into creator from public.celebrities where slug='runmusic';
  delete from public.runmusic_draw_entries;
  delete from public.runmusic_missions;
  update public.runmusic_campaign set draw_id=null,draw_request_key=null,
    draw_seed=null,drawn_at=null,results_published=false;

  foreach weight in array array[1,2,4,8] loop
    owner_id:=('dc000000-0000-4000-8000-'||lpad(weight::text,12,'0'))::uuid;
    insert into public.app_users(id,privy_user_id,verified_email) values(
      owner_id,'did:privy:rm-weight-'||weight,'rm-weight-'||weight||'@example.invalid'
    );
    update public.runmusic_campaign set
      registration_opens_at=clock_timestamp()-interval'3 hours',
      registration_closes_at=clock_timestamp()+interval'1 hour',
      event_starts_at=clock_timestamp()+interval'1 hour',
      event_ends_at=clock_timestamp()+interval'2 hours';
    if weight in(2,8) then
      perform public.submit_owned_runmusic(owner_id,jsonb_build_object(
        'action','register','requestKey',extensions.gen_random_uuid()
      ));
      perform public.submit_owned_runmusic(owner_id,jsonb_build_object(
        'action','pre_cheer','requestKey',extensions.gen_random_uuid(),'body','공연을 기다립니다'
      ));
      update public.fan_lounge_messages set created_at=clock_timestamp()-interval'2 hours'
        where id=(select source_id from public.runmusic_missions
                  where app_user_id=owner_id and mission='pre_cheer');
    end if;
    update public.runmusic_campaign set
      registration_closes_at=clock_timestamp()-interval'1 hour',
      event_starts_at=clock_timestamp()-interval'1 hour';
    perform public.submit_owned_runmusic(owner_id,jsonb_build_object(
      'action','checkin','requestKey',extensions.gen_random_uuid(),'code','local-test-qr-code-123'
    ));
    if weight in(4,8) then
      perform public.submit_owned_runmusic(owner_id,jsonb_build_object(
        'action','quiz','requestKey',extensions.gen_random_uuid(),'answer','안동체육관'
      ));
      perform public.submit_owned_runmusic(owner_id,jsonb_build_object(
        'action','cheer','requestKey',extensions.gen_random_uuid(),'body','공연을 응원합니다'
      ));
      image_id:=extensions.gen_random_uuid();
      insert into public.content_assets(
        id,app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,uploaded_at
      ) values(image_id,owner_id,creator,'qa/'||image_id,100,10,10,repeat('a',64),clock_timestamp());
      perform public.submit_owned_runmusic(owner_id,jsonb_build_object(
        'action','photo','requestKey',extensions.gen_random_uuid(),'body','현장 사진',
        'assetIds',jsonb_build_array(image_id)
      ));
    end if;
    response:=public.read_owned_runmusic(owner_id);
    perform pg_temp.rm_assert((response->>'tickets')::integer=weight,'mixed live tickets');
  end loop;
  update public.runmusic_campaign set event_ends_at=clock_timestamp();
  perform public.admin_runmusic(actor,admin_id,extensions.gen_random_uuid(),'draw',
    jsonb_build_object('requestKey',extensions.gen_random_uuid()));
  select draw_seed into stored_seed from public.runmusic_campaign;
  perform pg_temp.rm_assert(stored_seed=repeat('42',32),'fixed regression seed');
  perform pg_temp.rm_assert(not exists(
    select 1 from public.runmusic_draw_entries e
    where e.weight<>right(e.app_user_id::text,12)::integer
      or jsonb_array_length(e.mission_snapshot)<>case e.weight when 1 then 1 when 2 then 2 when 4 then 4 when 8 then 5 end
  ),'mixed snapshot weights and mission counts');
  select array_agg(e.weight order by e.rank) into actual_order from public.runmusic_draw_entries e;
  perform pg_temp.rm_assert(actual_order=array[2,8,4,1],'independent known mixed-weight ranking');

  -- Uniform U is decoded from SHA bytes, and U^(1/weight) sorts descending.
  -- This is independently equivalent to the production exponential race.
  perform pg_temp.rm_assert(not exists(
    with expected_candidates as(
      select app_user_id,right(app_user_id::text,12)::integer as expected_weight,
        extensions.digest(stored_seed||app_user_id::text,'sha256') as hash
      from public.runmusic_draw_entries
    ), uniforms as(
      select app_user_id,expected_weight,
        (1+(select sum(get_byte(hash,j)::numeric*power(256::numeric,6-j)*16)
            from generate_series(0,6)j)+floor(get_byte(hash,7)::numeric/16))
          /(power(2::numeric,60)+1) as u
      from expected_candidates
    ), expected as(
      select app_user_id,row_number()over(
        order by power(u,1::numeric/expected_weight) desc,app_user_id
      ) as expected_rank
      from uniforms
    )
    select 1 from expected e join public.runmusic_draw_entries d using(app_user_id)
    where d.rank<>e.expected_rank
  ),'independent byte-wise weighted rank');
end$$;
rollback;

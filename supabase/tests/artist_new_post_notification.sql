-- Synthetic data only. Run on a disposable/local migrated DB after 20261226150000; everything rolls back.
begin;
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %',label; end if; end $$;
-- Like the real flow (collector or CMS): a draft with its text, then published.
create function pg_temp.publish(p_id uuid,p_celebrity uuid,p_slug text,p_type text,p_visibility text) returns void language plpgsql as $$
begin
  insert into public.celebrity_notices(id,celebrity_id,slug,post_type,visibility) values(p_id,p_celebrity,p_slug,p_type,p_visibility);
  insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json) values(p_id,'ko','원문 제목 '||p_slug,'{"type":"doc","content":[]}'::jsonb);
  update public.celebrity_notices set publication_status='published',published_at=now(),ever_published_at=now(),revision=revision+1 where id=p_id;
end $$;
-- The chain-lane rule needs a blockchain job or an outbox row per passport; this test is about notifications, so it is dropped inside the rolled-back transaction.
alter table public.fan_passports drop constraint fan_passports_exactly_one_chain_lane;
do $$
declare c uuid:=gen_random_uuid(); page uuid:=gen_random_uuid(); quiz uuid; attempt uuid; pass uuid;
  u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); u3 uuid:=gen_random_uuid(); u4 uuid:=gen_random_uuid(); u5 uuid:=gen_random_uuid(); u6 uuid:=gen_random_uuid();
  n1 uuid:=gen_random_uuid(); n2 uuid:=gen_random_uuid(); n3 uuid:=gen_random_uuid(); n4 uuid:=gen_random_uuid(); n5 uuid:=gen_random_uuid(); n6 uuid:=gen_random_uuid();
  u uuid; cnt integer; r record; slug text;
begin
  insert into public.app_users(id,privy_user_id,verified_email) select x,'did:privy:anp-'||x,x||'@example.test' from unnest(array[u1,u2,u3,u4,u5,u6]) x;
  slug:='anp-'||substr(c::text,1,8);
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(c,slug,'published','/images/creator.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(c,'ko','엘리나','소개','사진'),(c,'en','Elina','Intro','Photo');
  insert into public.group_pages(id,kind,celebrity_id,name) values(page,'fan',c,'엘리나 팬페이지');
  -- u1 passport only, u2 member only, u3 member who turned the switch off, u4 passport holder who muted the page, u5 both, u6 neither
  insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at) values(gen_random_uuid(),c,1,'published',now()) returning id into quiz;
  foreach u in array array[u1,u4,u5] loop
    insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
      values(gen_random_uuid(),u,c,quiz,1,gen_random_uuid(),'passed',3,now()) returning id into attempt;
    insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values(gen_random_uuid(),u,c,attempt) returning id into pass;
    insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id) values(gen_random_uuid(),u,c,pass);
  end loop;
  -- a passport already joins its fan page, so u1, u4 and u5 may be members already
  insert into public.group_memberships(page_id,app_user_id,role) values(page,u2,'member'),(page,u3,'member'),(page,u5,'member') on conflict do nothing;
  insert into public.notification_preferences(app_user_id,official_post_notifications) values(u3,false);
  insert into public.group_notification_settings(page_id,app_user_id,enabled) values(page,u4,false);

  -- 1. first artist post: passport holders and page members, once each; not the switched-off, muted or unrelated ones
  perform pg_temp.publish(n1,c,'instagram-0000000000000001','artist_post','public');
  perform public.fan_web_drain_notification_intents(d.uid,100) from unnest(array[u1,u2,u3,u4,u5,u6]) as d(uid);
  foreach u in array array[u1,u2,u5] loop
    select count(*) into cnt from public.fan_notifications where app_user_id=u and kind::text='official_post';
    perform pg_temp.expect(cnt=1,'one row for '||u);
  end loop;
  select count(*) into cnt from public.fan_notifications where app_user_id in (u3,u4,u6) and kind::text='official_post';
  perform pg_temp.expect(cnt=0,'switched off, muted and unrelated get nothing');
  perform pg_temp.expect((select (payload->>'count')::int=1 and payload->>'celebrityId'=c::text and payload->>'targetId'=n1::text
    from public.fan_notifications where app_user_id=u1 and kind::text='official_post'),'first row carries artist and count 1');
  perform pg_temp.expect((select web_only from public.fan_notifications where app_user_id=u1 and kind::text='official_post'),'inbox only');

  -- 2. posts inside 2 hours fold into that row, point at a newer post and become unread again
  update public.fan_notifications set read_at=now() where app_user_id=u1 and kind::text='official_post';
  perform pg_temp.publish(n2,c,'instagram-0000000000000002','artist_post','public'); perform pg_temp.publish(n3,c,'tiktok-0000000000000003','artist_post','public');
  perform public.fan_web_drain_notification_intents(d.uid,100) from unnest(array[u1,u2,u3,u4,u5,u6]) as d(uid);
  select count(*) into cnt from public.fan_notifications where app_user_id=u1 and kind::text='official_post';
  perform pg_temp.expect(cnt=1,'still one row after 3 posts');
  select * into r from public.fan_notifications where app_user_id=u1 and kind::text='official_post';
  perform pg_temp.expect((r.payload->>'count')::int=3 and r.read_at is null and r.payload->>'targetId' in (n2::text,n3::text),'folded: count 3, unread, newer target');
  -- now() is the transaction start here, so the row is moved just before it for the path check
  update public.fan_notifications set scheduled_for=now()-interval '1 minute' where id=r.id;
  perform pg_temp.expect(public.fan_web_notification_path(u1,r.id) in ('/c/'||slug||'/notices/instagram-0000000000000002','/c/'||slug||'/notices/tiktok-0000000000000003'),'opens a post');

  -- 3. after 2 hours the next post starts a new row
  update public.fan_notifications set scheduled_for=scheduled_for-interval '3 hours',created_at=created_at-interval '3 hours' where app_user_id=u1 and kind::text='official_post';
  perform pg_temp.publish(n4,c,'instagram-0000000000000004','artist_post','public');
  perform public.fan_web_drain_notification_intents(d.uid,100) from unnest(array[u1,u2,u3,u4,u5,u6]) as d(uid);
  select count(*) into cnt from public.fan_notifications where app_user_id=u1 and kind::text='official_post';
  perform pg_temp.expect(cnt=2,'new row after the window');

  -- 4. a members-only artist post follows the screen's rule (fan_web_is_page_member): page members get it, outsiders never
  perform pg_temp.publish(n5,c,'instagram-0000000000000005','artist_post','members');
  perform public.fan_web_drain_notification_intents(d.uid,100) from unnest(array[u1,u2,u3,u4,u5,u6]) as d(uid);
  perform pg_temp.expect((select count(*) from public.fan_notifications where app_user_id=u2 and kind::text='official_post' and payload->>'targetId'=n5::text)=1,'members-only post reaches a page member');
  perform pg_temp.expect((select count(*) from public.fan_notifications where app_user_id in (u3,u4,u6))=0,'outsiders, muted and switched-off still get nothing');
  perform pg_temp.expect((select count(*) from public.fan_notifications where app_user_id=u1 and kind::text='official_post' and payload->>'targetId'=n5::text)=1,'members-only post reaches the passport holder');

  -- 5. an ordinary notice keeps the old rule: passport holders only, one row each, no batching
  perform pg_temp.publish(n6,c,'notice-0000000000000006','notice','public');
  perform public.fan_web_drain_notification_intents(d.uid,100) from unnest(array[u1,u2,u3,u4,u5,u6]) as d(uid);
  perform pg_temp.expect((select count(*) from public.fan_notifications where app_user_id=u2 and payload->>'targetId'=n6::text)=0,'notice not sent to page-only member');
  perform pg_temp.expect((select count(*) from public.fan_notifications where app_user_id=u1 and payload->>'targetId'=n6::text and not payload ? 'celebrityId')=1,'notice is its own row');
end $$;
rollback;

\set ON_ERROR_STOP on
-- Second review of the all-public profile change: friend request cap, signed-out clip author, support amounts, and the page ranking every reader gets.
begin;
\ir group_scope_fixture.sql
\ir group_public_ranking_open_fixture.sql
do $$
declare creator uuid:=extensions.gen_random_uuid();page uuid:=extensions.gen_random_uuid();slug text:='public-limits-fixture';
 viewer uuid:=extensions.gen_random_uuid();shown uuid:=extensions.gen_random_uuid();sanctioned uuid:=extensions.gen_random_uuid();gone uuid:=extensions.gen_random_uuid();blocker uuid:=extensions.gen_random_uuid();spammer uuid:=extensions.gen_random_uuid();other uuid:=extensions.gen_random_uuid();
 u uuid;i integer;r jsonb;first_request uuid;intents bigint;raised boolean;clip uuid;targets uuid[]:='{}';wave uuid;wave_creator uuid;period date;week date;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,slug,'published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','제한 검증','소개','사진'),(creator,'en','Limits','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'Limits');
 foreach u in array array[viewer,shown,sanctioned,gone,blocker,spammer,other] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:limits-'||u,u||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'l'||left(u::text,8),'l'||left(u::text,8));
 end loop;
 for i in 1..32 loop
  u:=extensions.gen_random_uuid();targets:=targets||u;
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:limits-t-'||u,u||'@example.test');
 end loop;
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(blocker,viewer);

 -- Friend requests: 30 a day per member, one more is refused and queues no notification.
 if public.social_friend_request_daily_limit()<>30 then raise exception 'Daily limit should be 30';end if;
 intents:=(select count(*)from public.fan_web_notification_intents where kind='fan_friend_request');
 first_request:=extensions.gen_random_uuid();
 r:=public.request_social_friend(spammer,targets[1],null,first_request);
 for i in 2..30 loop r:=public.request_social_friend(spammer,targets[i],null,extensions.gen_random_uuid());end loop;
 if r->>'status'<>'pending' then raise exception 'Requests under the limit must pass: %',r;end if;
 raised:=false;begin perform public.request_social_friend(spammer,targets[31],null,extensions.gen_random_uuid());exception when others then raised:=sqlerrm='SOCIAL_RATE_LIMITED';end;
 if not raised then raise exception 'Request 31 was not refused with SOCIAL_RATE_LIMITED';end if;
 if (select count(*)from public.fan_web_notification_intents where kind='fan_friend_request')-intents<>30 then raise exception 'Notifications queued past the limit';end if;
 if (public.request_social_friend(spammer,targets[1],null,first_request)->>'replayed')<>'true' then raise exception 'A replay must still answer at the limit';end if;
 if public.request_social_friend(other,targets[31],null,extensions.gen_random_uuid())->>'status'<>'pending' then raise exception 'Another member was limited';end if;
 set local session_replication_role=replica;
 update public.social_friendships set created_at=now()-interval'25 hours' where requester_id=spammer;
 set local session_replication_role=origin;
 if public.request_social_friend(spammer,targets[32],null,extensions.gen_random_uuid())->>'status'<>'pending' then raise exception 'Limit did not reset after a day';end if;

 set local session_replication_role=replica;
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(sanctioned,extensions.gen_random_uuid(),'제한 시험용 제재 사유입니다',extensions.gen_random_uuid());
 foreach u in array array[viewer,shown] loop
  insert into public.fan_passports(app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)values(u,creator,extensions.gen_random_uuid(),extensions.gen_random_uuid());
  insert into public.mobile_fan_support_contributions(app_user_id,request_key,celebrity_id,units,voucher_ledger_id,policy_id)values(u,extensions.gen_random_uuid(),creator,case when u=shown then 7 else 3 end,extensions.gen_random_uuid(),extensions.gen_random_uuid());
  insert into public.social_favorite_visibility(app_user_id,celebrity_id,visible)values(u,creator,true);
 end loop;
 insert into public.fan_clips(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash)values(extensions.gen_random_uuid(),creator,shown,'clip','public',extensions.gen_random_uuid(),repeat('a',64))returning id into clip;
 set local session_replication_role=origin;

 -- Signed-out clip: name and picture only. Signed in keeps the profile link and tier.
 r:=public.read_mobile_content_fan_clip(null,clip,'ko');
 if (select array_agg(k order by k)from jsonb_object_keys(r->'author')k)<>array['avatarUrl','nickname'] then raise exception 'Signed-out clip author wrong: %',r->'author';end if;
 if r::text like '%'||shown||'%' then raise exception 'Signed-out clip leaked an id';end if;
 r:=public.read_mobile_content_fan_clips(null,slug);
 if r::text like '%'||shown||'%' or r::text like '%fanTier%' then raise exception 'Signed-out clip list leaked: %',r;end if;
 r:=public.read_mobile_content_fan_clip(viewer,clip,'ko');
 if r#>>'{author,profileId}'<>shown::text or r#>>'{author,fanTier}' is null then raise exception 'Signed-in clip lost the author link: %',r->'author';end if;

 -- Support: other members get rank, name, picture only. Units are amounts too (100 won each). Your own totals stay yours.
 r:=public.read_owned_mobile_fan_support_fans(viewer,slug);
 if jsonb_array_length(r->'items')<>2 then raise exception 'Support list wrong: %',r;end if;
 if (select array_agg(k order by k)from jsonb_object_keys(r#>'{items,0}')k)<>array['avatarUrl','isMe','nickname','rank'] then raise exception 'Support row exposes more than rank and name: %',r#>'{items,0}';end if;
 if (r->'items')::text like '%700%' or r::text like '%'||shown||'%' then raise exception 'Support amount or id leaked: %',r;end if;
 if (r#>>'{items,1,isMe}')<>'true' or (r#>>'{items,0,isMe}')<>'false' then raise exception 'isMe wrong: %',r;end if;
 if (r#>>'{me,supportKrw}')::integer<>300 or (r#>>'{me,supportUnits}')::integer<>3 then raise exception 'Own totals missing: %',r->'me';end if;

 -- Page ranking, every reader: signed out, signed in, and both metrics.
 perform pg_temp.open_fan_ranking(creator);
 select w.period_start into period from public.ranking_period_window('all',now())w;
 select w.period_start into week from public.ranking_period_window('week',now())w;
 insert into public.ranking_snapshots(kind,scope_id,period,period_start,computed_at,rows)values
  ('fan_contribution',creator,'all',period,now(),(select jsonb_agg(jsonb_build_object('rank',n,'subjectId',x,'score',100-n,'achievedAt',now())order by n)from unnest(array[shown,sanctioned,gone,blocker,viewer])with ordinality t(x,n))),
  ('dukjil',creator,'week',week,now(),(select jsonb_agg(jsonb_build_object('rank',n,'subjectId',x,'score',100-n,'achievedAt',now())order by n)from unnest(array[sanctioned,shown])with ordinality t(x,n)));
 update public.app_users set status='disabled' where id=gone;
 r:=public.read_page_ranking(creator,'fan_contribution','all',null);
 if (select array_agg((v->>'rank')::integer order by (v->>'rank')::integer)from jsonb_array_elements(r->'rows')v)<>array[1,4,5] then raise exception 'Sanctioned or disabled member ranked: %',r->'rows';end if;
 r:=public.read_page_ranking(creator,'dukjil','week',null);
 if (select array_agg((v->>'rank')::integer)from jsonb_array_elements(r->'rows')v)<>array[2] then raise exception 'Dukjil ranking not filtered: %',r->'rows';end if;
 r:=public.read_page_ranking(creator,'fan_contribution','all',viewer);
 if (select array_agg((v->>'rank')::integer order by (v->>'rank')::integer)from jsonb_array_elements(r->'rows')v)<>array[1,5] then raise exception 'Block not applied for the viewer: %',r->'rows';end if;
 if r#>>'{me,rank}'<>'5' then raise exception 'Own rank lost: %',r->'me';end if;
 update public.group_pages set anonymous=true where id=page;
 if jsonb_array_length(public.read_page_ranking(creator,'fan_contribution','all',null)->'rows')<>0 then raise exception 'Anonymous page ranking named fans';end if;
 update public.group_pages set anonymous=false,status='hidden' where id=page;
 raised:=false;begin perform public.read_page_ranking(creator,'fan_contribution','all',null);exception when others then raised:=sqlerrm='CREATOR_NOT_FOUND';end;
 if not raised then raise exception 'Hidden page ranking served';end if;
 update public.group_pages set status='published' where id=page;
 -- The signed-out tab agrees with the page ranking.
 if (select array_agg((v->>'rank')::integer order by (v->>'rank')::integer)from jsonb_array_elements(public.read_group_public_ranking(null,page)->'rows')v)<>array[1,4,5] then raise exception 'Tab and page ranking disagree';end if;

 -- Wave members stay hidden unless the viewer checked in.
 wave:=pg_temp.group_scope_fixture(viewer,false);
 select celebrity_id into wave_creator from public.group_pages where id=wave;
 perform pg_temp.open_fan_ranking(wave_creator);
 insert into public.ranking_snapshots(kind,scope_id,period,period_start,computed_at,rows)values('fan_contribution',wave_creator,'all',period,now(),jsonb_build_array(jsonb_build_object('rank',1,'subjectId',shown,'score',9,'achievedAt',now())));
 raised:=false;begin perform public.read_page_ranking(wave_creator,'fan_contribution','all',null);exception when others then raised:=sqlerrm='CREATOR_NOT_FOUND';end;
 if not raised then raise exception 'Wave ranking served to a signed-out reader';end if;
 raised:=false;begin perform public.read_page_ranking(wave_creator,'fan_contribution','all',viewer);exception when others then raised:=sqlerrm='CREATOR_NOT_FOUND';end;
 if not raised then raise exception 'Wave ranking served before check-in';end if;
 perform pg_temp.group_scope_fixture(viewer,true);
 if jsonb_array_length(public.read_page_ranking(wave_creator,'fan_contribution','all',viewer)->'rows')<>1 then raise exception 'Checked-in viewer lost the wave ranking';end if;
 if jsonb_array_length(public.read_group_public_ranking(viewer,wave)->'rows')<>1 then raise exception 'Checked-in viewer lost the wave tab';end if;
 raise notice 'PASS public profile limits';
end $$;
rollback;

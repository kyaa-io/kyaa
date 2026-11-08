\set ON_ERROR_STOP on
-- 6th-round list facts: group directory facts, reply counts, friend facts and notification actors.
-- Each new key appears only through the new readers (or fields=...), the readers the deployed web calls keep their exact output,
-- blocked and sanctioned people are never named, and an empty account answers with zeros and nulls.
-- Locally: psql -v skip_rollback=1 -f this file (the rollback section commits and would undo the migrations).
begin;
\ir group_scope_fixture.sql
create role r6_facts_owner nologin nosuperuser nobypassrls;
grant usage on schema public,extensions to r6_facts_owner;
do $$
declare creator uuid:=extensions.gen_random_uuid();fan_page uuid:=extensions.gen_random_uuid();hobby uuid:=extensions.gen_random_uuid();empty_page uuid:=extensions.gen_random_uuid();
 viewer uuid:=extensions.gen_random_uuid();friend uuid:=extensions.gen_random_uuid();sanctioned uuid:=extensions.gen_random_uuid();blocker uuid:=extensions.gen_random_uuid();
 old_member uuid:=extensions.gen_random_uuid();lonely uuid:=extensions.gen_random_uuid();
 post uuid:=extensions.gen_random_uuid();root uuid:=extensions.gen_random_uuid();other_root uuid:=extensions.gen_random_uuid();
 fpost uuid:=extensions.gen_random_uuid();froot uuid:=extensions.gen_random_uuid();live uuid:=extensions.gen_random_uuid();brand uuid:=extensions.gen_random_uuid();notice uuid:=extensions.gen_random_uuid();
 anon_comment uuid:=extensions.gen_random_uuid();blocked_comment uuid:=extensions.gen_random_uuid();friend_comment uuid:=extensions.gen_random_uuid();dm uuid;conv uuid;
 u uuid;result jsonb;plain jsonb;item jsonb;facts jsonb;raised boolean;state text;
begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'r6-facts-fixture','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','사실 검증','소개','사진'),(creator,'en','Facts fixture','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(fan_page,'fan',creator,'R6 facts fan');
 insert into public.group_pages(id,kind,name)values(hobby,'hobby','R6 facts hobby'),(empty_page,'hobby','R6 facts empty');
 foreach u in array array[viewer,friend,sanctioned,blocker,old_member,lonely] loop
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:r6-facts-'||u,u||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,'r'||left(u::text,8),'r'||left(u::text,8));
 end loop;
 foreach u in array array[viewer,friend,sanctioned,blocker,old_member] loop insert into public.group_memberships(page_id,app_user_id)values(hobby,u),(fan_page,u);end loop;
 update public.group_memberships set joined_at=now()-interval '10 days' where app_user_id=old_member;
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(blocker,viewer);
 set local session_replication_role=replica;
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(sanctioned,extensions.gen_random_uuid(),'사실 시험용 제재 사유입니다',extensions.gen_random_uuid());
 insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id)values
  (creator,friend,1,'passport_page_claim',extensions.gen_random_uuid()),(creator,friend,1,'passport_page_claim',extensions.gen_random_uuid()),(creator,friend,1,'passport_page_claim',extensions.gen_random_uuid()),(creator,sanctioned,1,'passport_page_claim',extensions.gen_random_uuid());
 -- Group posts: two this week, one old, one removed. A live that runs now, and one cancelled.
 insert into public.group_posts(id,page_id,author_id,title,body,visibility,anonymous,created_at)values
  (post,hobby,friend,'이번 주 글','본문','public',false,now()-interval '1 day'),
  (extensions.gen_random_uuid(),hobby,friend,'회원 글','본문','members',false,now()-interval '2 days'),
  (extensions.gen_random_uuid(),hobby,friend,'지난 글','본문','public',false,now()-interval '9 days');
 insert into public.group_posts(page_id,author_id,title,body,visibility,anonymous,created_at,removed_at)values(hobby,friend,'지운 글','본문','public',false,now(),now());
 insert into public.group_comments(id,post_id,author_id,body,anonymous,created_at)values(root,post,friend,'원댓글','f',now()-interval '1 hour'),(other_root,post,viewer,'두 번째','f',now()-interval '30 minutes');
 insert into public.group_comments(post_id,author_id,body,anonymous,parent_id)values(post,friend,'답글','f',root),(post,blocker,'차단한 사람의 답글','f',root);
 insert into public.group_comments(post_id,author_id,body,anonymous,parent_id,removed_at)values(post,friend,'지운 답글','f',root,now());
 insert into public.brands(id,slug,status,logo_url,logo_alt,published_at)values(brand,'r6-facts-brand','published','/fixture-brand.svg','Fixture brand',now());
 insert into public.live_events(id,slug,celebrity_id,brand_id,publication_status,content_status,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,external_live_url,approved_hero_url,
   fan_code_hash,attendance_valid_from,attendance_valid_until,published_at)
  values(live,'r6-facts-live',creator,brand,'published','scheduled',now()-interval '10 minutes',now()+interval '1 hour',now()-interval '2 days',now()-interval '1 day',
   'https://www.youtube.com/watch?v=r6factslive','https://www.youtube.com/watch?v=r6factslive','https://kyaa.io/fixture-hero.webp',
   '$2a$10$'||repeat('a',53),now()-interval '10 minutes',now()+interval '1 hour',now());
 -- Fan post with a reply from the friend and one from the blocker.
 insert into public.fan_posts(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash)values(fpost,creator,viewer,'내 팬 글 본문','public',extensions.gen_random_uuid(),repeat('a',64));
 insert into public.fan_post_comments(id,post_id,app_user_id,body,idempotency_key)values(froot,fpost,viewer,'원댓글',extensions.gen_random_uuid()),(friend_comment,fpost,friend,'친구 댓글',extensions.gen_random_uuid());
 insert into public.fan_post_comments(post_id,parent_id,app_user_id,body,idempotency_key)values(fpost,froot,friend,'친구 답글',extensions.gen_random_uuid()),(fpost,froot,blocker,'차단 답글',extensions.gen_random_uuid());
 insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at)values(notice,creator,'r6-facts-notice','published',now());
 insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)values(notice,'ko','공식 공지 제목','{"type":"doc","content":[]}'::jsonb);
 set local session_replication_role=origin;

 -- Directory: the plain call is the old call, the facts call adds exactly four keys.
 plain:=public.groups_dispatch('directory',null,null,null,'{"sort":"recent","type":"all","search":"R6 facts","limit":50}'::jsonb);
 if plain<>public.groups_dispatch_before_directory_facts('directory',null,null,null,'{"sort":"recent","type":"all","search":"R6 facts","limit":50}'::jsonb) then raise exception 'Plain directory changed';end if;
 if plain::text like '%weeklyJoined%' or plain::text like '%lastActiveAt%' then raise exception 'Plain directory has facts: %',plain;end if;
 result:=public.groups_dispatch('directory',null,null,null,'{"sort":"recent","type":"all","search":"R6 facts","limit":50,"fields":"facts"}'::jsonb);
 if jsonb_array_length(result->'items')<>3 then raise exception 'Fixture pages not listed: %',result;end if;
 if exists(select 1 from jsonb_array_elements(result->'items') i join jsonb_array_elements(plain->'items') p on p->>'id'=i->>'id'
   where i-'weeklyJoined'-'newPostCount'-'liveNow'-'lastActiveAt'<>p) then raise exception 'Facts changed other keys';end if;
 select i into item from jsonb_array_elements(result->'items')i where i->>'id'=hobby::text;
 -- old_member joined 10 days ago; the sanctioned fan is still an active account, so 4 of 5 joined this week.
 if (item->>'weeklyJoined')::integer<>4 then raise exception 'weeklyJoined wrong: %',item;end if;
 if (item->>'newPostCount')::integer<>2 then raise exception 'newPostCount wrong: %',item;end if;
 if (item->>'liveNow')::boolean then raise exception 'Hobby page live: %',item;end if;
 if (item->>'lastActiveAt')::timestamptz<now()-interval '1 minute' then raise exception 'lastActiveAt missed the newest join: %',item;end if;
 select i into item from jsonb_array_elements(result->'items')i where i->>'id'=fan_page::text;
 if not (item->>'liveNow')::boolean then raise exception 'Live not seen: %',item;end if;
 if (item->>'newPostCount')::integer<>1 then raise exception 'Fan page posts wrong: %',item;end if;
 select i into item from jsonb_array_elements(result->'items')i where i->>'id'=empty_page::text;
 if item->'weeklyJoined'<>'0'::jsonb or item->'newPostCount'<>'0'::jsonb or item->'liveNow'<>'false'::jsonb or item->'lastActiveAt'<>'null'::jsonb then raise exception 'Empty page facts wrong: %',item;end if;
 -- An override ends the live early.
 set local session_replication_role=replica;
 insert into public.live_status_overrides(live_event_id,effective_status,effective_from,reason,actor_admin_allowlist_id)values(live,'ended',now()-interval '1 minute','시험',extensions.gen_random_uuid());
 set local session_replication_role=origin;
 result:=public.groups_dispatch('directory',null,null,null,'{"sort":"recent","type":"all","search":"R6 facts fan","limit":50,"fields":"facts"}'::jsonb);
 if (result->'items'->0->>'liveNow')::boolean then raise exception 'Override ignored: %',result;end if;
 raised:=false;begin perform public.groups_dispatch('directory',null,null,null,'{"sort":"recent","type":"all","search":"","limit":8,"fields":"all"}'::jsonb);exception when others then raised:=sqlerrm='GROUPS_INVALID_REQUEST';end;
 if not raised then raise exception 'Unknown fields accepted';end if;

 -- Group comments: the viewer does not count the blocker's reply, a signed-out reader does; removed replies never count.
 plain:=public.groups_content_dispatch('comments',viewer,hobby,post,'{"limit":30}'::jsonb);
 if plain::text like '%replyCount%' then raise exception 'Plain comments have replyCount';end if;
 result:=public.groups_content_dispatch('comments',viewer,hobby,post,'{"limit":30,"fields":"replies"}'::jsonb);
 if (select(i->>'replyCount')::integer from jsonb_array_elements(result->'items')i where i->>'id'=root::text)<>1 then raise exception 'Viewer reply count wrong: %',result;end if;
 if (select i->'replyCount' from jsonb_array_elements(result->'items')i where i->>'id'=other_root::text)<>'0'::jsonb then raise exception 'Zero replies not 0';end if;
 if exists(select 1 from jsonb_array_elements(result->'items')i where i->>'parentId' is not null and i?'replyCount') then raise exception 'Reply has replyCount';end if;
 result:=public.groups_content_dispatch('comments',null,hobby,post,'{"limit":30,"fields":"replies"}'::jsonb);
 if (select(i->>'replyCount')::integer from jsonb_array_elements(result->'items')i where i->>'id'=root::text)<>2 then raise exception 'Signed-out reply count wrong: %',result;end if;

 -- Fan post comments: same rule through the fan-post reader.
 plain:=public.read_fan_post_comments(viewer,fpost,null,null,20,'ko');
 if plain is null then raise exception 'Fixture post not readable';end if;
 if plain::text like '%replyCount%' then raise exception 'Plain fan comments have replyCount';end if;
 result:=public.read_fan_post_comments_replies(viewer,fpost,null,null,20,'ko');
 if result-'items'<>plain-'items' or (select array_agg(i-'replyCount' order by o) from jsonb_array_elements(result->'items') with ordinality t(i,o))<>(select array_agg(i order by o) from jsonb_array_elements(plain->'items') with ordinality t(i,o)) then raise exception 'Fan replies reader changed other keys';end if;
 if (select(i->>'replyCount')::integer from jsonb_array_elements(result->'items')i where i->>'id'=froot::text)<>1 then raise exception 'Fan reply count wrong: %',result;end if;
 if (select(i->>'replyCount')::integer from jsonb_array_elements(result->'items')i where i->>'id'=friend_comment::text)<>0 then raise exception 'Fan zero reply count wrong';end if;

 -- Friends: grade, hearts and favorite for an open friend; nothing for a sanctioned one; a friendship with no creator
 -- takes the grade for the friend's favorite, and with no favorite either it has none.
 insert into public.social_friendships(requester_id,addressee_id,status,request_id,payload_hash,celebrity_id,accepted_at)values
  (viewer,friend,'accepted',extensions.gen_random_uuid(),repeat('b',64),creator,now()),(sanctioned,viewer,'accepted',extensions.gen_random_uuid(),repeat('c',64),creator,now());
 insert into public.fan_profile_public_fields(app_user_id,favorite_celebrity_id)values(friend,creator),(sanctioned,creator);
 plain:=public.read_owned_social_friends(viewer,'ko');
 result:=public.read_owned_social_friends_facts(viewer,'ko');
 if result-'friendships'<>plain-'friendships' then raise exception 'Friend exchanges changed';end if;
 if jsonb_array_length(result->'friendships')<>jsonb_array_length(plain->'friendships') then raise exception 'Friend rows changed';end if;
 select i into item from jsonb_array_elements(result->'friendships')i where i->>'profileId'=friend::text;
 if (item->>'hearts')::integer<>3 or item->>'tier' is null or item->'favorite'->>'name'<>'사실 검증' then raise exception 'Friend facts wrong: %',item;end if;
 if public.read_owned_social_friends_facts(viewer,'en')->'friendships'@@'$[*].favorite.name=="Facts fixture"' is not true then raise exception 'Favorite not localized';end if;
 select i into item from jsonb_array_elements(result->'friendships')i where i->>'profileId'=sanctioned::text;
 if item is not null and (item->'tier'<>'null'::jsonb or item->'hearts'<>'null'::jsonb or item->'favorite'<>'null'::jsonb) then raise exception 'Sanctioned friend facts shown: %',item;end if;
 if public.read_owned_social_friends_facts(lonely,'ko')->'friendships'<>'[]'::jsonb then raise exception 'Empty friends not []';end if;
 insert into public.social_friendships(requester_id,addressee_id,status,request_id,payload_hash,accepted_at)values(lonely,friend,'accepted',extensions.gen_random_uuid(),repeat('d',64),now()),(lonely,old_member,'accepted',extensions.gen_random_uuid(),repeat('e',64),now());
 result:=public.read_owned_social_friends_facts(lonely,'ko');
 select i into item from jsonb_array_elements(result->'friendships')i where i->>'profileId'=friend::text;
 if item->>'celebritySlug' is not null or (item->>'hearts')::integer<>3 or item->'favorite'->>'slug'<>'r6-facts-fixture' then raise exception 'Global friend did not take the favorite: %',item;end if;
 select i into item from jsonb_array_elements(result->'friendships')i where i->>'profileId'=old_member::text;
 if item->'tier'<>'null'::jsonb or item->'hearts'<>'null'::jsonb or item->'favorite'<>'null'::jsonb then raise exception 'Friend with no creator and no favorite has facts: %',item;end if;

 -- Notifications: the person is the comment author unless blocked, sanctioned, anonymous or the reader; official posts name the creator.
 insert into public.group_comments(id,post_id,author_id,body,anonymous,parent_id)values(blocked_comment,post,blocker,'차단 답글2','f',other_root),(anon_comment,post,old_member,'익명 답글','t',other_root);
 facts:=public.web_notification_facts(viewer,jsonb_build_object('kind','content_reply','payload',jsonb_build_object('targetType','group_comment','targetId',root)),'ko');
 if facts->'actor'->>'profileId'<>friend::text or facts->'target'->>'type'<>'group_post' or facts->'target'->>'label'<>'이번 주 글' then raise exception 'Group reply actor wrong: %',facts;end if;
 facts:=public.web_notification_facts(viewer,jsonb_build_object('kind','content_reply','payload',jsonb_build_object('targetType','group_comment','targetId',blocked_comment)),'ko');
 if facts->'actor'<>'null'::jsonb then raise exception 'Blocked actor named: %',facts;end if;
 facts:=public.web_notification_facts(viewer,jsonb_build_object('kind','content_reply','payload',jsonb_build_object('targetType','group_comment','targetId',anon_comment)),'ko');
 if facts->'actor'<>'null'::jsonb then raise exception 'Anonymous actor named: %',facts;end if;
 facts:=public.web_notification_facts(viewer,jsonb_build_object('kind','content_reply','payload',jsonb_build_object('targetType','fan_post_comment','targetId',friend_comment)),'ko');
 if facts->'actor'->>'profileId'<>friend::text or facts->'target'->>'id'<>fpost::text or facts->'target'->>'label'<>'내 팬 글 본문' then raise exception 'Fan reply facts wrong: %',facts;end if;
 facts:=public.web_notification_facts(viewer,jsonb_build_object('kind','fan_friend_request','payload',jsonb_build_object('targetType','social_friendship','targetId',(select id from public.social_friendships where requester_id=sanctioned))),'ko');
 if facts->'actor'<>'null'::jsonb or facts->'target'->>'type'<>'friendship' then raise exception 'Sanctioned requester named: %',facts;end if;
 facts:=public.web_notification_facts(viewer,jsonb_build_object('kind','official_post','payload',jsonb_build_object('targetType','notice','targetId',notice)),'ko');
 if facts->'actor'->'profileId'<>'null'::jsonb or facts->'actor'->>'nickname'<>'사실 검증' or facts->'target'->>'label'<>'공식 공지 제목' then raise exception 'Official actor wrong: %',facts;end if;
 facts:=public.web_notification_facts(viewer,jsonb_build_object('kind','artist_online','payload',jsonb_build_object('artistId',blocker,'artistName','차단 아티스트','pageId',fan_page,'pageName','R6')),'ko');
 if facts->'actor'<>'null'::jsonb or facts->'target'->>'type'<>'group_page' then raise exception 'Blocked artist named: %',facts;end if;
 facts:=public.web_notification_facts(viewer,jsonb_build_object('kind','artist_online','payload',jsonb_build_object('artistId',friend,'artistName','아티스트 이름','pageId',fan_page,'pageName','R6')),'ko');
 if facts->'actor'->>'nickname'<>'아티스트 이름' then raise exception 'Artist name not used: %',facts;end if;
 facts:=public.web_notification_facts(viewer,jsonb_build_object('kind','stamp_issued','payload',jsonb_build_object('targetType','community_stamp','targetId',extensions.gen_random_uuid())),'ko');
 if facts<>'{"actor":null,"target":null,"thumbnail_url":null}'::jsonb then raise exception 'Kind without a person has facts: %',facts;end if;
 facts:=public.web_notification_facts(viewer,jsonb_build_object('kind','content_reply','payload',jsonb_build_object('targetType','fan_post_comment','targetId',froot)),'ko');
 if facts->'actor'<>'null'::jsonb then raise exception 'Reader named as own actor: %',facts;end if;
 -- The wrapper is the plain list plus three keys; an account with no notifications gets [].
 if public.get_owned_web_notifications_facts(lonely,'ko')<>'[]'::jsonb then raise exception 'Empty notifications not []';end if;

 -- Only the service role calls the readers.
 raised:=false;begin execute 'set local role anon';perform public.get_owned_web_notifications_facts(viewer,'ko');exception when others then get stacked diagnostics state=returned_sqlstate;raised:=state='42501';end;
 execute 'reset role';
 if not raised then raise exception 'anon may read notification facts';end if;
 raised:=false;begin execute 'set local role authenticated';perform public.read_owned_social_friends_facts(viewer,'ko');exception when others then get stacked diagnostics state=returned_sqlstate;raised:=state='42501';end;
 execute 'reset role';
 if not raised then raise exception 'authenticated may read friend facts';end if;

 -- An ordinary owner: the gap is reported, then after the access step the readers work the same with the exclusions intact.
 alter function public.group_directory_facts(jsonb) owner to r6_facts_owner;
 alter function public.group_comment_reply_counts(uuid,jsonb) owner to r6_facts_owner;
 alter function public.web_notification_facts(uuid,jsonb,public.content_locale) owner to r6_facts_owner;
 alter function public.web_notification_actor(uuid,uuid,text,public.content_locale) owner to r6_facts_owner;
 alter function public.read_owned_social_friends_facts(uuid,public.content_locale) owner to r6_facts_owner;
 alter function public.fan_web_blocked(uuid,uuid) owner to r6_facts_owner;
 raised:=false;begin perform public.group_public_directory_owner_check();exception when others then raised:=sqlerrm like 'PUBLIC_DIRECTORY_OWNER_GAP%';end;
 if not raised then raise exception 'Owner gap not reported';end if;
 perform public.group_public_directory_owner_access();
 perform public.group_public_directory_owner_check();
 execute 'set local role service_role';
 result:=public.groups_dispatch('directory',null,null,null,'{"sort":"recent","type":"all","search":"R6 facts hobby","limit":50,"fields":"facts"}'::jsonb);
 plain:=public.read_owned_social_friends_facts(viewer,'ko');
 execute 'reset role';
 -- Called as the superuser, it still runs as the ordinary owner (definer); the service role reaches it only through the list reader.
 facts:=public.web_notification_facts(viewer,jsonb_build_object('kind','content_reply','payload',jsonb_build_object('targetType','group_comment','targetId',blocked_comment)),'ko');
 if (result->'items'->0->>'newPostCount')::integer<>2 or (result->'items'->0->>'weeklyJoined')::integer<>4 then raise exception 'Facts lost under an ordinary owner: %',result;end if;
 if facts->'actor'<>'null'::jsonb then raise exception 'Block lost under an ordinary owner';end if;
 if (select(i->>'hearts')::integer from jsonb_array_elements(plain->'friendships')i where i->>'profileId'=friend::text)<>3 then raise exception 'Friend facts lost under an ordinary owner';end if;
 raise notice 'PASS r6 server facts';
end $$;
rollback;

\if :{?skip_rollback}
\else
-- The rollbacks stand on the current definitions and leave the readers the deployed web calls.
\ir ../rollback/20261218020000_social_notification_facts.sql
\ir ../rollback/20261218010000_group_directory_facts.sql
do $$
begin
 if to_regprocedure('public.groups_dispatch_before_directory_facts(text,uuid,uuid,uuid,jsonb,uuid)') is not null or to_regprocedure('public.group_directory_facts(jsonb)') is not null
  or to_regprocedure('public.get_owned_web_notifications_facts(uuid,public.content_locale)') is not null then raise exception 'Rollback left new readers';end if;
 if to_regprocedure('public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)') is null or to_regprocedure('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)') is null then raise exception 'Rollback lost the dispatchers';end if;
 raise notice 'PASS r6 server facts rollback';
end $$;
\endif

\set ON_ERROR_STOP on
-- Third review: creator totals could be compared across a block to work out one member's amount, and two request paths had no daily limit.
begin;
\ir group_scope_fixture.sql
create function pg_temp.member(u uuid,tag text)returns void language plpgsql as $$begin
 insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:req-'||tag||'-'||u,u||'@example.test');
 insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,left(tag,4)||left(u::text,8),left(tag,4)||left(u::text,8));
end $$;
create function pg_temp.creator(c uuid,slug text)returns void language plpgsql as $$begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(c,slug,'published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(c,'ko',slug,'소개','사진'),(c,'en',slug,'Summary','Photo');
end $$;
-- BLOCK support
do $$
declare a uuid:=extensions.gen_random_uuid();b uuid:=extensions.gen_random_uuid();target uuid:=extensions.gen_random_uuid();viewer uuid:=extensions.gen_random_uuid();big uuid:=extensions.gen_random_uuid();small uuid:=extensions.gen_random_uuid();before_block jsonb;after_block jsonb;
begin
 perform pg_temp.creator(big,'support-big-fixture');perform pg_temp.creator(small,'support-small-fixture');
 perform pg_temp.member(a,'a');perform pg_temp.member(b,'b');perform pg_temp.member(target,'t');perform pg_temp.member(viewer,'v');
 set local session_replication_role=replica;
 insert into public.mobile_fan_support_contributions(app_user_id,request_key,celebrity_id,units,voucher_ledger_id,policy_id)values
  (target,extensions.gen_random_uuid(),big,7,extensions.gen_random_uuid(),extensions.gen_random_uuid()),
  (a,extensions.gen_random_uuid(),big,3,extensions.gen_random_uuid(),extensions.gen_random_uuid()),
  (b,extensions.gen_random_uuid(),small,5,extensions.gen_random_uuid(),extensions.gen_random_uuid());
 insert into public.social_favorite_visibility(app_user_id,celebrity_id,visible)values(target,big,true),(a,big,true),(b,small,true);
 set local session_replication_role=origin;
 before_block:=public.read_owned_mobile_fan_support_rankings(viewer);
 if jsonb_array_length(before_block->'items')<2 then raise exception 'Fixture creators missing: %',before_block;end if;
 if (select array_agg(k order by k)from jsonb_object_keys(before_block#>'{items,0}')k)<>array['celebrityId','celebritySlug','imageUrl','name','rank'] then raise exception 'Creator row exposes more than rank and identity: %',before_block#>'{items,0}';end if;
 if before_block::text ~ 'support(Units|Krw)' then raise exception 'Creator amounts still present: %',before_block;end if;
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(viewer,target);
 after_block:=public.read_owned_mobile_fan_support_rankings(viewer);
 -- 10 units before the block, 3 after, against 5: the order must not move, or the block reveals the difference.
 if after_block<>before_block then raise exception 'Blocking changed the creator ranking: % -> %',before_block,after_block;end if;
 raise notice 'PASS support creator ranking';
end $$;
-- BLOCK wave
do $$
declare spammer uuid:=extensions.gen_random_uuid();u uuid;i integer;targets uuid[]:='{}';r jsonb;raised boolean;first_request uuid:=extensions.gen_random_uuid();
begin
 perform pg_temp.member(spammer,'s');perform pg_temp.group_scope_fixture(spammer,true);
 for i in 1..32 loop u:=extensions.gen_random_uuid();targets:=targets||u;perform pg_temp.member(u,'w');perform pg_temp.group_scope_fixture(u,true);end loop;
 r:=public.request_kyaa_wave_friend(spammer,targets[1],first_request);
 for i in 2..30 loop r:=public.request_kyaa_wave_friend(spammer,targets[i],extensions.gen_random_uuid());end loop;
 if r->>'status'<>'pending' then raise exception 'Wave request under the limit failed: %',r;end if;
 raised:=false;begin perform public.request_kyaa_wave_friend(spammer,targets[31],extensions.gen_random_uuid());exception when others then raised:=sqlerrm='SOCIAL_RATE_LIMITED';end;
 if not raised then raise exception 'Wave request 31 was not refused';end if;
 if (public.request_kyaa_wave_friend(spammer,targets[1],first_request)->>'replayed')<>'true' then raise exception 'Wave replay must still answer';end if;
 -- Both paths share one count.
 raised:=false;begin perform public.request_social_friend(spammer,targets[32],null,extensions.gen_random_uuid());exception when others then raised:=sqlerrm='SOCIAL_RATE_LIMITED';end;
 if not raised then raise exception 'General request not limited after wave requests';end if;
 if (select count(*)from public.social_friendships where requester_id=spammer)<>30 then raise exception 'Rows past the limit';end if;
 raise notice 'PASS wave friend limit';
end $$;
-- BLOCK dm
do $$
declare creator uuid:=extensions.gen_random_uuid();spammer uuid:=extensions.gen_random_uuid();friend uuid:=extensions.gen_random_uuid();u uuid;i integer;targets uuid[]:='{}';r jsonb;raised boolean;first_request uuid:=extensions.gen_random_uuid();conversation uuid;
begin
 if public.social_dm_request_daily_limit()<>30 then raise exception 'Message request limit should start at 30';end if;
 perform pg_temp.creator(creator,'dm-limit-fixture');perform pg_temp.member(spammer,'d');perform pg_temp.member(friend,'f');
 set local session_replication_role=replica;
 insert into public.fan_passports(app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)values(spammer,creator,extensions.gen_random_uuid(),extensions.gen_random_uuid());
 insert into public.social_favorite_visibility(app_user_id,celebrity_id,visible)values(spammer,creator,true);
 -- 2026-11-07 Q2: message requests need a shared page.
 insert into public.group_pages(id,kind,name)values('75000000-0000-4000-8000-0000000000aa','hobby','Limit page');
 insert into public.group_memberships(page_id,app_user_id)values('75000000-0000-4000-8000-0000000000aa',spammer);
 for i in 1..32 loop
  u:=extensions.gen_random_uuid();targets:=targets||u;perform pg_temp.member(u,'r');
  insert into public.social_profile_settings(app_user_id,dm_policy)values(u,'requests');
  insert into public.fan_passports(app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id)values(u,creator,extensions.gen_random_uuid(),extensions.gen_random_uuid());
  insert into public.social_favorite_visibility(app_user_id,celebrity_id,visible)values(u,creator,true);
  insert into public.group_memberships(page_id,app_user_id)values('75000000-0000-4000-8000-0000000000aa',u);
 end loop;
 set local session_replication_role=origin;
 r:=public.request_social_dm(spammer,targets[1],'안녕하세요',first_request);
 conversation:=(r->>'id')::uuid;
 -- Cancelling or being rejected must not hand the quota back.
 update public.social_dm_conversations set status='cancelled',retry_at=now()+interval'24 hours' where id=conversation;
 for i in 2..30 loop r:=public.request_social_dm(spammer,targets[i],'안녕하세요',extensions.gen_random_uuid());end loop;
 if r->>'status'<>'pending' then raise exception 'Message request under the limit failed: %',r;end if;
 raised:=false;begin perform public.request_social_dm(spammer,targets[31],'안녕하세요',extensions.gen_random_uuid());exception when others then raised:=sqlerrm='SOCIAL_RATE_LIMITED';end;
 if not raised then raise exception 'Message request 31 was not refused';end if;
 if (select count(*)from public.social_dm_messages where sender_id=spammer)<>30 then raise exception 'Messages past the limit';end if;
 if (public.request_social_dm(spammer,targets[1],'안녕하세요',first_request)->>'replayed')<>'true' then raise exception 'Message replay must still answer';end if;
 -- An existing friend can still be messaged at the limit.
 insert into public.social_friendships(requester_id,addressee_id,status,request_id,payload_hash)values(friend,spammer,'accepted',extensions.gen_random_uuid(),'fixture');
 if public.request_social_dm(spammer,friend,'친구에게',extensions.gen_random_uuid())->>'status'<>'pending' then raise exception 'Friend message was limited';end if;
 -- The limit resets after a day.
 update public.social_dm_messages set created_at=now()-interval'25 hours' where sender_id=spammer;
 if public.request_social_dm(spammer,targets[32],'안녕하세요',extensions.gen_random_uuid())->>'status'<>'pending' then raise exception 'Message limit did not reset';end if;
 raise notice 'PASS message request limit';
end $$;
rollback;

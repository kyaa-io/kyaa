-- Run on a disposable latest-chain database. The fixture and policy activation are committed first because a
-- reward only counts for content created after the policy's effective time; the assertions then roll back.
do $$ begin
  if current_database() <> 'byus_clean' or inet_server_addr() is not null then
    raise exception 'Post reward result tests require disposable local byus_clean';
  end if;
end $$;

begin;
insert into public.app_users(id,privy_user_id,verified_email) values
 ('93000000-0000-4000-8000-000000000001','did:privy:prr-owner','prr-owner@example.test'),
 ('93000000-0000-4000-8000-000000000002','did:privy:prr-other','prr-other@example.test'),
 ('93000000-0000-4000-8000-000000000003','did:privy:prr-poster','prr-poster@example.test');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
 ('93000000-0000-4000-8000-000000000010','prr-v2','published','/f.webp',now(),'{creator}','creator'),
 ('93000000-0000-4000-8000-000000000011','prr-v1','published','/f.webp',now(),'{creator}','creator'),
 ('93000000-0000-4000-8000-000000000012','prr-none','published','/f.webp',now(),'{creator}','creator');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
 select c,locale,'Fixture','Fixture','Fixture' from unnest(array['93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000012']::uuid[]) c, unnest(enum_range(null::public.content_locale)) locale;
insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash,first_comment_eligible) values
 ('93000000-0000-4000-8000-000000000020','93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000002','A',extensions.gen_random_uuid(),repeat('a',64),false),
 ('93000000-0000-4000-8000-000000000021','93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000002','B',extensions.gen_random_uuid(),repeat('a',64),false),
 ('93000000-0000-4000-8000-000000000022','93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000002','C',extensions.gen_random_uuid(),repeat('a',64),false),
 ('93000000-0000-4000-8000-000000000023','93000000-0000-4000-8000-000000000012','93000000-0000-4000-8000-000000000002','D',extensions.gen_random_uuid(),repeat('a',64),false);

create function pg_temp.rules() returns jsonb language sql as $$select '{"verification":100,"reaction":2,"comment":10,"checkin":100,"certification":30,"membership_instagram":50,"membership_tiktok":50,"membership_youtube":50,"share":10,"live_reservation":10,"live_attendance":50,"mission_completion":30,"first_clip":100,"journey_completion":20,"invitation_milestone":200}'::jsonb$$;
create function pg_temp.caps() returns jsonb language sql as $$select jsonb_agg(jsonb_build_object('key',k,'scope',case when k in('verification','membership_instagram','membership_tiktok','membership_youtube','first_clip','invitation_milestone')then'lifetime'else'daily'end,'dailyLimit',case when k in('verification','membership_instagram','membership_tiktok','membership_youtube','first_clip','invitation_milestone')then null when k='reaction'then 5 when k='comment'then 2 else 1 end,'lifetimeLimit',case when k='invitation_milestone'then 5 when k in('verification','membership_instagram','membership_tiktok','membership_youtube','first_clip')then 1 else null end))from jsonb_object_keys(pg_temp.rules())k$$;
select public.activate_mobile_fan_earning_v2('93000000-0000-4000-8000-000000000010','prr-v2',pg_temp.rules(),pg_temp.caps());
select public.activate_mobile_fan_earning('93000000-0000-4000-8000-000000000011','prr-v1',pg_temp.rules());

commit;
begin;
create function pg_temp.counts() returns text language sql as $$
 select (select count(*) from public.mobile_fan_economy_ledger)||'/'||(select count(*) from public.mobile_fan_activity_decisions)||'/'||(select count(*) from public.mobile_fan_economy_activity_receipts) $$;

do $$
declare
 owner_id constant uuid := '93000000-0000-4000-8000-000000000001';
 other_id constant uuid := '93000000-0000-4000-8000-000000000002';
 poster_id constant uuid := '93000000-0000-4000-8000-000000000003';
 c1 uuid; c2 uuid; c3 uuid; c5 uuid; c6 uuid; v1post uuid := '93000000-0000-4000-8000-000000000030'; p1 uuid;
 before_counts text; amt bigint; ok boolean;
begin
 -- Publishing creates each creator's page (20261212010000), and a page admits only members to its board.
 insert into public.group_memberships(page_id,app_user_id)
  select g.id,member.id from public.group_pages g cross join (values (owner_id),(poster_id)) as member(id)
  where g.celebrity_id::text like '93000000-%';
 -- (a) owner award on the v2 path
 c1 := (public.post_fan_post_comment(owner_id,'93000000-0000-4000-8000-000000000020',null,'first','f3000000-0000-4000-8000-000000000001'))->>'id';
 if (public.read_owned_fan_post_reward(owner_id,c1)->>'amount')::bigint <> 10 then raise exception '(a) v2 award expected 10'; end if;
 -- (a2) v1 path: first post of an activity-conversion-only creator is paid without a decisions row
 insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash,first_comment_eligible)
  values(v1post,'93000000-0000-4000-8000-000000000011',owner_id,'v1 first post',extensions.gen_random_uuid(),repeat('a',64),true);
 set constraints all immediate;
 if exists(select 1 from public.mobile_fan_activity_decisions where source_id=v1post) then raise exception '(a2) fixture is not the v1 path'; end if;
 if (public.read_owned_fan_post_reward(owner_id,v1post)->>'amount')::bigint <> 10 then raise exception '(a2) v1 award expected 10'; end if;
 -- (b) another member with the same source id
 if (public.read_owned_fan_post_reward(other_id,c1)->>'amount')::bigint <> 0 or (public.read_owned_fan_post_reward(poster_id,v1post)->>'amount')::bigint <> 0 then raise exception '(b) other member must read 0'; end if;
 -- (c) duplicate and daily limit (no ledger row)
 c2 := (public.post_fan_post_comment(owner_id,'93000000-0000-4000-8000-000000000020',null,'second','f3000000-0000-4000-8000-000000000002'))->>'id';
 c3 := (public.post_fan_post_comment(owner_id,'93000000-0000-4000-8000-000000000021',null,'on B','f3000000-0000-4000-8000-000000000003'))->>'id';
 c5 := (public.post_fan_post_comment(owner_id,'93000000-0000-4000-8000-000000000022',null,'on C','f3000000-0000-4000-8000-000000000005'))->>'id';
 if not exists(select 1 from public.mobile_fan_activity_decisions where source_id=c2 and decision='duplicate' and point_ledger_id is null) then raise exception '(c) c2 not duplicate'; end if;
 if not exists(select 1 from public.mobile_fan_activity_decisions where source_id=c5 and decision='daily_limit' and point_ledger_id is null) then raise exception '(c) c5 not daily_limit'; end if;
 if (public.read_owned_fan_post_reward(owner_id,c2)->>'amount')::bigint <> 0 or (public.read_owned_fan_post_reward(owner_id,c5)->>'amount')::bigint <> 0 then raise exception '(c) duplicate/daily_limit must read 0'; end if;
 if (public.read_owned_fan_post_reward(owner_id,c3)->>'amount')::bigint <> 10 then raise exception '(c) c3 expected 10'; end if;
 -- inactive creator: no decision or receipt, read 0
 c6 := (public.post_fan_post_comment(owner_id,'93000000-0000-4000-8000-000000000023',null,'no earning','f3000000-0000-4000-8000-000000000006'))->>'id';
 if (public.read_owned_fan_post_reward(owner_id,c6)->>'amount')::bigint <> 0 then raise exception '(c) inactive creator must read 0'; end if;
 -- (d) a post id and a comment id each return only their own amount
 p1 := (public.save_fan_post(p_app_user_id=>poster_id,p_slug=>'prr-v2',p_post_id=>null,p_body=>'new post',p_visibility=>'public',p_asset_ids=>'{}'::uuid[],p_expected_revision=>null,p_idempotency_key=>'f3000000-0000-4000-8000-000000000010'))->>'id';
 set constraints all immediate;
 if (public.read_owned_fan_post_reward(poster_id,p1)->>'amount')::bigint <> 10 then raise exception '(d) post award expected 10'; end if;
 if (public.read_owned_fan_post_reward(poster_id,c1)->>'amount')::bigint <> 0 or (public.read_owned_fan_post_reward(owner_id,p1)->>'amount')::bigint <> 0 then raise exception '(d) ids must not cross members'; end if;
 -- (e) unknown id
 if (public.read_owned_fan_post_reward(owner_id,'ffffffff-ffff-4fff-8fff-ffffffffffff')->>'amount')::bigint <> 0 then raise exception '(e) unknown id must read 0'; end if;
 -- (h) a receipt whose ledger asset is not fan_point reads 0
 declare other_src constant uuid := '93000000-0000-4000-8000-000000000040'; led uuid; pol uuid;
 begin
  select id into pol from public.mobile_fan_economy_policies where celebrity_id='93000000-0000-4000-8000-000000000010' and kind='earning' limit 1;
  led := public.mobile_fan_economy_post(owner_id,'93000000-0000-4000-8000-000000000010','free_vote',5,'activity',other_src,pol);
  insert into public.mobile_fan_economy_activity_receipts(app_user_id,celebrity_id,action_key,scope_key,source_id,occurred_at,policy_id,point_ledger_id)
   values(owner_id,'93000000-0000-4000-8000-000000000010','comment',other_src::text,other_src,now(),pol,led);
  if (public.read_owned_fan_post_reward(owner_id,other_src)->>'amount')::bigint <> 0 then raise exception '(h) non fan_point asset must read 0'; end if;
 end;
 -- (f) reads change no row counts
 before_counts := pg_temp.counts();
 perform public.read_owned_fan_post_reward(owner_id,x) from unnest(array[c1,c2,c3,c5,c6,p1,v1post]) x;
 if pg_temp.counts() <> before_counts then raise exception '(f) read changed row counts % -> %',before_counts,pg_temp.counts(); end if;
end $$;

-- (g) permissions
do $$ begin
 if has_function_privilege('anon','public.read_owned_fan_post_reward(uuid,uuid)','execute')
  or has_function_privilege('authenticated','public.read_owned_fan_post_reward(uuid,uuid)','execute')
  or has_function_privilege('public','public.read_owned_fan_post_reward(uuid,uuid)','execute')
  or not has_function_privilege('service_role','public.read_owned_fan_post_reward(uuid,uuid)','execute') then
  raise exception '(g) only service_role may execute read_owned_fan_post_reward';
 end if;
end $$;
rollback;

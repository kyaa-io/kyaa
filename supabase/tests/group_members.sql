\set ON_ERROR_STOP on
begin;
\ir group_scope_fixture.sql
do $$declare creator uuid:=extensions.gen_random_uuid();page uuid:=extensions.gen_random_uuid();hobby uuid:=extensions.gen_random_uuid();ids uuid[]:='{}';u uuid;j uuid;r uuid;friend uuid;name text;result jsonb;legacy jsonb;first_page jsonb;cursor uuid;i integer;before_count bigint;wave uuid;begin
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'group-people-fixture','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','회원 검증','소개','사진'),(creator,'en','People fixture','Summary','Photo');
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'People fixture'),(hobby,'hobby',null,'Hobby fixture');
 for i in 1..100 loop
  u:=extensions.gen_random_uuid();ids:=array_append(ids,u);j:=extensions.gen_random_uuid();r:=extensions.gen_random_uuid();
  insert into public.app_users(id,privy_user_id,verified_email)values(u,'did:privy:group-people-'||u,u||'@example.test');
  name:=case i when 1 then 'Alpha owner'when 3 then 'literal_underscore'when 4 then 'Blocked member'else 'Fixture '||i end;
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values(u,name,lower(name));
  insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type)values(u,91342,'0xee96'||lpad(to_hex(i),36,'0'),'privy','embedded');
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)values(j,'reaction',r,'byus:reaction:v1:'||r,jsonb_build_object('recipient','0xee96'||lpad(to_hex(i),36,'0'),'celebritySlug','group-people-fixture','issuanceId','0x'||repeat(md5(r::text),2),'reactionType','FirstReaction'));
  insert into public.fan_reactions(id,app_user_id,celebrity_id,blockchain_job_id,completed_at)values(r,u,creator,j,now()+i*interval'1 second');
  if i in(1,3,4,5)then insert into public.group_memberships(page_id,app_user_id,role,joined_at)values(page,u,case when i=1 then'owner'else'member'end,now()+i*interval'1 second');end if;
  if i=1 then insert into public.group_memberships(page_id,app_user_id,role)values(hobby,u,'owner');end if;
 end loop;
 result:=public.read_group_people(ids[1],page,'members','',null,1);cursor:=(result->>'nextCursor')::uuid;
 if jsonb_array_length(result->'items')<>1 or cursor<>ids[1]then raise exception 'Member cursor first page invalid';end if;
 result:=public.read_group_people(ids[1],page,'members','',cursor,10);
 if jsonb_array_length(result->'items')<>3 or result->>'nextCursor'is not null then raise exception 'Member cursor final page invalid';end if;
 result:=public.read_group_people(ids[1],page,'members','_',null,10);
 if jsonb_array_length(result->'items')<>1 or result#>>'{items,0,profileId}'<>ids[3]::text then raise exception 'Search treated literal as wildcard';end if;
 result:=public.groups_dispatch('members',ids[1],page,null,jsonb_build_object('search','literal_','limit',1));
 if jsonb_array_length(result->'items')<>1 or result#>>'{items,0,profileId}'<>ids[3]::text or result->>'nextCursor'is not null then raise exception 'Management member search did not precede pagination';end if;
 -- Management details use actual page records and never expose anonymous activity.
 insert into public.group_posts(page_id,author_id,title,body,visibility,anonymous)values(page,ids[3],'Visible fixture','Body','members',false),(page,ids[3],'Anonymous fixture','Body','members',true);
 result:=public.groups_dispatch('members',ids[1],page,null,jsonb_build_object('search','literal_','limit',1));
 if result#>>'{items,0,joinedAt}' is null or result#>>'{items,0,postCount}'<>'1' or result#>>'{items,0,commentCount}'<>'0' or result#>>'{items,0,lastActiveAt}' is null then raise exception 'Management details missing or anonymous activity exposed';end if;
 result:=public.groups_dispatch('members',ids[3],page,null,jsonb_build_object('search','literal_','limit',1));
 if result#>>'{items,0,postCount}' is not null or result#>>'{items,0,lastActiveAt}' is not null or result#>>'{items,0,joinedAt}' is not null then raise exception 'Management details leaked to member';end if;
 -- A legacy Creator-scoped friendship and a global friendship outside this page.
 insert into public.social_friendships(requester_id,addressee_id,celebrity_id,status,request_id,payload_hash)values(ids[1],ids[3],creator,'accepted',extensions.gen_random_uuid(),'fixture'),(ids[1],ids[2],null,'accepted',extensions.gen_random_uuid(),'fixture'),(ids[1],ids[5],null,'pending',extensions.gen_random_uuid(),'fixture');
 result:=public.read_group_people(ids[1],page,'friends');
 if jsonb_array_length(result->'items')<>1 or result#>>'{items,0,profileId}'<>ids[3]::text then raise exception 'Friends not intersected with page/accepted global relationship';end if;
 select count(*)into before_count from public.fan_score_ledger;
 legacy:=public.read_celebrity_fan_leaderboard('group-people-fixture',ids[1],'ko','all');
 result:=public.read_group_people(ids[1],page,'ranking');
 if result#>>'{ranking,available}'<>'true'or jsonb_array_length(result->'items')<>4 or result#>>'{items,1,rank}'<>'3'or result#>>'{items,1,points}'<>legacy#>>'{rows,2,points}'then raise exception 'Existing Creator rank/points recalculated by page adapter';end if;
 perform public.block_social_profile(ids[4],ids[1],extensions.gen_random_uuid());
 result:=public.read_group_people(ids[1],page,'members');
 if jsonb_array_length(result->'items')<>3 or exists(select 1 from jsonb_array_elements(result->'items')v where(v->>'profileId')::uuid=ids[4])then raise exception 'Bilateral block leaked member';end if;
 result:=public.read_group_people(ids[1],page,'ranking');
 if jsonb_array_length(result->'items')<>3 then raise exception 'Bilateral block leaked ranking';end if;
 update public.app_users set status='disabled'where id=ids[5];
 result:=public.read_group_people(ids[1],page,'members');if jsonb_array_length(result->'items')<>2 then raise exception 'Disabled member leaked';end if;
 result:=public.read_group_people(ids[1],page,'ranking');if result#>>'{ranking,reason}'<>'threshold'or jsonb_array_length(result->'items')<>0 then raise exception 'Existing 100 fan threshold bypassed';end if;
 result:=public.read_group_people(ids[1],hobby,'ranking');if result#>>'{ranking,reason}'<>'creator_required'then raise exception 'Invented hobby fan score';end if;
 begin perform public.read_group_people(ids[2],page);raise exception 'Unjoined member accepted';exception when others then if sqlerrm<>'GROUPS_FORBIDDEN'then raise;end if;end;
 wave:=pg_temp.group_scope_fixture(ids[1],false);
 begin perform public.read_group_people(ids[1],wave);raise exception 'WAVE unchecked-in member read directory';exception when others then if sqlerrm<>'GROUPS_NOT_FOUND'then raise;end if;end;
 begin perform public.read_group_people(null,wave);raise exception 'WAVE guest read directory';exception when others then if sqlerrm<>'GROUPS_FORBIDDEN'then raise;end if;end;
 perform pg_temp.group_scope_fixture(ids[1],true);
 result:=public.read_group_people(ids[1],wave);if jsonb_array_length(result->'items')<>1 then raise exception 'Checked-in WAVE member denied';end if;
 update public.group_pages set status='hidden'where id=page;
 begin perform public.read_group_people(ids[1],page);raise exception 'Hidden page leaked';exception when others then if sqlerrm<>'GROUPS_NOT_FOUND'then raise;end if;end;
 if(select count(*)from public.fan_score_ledger)<>before_count then raise exception 'Read adapter minted score';end if;
 if has_function_privilege('anon','public.read_group_people(uuid,uuid,text,text,uuid,integer,public.content_locale)','EXECUTE')or has_function_privilege('authenticated','public.read_group_people(uuid,uuid,text,text,uuid,integer,public.content_locale)','EXECUTE')then raise exception 'Client role bypass exposed';end if;
 raise notice 'PASS real Creator ranking policy/points preserved, page-scoped members/friends/search/cursors/blocks/private boundaries';
end $$;
rollback;

-- Local disposable-database contract test for 20261215030000_post_dislikes. Every change rolls back.
-- Uses an existing visible fan post and group post with members; run after seeding the local stack.
\set ON_ERROR_STOP on
begin;

do $$
declare
  fp record; gp record; m1 uuid; m2 uuid; op uuid; r jsonb; before_score jsonb; after_score jsonb; fn text; req uuid;
begin
  -- Nobody outside the database functions reaches the tables.
  if has_table_privilege('anon','public.fan_post_dislikes','SELECT') or has_table_privilege('authenticated','public.fan_post_dislikes','SELECT')
   or has_table_privilege('service_role','public.fan_post_dislikes','SELECT') or has_table_privilege('service_role','public.group_post_dislikes','SELECT')
   or has_function_privilege('anon','public.read_fan_post_reaction(uuid,uuid)','EXECUTE')
   or has_function_privilege('authenticated','public.set_fan_post_reaction(uuid,uuid,text)','EXECUTE')
   or has_function_privilege('service_role','public.fan_post_dislike_count_visible(uuid,uuid)','EXECUTE') then
    raise exception 'Dislike tables or helpers are exposed';
  end if;

  -- Only this migration's functions read the dislike tables, so no list, ranking, popular score or notification can leak or count them.
  for fn in select p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.prosrc ~ '(fan|group)_post_dislikes' loop
    if fn not in ('clear_opposite_post_reaction','scrub_post_dislikes_on_deletion','read_fan_post_reaction','set_fan_post_reaction','group_post_reaction_json','groups_content_dispatch') then
      raise exception 'Unexpected reader of dislikes: %', fn;
    end if;
  end loop;

  -- Fan board ---------------------------------------------------------------------------------------------------------
  select p.id,p.app_user_id author,p.celebrity_id,g.id page into fp from public.fan_posts p join public.group_pages g on g.celebrity_id=p.celebrity_id
   join public.app_users a on a.id=p.app_user_id and a.status='active'
   where p.deleted_at is null and p.hidden_at is null and p.visibility='public' order by p.created_at desc limit 1;
  if fp.id is null then raise exception 'Fixture: no fan post with a page'; end if;
  select m.app_user_id into m1 from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active'
   where m.page_id=fp.page and m.role='member' and m.app_user_id<>fp.author
     and not exists(select 1 from public.channel_operators o where o.app_user_id=m.app_user_id and o.celebrity_id=fp.celebrity_id)
     and public.fan_web_content_visible(m.app_user_id,'fan_post',fp.id) order by m.app_user_id limit 1;
  select m.app_user_id into m2 from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active'
   where m.page_id=fp.page and m.role='member' and m.app_user_id not in(fp.author,m1)
     and not exists(select 1 from public.channel_operators o where o.app_user_id=m.app_user_id and o.celebrity_id=fp.celebrity_id)
     and public.fan_web_content_visible(m.app_user_id,'fan_post',fp.id) order by m.app_user_id limit 1;
  if m1 is null or m2 is null then raise exception 'Fixture: two members needed'; end if;
  delete from public.fan_post_likes where post_id=fp.id and app_user_id in(m1,m2);
  delete from public.content_write_events where app_user_id in(m1,m2);

  r:=public.set_fan_post_reaction(m1,fp.id,'dislike');
  if r->>'reaction'<>'dislike' or r->'dislikeCount'<>'null'::jsonb then raise exception 'Member saw a dislike count: %',r; end if;
  perform public.set_fan_post_reaction(m2,fp.id,'dislike');
  -- Guest, other member: no count. Author and page operator: the count.
  if public.read_fan_post_reaction(null,fp.id)<>'{"reaction":null,"dislikeCount":null}'::jsonb then raise exception 'Guest saw dislikes'; end if;
  if public.read_fan_post_reaction(m2,fp.id)->'dislikeCount'<>'null'::jsonb then raise exception 'Member saw dislikes'; end if;
  if (public.read_fan_post_reaction(fp.author,fp.id)->>'dislikeCount')::int<2 then raise exception 'Author missed dislikes'; end if;
  update public.group_memberships set role='manager' where page_id=fp.page and app_user_id=m2;
  if (public.read_fan_post_reaction(m2,fp.id)->>'dislikeCount')::int<2 then raise exception 'Page manager missed dislikes'; end if;
  update public.group_memberships set role='member' where page_id=fp.page and app_user_id=m2;

  -- Existing read paths keep their shape: no dislike key anywhere.
  if (public.read_fan_post(m1,fp.id,'ko')->'post') ?| array['dislikeCount','disliked'] then raise exception 'read_fan_post leaked dislikes'; end if;
  if public.read_fan_posts(m1,(select slug from public.celebrities where id=fp.celebrity_id),null,null,null,'latest',20,'ko')::text ~ 'dislike' then raise exception 'Feed leaked dislikes'; end if;

  -- Taken with two dislikes stored; compared after they are gone.
  before_score:=public.read_fan_post_period_ranking(null,(select slug from public.celebrities where id=fp.celebrity_id),'month','ko');
  -- Switch and cancel: one reaction at a time.
  r:=public.set_fan_post_reaction(m1,fp.id,'like');
  if r->>'reaction'<>'like' or exists(select 1 from public.fan_post_dislikes where post_id=fp.id and app_user_id=m1) then raise exception 'Like did not clear dislike'; end if;
  r:=public.set_fan_post_reaction(m1,fp.id,'dislike');
  if r->>'reaction'<>'dislike' or exists(select 1 from public.fan_post_likes where post_id=fp.id and app_user_id=m1) then raise exception 'Dislike did not clear like'; end if;
  -- The older like call also switches.
  perform public.set_fan_post_like(m1,fp.id,true);
  if exists(select 1 from public.fan_post_dislikes where post_id=fp.id and app_user_id=m1) then raise exception 'Legacy like kept dislike'; end if;
  r:=public.set_fan_post_reaction(m1,fp.id,'none');
  if r->'reaction'<>'null'::jsonb then raise exception 'Cancel failed: %',r; end if;
  perform public.set_fan_post_reaction(m1,fp.id,'none');

  -- Dislikes do not move the popular score.
  perform public.set_fan_post_reaction(m2,fp.id,'none');
  after_score:=public.read_fan_post_period_ranking(null,(select slug from public.celebrities where id=fp.celebrity_id),'month','ko');
  if before_score<>after_score then raise exception 'Dislikes changed the popular ranking: % || %',before_score::text,after_score::text; end if;

  -- Invalid input and outsiders.
  begin perform public.set_fan_post_reaction(m1,fp.id,'love'); raise exception 'accepted'; exception when others then if sqlerrm not like '%FAN_WEB_INVALID_INPUT%' then raise; end if; end;
  begin perform public.set_fan_post_reaction(null,fp.id,'dislike'); raise exception 'accepted'; exception when others then if sqlerrm like 'accepted' then raise; end if; end;

  -- Group posts ------------------------------------------------------------------------------------------------------
  select p.id,p.page_id,p.author_id into gp from public.group_posts p join public.app_users a on a.id=p.author_id and a.status='active'
   where p.removed_at is null and p.visibility='public'
     and (select count(*) from public.group_memberships m where m.page_id=p.page_id and m.role='member' and m.app_user_id<>p.author_id)>=2
   order by p.created_at desc limit 1;
  if gp.id is null then raise exception 'Fixture: no group post'; end if;
  select m.app_user_id into m1 from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active'
   where m.page_id=gp.page_id and m.role='member' and m.app_user_id<>gp.author_id and public.group_post_visible(m.app_user_id,gp.id)
     and not exists(select 1 from public.channel_operators o join public.group_pages g on g.celebrity_id=o.celebrity_id where g.id=gp.page_id and o.app_user_id=m.app_user_id)
   order by m.app_user_id limit 1;
  select m.app_user_id into op from public.group_memberships m where m.page_id=gp.page_id and m.role in('owner','manager') and m.app_user_id<>gp.author_id limit 1;
  delete from public.group_post_reactions where post_id=gp.id and app_user_id=m1;
  req:=gen_random_uuid();
  perform public.groups_content_dispatch('reaction',m1,gp.page_id,gp.id,jsonb_build_object('liked',true,'requestId',req));
  r:=public.groups_content_dispatch('dislike',m1,gp.page_id,gp.id,jsonb_build_object('disliked',true,'requestId',gen_random_uuid()));
  if (r->>'disliked')::boolean is not true or (r->>'liked')::boolean or r->'dislikeCount'<>'null'::jsonb then raise exception 'Group dislike: %',r; end if;
  r:=public.groups_content_dispatch('post-detail',m1,gp.page_id,gp.id,'{}');
  if (r->>'disliked')::boolean is not true or r->'dislikeCount'<>'null'::jsonb or (r->>'liked')::boolean then raise exception 'Group detail for member: %',r; end if;
  r:=public.groups_content_dispatch('post-detail',null,gp.page_id,gp.id,'{}');
  if r ? 'dislikeCount' and r->'dislikeCount'<>'null'::jsonb then raise exception 'Guest saw group dislikes'; end if;
  r:=public.groups_content_dispatch('post-detail',gp.author_id,gp.page_id,gp.id,'{}');
  if (r->>'dislikeCount')::int<1 then raise exception 'Group author missed dislikes: %',r; end if;
  if op is not null then
    r:=public.groups_content_dispatch('post-detail',op,gp.page_id,gp.id,'{}');
    if (r->>'dislikeCount')::int<1 then raise exception 'Group operator missed dislikes'; end if;
  end if;
  if public.groups_content_dispatch('posts',m1,gp.page_id,null,'{}')::text ~ 'dislike' then raise exception 'Group list leaked dislikes'; end if;
  perform public.groups_content_dispatch('reaction',m1,gp.page_id,gp.id,jsonb_build_object('liked',true,'requestId',gen_random_uuid()));
  if exists(select 1 from public.group_post_dislikes where post_id=gp.id and app_user_id=m1) then raise exception 'Group like kept dislike'; end if;
  r:=public.groups_content_dispatch('dislike',m1,gp.page_id,gp.id,jsonb_build_object('disliked',false,'requestId',gen_random_uuid()));
  if (r->>'disliked')::boolean then raise exception 'Group cancel failed'; end if;
  begin perform public.groups_content_dispatch('dislike',null,gp.page_id,gp.id,jsonb_build_object('disliked',true)); raise exception 'accepted';
  exception when others then if sqlerrm not like '%GROUPS_FORBIDDEN%' then raise; end if; end;
  -- A restricted member is refused the dislike exactly like the like (review r4 M3). Needs one report and one admin row.
  if exists(select 1 from public.content_reports) and exists(select 1 from public.admin_allowlist) then
    insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)
      values(m1,(select id from public.content_reports limit 1),'post_dislikes test restriction',(select id from public.admin_allowlist limit 1))
      on conflict (app_user_id) do update set revoked_at=null;
    begin perform public.groups_content_dispatch('reaction',m1,gp.page_id,gp.id,jsonb_build_object('liked',true,'requestId',gen_random_uuid())); raise exception 'like accepted';
    exception when others then if sqlerrm not like '%FAN_WEB_ACTIVE_ACCOUNT_REQUIRED%' then raise; end if; end;
    begin perform public.groups_content_dispatch('dislike',m1,gp.page_id,gp.id,jsonb_build_object('disliked',true,'requestId',gen_random_uuid())); raise exception 'restricted dislike accepted';
    exception when others then if sqlerrm not like '%FAN_WEB_ACTIVE_ACCOUNT_REQUIRED%' then raise; end if; end;
    if exists(select 1 from public.group_post_dislikes where post_id=gp.id and app_user_id=m1) then raise exception 'Restricted dislike stored'; end if;
    begin perform public.set_fan_post_reaction(m1,fp.id,'dislike'); raise exception 'restricted fan dislike accepted';
    exception when others then if sqlerrm not like '%FAN_WEB_%' then raise; end if; end;
  else
    raise notice 'post_dislikes: restriction case skipped (no report or admin row)';
  end if;
  raise notice 'post_dislikes: ok (fan post %, group post %)', fp.id, gp.id;
end $$;

rollback;

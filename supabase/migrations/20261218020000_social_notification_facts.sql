begin;
-- Friends, notifications and comment threads gain the facts the new lists draw. Each comes from a new reader that wraps the
-- current one, so the readers the deployed web calls keep their exact output (their web schemas are strict and answer 503 on a new key):
--  * read_owned_social_friends_facts   (/api/me/social/friends?fields=facts)   friendships[].tier, hearts, favorite
--  * get_owned_web_notifications_facts (/api/notifications?fields=actor)       actor, target, thumbnail_url per row
--  * read_fan_post_comments_replies    (/api/posts/{id}/comments?fields=replies) replyCount on top-level comments
--  * read_celebrity_notice_comments_replies (notice comments ?fields=replies)   replyCount on top-level comments
-- Order: this migration first, then the web. Applying it alone changes no response.

create index if not exists fan_post_comments_parent_idx on public.fan_post_comments(parent_id) where parent_id is not null and deleted_at is null and hidden_at is null;

-- A person shown next to a notification, or nobody: never the reader, never a closed or sanctioned account,
-- never someone the reader blocked or who blocked the reader. Anonymous authors are passed in as null.
create or replace function public.web_notification_actor(p_owner uuid,p_actor uuid,p_name text,p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('profileId',u.id,
  'nickname',coalesce(nullif(btrim(p_name),''),nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),
  'avatarUrl',public.public_fan_avatar_url(u.id))
 from public.app_users u left join public.user_profiles p on p.app_user_id=u.id
 where u.id=p_actor and u.id<>p_owner and u.status='active'
  and not public.fan_web_blocked(p_owner,u.id)
  and not exists(select 1 from public.app_user_moderation_restrictions r where r.app_user_id=u.id and r.revoked_at is null)
$$;
revoke all on function public.web_notification_actor(uuid,uuid,text,public.content_locale) from public,anon,authenticated,service_role;

-- The first image of a public fan post, as the feed cards already draw it.
create or replace function public.fan_post_thumbnail_url(p_post uuid)
returns text language sql stable security definer set search_path='' as $$
 select '/api/content-assets/'||a.id||'?size=thumbnail' from public.content_assets a join public.fan_posts p on p.id=a.post_id
 where a.post_id=p_post and p.visibility='public' and p.deleted_at is null and p.hidden_at is null
  and a.uploaded_at is not null and a.deleted_at is null and a.cleanup_requested_at is null and a.storage_deleted_at is null and a.mime_type like 'image/%'
 order by a.position limit 1
$$;
revoke all on function public.fan_post_thumbnail_url(uuid) from public,anon,authenticated,service_role;

-- Who did it, what it is about, and a picture, for one row of get_owned_web_notifications. The row has already passed
-- fan_web_notification_path for this reader, so the target is one the reader may open. Kinds with no person get actor null.
create or replace function public.web_notification_facts(p_owner uuid,p_row jsonb,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare kind text:=p_row->>'kind';payload jsonb:=coalesce(p_row->'payload','{}'::jsonb);t_type text:=payload->>'targetType';t_id uuid;
 actor_id uuid;actor_name text;actor jsonb;target jsonb;thumb text;post uuid;label text;
begin
 if payload->>'targetId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t_id:=(payload->>'targetId')::uuid;end if;
 if kind='content_reply' and t_type='fan_post_comment' then
  select x.app_user_id,x.post_id into actor_id,post from public.fan_post_comments x where x.id=t_id;
 elsif kind='content_reply' and t_type='group_comment' then
  select case when c.anonymous then null else c.author_id end,jsonb_build_object('type','group_post','id',p.id,'label',p.title)
   into actor_id,target from public.group_comments c join public.group_posts p on p.id=c.post_id where c.id=t_id;
 elsif kind='official_post' and t_type='notice' then
  select jsonb_build_object('profileId',null,'nickname',coalesce(cl.name,c.slug),'avatarUrl',c.image_url),
   jsonb_build_object('type','notice','id',n.id,'label',nl.title),
   (select '/api/content-assets/'||a.id||'?size=thumbnail' from public.content_assets a where a.notice_id=n.id and a.uploaded_at is not null and a.deleted_at is null
     and a.cleanup_requested_at is null and a.storage_deleted_at is null and a.mime_type like 'image/%' order by a.position limit 1)
   into actor,target,thumb
   from public.celebrity_notices n join public.celebrities c on c.id=n.celebrity_id
   left join public.celebrity_localizations cl on cl.celebrity_id=c.id and cl.locale=p_locale
   left join public.celebrity_notice_localizations nl on nl.notice_id=n.id and nl.locale=p_locale
   where n.id=t_id;
 elsif kind='fan_friend_request' and t_type='social_friendship' then
  select f.requester_id,jsonb_build_object('type','friendship','id',f.id,'label',null) into actor_id,target from public.social_friendships f where f.id=t_id;
 elsif kind in('fan_dm_request','fan_dm_message') and t_type='social_dm_message' then
  select m.sender_id,jsonb_build_object('type','conversation','id',m.conversation_id,'label',null) into actor_id,target from public.social_dm_messages m where m.id=t_id;
 elsif kind='friend_post' and t_type='fan_post' then
  select p.app_user_id,p.id into actor_id,post from public.fan_posts p where p.id=t_id;
 elsif kind='friend_reaction' and t_type='fan_post_like' then
  select l.app_user_id,l.post_id into actor_id,post from public.fan_post_likes l where l.notification_id=t_id;
 elsif kind='friend_reaction' and t_type='fan_post_comment_reaction' then
  select r.app_user_id,x.post_id into actor_id,post from public.mobile_content_comment_reactions r join public.fan_post_comments x on x.id=r.target_id
   where r.notification_id=t_id and r.target_type='fan_post_comment';
 elsif kind in('artist_comment','artist_online') and payload->>'artistId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  actor_id:=(payload->>'artistId')::uuid;actor_name:=payload->>'artistName';
  if kind='artist_online' then
   target:=jsonb_build_object('type','group_page','id',payload->'pageId','label',payload->'pageName');
  elsif t_type='fan_post_comment' then
   post:=case when payload->>'postId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (payload->>'postId')::uuid end;
   label:=payload->>'postTitle';
  else
   target:=jsonb_build_object('type','group_post','id',payload->'postId','label',payload->'postTitle');
  end if;
 elsif kind='group_event_reviewed' and t_type='group_event' then
  select jsonb_build_object('type','group_event','id',e.id,'label',coalesce(payload->>'eventTitle',e.title)) into target from public.group_events e where e.id=t_id;
 elsif kind in('schedule_reminder','schedule_changed','schedule_cancelled') and t_type='schedule' then
  select jsonb_build_object('type','schedule','id',s.id,'label',case when p_locale='ko' then s.title_ko else coalesce(s.title_en,s.title_ko) end)
   into target from public.celebrity_schedules s where s.id=t_id;
 elsif kind='level_up' and p_row->>'celebrity_id' is not null then
  select jsonb_build_object('type','celebrity','id',c.id,'label',coalesce(cl.name,c.slug)),c.image_url into target,thumb
   from public.celebrities c left join public.celebrity_localizations cl on cl.celebrity_id=c.id and cl.locale=p_locale
   where c.id=(p_row->>'celebrity_id')::uuid;
 elsif jsonb_typeof(p_row->'live_events')='object' then
  select jsonb_build_object('type','live_event','id',e.id,'label',p_row->'live_events'->'live_event_localizations'->0->'title'),e.approved_hero_url into target,thumb
   from public.live_events e where e.id=(p_row->'live_events'->>'id')::uuid;
 elsif jsonb_typeof(p_row->'benefits')='object' then
  target:=jsonb_build_object('type','benefit','id',p_row->'benefits'->'id','label',p_row->'benefits'->'benefit_localizations'->0->'title');
 end if;
 if post is not null then
  select jsonb_build_object('type','fan_post','id',p.id,'label',coalesce(label,nullif(left(regexp_replace(btrim(p.body),'\s+',' ','g'),60),''))) into target
   from public.fan_posts p where p.id=post;
  thumb:=public.fan_post_thumbnail_url(post);
 end if;
 if actor is null and actor_id is not null then actor:=public.web_notification_actor(p_owner,actor_id,actor_name,p_locale);end if;
 return jsonb_build_object('actor',actor,'target',target,'thumbnail_url',thumb);
end $$;
revoke all on function public.web_notification_facts(uuid,jsonb,public.content_locale) from public,anon,authenticated,service_role;

create or replace function public.get_owned_web_notifications_facts(p_app_user_id uuid,p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(t.item||public.web_notification_facts(p_app_user_id,t.item,p_locale) order by t.ord),'[]'::jsonb)
 from jsonb_array_elements(public.get_owned_web_notifications(p_app_user_id,p_locale)) with ordinality t(item,ord)
$$;
revoke all on function public.get_owned_web_notifications_facts(uuid,public.content_locale) from public,anon,authenticated;
grant execute on function public.get_owned_web_notifications_facts(uuid,public.content_locale) to service_role;

-- Friends: the friend's grade and hearts for the creator the friendship belongs to, and the friend's favorite creator,
-- with the same exclusions as read_group_people: a sanctioned friend shows none of them. Blocked and closed accounts are
-- already left out by read_owned_social_friends.
create or replace function public.read_owned_social_friends_facts(p_app_user_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb;
begin
 base:=public.read_owned_social_friends(p_app_user_id,p_locale);
 return jsonb_set(base,'{friendships}',coalesce((select jsonb_agg(t.item||jsonb_build_object(
   'tier',case when not x.open or c.id is null then null else public.get_fan_effective_tier(x.id,c.id) end,
   'hearts',case when not x.open or c.id is null then null else public.passport_hearts(x.id,c.id) end,
   'favorite',case when not x.open then null else(select public.fan_profile_favorite_json(f.favorite_celebrity_id,p_locale) from public.fan_profile_public_fields f where f.app_user_id=x.id) end
  ) order by t.ord)
  from jsonb_array_elements(base->'friendships') with ordinality t(item,ord)
  cross join lateral(select (t.item->>'profileId')::uuid id,not exists(select 1 from public.app_user_moderation_restrictions r where r.app_user_id=(t.item->>'profileId')::uuid and r.revoked_at is null) open) x
  left join public.celebrities c on c.slug=t.item->>'celebritySlug' and c.status='published' and c.archived_at is null),'[]'::jsonb));
end $$;
revoke all on function public.read_owned_social_friends_facts(uuid,public.content_locale) from public,anon,authenticated;
grant execute on function public.read_owned_social_friends_facts(uuid,public.content_locale) to service_role;

-- Reply counts: the replies this reader can see under each top-level comment of the page (replies are one level deep).
create or replace function public.read_fan_post_comments_replies(p_app_user_id uuid,p_post_id uuid,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 20,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb;
begin
 base:=public.read_fan_post_comments(p_app_user_id,p_post_id,p_before,p_before_id,p_limit,p_locale);
 if base is null or jsonb_typeof(base->'items')<>'array' then return base;end if;
 return jsonb_set(base,'{items}',coalesce((select jsonb_agg(case when t.item->>'parentId' is null then t.item||jsonb_build_object('replyCount',
   (select count(*) from public.fan_post_comments r where r.parent_id=(t.item->>'id')::uuid and r.deleted_at is null and r.hidden_at is null
     and public.fan_web_content_visible(p_app_user_id,'fan_post_comment',r.id))::integer) else t.item end order by t.ord)
  from jsonb_array_elements(base->'items') with ordinality t(item,ord)),'[]'::jsonb));
end $$;
revoke all on function public.read_fan_post_comments_replies(uuid,uuid,timestamptz,uuid,integer,public.content_locale) from public,anon,authenticated;
grant execute on function public.read_fan_post_comments_replies(uuid,uuid,timestamptz,uuid,integer,public.content_locale) to service_role;

create or replace function public.read_celebrity_notice_comments_replies(p_slug text,p_notice_slug text,p_app_user_id uuid,p_before timestamptz,p_before_id uuid,p_limit integer,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb;
begin
 base:=public.read_celebrity_notice_comments(p_slug,p_notice_slug,p_app_user_id,p_before,p_before_id,p_limit,p_locale);
 if base is null or jsonb_typeof(base->'comments')<>'array' then return base;end if;
 return jsonb_set(base,'{comments}',coalesce((select jsonb_agg(case when t.item->>'parentId' is null then t.item||jsonb_build_object('replyCount',
   (select count(*) from public.celebrity_notice_comments r join public.app_users u on u.id=r.app_user_id and u.status='active'
     where r.parent_id=(t.item->>'id')::uuid and r.removed_at is null
     and public.fan_web_content_target(p_app_user_id,'notice_comment',r.id,p_locale) is not null)::integer) else t.item end order by t.ord)
  from jsonb_array_elements(base->'comments') with ordinality t(item,ord)),'[]'::jsonb));
end $$;
revoke all on function public.read_celebrity_notice_comments_replies(text,text,uuid,timestamptz,uuid,integer,public.content_locale) from public,anon,authenticated;
grant execute on function public.read_celebrity_notice_comments_replies(text,text,uuid,timestamptz,uuid,integer,public.content_locale) to service_role;

do $patch$
declare def text;anchor text;
begin
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_roles()'::regprocedure);
 if position('read_owned_social_friends_facts' in def)>0 then return;end if;
 anchor:=$a$'group_directory_facts','group_comment_reply_counts')$a$;
 if position(anchor in def)=0 then raise exception 'SOCIAL_NOTIFICATION_FACTS_UNPATCHED: owner roles';end if;
 execute replace(def,anchor,$a$'group_directory_facts','group_comment_reply_counts','web_notification_actor','fan_post_thumbnail_url','web_notification_facts','get_owned_web_notifications_facts','read_owned_social_friends_facts','read_fan_post_comments_replies','read_celebrity_notice_comments_replies')$a$);
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_tables()'::regprocedure);
 anchor:=$a$'live_events','live_status_overrides']$a$;
 if position(anchor in def)=0 then raise exception 'SOCIAL_NOTIFICATION_FACTS_UNPATCHED: owner tables';end if;
 execute replace(def,anchor,$a$'live_events','live_status_overrides','fan_profile_public_fields','celebrity_localizations','fan_post_comments','celebrity_notice_comments','celebrity_notices','celebrity_notice_localizations','content_assets','social_dm_messages','fan_post_likes','mobile_content_comment_reactions','group_events','celebrity_schedules']$a$);
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_functions()'::regprocedure);
 anchor:=$a$array['public.group_public_visible_page(uuid,uuid)',$a$;
 if position(anchor in def)=0 then raise exception 'SOCIAL_NOTIFICATION_FACTS_UNPATCHED: owner functions';end if;
 execute replace(def,anchor,anchor||$a$'public.group_directory_facts(jsonb)','public.group_comment_reply_counts(uuid,jsonb)','public.web_notification_actor(uuid,uuid,text,public.content_locale)','public.fan_post_thumbnail_url(uuid)','public.web_notification_facts(uuid,jsonb,public.content_locale)','public.fan_web_blocked(uuid,uuid)','public.fan_web_content_visible(uuid,text,uuid)','public.fan_web_content_target(uuid,text,uuid,public.content_locale)','public.fan_profile_favorite_json(uuid,public.content_locale)','public.read_owned_social_friends(uuid,public.content_locale)','public.get_owned_web_notifications(uuid,public.content_locale)','public.read_fan_post_comments(uuid,uuid,timestamptz,uuid,integer,public.content_locale)','public.read_celebrity_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale)',$a$);
end $patch$;
select public.group_public_directory_owner_access();
select public.group_public_directory_owner_check();
commit;

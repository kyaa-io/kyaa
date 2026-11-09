begin;
-- B6 (2026-11-09 plan v4): a profile opens from what the viewer is looking at, never from a member id in a public reply.
-- A ref names "the author of this post / comment / group post / ranking row". The server finds the person and checks, every
-- time, that the viewer may see that content and that the person is active, not sanctioned and not blocked with the viewer.
-- Signed out, the reply holds the public card only: name, picture, level, favorite, its stats, links and intro. No member id,
-- relationship, message state or capabilities.
-- A signed-out viewer who presses Message or Add friend gets a 30-minute return ref, so the same window opens after sign-in even if
-- the ranking was recomputed meanwhile. Reading never writes; issuing reuses a ref with more than 10 minutes left and clears up to
-- 100 expired rows, so no cron is needed.

create table public.social_profile_return_refs(
 token uuid primary key default extensions.gen_random_uuid(),
 subject_id uuid not null references public.app_users(id) on delete cascade,
 expires_at timestamptz not null
);
create index social_profile_return_refs_subject on public.social_profile_return_refs(subject_id,expires_at);
alter table public.social_profile_return_refs enable row level security;
alter table public.social_profile_return_refs force row level security;
revoke all on table public.social_profile_return_refs from public,anon,authenticated,service_role;

-- {subjectId, contextType, contextId} or null. Raises SOCIAL_FORBIDDEN for a member id without a viewer, SOCIAL_STALE when the
-- ranking row the viewer saw is no longer the current snapshot.
create function public.social_profile_ref_subject(p_viewer uuid,p_ref jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare kind text:=p_ref->>'kind';subject uuid;ctx_type text;ctx_id uuid;target jsonb;cid uuid;ranking jsonb;row_item jsonb;
begin
 if kind='profile' then
  if p_viewer is null then raise exception 'SOCIAL_FORBIDDEN'; end if;
  subject:=(p_ref->>'profileId')::uuid;
 elsif kind in('fan_post','fan_post_comment') then
  ctx_type:=kind;ctx_id:=(p_ref->>'id')::uuid;
  target:=public.fan_web_content_target(p_viewer,kind,ctx_id,'ko');
  if target is null then return null; end if;
  subject:=(target->>'appUserId')::uuid;
 elsif kind='group_post' then
  ctx_type:=kind;ctx_id:=(p_ref->>'id')::uuid;
  if not public.group_post_visible(p_viewer,ctx_id) then return null; end if;
  select p.author_id into subject from public.group_posts p join public.group_pages g on g.id=p.page_id where p.id=ctx_id and not p.anonymous and not g.anonymous;
 elsif kind='page_ranking' then
  select c.id into cid from public.celebrities c where c.slug=p_ref->>'slug' and c.status='published' and c.archived_at is null;
  if cid is null then return null; end if;
  begin
   ranking:=public.read_page_ranking(cid,p_ref->>'metric',p_ref->>'period',p_viewer,((p_ref->>'periodStart')::date::timestamp at time zone 'Asia/Seoul')+interval '1 hour');
  exception when sqlstate 'P0001' then return null;
  end;
  if (ranking->>'periodStart')::date is distinct from (p_ref->>'periodStart')::date
   or (ranking->>'computedAt')::timestamptz is distinct from (p_ref->>'computedAt')::timestamptz then raise exception 'SOCIAL_STALE'; end if;
  select e into row_item from jsonb_array_elements(ranking->'rows') e where (e->>'rank')::integer=(p_ref->>'rank')::integer limit 1;
  if row_item is null then return null; end if;
  subject:=(row_item->>'subjectId')::uuid;
 elsif kind='return' then
  select r.subject_id into subject from public.social_profile_return_refs r where r.token=(p_ref->>'token')::uuid and r.expires_at>now();
 else
  return null;
 end if;
 if subject is null
  or not exists(select 1 from public.app_users u where u.id=subject and u.status='active')
  or not public.social_profile_is_public(subject)
  or (p_viewer is not null and public.fan_web_blocked(p_viewer,subject)) then return null; end if;
 return jsonb_build_object('subjectId',subject,'contextType',ctx_type,'contextId',ctx_id);
end $$;

-- The public card a signed-out viewer may see: the favorite's scope only, never a page's.
create function public.social_profile_public_card(p_profile_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.fan_profile_public_fields;v_scope uuid;
begin
 select * into f from public.fan_profile_public_fields where app_user_id=p_profile_id;
 v_scope:=(select c.id from public.celebrities c where c.id=f.favorite_celebrity_id and c.status='published' and c.archived_at is null);
 return jsonb_build_object(
  'favorite',public.fan_profile_favorite_json(f.favorite_celebrity_id,p_locale),
  'links',to_jsonb(coalesce(f.sns_links,'{}')),
  'bio',f.bio,
  'stats',case when v_scope is null then null else jsonb_build_object(
   'creator',public.fan_profile_favorite_json(v_scope,p_locale),
   'tier',public.get_fan_effective_tier(p_profile_id,v_scope),
   'points',coalesce((select sum(s.points) from public.fan_score_ledger s where s.app_user_id=p_profile_id and s.celebrity_id=v_scope),0)::integer,
   'stamps',(select count(*) from public.community_stamps s where s.app_user_id=p_profile_id and s.celebrity_id=v_scope and s.revoked_at is null)::integer,
   'hearts',public.passport_hearts(p_profile_id,v_scope)) end);
end $$;

-- Signed in: the same reply as /api/me/social/profiles/[id] (profile, reach, card), from one ref. Signed out: the public card.
create function public.read_social_profile_by_ref(p_viewer uuid,p_ref jsonb,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare resolved jsonb;subject uuid;result jsonb;
begin
 if p_viewer is not null then perform public.fan_web_lock_active_user(p_viewer); end if;
 resolved:=public.social_profile_ref_subject(p_viewer,p_ref);
 if resolved is null then return null; end if;
 subject:=(resolved->>'subjectId')::uuid;
 if p_viewer is null then
  return jsonb_build_object(
   'profile',(select jsonb_build_object('nickname',coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),
     'avatarUrl',public.public_fan_avatar_url(u.id),'accountLevel',public.mobile_profile_account_level(u.id))
    from public.app_users u left join public.user_profiles p on p.app_user_id=u.id where u.id=subject),
   'card',public.social_profile_public_card(subject,p_locale));
 end if;
 result:=public.read_social_fan_profile(p_viewer,subject,null,p_locale,null,null,null,12);
 if result is null then return null; end if;
 return result||jsonb_build_object('reach',public.read_social_profile_reach(p_viewer,subject),'card',public.read_social_profile_card(p_viewer,subject,null,p_locale));
end $$;

create function public.issue_social_profile_return_ref(p_ref jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare resolved jsonb;subject uuid;v_token uuid;
begin
 if p_ref->>'kind' in('profile','return') then raise exception 'SOCIAL_FORBIDDEN'; end if;
 resolved:=public.social_profile_ref_subject(null,p_ref);
 if resolved is null then raise exception 'SOCIAL_NOT_FOUND'; end if;
 subject:=(resolved->>'subjectId')::uuid;
 delete from public.social_profile_return_refs where token in(select r.token from public.social_profile_return_refs r where r.expires_at<=now() limit 100);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social-profile-return-ref:'||subject::text,0));
 select r.token into v_token from public.social_profile_return_refs r where r.subject_id=subject and r.expires_at>now()+interval '10 minutes' order by r.expires_at desc limit 1;
 if v_token is null then
  insert into public.social_profile_return_refs(subject_id,expires_at) values(subject,now()+interval '30 minutes') returning token into v_token;
 end if;
 return jsonb_build_object('returnRef',v_token);
end $$;

-- Which of these authors can be opened by this viewer. Used to show a name as a button or as text; at most 50 per call.
create function public.read_social_profile_refs_open(p_viewer uuid,p_refs jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare item jsonb;open_ids jsonb:='[]'::jsonb;
begin
 if jsonb_typeof(p_refs)<>'array' or jsonb_array_length(p_refs)>50 then raise exception 'SOCIAL_CONFLICT'; end if;
 if p_viewer is not null then perform public.fan_web_lock_active_user(p_viewer); end if;
 for item in select e from jsonb_array_elements(p_refs) e loop
  if item->>'kind' not in('fan_post','fan_post_comment','group_post') then raise exception 'SOCIAL_CONFLICT'; end if;
  if public.social_profile_ref_subject(p_viewer,item) is not null then open_ids:=open_ids||jsonb_build_object('kind',item->>'kind','id',item->>'id'); end if;
 end loop;
 return jsonb_build_object('open',open_ids);
end $$;

revoke all on function public.social_profile_ref_subject(uuid,jsonb),public.social_profile_public_card(uuid,public.content_locale) from public,anon,authenticated,service_role;
revoke all on function public.read_social_profile_by_ref(uuid,jsonb,public.content_locale),public.issue_social_profile_return_ref(jsonb),public.read_social_profile_refs_open(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.read_social_profile_by_ref(uuid,jsonb,public.content_locale),public.issue_social_profile_return_ref(jsonb),public.read_social_profile_refs_open(uuid,jsonb) to service_role;

-- A deleted account leaves no return ref behind.
create function pg_temp.b6_patch(p_sig regprocedure,p_anchor text,p_replacement text,p_count integer default 1)
returns void language plpgsql as $$
declare def text:=pg_catalog.pg_get_functiondef(p_sig);n integer;
begin
 n:=(length(def)-length(replace(def,p_anchor,'')))/length(p_anchor);
 if n<>p_count then raise exception 'B6_PROFILE_REFS_UNPATCHED: % (% of %)',p_sig,n,p_count; end if;
 execute replace(def,p_anchor,p_replacement);
end $$;
do $snapshot$
declare def text:=pg_catalog.pg_get_functiondef('public.scrub_social_account_on_deletion()'::regprocedure);
begin
 execute regexp_replace(def,'FUNCTION public\.scrub_social_account_on_deletion\(','FUNCTION public.scrub_social_account_on_deletion_before_b6(');
 revoke all on function public.scrub_social_account_on_deletion_before_b6() from public,anon,authenticated,service_role;
end $snapshot$;
select pg_temp.b6_patch('public.scrub_social_account_on_deletion()',
 '    delete from public.social_action_requests where actor_id=new.id;',
 '    delete from public.social_action_requests where actor_id=new.id;
    delete from public.social_profile_return_refs where subject_id=new.id;');

create or replace function public.b6_owner_function_names() returns text[] language sql immutable set search_path='' as $$
 select array['request_social_dm','resolve_social_dm','send_social_dm_message','send_social_dm_message_before_groups_text','send_social_dm_message_before_groups_media',
  'react_social_dm_message','block_social_profile','unblock_social_profile','read_owned_dm_conversations','read_social_dm_messages',
  'read_kyaa_wave_friend_messages','send_kyaa_wave_friend_message','assert_kyaa_wave_dm_pair','read_social_fan_profile','social_dm_request_state',
  'mobile_social_notification_path','evaluate_owned_kyaa_wave_missions','reconcile_wave_mission_evidence','read_admin_wave_stage_presentation',
  'read_owned_social_blocks_closed','social_lock_pair_for','social_lock_pair_actor','social_dm_request_count',
  'social_profile_ref_subject','social_profile_public_card','read_social_profile_by_ref','issue_social_profile_return_ref','read_social_profile_refs_open',
  'scrub_social_account_on_deletion']::text[]
$$;
create or replace function public.b6_owner_tables() returns table(table_name text,cmds text[]) language sql immutable set search_path='' as $$
 values('social_dm_request_log',array['select','insert']),('social_profile_return_refs',array['select','insert','delete'])
$$;
create or replace function public.b6_owner_functions() returns text[] language sql immutable set search_path='' as $$
 select array['public.social_lock_user_quiet(uuid)','public.social_lock_pair_actor(uuid,uuid)','public.social_lock_pair_for(uuid,uuid)',
  'public.social_dm_counterpart_open(uuid)','public.social_dm_hidden_for(uuid,public.social_dm_conversations)','public.social_dm_request_count(uuid)',
  'public.social_profile_is_public(uuid)','public.fan_web_lock_active_user(uuid)','public.group_wallet_enabled()','public.fan_web_blocked(uuid,uuid)',
  'public.social_profile_ref_subject(uuid,jsonb)','public.social_profile_public_card(uuid,public.content_locale)','public.fan_web_content_target(uuid,text,uuid,public.content_locale)',
  'public.group_post_visible(uuid,uuid)','public.read_page_ranking(uuid,text,text,uuid,timestamptz)','public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer)',
  'public.read_social_profile_reach(uuid,uuid)','public.read_social_profile_card(uuid,uuid,uuid,public.content_locale)','public.public_fan_avatar_url(uuid)',
  'public.mobile_profile_account_level(uuid)','public.fan_profile_favorite_json(uuid,public.content_locale)','public.get_fan_effective_tier(uuid,uuid)','public.passport_hearts(uuid,uuid)']::text[]
$$;
revoke all on function public.b6_owner_function_names(),public.b6_owner_tables(),public.b6_owner_functions() from public,anon,authenticated,service_role;
select public.b6_owner_access();
select public.b6_owner_check();
commit;

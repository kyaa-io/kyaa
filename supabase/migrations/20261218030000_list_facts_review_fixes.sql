begin;
-- Review fixes for 20261218010000 and 20261218020000. The responses without fields= stay the same; only the new keys change.
--  * newPostCount and lastActiveAt count only posts a signed-out visitor can read on the board: public, kept,
--    and for fan pages not proof posts or program posts, by an active author.
--  * liveNow skips archived lives and looks only at lives running by their times or opened by an override in force.
--  * Reply counts join the block and the active author directly instead of a visibility call per reply
--    (they run only for top-level comments the reader can already see).
--  * A restricted reader gets no friend facts.
--  * Each wrapper owner can run what it calls, even when AWS gives the wrapper and the renamed reader different owners.
-- Order: after 20261218020000, before or after the web.

create or replace function public.group_directory_facts(p_items jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
 with given as (
  select t.item,t.ord,g.id,g.kind,g.celebrity_id
  from jsonb_array_elements(case when jsonb_typeof(p_items)='array' then p_items else '[]'::jsonb end) with ordinality t(item,ord)
  left join public.group_pages g on g.id=case when t.item->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (t.item->>'id')::uuid end
 ), facts as (
  select given.*,
   (select count(*) from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active'
     where m.page_id=given.id and m.joined_at>=statement_timestamp()-interval '7 days')::integer weekly_joined,
   (select count(*) from public.group_posts p where p.page_id=given.id and p.removed_at is null and p.visibility='public' and p.created_at>=statement_timestamp()-interval '7 days')::integer
   + case when given.kind='fan' and given.celebrity_id is not null then
     (select count(*) from public.fan_posts p join public.app_users u on u.id=p.app_user_id and u.status='active'
       where p.celebrity_id=given.celebrity_id and p.visibility='public' and p.deleted_at is null and p.hidden_at is null
        and p.category<>'proof' and p.program_notice_id is null and p.created_at>=statement_timestamp()-interval '7 days')::integer
     else 0 end new_post_count,
   case when given.kind='fan' and given.celebrity_id is not null then exists(
    select 1 from public.live_events e join public.celebrities c on c.id=e.celebrity_id and c.status='published' and c.archived_at is null
    where e.celebrity_id=given.celebrity_id and e.publication_status='published' and e.archived_at is null and e.content_status<>'cancelled'
     and (e.starts_at<=statement_timestamp() and e.ends_at>statement_timestamp()
      or exists(select 1 from public.live_status_overrides o where o.live_event_id=e.id and o.effective_status='live' and o.effective_from<=statement_timestamp()
        and (o.effective_until is null or statement_timestamp()<o.effective_until)))
     and coalesce(
      (select o.effective_status::text from public.live_status_overrides o where o.live_event_id=e.id and o.effective_from<=statement_timestamp()
        and (o.effective_until is null or statement_timestamp()<o.effective_until) order by o.effective_from desc,o.created_at desc limit 1),
      case when e.ends_at is null or statement_timestamp()<e.starts_at then 'scheduled' when statement_timestamp()<e.ends_at then 'live' else 'ended' end)='live'
   ) else false end live_now,
   greatest(
    (select max(p.created_at) from public.group_posts p where p.page_id=given.id and p.removed_at is null and p.visibility='public'),
    (select max(c.created_at) from public.group_comments c join public.group_posts p on p.id=c.post_id and p.removed_at is null and p.visibility='public' where p.page_id=given.id and c.removed_at is null),
    (select max(m.joined_at) from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active' where m.page_id=given.id),
    case when given.kind='fan' and given.celebrity_id is not null then
     (select max(p.created_at) from public.fan_posts p join public.app_users u on u.id=p.app_user_id and u.status='active'
       where p.celebrity_id=given.celebrity_id and p.visibility='public' and p.deleted_at is null and p.hidden_at is null and p.category<>'proof' and p.program_notice_id is null) end
   ) last_active_at
  from given
 )
 select coalesce(jsonb_agg(case when id is null then item else item||jsonb_build_object('weeklyJoined',weekly_joined,'newPostCount',new_post_count,'liveNow',live_now,'lastActiveAt',last_active_at) end order by ord),'[]'::jsonb)
 from facts
$$;

-- A reply under a visible top-level comment is visible when it is kept, its author is active, and neither blocked the other
-- (fan_web_content_target's fan_post_comment and notice_comment rules once the parent is known to be visible).
create or replace function public.read_fan_post_comments_replies(p_app_user_id uuid,p_post_id uuid,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 20,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb;
begin
 base:=public.read_fan_post_comments(p_app_user_id,p_post_id,p_before,p_before_id,p_limit,p_locale);
 if base is null or jsonb_typeof(base->'items')<>'array' then return base;end if;
 return jsonb_set(base,'{items}',coalesce((select jsonb_agg(case when t.item->>'parentId' is null then t.item||jsonb_build_object('replyCount',
   (select count(*) from public.fan_post_comments r join public.app_users u on u.id=r.app_user_id and u.status='active'
     where r.parent_id=(t.item->>'id')::uuid and r.post_id=p_post_id and r.deleted_at is null and r.hidden_at is null
     and (p_app_user_id is null or not public.fan_web_blocked(p_app_user_id,r.app_user_id)))::integer) else t.item end order by t.ord)
  from jsonb_array_elements(base->'items') with ordinality t(item,ord)),'[]'::jsonb));
end $$;

create or replace function public.read_celebrity_notice_comments_replies(p_slug text,p_notice_slug text,p_app_user_id uuid,p_before timestamptz,p_before_id uuid,p_limit integer,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb;
begin
 base:=public.read_celebrity_notice_comments(p_slug,p_notice_slug,p_app_user_id,p_before,p_before_id,p_limit,p_locale);
 if base is null or jsonb_typeof(base->'comments')<>'array' then return base;end if;
 return jsonb_set(base,'{comments}',coalesce((select jsonb_agg(case when t.item->>'parentId' is null then t.item||jsonb_build_object('replyCount',
   (select count(*) from public.celebrity_notice_comments r join public.app_users u on u.id=r.app_user_id and u.status='active'
     where r.parent_id=(t.item->>'id')::uuid and r.removed_at is null
     and (p_app_user_id is null or not public.fan_web_blocked(p_app_user_id,r.app_user_id)))::integer) else t.item end order by t.ord)
  from jsonb_array_elements(base->'comments') with ordinality t(item,ord)),'[]'::jsonb));
end $$;

create or replace function public.read_owned_social_friends_facts(p_app_user_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb;reader_open boolean;
begin
 base:=public.read_owned_social_friends(p_app_user_id,p_locale);
 reader_open:=public.social_profile_is_public(p_app_user_id);
 return jsonb_set(base,'{friendships}',coalesce((select jsonb_agg(t.item||jsonb_build_object(
   'tier',case when not x.open or y.creator is null then null else public.get_fan_effective_tier(x.id,y.creator) end,
   'hearts',case when not x.open or y.creator is null then null else public.passport_hearts(x.id,y.creator) end,
   'favorite',case when not x.open or y.favorite is null then null else public.fan_profile_favorite_json(y.favorite,p_locale) end
  ) order by t.ord)
  from jsonb_array_elements(base->'friendships') with ordinality t(item,ord)
  cross join lateral(select (t.item->>'profileId')::uuid id,reader_open and not exists(select 1 from public.app_user_moderation_restrictions r where r.app_user_id=(t.item->>'profileId')::uuid and r.revoked_at is null) open) x
  cross join lateral(select fav.id favorite,coalesce(c.id,fav.id) creator
   from (select 1) one
   left join public.celebrities c on c.slug=t.item->>'celebritySlug' and c.status='published' and c.archived_at is null
   left join lateral(select v.id from public.fan_profile_public_fields f join public.celebrities v on v.id=f.favorite_celebrity_id and v.status='published' and v.archived_at is null
     where f.app_user_id=x.id) fav on true) y),'[]'::jsonb));
end $$;

-- The dispatch wrappers call a renamed reader and a helper that only their owners may run. Grant each wrapper's owner what it
-- calls, then check; run it again after any owner change. Grants fail quietly when the migration role may not give them, and the check then stops.
create or replace function public.list_facts_wrapper_access()
returns void language plpgsql set search_path='' as $$
declare r record;gaps text[]:='{}';
begin
 for r in select w.proowner::regrole::text wrapper_owner,w.proowner,callee
  from (values('public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.groups_dispatch_before_directory_facts(text,uuid,uuid,uuid,jsonb,uuid)'),
   ('public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.group_directory_facts(jsonb)'),
   ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.groups_content_dispatch_before_reply_count(text,uuid,uuid,uuid,jsonb,uuid)'),
   ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','public.group_comment_reply_counts(uuid,jsonb)')) v(wrapper,callee)
  join pg_catalog.pg_proc w on w.oid=v.wrapper::regprocedure
 loop
  if not pg_catalog.has_function_privilege(r.proowner,r.callee,'execute') then
   begin execute format('grant execute on function %s to %s',r.callee,r.wrapper_owner);exception when insufficient_privilege then null;end;
   if not pg_catalog.has_function_privilege(r.proowner,r.callee,'execute') then gaps:=gaps||format('%s cannot execute %s',r.wrapper_owner,r.callee);end if;
  end if;
 end loop;
 if cardinality(gaps)>0 then raise exception 'LIST_FACTS_WRAPPER_GAP: %',array_to_string(gaps,'; ');end if;
end $$;
revoke all on function public.list_facts_wrapper_access() from public,anon,authenticated,service_role;
select public.list_facts_wrapper_access();
select public.group_public_directory_owner_access();
select public.group_public_directory_owner_check();
commit;

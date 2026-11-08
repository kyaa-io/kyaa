begin;
-- Group list rows show four facts: joins this week, new posts this week, whether the creator is live now, and the last activity.
-- Group comment pages can carry each top-level comment's reply count.
-- The deployed web does not ask for either, so its responses stay byte for byte the same: the facts come only with
-- p_input.fields='facts' on 'directory' (/api/groups?fields=facts) and the counts only with p_input.fields='replies'
-- on 'comments' (/api/groups/{id}/posts/{postId}/comments?fields=replies).
-- Order: this migration first, then the web. Applying it alone changes no response.

create index if not exists group_memberships_page_joined_idx on public.group_memberships(page_id,joined_at desc);
create index if not exists group_comments_parent_idx on public.group_comments(parent_id) where parent_id is not null and removed_at is null;

-- One read for a whole page of directory items, in the order given. Counts are of active accounts and kept content only.
-- liveNow follows deriveEffectiveLiveStatus in features/live/domain/live-event.ts: a cancelled source is never live,
-- the newest override in force wins, otherwise the live runs from starts_at until ends_at.
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
   (select count(*) from public.group_posts p where p.page_id=given.id and p.removed_at is null and p.created_at>=statement_timestamp()-interval '7 days')::integer
   + case when given.kind='fan' and given.celebrity_id is not null then
     (select count(*) from public.fan_posts p where p.celebrity_id=given.celebrity_id and p.visibility='public' and p.deleted_at is null and p.hidden_at is null and p.created_at>=statement_timestamp()-interval '7 days')::integer
     else 0 end new_post_count,
   case when given.kind='fan' and given.celebrity_id is not null then exists(
    select 1 from public.live_events e join public.celebrities c on c.id=e.celebrity_id and c.status='published' and c.archived_at is null
    where e.celebrity_id=given.celebrity_id and e.publication_status='published' and e.content_status<>'cancelled'
     and coalesce(
      (select o.effective_status::text from public.live_status_overrides o where o.live_event_id=e.id and o.effective_from<=statement_timestamp()
        and (o.effective_until is null or statement_timestamp()<o.effective_until) order by o.effective_from desc,o.created_at desc limit 1),
      case when e.ends_at is null or statement_timestamp()<e.starts_at then 'scheduled' when statement_timestamp()<e.ends_at then 'live' else 'ended' end)='live'
   ) else false end live_now,
   greatest(
    (select max(p.created_at) from public.group_posts p where p.page_id=given.id and p.removed_at is null),
    (select max(c.created_at) from public.group_comments c join public.group_posts p on p.id=c.post_id and p.removed_at is null where p.page_id=given.id and c.removed_at is null),
    (select max(m.joined_at) from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active' where m.page_id=given.id),
    case when given.kind='fan' and given.celebrity_id is not null then
     (select max(p.created_at) from public.fan_posts p where p.celebrity_id=given.celebrity_id and p.visibility='public' and p.deleted_at is null and p.hidden_at is null) end
   ) last_active_at
  from given
 )
 select coalesce(jsonb_agg(case when id is null then item else item||jsonb_build_object('weeklyJoined',weekly_joined,'newPostCount',new_post_count,'liveNow',live_now,'lastActiveAt',last_active_at) end order by ord),'[]'::jsonb)
 from facts
$$;
revoke all on function public.group_directory_facts(jsonb) from public,anon,authenticated,service_role;

-- Reply counts for the top-level comments of one group post page, as the 'comments' operation shows them to this actor:
-- kept replies, minus authors the actor blocked or who blocked the actor.
create or replace function public.group_comment_reply_counts(p_actor uuid,p_items jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(case when t.item->>'parentId' is null and t.item->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t.item||jsonb_build_object('replyCount',
   (select count(*) from public.group_comments r where r.parent_id=(t.item->>'id')::uuid and r.removed_at is null
     and (p_actor is null or not public.fan_web_blocked(p_actor,r.author_id)))::integer) else t.item end order by t.ord),'[]'::jsonb)
 from jsonb_array_elements(case when jsonb_typeof(p_items)='array' then p_items else '[]'::jsonb end) with ordinality t(item,ord)
$$;
revoke all on function public.group_comment_reply_counts(uuid,jsonb) from public,anon,authenticated,service_role;

do $patch$
declare def text;anchor text;
begin
 -- A second run changes nothing.
 if to_regprocedure('public.groups_dispatch_before_directory_facts(text,uuid,uuid,uuid,jsonb,uuid)') is not null then return;end if;
 alter function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_dispatch_before_directory_facts;
 alter function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch_before_reply_count;

 -- The new readers and their tables join the owner check of the public directory (AWS definers can have an ordinary owner).
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_roles()'::regprocedure);
 anchor:=$a$'read_group_public_people_hearts','passport_hearts')$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_DIRECTORY_FACTS_UNPATCHED: owner roles';end if;
 execute replace(def,anchor,$a$'read_group_public_people_hearts','passport_hearts','group_directory_facts','group_comment_reply_counts')$a$);
 def:=pg_catalog.pg_get_functiondef('public.group_public_directory_owner_tables()'::regprocedure);
 anchor:=$a$'creator_heart_ledger','fan_heart_conversions']$a$;
 if position(anchor in def)=0 then raise exception 'GROUP_DIRECTORY_FACTS_UNPATCHED: owner tables';end if;
 execute replace(def,anchor,$a$'creator_heart_ledger','fan_heart_conversions','group_posts','group_comments','fan_posts','live_events','live_status_overrides']$a$);
end $patch$;

create or replace function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_operation<>'directory' or p_input is null or not p_input ? 'fields' then
  return public.groups_dispatch_before_directory_facts(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 end if;
 if p_input->>'fields' is distinct from 'facts' then raise exception 'GROUPS_INVALID_REQUEST';end if;
 result:=public.groups_dispatch_before_directory_facts(p_operation,p_actor,p_page_id,p_item_id,p_input-'fields',p_admin_id);
 if jsonb_typeof(result->'items')='array' then result:=jsonb_set(result,'{items}',public.group_directory_facts(result->'items'));end if;
 return result;
end $$;

create or replace function public.groups_content_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}'::jsonb,p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_operation<>'comments' or p_input is null or not p_input ? 'fields' then
  return public.groups_content_dispatch_before_reply_count(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 end if;
 if p_input->>'fields' is distinct from 'replies' then raise exception 'GROUPS_INVALID_REQUEST';end if;
 result:=public.groups_content_dispatch_before_reply_count(p_operation,p_actor,p_page_id,p_item_id,p_input-'fields',p_admin_id);
 if jsonb_typeof(result->'items')='array' then result:=jsonb_set(result,'{items}',public.group_comment_reply_counts(p_actor,result->'items'));end if;
 return result;
end $$;

revoke all on function public.groups_dispatch_before_directory_facts(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.groups_content_dispatch_before_reply_count(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;
grant execute on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;
select public.group_public_directory_owner_access();
select public.group_public_directory_owner_check();
commit;

-- Source inbox groups are independent of legacy delivery categories and preferences.
create function public.mobile_notification_inbox_group(p_kind text)
returns text language sql immutable set search_path='' as $$
 select case
  when p_kind in('content_reply','fan_friend_request','fan_dm_request','fan_dm_message','friend_post','friend_reaction') then 'relationships'
  when p_kind='official_post' or p_kind='level_up' or public.mobile_notification_category(p_kind) in('schedule','benefit','participation') then 'activity'
  else 'info' end
$$;

create function public.mobile_notification_inbox_item(p_owner uuid,p_notification uuid,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n public.fan_notifications%rowtype; path text; subject text; image text;
begin
 select * into n from public.fan_notifications where id=p_notification and app_user_id=p_owner;
 if not found then return null; end if;
 path:=public.fan_web_notification_path(p_owner,n.id);
 if path is null then return null; end if;
 if n.kind::text='official_post' and n.payload->>'targetId' ~ '^[0-9a-f-]{36}$' then
  select coalesce(l.name,f.name),c.image_url into subject,image
   from public.celebrity_notices x join public.celebrities c on c.id=x.celebrity_id and c.status='published' and c.archived_at is null
   left join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
   left join public.celebrity_localizations f on f.celebrity_id=c.id and f.locale='ko'
   where x.id=(n.payload->>'targetId')::uuid;
 elsif n.kind::text='fan_friend_request' and n.payload->>'targetId' ~ '^[0-9a-f-]{36}$' then
  select coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),public.public_fan_avatar_url(f.requester_id)
   into subject,image from public.social_friendships f left join public.user_profiles p on p.app_user_id=f.requester_id
   where f.id=(n.payload->>'targetId')::uuid and f.addressee_id=p_owner and f.status='pending';
 elsif n.kind::text='content_reply' and n.payload->>'targetId' ~ '^[0-9a-f-]{36}$' then
  select public.public_fan_avatar_url(x.app_user_id) into image from public.fan_post_comments x
   where x.id=(n.payload->>'targetId')::uuid;
 end if;
 return jsonb_build_object('id',n.id,'category',public.mobile_notification_category(n.kind::text),
  'group',public.mobile_notification_inbox_group(n.kind::text),'kind',n.kind,
  'title',case when p_locale='ko' then '새 알림이 있어요' else 'You have a new notification' end,
  'detail',case when p_locale='ko' then '앱에서 내용을 확인해 주세요.' else 'Open the app to view the details.' end,
  'subject',subject,'imageUrl',image,'readAt',n.read_at,'createdAt',n.created_at,
  'target',jsonb_build_object('available',true,'deepLink',path));
end $$;

create or replace function public.mobile_get_owned_notifications(p_app_user_id uuid,p_locale public.content_locale,p_category text,p_limit integer,p_cursor_created_at timestamptz default null,p_cursor_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_category is not null and p_category not in('schedule','benefit','community','participation','account','activity','relationships','info')
  or p_limit is null or p_limit not between 1 and 100 or (p_cursor_created_at is null)<>(p_cursor_id is null)
  then raise exception 'MOBILE_NOTIFICATIONS_INVALID' using errcode='22023'; end if;
 if not exists(select 1 from public.app_users where id=p_app_user_id and status='active') then raise exception 'ACTIVE_APP_USER_REQUIRED' using errcode='42501'; end if;
 with visible as materialized(
  select n.id,n.created_at,n.read_at,public.mobile_notification_category(n.kind::text) category,
   public.mobile_notification_inbox_group(n.kind::text) inbox_group
  from public.fan_notifications n where n.app_user_id=p_app_user_id
   and n.scheduled_for<=pg_catalog.clock_timestamp() and public.fan_web_notification_path(p_app_user_id,n.id) is not null
 ), candidates as materialized(
  select * from visible where (p_category is null or category=p_category or inbox_group=p_category)
   and (p_cursor_id is null or(created_at,id)<(p_cursor_created_at,p_cursor_id))
   order by created_at desc,id desc limit p_limit+1
 ), page as materialized(select * from candidates order by created_at desc,id desc limit p_limit)
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(public.mobile_notification_inbox_item(p_app_user_id,id,p_locale) order by created_at desc,id desc) from page),'[]'::jsonb),
  'nextCursor',case when(select count(*) from candidates)>p_limit then(select jsonb_build_object('createdAt',created_at,'id',id) from page order by created_at,id limit 1) else null end,
  'unreadByCategory',coalesce((select jsonb_object_agg(category,total) from(select category,count(*) total from visible where read_at is null group by category)x),'{}'::jsonb),
  'unreadByGroup',coalesce((select jsonb_object_agg(inbox_group,total) from(select inbox_group,count(*) total from visible where read_at is null group by inbox_group)x),'{}'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.mobile_get_owned_notification(p_app_user_id uuid,p_notification_id uuid,p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
 select public.mobile_notification_inbox_item(p_app_user_id,p_notification_id,p_locale)
$$;

revoke all on function public.mobile_notification_inbox_group(text) from public,anon,authenticated,service_role;
revoke all on function public.mobile_notification_inbox_item(uuid,uuid,public.content_locale) from public,anon,authenticated,service_role;
revoke all on function public.mobile_get_owned_notifications(uuid,public.content_locale,text,integer,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.mobile_get_owned_notification(uuid,uuid,public.content_locale) from public,anon,authenticated;
grant execute on function public.mobile_get_owned_notifications(uuid,public.content_locale,text,integer,timestamptz,uuid) to service_role;
grant execute on function public.mobile_get_owned_notification(uuid,uuid,public.content_locale) to service_role;

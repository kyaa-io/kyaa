-- Separate source-screen topics without changing legacy client preferences or consent.
alter table public.notification_preferences
  add column social_notifications boolean not null default true,
  add column friend_activity_notifications boolean not null default true;

create or replace function public.mobile_notification_topic_enabled(p_app_user_id uuid,p_kind text)
returns boolean language sql stable security definer set search_path='' as $$
 select case
  when p_kind='official_post' then coalesce(n.official_post_notifications,true)
  when p_kind='content_reply' then coalesce(n.reply_notifications,true)
  when p_kind in('fan_friend_request','fan_dm_request','fan_dm_message') then coalesce(n.social_notifications,true)
  when p_kind in('friend_post','friend_reaction') then coalesce(n.friend_activity_notifications,true)
  when public.mobile_notification_category(p_kind)='schedule' then coalesce(n.live_reminders,true) and coalesce(n.schedule_notifications,true)
  when public.mobile_notification_category(p_kind)='benefit' then coalesce(n.benefit_notifications,true)
  when public.mobile_notification_category(p_kind)='participation' then coalesce(n.participation_notifications,true)
  when p_kind='marketing' then coalesce(n.marketing_notifications,false)
  else true end
 from (select p_app_user_id app_user_id) x left join public.notification_preferences n using(app_user_id)
$$;

alter function public.mobile_get_owned_settings(uuid) rename to mobile_get_owned_settings_before_topics;
revoke all on function public.mobile_get_owned_settings_before_topics(uuid) from public,anon,authenticated,service_role;
create function public.mobile_get_owned_settings(p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; n public.notification_preferences%rowtype; preview_locale public.content_locale;
  previews jsonb; email_enabled boolean;
begin
 result:=public.mobile_get_owned_settings_before_topics(p_app_user_id);
 select * into strict n from public.notification_preferences where app_user_id=p_app_user_id;
 preview_locale:=case when result->>'preferredLocale'='ko' then 'ko'::public.content_locale else 'en'::public.content_locale end;
 email_enabled:=coalesce((result#>>'{channels,email,enabled}')::boolean,false);
 result:=jsonb_set(result,'{topics}',(result->'topics')||jsonb_build_object(
  'favoriteNews',n.official_post_notifications,'social',n.social_notifications,
  'activity',n.benefit_notifications and n.participation_notifications,
  'friendActivity',n.friend_activity_notifications));
 select coalesce(jsonb_agg(item order by position),'[]'::jsonb) into previews from (
  (select 1 as position,jsonb_build_object('kind','news','name',coalesce(l.name,k.name,c.slug),
    'imageUrl',c.image_url,'channel','push') item
   from public.fan_passports p join public.celebrities c on c.id=p.celebrity_id
   left join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=preview_locale
   left join public.celebrity_localizations k on k.celebrity_id=c.id and k.locale='ko'
   where p.app_user_id=p_app_user_id and p.business_status='issued'
     and c.status='published' and c.archived_at is null
   order by p.issued_at,p.id limit 1)
  union all
  (select 2,jsonb_build_object('kind','live','name',coalesce(l.name,k.name,c.slug),
    'imageUrl',c.image_url,'channel',case when email_enabled then 'email' else 'push' end)
   from public.live_reservations r join public.live_events e on e.id=r.live_event_id
   join public.celebrities c on c.id=e.celebrity_id
   join public.fan_passports p on p.id=r.passport_id and p.app_user_id=p_app_user_id and p.business_status='issued'
   left join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=preview_locale
   left join public.celebrity_localizations k on k.celebrity_id=c.id and k.locale='ko'
   where r.app_user_id=p_app_user_id and e.publication_status='published' and e.archived_at is null
     and e.content_status<>'cancelled' and e.ends_at>pg_catalog.now()
     and c.status='published' and c.archived_at is null
   order by e.starts_at,e.id limit 1)
 ) candidates;
 return result||jsonb_build_object('previews',previews);
end $$;
revoke all on function public.mobile_get_owned_settings(uuid) from public,anon,authenticated,service_role;
grant execute on function public.mobile_get_owned_settings(uuid) to service_role;

create or replace function public.mobile_patch_owned_settings(p_app_user_id uuid,p_expected_revision bigint,p_patch jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.mobile_app_settings%rowtype; allowed text[]:=array['preferredLocale','regionCode','qrVisible','pushEnabled','topics']; topics jsonb;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_expected_revision is null or jsonb_typeof(p_patch)<>'object' or exists(select 1 from jsonb_object_keys(p_patch) k where not(k=any(allowed))) then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 if p_patch?'preferredLocale' and (jsonb_typeof(p_patch->'preferredLocale')<>'string' or p_patch->>'preferredLocale' not in('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr')) then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 if p_patch?'regionCode' and not (p_patch->'regionCode'='null'::jsonb or (jsonb_typeof(p_patch->'regionCode')='string' and p_patch->>'regionCode'~'^[A-Z]{2}$')) then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 if p_patch?'qrVisible' and jsonb_typeof(p_patch->'qrVisible')<>'boolean' or p_patch?'pushEnabled' and jsonb_typeof(p_patch->'pushEnabled')<>'boolean' then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 topics:=coalesce(p_patch->'topics','{}'::jsonb);
 if jsonb_typeof(topics)<>'object' or exists(select 1 from jsonb_each(topics) x where x.key not in('schedule','benefit','community','marketing','participation','favoriteNews','social','activity','friendActivity') or jsonb_typeof(x.value)<>'boolean') then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 insert into public.mobile_app_settings(app_user_id) values(p_app_user_id) on conflict do nothing;
 select * into strict s from public.mobile_app_settings where app_user_id=p_app_user_id for update;
 if s.revision<>p_expected_revision then raise exception 'MOBILE_SETTINGS_REVISION_CONFLICT' using errcode='40001'; end if;
 if p_patch?'preferredLocale' then update public.app_users set preferred_locale=p_patch->>'preferredLocale' where id=p_app_user_id; end if;
 update public.mobile_app_settings set
  region_code=case when p_patch?'regionCode' then p_patch->>'regionCode' else region_code end,
  qr_visible=coalesce((p_patch->>'qrVisible')::boolean,qr_visible),
  push_enabled=coalesce((p_patch->>'pushEnabled')::boolean,push_enabled),
  revision=revision+1
 where app_user_id=p_app_user_id;
 insert into public.notification_preferences(app_user_id) values(p_app_user_id) on conflict do nothing;
 update public.notification_preferences set
  live_reminders=coalesce((topics->>'schedule')::boolean,live_reminders),schedule_notifications=coalesce((topics->>'schedule')::boolean,schedule_notifications),
  benefit_notifications=coalesce((topics->>'activity')::boolean,(topics->>'benefit')::boolean,benefit_notifications),reply_notifications=coalesce((topics->>'community')::boolean,reply_notifications),official_post_notifications=coalesce((topics->>'favoriteNews')::boolean,(topics->>'community')::boolean,official_post_notifications),
  marketing_notifications=coalesce((topics->>'marketing')::boolean,marketing_notifications),participation_notifications=coalesce((topics->>'activity')::boolean,(topics->>'participation')::boolean,participation_notifications),
  social_notifications=coalesce((topics->>'social')::boolean,social_notifications),
  friend_activity_notifications=coalesce((topics->>'friendActivity')::boolean,friend_activity_notifications)
 where app_user_id=p_app_user_id;
 return public.mobile_get_owned_settings(p_app_user_id);
end $$;

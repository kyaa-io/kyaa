begin;
alter table public.group_notification_settings
 add column notice_enabled boolean not null default true,
 add column event_enabled boolean not null default true,
 add column recipient_enabled boolean not null default true,
 add column activity_enabled boolean not null default true;

-- Keep original function OIDs: SQL callers and imported legacy definers must use the new guards.
do $$declare signature text;source text;name text;backup text;begin
 foreach signature in array array['groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','fan_web_notification_path(uuid,uuid)','notification_delivery_is_eligible(uuid,timestamp with time zone)','email_notification_delivery_is_eligible(uuid,uuid,timestamp with time zone)','kakao_notification_delivery_is_eligible(uuid,timestamp with time zone)']loop
  name:=split_part(signature,'(',1);backup:=name||'_before_group_categories';
  source:=pg_get_functiondef(('public.'||signature)::regprocedure);
  if position('CREATE OR REPLACE FUNCTION public.'||name||'(' in source)<>1 then raise exception 'GROUP_NOTIFICATION_FUNCTION_DECLARATION_CHANGED';end if;
  execute overlay(source placing 'CREATE OR REPLACE FUNCTION public.'||backup||'(' from 1 for length('CREATE OR REPLACE FUNCTION public.'||name||'('));
  execute format('revoke all on function public.%s from public,anon,authenticated,service_role',replace(signature,name,backup));
 end loop;
end $$;

create or replace function public.group_notification_page(p_target_type text,p_target_id uuid)returns uuid language sql stable security definer set search_path=''as $$
 select case p_target_type
 when 'group_comment'then(select p.page_id from public.group_comments c join public.group_posts p on p.id=c.post_id where c.id=p_target_id)
 when 'group_post'then(select page_id from public.group_posts where id=p_target_id)
 when 'fan_post_comment'then(select g.id from public.fan_post_comments c join public.fan_posts p on p.id=c.post_id join public.group_pages g on g.celebrity_id=p.celebrity_id where c.id=p_target_id)
 when 'notice'then(select g.id from public.celebrity_notices n join public.group_pages g on g.celebrity_id=n.celebrity_id where n.id=p_target_id)
 when 'schedule'then(select g.id from public.celebrity_schedules s join public.group_pages g on g.celebrity_id=s.celebrity_id where s.id=p_target_id)
 when 'live'then(select g.id from public.live_events l join public.group_pages g on g.celebrity_id=l.celebrity_id where l.id=p_target_id)
 when 'celebrity'then(select id from public.group_pages where celebrity_id=p_target_id)
 when 'benefit'then(select g.id from public.benefits b join public.group_pages g on g.celebrity_id=b.celebrity_id where b.id=p_target_id)
 when 'group_event'then(select page_id from public.group_events where id=p_target_id)
 when 'group_raffle'then(select page_id from public.group_raffles where id=p_target_id)
 when 'group_raffle_winner'then(select r.page_id from public.group_raffle_winners w join public.group_raffles r on r.id=w.raffle_id where w.id=p_target_id)
 when 'group_mission'then(select page_id from public.group_missions where id=p_target_id)
 when 'group_mission_submission'then(select m.page_id from public.group_mission_submissions s join public.group_missions m on m.id=s.mission_id where s.id=p_target_id)
 end
$$;
create function public.group_notification_category(p_kind text,p_target_type text)returns text language sql immutable set search_path=''as $$
 select case
 when p_kind in('official_post','group_notice') or p_target_type='notice'then'notice'
 when p_kind in('group_raffle_won','benefit_won','recipient_information_required','recipient_deadline_reminder','fulfillment_meaningful_update') or p_target_type in('group_raffle','group_raffle_winner')then'recipient'
 when p_kind in('level_up','benefit_unlocked','benefit_available','stamp_issued','participation_deadline','collectible_claim_available','collectible_claim_expiring','group_activity','group_reward') or p_target_type in('group_mission','group_mission_submission')then'activity'
 when p_kind in('live_24h','live_10m','live_reserved','live_changed','schedule_reminder','survey_reminder','group_event') or p_target_type in('schedule','live','group_event')then'event'
 else null end
$$;
create function public.group_notification_allowed(p_owner uuid,p_kind text,p_target_type text,p_target_id uuid)returns boolean language sql stable security definer set search_path=''as $$
 select coalesce((select s.enabled and case public.group_notification_category(p_kind,p_target_type)
 when'notice'then s.notice_enabled when'event'then s.event_enabled when'recipient'then s.recipient_enabled when'activity'then s.activity_enabled else true end
 from public.group_notification_settings s where s.app_user_id=p_owner and s.page_id=public.group_notification_page(p_target_type,p_target_id)),true)
$$;
create function public.group_notification_row_allowed(p_notification public.fan_notifications)returns boolean language plpgsql stable security definer set search_path=''as $$
declare target_type text;target_id uuid;begin
 target_type:=coalesce(p_notification.payload->>'targetType',p_notification.target_type);
 if coalesce(p_notification.payload->>'targetId','')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'then target_id:=(p_notification.payload->>'targetId')::uuid;else target_id:=p_notification.target_id;end if;
 if target_type is null and p_notification.live_event_id is not null then target_type:='live';target_id:=p_notification.live_event_id;end if;
 if target_type is null and p_notification.benefit_id is not null then target_type:='benefit';target_id:=p_notification.benefit_id;end if;
 return public.group_notification_allowed(p_notification.app_user_id,p_notification.kind::text,target_type,target_id);
end $$;
create function public.group_notification_gate_insert()returns trigger language plpgsql security definer set search_path=''as $$begin
 if tg_table_name='fan_web_notification_intents'then
  if not public.group_notification_allowed(new.recipient_app_user_id,new.kind,new.target_type,new.target_id)then return null;end if;
 elsif not public.group_notification_row_allowed(new)then return null;
 end if;
 return new;
end $$;
create trigger group_notification_categories_intent before insert on public.fan_web_notification_intents for each row execute function public.group_notification_gate_insert();
-- This also gates drain inserts and the direct group-raffle winner trigger.
create trigger group_notification_categories_notification before insert on public.fan_notifications for each row execute function public.group_notification_gate_insert();

create or replace function public.groups_content_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default'{}'::jsonb,p_admin_id uuid default null)returns jsonb language plpgsql security definer set search_path=''as $$
declare settings public.group_notification_settings;categories boolean;begin
 if p_operation not in('notifications','set-notifications')then return public.groups_content_dispatch_before_group_categories(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);end if;
 if p_actor is null then raise exception 'GROUPS_FORBIDDEN';end if;
 perform public.fan_web_lock_active_user(p_actor);
 perform public.groups_dispatch('detail',p_actor,p_page_id);
 if not exists(select 1 from public.group_memberships where page_id=p_page_id and app_user_id=p_actor)then raise exception 'GROUPS_FORBIDDEN';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||p_actor::text,0));
 if p_operation='set-notifications'then
  if jsonb_typeof(p_input)<>'object'then raise exception 'GROUPS_INVALID_REQUEST';end if;
  categories:=p_input ?& array['notices','events','recipients','activity'];
  if categories then
   if p_input-array['enabled','notices','events','recipients','activity']<>'{}'::jsonb or exists(select 1 from jsonb_each(p_input)where jsonb_typeof(value)<>'boolean')or(p_input?'enabled'and p_input->'enabled'<>'true'::jsonb)then raise exception 'GROUPS_INVALID_REQUEST';end if;
   insert into public.group_notification_settings(page_id,app_user_id,enabled,notice_enabled,event_enabled,recipient_enabled,activity_enabled)
   values(p_page_id,p_actor,true,(p_input->>'notices')::boolean,(p_input->>'events')::boolean,(p_input->>'recipients')::boolean,(p_input->>'activity')::boolean)
   on conflict(page_id,app_user_id)do update set enabled=true,notice_enabled=excluded.notice_enabled,event_enabled=excluded.event_enabled,recipient_enabled=excluded.recipient_enabled,activity_enabled=excluded.activity_enabled;
  else
   if p_input-array['enabled']<>'{}'::jsonb or jsonb_typeof(p_input->'enabled')is distinct from'boolean'then raise exception 'GROUPS_INVALID_REQUEST';end if;
   insert into public.group_notification_settings(page_id,app_user_id,enabled)values(p_page_id,p_actor,(p_input->>'enabled')::boolean)on conflict(page_id,app_user_id)do update set enabled=excluded.enabled;
  end if;
  delete from public.fan_web_notification_intents i where i.recipient_app_user_id=p_actor and public.group_notification_page(i.target_type,i.target_id)=p_page_id and not public.group_notification_allowed(p_actor,i.kind,i.target_type,i.target_id);
 end if;
 select *into settings from public.group_notification_settings where page_id=p_page_id and app_user_id=p_actor;
 return jsonb_build_object('enabled',coalesce(settings.enabled,true),'notices',coalesce(settings.notice_enabled,true),'events',coalesce(settings.event_enabled,true),'recipients',coalesce(settings.recipient_enabled,true),'activity',coalesce(settings.activity_enabled,true));
end $$;
create or replace function public.fan_web_notification_path(p_owner uuid,p_notification uuid)returns text language plpgsql stable security definer set search_path=''as $$begin
 if not coalesce((select public.group_notification_row_allowed(n)from public.fan_notifications n where n.id=p_notification and n.app_user_id=p_owner),false)then return null;end if;
 return public.fan_web_notification_path_before_group_categories(p_owner,p_notification);
end $$;
create or replace function public.notification_delivery_is_eligible(p_notification_id uuid,p_at timestamptz default pg_catalog.now())returns boolean language sql stable security definer set search_path=''as $$
 select public.notification_delivery_is_eligible_before_group_categories(p_notification_id,p_at)and public.group_notification_row_allowed(n)from public.fan_notifications n where n.id=p_notification_id
$$;
create or replace function public.email_notification_delivery_is_eligible(p_notification_id uuid,p_channel_id uuid,p_at timestamptz default pg_catalog.now())returns boolean language sql stable security definer set search_path=''as $$
 select public.email_notification_delivery_is_eligible_before_group_categories(p_notification_id,p_channel_id,p_at)and public.group_notification_row_allowed(n)from public.fan_notifications n where n.id=p_notification_id
$$;
create or replace function public.kakao_notification_delivery_is_eligible(p_delivery_id uuid,p_at timestamptz default pg_catalog.now())returns boolean language sql stable security definer set search_path=''as $$
 select public.kakao_notification_delivery_is_eligible_before_group_categories(p_delivery_id,p_at)and public.group_notification_row_allowed(n)from public.external_notification_delivery_outbox d join public.fan_notifications n on n.id=d.notification_id where d.id=p_delivery_id
$$;

revoke all on function public.group_notification_page(text,uuid),public.group_notification_category(text,text),public.group_notification_allowed(uuid,text,text,uuid),public.group_notification_row_allowed(public.fan_notifications),public.group_notification_gate_insert()from public,anon,authenticated,service_role;
-- CREATE OR REPLACE preserves existing ACL/owner. Grant helpers/backups only to trusted existing definer owners.
do $$declare owner_name name;signature text;begin
 for owner_name in select distinct pg_get_userbyid(proowner)from pg_proc where oid=any(array['public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure,'public.fan_web_notification_path(uuid,uuid)'::regprocedure,'public.notification_delivery_is_eligible(uuid,timestamptz)'::regprocedure,'public.email_notification_delivery_is_eligible(uuid,uuid,timestamptz)'::regprocedure,'public.kakao_notification_delivery_is_eligible(uuid,timestamptz)'::regprocedure,'public.fan_web_lock_active_user(uuid)'::regprocedure])loop
  if owner_name in('anon','authenticated','service_role')then raise exception 'UNTRUSTED_NOTIFICATION_DEFINER';end if;
  foreach signature in array array['group_notification_page(text,uuid)','group_notification_category(text,text)','group_notification_allowed(uuid,text,text,uuid)','group_notification_row_allowed(public.fan_notifications)','groups_content_dispatch_before_group_categories(text,uuid,uuid,uuid,jsonb,uuid)','fan_web_notification_path_before_group_categories(uuid,uuid)','notification_delivery_is_eligible_before_group_categories(uuid,timestamptz)','email_notification_delivery_is_eligible_before_group_categories(uuid,uuid,timestamptz)','kakao_notification_delivery_is_eligible_before_group_categories(uuid,timestamptz)']loop execute format('grant execute on function public.%s to %I',signature,owner_name);end loop;
  execute format('grant select on public.group_notification_settings to %I',owner_name);
 end loop;
end $$;
commit;

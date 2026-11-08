-- Rollback of 20261216031000_artist_activity_notifications. Roll the web back first.
-- Deletes every artist_comment / artist_online notice and its queued push rows, then restores the functions kept under
-- *_before_artist_activity, the source-shape constraint and the preference patch, and drops the new objects.
begin;
set local lock_timeout = '5s';
drop trigger if exists artist_activity_comment on public.group_comments;
drop trigger if exists artist_activity_presence on public.group_presence;
drop trigger if exists artist_activity_mobile_push_gate on public.mobile_push_delivery_outbox;

delete from public.notification_delivery_outbox where notification_id in (select id from public.fan_notifications where kind::text in ('artist_comment','artist_online'));
delete from public.mobile_push_delivery_outbox where notification_id in (select id from public.fan_notifications where kind::text in ('artist_comment','artist_online'));
delete from public.fan_notifications where kind::text in ('artist_comment','artist_online');

do $$
declare signature text; source text; fname text; backup text;
begin
  foreach signature in array array['fan_web_notification_path(uuid,uuid)', 'notification_delivery_is_eligible(uuid,timestamp with time zone)',
      'create_external_notification_plan(uuid,timestamp with time zone)', 'mobile_prepare_push_delivery(uuid,text)',
      'enqueue_due_notification_maintenance(timestamp with time zone)'] loop
    fname := split_part(signature, '(', 1); backup := fname || '_before_artist_activity';
    if to_regprocedure('public.' || replace(signature, fname, backup)) is null then continue; end if;
    source := pg_get_functiondef(('public.' || replace(signature, fname, backup))::regprocedure);
    execute overlay(source placing 'CREATE OR REPLACE FUNCTION public.' || fname || '(' from 1 for length('CREATE OR REPLACE FUNCTION public.' || backup || '('));
    execute format('drop function public.%s', replace(signature, fname, backup));
  end loop;
end $$;

do $$
declare note text;
begin
  select obj_description(oid, 'pg_constraint') into note from pg_constraint where conrelid = 'public.fan_notifications'::regclass and conname = 'fan_notifications_source_shape';
  if note is null or note not like 'before_artist_activity:%' then return; end if;
  alter table public.fan_notifications drop constraint fan_notifications_source_shape;
  execute 'alter table public.fan_notifications add constraint fan_notifications_source_shape check (' || substr(note, length('before_artist_activity:') + 1) || ') not valid';
end $$;

create or replace function public.fan_web_patch_notification_preferences(p_app_user_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if jsonb_typeof(p_patch)<>'object' or exists(select 1 from jsonb_each(p_patch) x
    where x.key not in('live_reminders','survey_reminders','benefit_notifications','reply_notifications','official_post_notifications','schedule_notifications') or jsonb_typeof(x.value)<>'boolean') then
    raise exception 'INVALID_NOTIFICATION_PREFERENCES' using errcode='22023'; end if;
  insert into public.notification_preferences(app_user_id) values(p_app_user_id) on conflict do nothing;
  update public.notification_preferences set
    live_reminders=coalesce((p_patch->>'live_reminders')::boolean,live_reminders),
    survey_reminders=coalesce((p_patch->>'survey_reminders')::boolean,survey_reminders),
    benefit_notifications=coalesce((p_patch->>'benefit_notifications')::boolean,benefit_notifications),
    reply_notifications=coalesce((p_patch->>'reply_notifications')::boolean,reply_notifications),
    official_post_notifications=coalesce((p_patch->>'official_post_notifications')::boolean,official_post_notifications),
    schedule_notifications=coalesce((p_patch->>'schedule_notifications')::boolean,schedule_notifications)
    where app_user_id=p_app_user_id;
end $$;

-- The owner policies this file added (artist_activity_owner_<role>) on tables that stay.
do $$
declare p record;
begin
  for p in select pol.polname, c.relname from pg_policy pol join pg_class c on c.oid = pol.polrelid
      where pol.polname like 'artist\_activity\_owner\_%' and c.relnamespace = 'public'::regnamespace
        and c.relname not in ('artist_activity_push_control', 'artist_online_daily', 'artist_activity_jobs', 'artist_activity_failures') loop
    execute format('drop policy %I on public.%I', p.polname, p.relname);
  end loop;
end $$;
drop function if exists public.artist_activity_mobile_push_gate();
drop function if exists public.artist_activity_presence_trigger();
drop function if exists public.artist_activity_comment_trigger();
drop function if exists public.run_artist_activity_jobs(integer);
drop function if exists public.artist_activity_notify_online(uuid, uuid, timestamptz);
drop function if exists public.artist_activity_notify_comment(uuid, timestamptz);
drop function if exists public.artist_activity_online_batch(uuid, uuid, timestamptz, uuid, integer);
drop function if exists public.artist_activity_comment_batch(uuid, timestamptz, uuid, integer);
drop function if exists public.artist_activity_recipients(uuid, uuid, text, uuid, integer);
drop function if exists public.artist_activity_record_failure(text, uuid, uuid, uuid, timestamptz, text, text);
drop function if exists public.artist_activity_notification_path(uuid, uuid);
drop function if exists public.artist_activity_delivery_allowed(uuid, timestamptz);
drop function if exists public.artist_activity_is_artist_notice(uuid);
drop function if exists public.artist_activity_mobile_delivery_refused(uuid, text);
drop function if exists public.artist_activity_display_name(uuid, text);
drop function if exists public.artist_activity_push_allowed(uuid, text, timestamptz);
drop table if exists public.artist_activity_failures;
drop table if exists public.artist_activity_jobs;
drop table if exists public.artist_online_daily;
drop table if exists public.artist_activity_push_control;
alter table public.notification_preferences drop column if exists artist_activity_notifications, drop column if exists artist_online_notifications;
commit;
notify pgrst, 'reload schema';

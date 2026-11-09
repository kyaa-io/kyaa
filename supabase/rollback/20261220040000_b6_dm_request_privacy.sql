-- Rollback of 20261220040000_b6_dm_request_privacy.sql, in one transaction: functions back to their <name>_before_b6 originals,
-- a declined request becomes the old 'rejected' row (retry 24 hours after the decline), then declined_at, the request log and the
-- B6 helpers go. Cancelled and rejected rows keep their status. Roll back 20261220042000 and 20261220041000 first.
-- A second run stops at B6_DM_PRIVACY_ROLLBACK_SHAPE.
begin;
set local lock_timeout = '5s';

do $restore$
declare sig regprocedure;copy regprocedure;def text;
begin
 if to_regprocedure('public.request_social_dm_before_b6(uuid,uuid,text,uuid)') is null then raise exception 'B6_DM_PRIVACY_ROLLBACK_SHAPE'; end if;
 if to_regclass('public.social_profile_report_snapshots') is not null or to_regclass('public.social_profile_return_refs') is not null then
  raise exception 'B6_DM_PRIVACY_ROLLBACK_ORDER: roll back 20261220042000 and 20261220041000 first';
 end if;
 foreach sig in array array[
  'public.request_social_dm(uuid,uuid,text,uuid)','public.resolve_social_dm(uuid,uuid,text,uuid)',
  'public.send_social_dm_message(uuid,uuid,text,uuid)','public.send_social_dm_message(uuid,uuid,text,uuid,uuid)',
  'public.send_social_dm_message_before_groups_text(uuid,uuid,text,uuid)','public.send_social_dm_message_before_groups_media(uuid,uuid,text,uuid,uuid)',
  'public.react_social_dm_message(uuid,uuid,text,uuid)','public.block_social_profile(uuid,uuid,uuid)','public.unblock_social_profile(uuid,uuid)',
  'public.read_owned_dm_conversations(uuid)','public.read_social_dm_messages(uuid,uuid,timestamptz,uuid,integer)',
  'public.read_kyaa_wave_friend_messages(uuid,uuid)','public.send_kyaa_wave_friend_message(uuid,uuid,text,uuid)','public.assert_kyaa_wave_dm_pair(uuid,uuid)',
  'public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer)','public.social_dm_request_state(uuid,uuid)',
  'public.mobile_social_notification_path(uuid,text,text,uuid)','public.evaluate_owned_kyaa_wave_missions(uuid)','public.reconcile_wave_mission_evidence()',
  'public.read_admin_wave_stage_presentation(uuid,uuid,text)']::regprocedure[] loop
  copy:=regexp_replace(sig::text,'^(public\.)?([a-z_]+)\(','public.\2_before_b6(')::regprocedure;
  if copy=sig then raise exception 'B6_ROLLBACK_COPY_NAME: %',sig; end if;
  def:=regexp_replace(pg_catalog.pg_get_functiondef(copy),'FUNCTION public\.([a-z_]+)_before_b6\(','FUNCTION public.\1(');
  execute def;
  execute format('drop function %s',copy);
 end loop;
end $restore$;

update public.social_dm_conversations set status='rejected',retry_at=declined_at+interval '24 hours'
 where declined_at is not null and status='pending';
-- The wave mission trigger on this table is deferred; run it now so the column can be dropped in this transaction.
set constraints all immediate;

drop function public.read_owned_social_blocks_closed(uuid);
drop function public.b6_owner_check();
drop function public.b6_owner_access();
drop function public.b6_owner_roles();
drop function public.b6_owner_functions();
drop function public.b6_owner_tables();
drop function public.b6_owner_function_names();
drop function public.social_lock_pair_for(uuid,uuid);
drop function public.social_lock_pair_actor(uuid,uuid);
drop function public.social_lock_user_quiet(uuid);
drop function public.social_dm_counterpart_open(uuid);
drop function public.social_dm_request_count(uuid);
drop function public.social_dm_hidden_for(uuid,public.social_dm_conversations);
drop table public.social_dm_request_log;
alter table public.social_dm_conversations drop column declined_at;
commit;

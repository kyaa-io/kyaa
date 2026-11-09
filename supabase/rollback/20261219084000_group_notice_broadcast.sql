-- Rollback of 20261219084000_group_notice_broadcast.sql (plan.md 3.6 롤백 절차 1~4). Run before rolling back 20261219080000.
-- 1 발송 중지 -> 2 진행 작업 cancelled -> 3 group_notice 알림 행 삭제(K2를 되돌리기 전에: 남은 행이 있으면 source_shape 검사가 갱신을 막는다)
-- -> 4 래퍼·트리거·유지보수 감싸기 원복, K2·K3 원복. group_notice_broadcasts는 기록으로 남긴다(삭제하지 않음).
-- 5(웹 복귀)는 이 파일 뒤에만. enum 값 group_notice는 남는다(행 0이면 무해).
begin;
set local lock_timeout = '5s';

update public.group_notice_broadcast_control set sending_enabled = false, updated_at = clock_timestamp() where id;
update public.group_notice_broadcasts set status = 'cancelled', last_error = 'rollback', finished_at = clock_timestamp() where status in ('queued','sending','paused');
delete from public.fan_notifications where kind::text = 'group_notice';

drop trigger group_notice_broadcast_post_removed on public.group_posts;
drop function public.group_notice_broadcast_post_removed();

drop function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid);
alter function public.groups_content_dispatch_before_notice_broadcast(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch;
drop function public.enqueue_due_notification_maintenance(timestamptz);
alter function public.enqueue_due_notification_maintenance_before_group_notice(timestamptz) rename to enqueue_due_notification_maintenance;
drop function public.fan_web_notification_path(uuid,uuid);
alter function public.fan_web_notification_path_before_group_notice(uuid,uuid) rename to fan_web_notification_path;

do $$
declare previous text; added constant text := ' OR (((kind)::text = ''group_notice''::text) AND (live_event_id IS NULL) AND (benefit_id IS NULL) AND web_only))';
begin
  select pg_get_expr(conbin, conrelid) into strict previous from pg_constraint where conrelid = 'public.fan_notifications'::regclass and conname = 'fan_notifications_source_shape';
  if right(previous, length(added)) <> added then raise exception 'GROUP_NOTICE_BROADCAST_ROLLBACK_SHAPE: %', right(previous, 200); end if;
  alter table public.fan_notifications drop constraint fan_notifications_source_shape;
  -- pg_get_expr flattens the OR chain into one parenthesised list: drop our last term and close the list again.
  previous := left(previous, length(previous) - length(added));
  execute 'alter table public.fan_notifications add constraint fan_notifications_source_shape check (' || previous || ')) not valid';
end $$;
drop function public.fan_web_notification_kind(text);
alter function public.fan_web_notification_kind_before_group_notice(text) rename to fan_web_notification_kind;

drop function public.run_group_notice_broadcasts(integer,text);
drop function public.group_notice_broadcast_batch(uuid,integer,text);
drop function public.group_notice_broadcast_enabled();

-- Grants the original entry functions had (the migration moved them to the wrappers).
do $$
declare g record;
begin
  grant execute on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;
  grant execute on function public.fan_web_notification_path(uuid,uuid) to service_role;
  grant execute on function public.enqueue_due_notification_maintenance(timestamptz) to service_role;
  for g in select distinct pg_get_userbyid(p.proowner) rolname from pg_proc p where p.prosrc like '%fan_web_notification_path(%' and p.pronamespace = 'public'::regnamespace loop
    execute format('grant execute on function public.fan_web_notification_path(uuid,uuid) to %I', g.rolname);
  end loop;
  for g in select distinct pg_get_userbyid(p.proowner) rolname from pg_proc p where p.prosrc like '%fan_web_notification_kind(%' and p.pronamespace = 'public'::regnamespace loop
    execute format('grant execute on function public.fan_web_notification_kind(text) to %I', g.rolname);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;

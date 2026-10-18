do $$ declare n public.fan_notifications%rowtype; s record; item jsonb; begin
 select * into s from public.activity_notification_upgrade_snapshot;
 select * into n from public.fan_notifications where id='92500000-0000-4000-8000-000000000903';
 item:=public.mobile_get_owned_notification(n.app_user_id,n.id,'ko');
 if to_jsonb(n) is distinct from s.row_data or item is distinct from s.item then raise exception 'legacy notification changed during activity upgrade'; end if;
 if public.mobile_get_owned_notifications(n.app_user_id,'ko',null,100)->'unreadByGroup' is distinct from '{"activity":1}'::jsonb then raise exception 'legacy row was not classified'; end if;
end $$;
drop table public.activity_notification_upgrade_snapshot;

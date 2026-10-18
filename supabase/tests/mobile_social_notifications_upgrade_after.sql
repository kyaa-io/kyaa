do $$ begin
 if (select to_jsonb(l)-'notification_id' from public.fan_post_likes l where app_user_id='92300000-0000-4000-8000-000000000901') is distinct from (select item from public.social_notification_upgrade_snapshot) then raise exception 'legacy reaction changed'; end if;
 if exists(select 1 from public.fan_web_notification_intents where recipient_app_user_id='92300000-0000-4000-8000-000000000901') then raise exception 'upgrade backfilled private notifications'; end if;
 if (select notification_id from public.fan_post_likes where app_user_id='92300000-0000-4000-8000-000000000901') is null then raise exception 'legacy reaction event identity missing'; end if;
end $$;
drop table public.social_notification_upgrade_snapshot;

alter type public.notification_kind add value if not exists 'group_raffle_won';
begin;
alter function public.fan_web_notification_kind(text)rename to fan_web_notification_kind_before_group_raffle;
revoke all on function public.fan_web_notification_kind_before_group_raffle(text)from public,anon,authenticated,service_role;
create function public.fan_web_notification_kind(p_kind text)returns boolean language sql immutable security definer set search_path=''as $$select p_kind='group_raffle_won'or public.fan_web_notification_kind_before_group_raffle(p_kind)$$;
revoke all on function public.fan_web_notification_kind(text)from public,anon,authenticated;

-- Renamed function dependencies retain their OID, including the existing check.
do $$
declare previous text;
begin
 select pg_get_expr(conbin,conrelid) into strict previous from pg_constraint
 where conrelid='public.fan_notifications'::regclass and conname='fan_notifications_source_shape';
 alter table public.fan_notifications drop constraint fan_notifications_source_shape;
 execute 'alter table public.fan_notifications add constraint fan_notifications_source_shape check (('
 ||previous||') or (kind::text=''group_raffle_won'' and live_event_id is null and benefit_id is null and web_only))';
end $$;

alter function public.fan_web_notification_path(uuid,uuid)rename to fan_web_notification_path_before_group_raffle;
revoke all on function public.fan_web_notification_path_before_group_raffle(uuid,uuid)from public,anon,authenticated,service_role;
create function public.fan_web_notification_path(p_owner uuid,p_notification uuid)returns text language plpgsql stable security definer set search_path='' as $$
declare n public.fan_notifications;path text;begin
 select *into n from public.fan_notifications where id=p_notification and app_user_id=p_owner and superseded_at is null and scheduled_for<=now();
 if n.payload->>'targetType'='group_raffle_winner'then
  select '/pages/groups/'||r.page_id||'/raffles/'||r.id into path from public.group_raffle_winners w join public.group_raffles r on r.id=w.raffle_id join public.app_users u on u.id=w.app_user_id and u.status='active'where w.id=(n.payload->>'targetId')::uuid and w.app_user_id=p_owner;return path;
 end if;
 return public.fan_web_notification_path_before_group_raffle(p_owner,p_notification);
end $$;
create function public.group_raffle_notify_winner()returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.fan_notifications(app_user_id,kind,source_key,scheduled_for,deep_link,payload,web_only)
 values(new.app_user_id,'group_raffle_won','group-raffle-winner:'||new.id,clock_timestamp(),'/my',jsonb_build_object('targetType','group_raffle_winner','targetId',new.id,'revision',1),true)on conflict(app_user_id,source_key)do nothing;
 return new;
end $$;
create trigger group_raffle_notify_winner after insert on public.group_raffle_winners for each row execute function public.group_raffle_notify_winner();
revoke all on function public.group_raffle_notify_winner(),public.fan_web_notification_path(uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function public.fan_web_notification_path(uuid,uuid)to service_role;
commit;

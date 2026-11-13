-- SELECT DISTINCT resolves the untyped literal to text, which fan_notifications.kind (enum) rejects on draw.
create or replace function public.group_raffle_notify_result() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.drawn_at is null and new.drawn_at is not null and new.approval_status='approved' then
  insert into public.fan_notifications(app_user_id,kind,source_key,scheduled_for,deep_link,payload,web_only)
  select distinct e.app_user_id,'group_raffle_result'::public.notification_kind,'group-raffle-result:'||new.id,clock_timestamp(),'/my',
   jsonb_build_object('targetType','group_raffle','targetId',new.id,'revision',1,'prizeName',coalesce(new.gift_snapshot->>'name',new.title)),true
  from public.group_raffle_entries e join public.group_memberships m on m.page_id=new.page_id and m.app_user_id=e.app_user_id
   join public.app_users u on u.id=e.app_user_id and u.status='active'
  where e.raffle_id=new.id and public.group_scope_visible(e.app_user_id,new.page_id)
  on conflict(app_user_id,source_key)do nothing;
 end if;
 return new;
end $$;
revoke all on function public.group_raffle_notify_result() from public,anon,authenticated,service_role;

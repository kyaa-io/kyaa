-- Same row-level closing for the customer-inquiry room. Its claim joins cs_messages, so rank the same way.
alter table public.telegram_cs_alert_outbox drop constraint telegram_cs_alert_outbox_last_error_check;
alter table public.telegram_cs_alert_outbox add constraint telegram_cs_alert_outbox_last_error_check
  check(last_error in ('THROTTLED','REJECTED','DELIVERY_UNKNOWN','INVALID_PAYLOAD'));

create function public.reject_telegram_cs_alert_rows(p_batch_id uuid,p_chat_id text,p_positions integer[]) returns boolean
language plpgsql security definer set search_path='' as $$
declare cfg public.telegram_cs_alert_settings; t timestamptz:=clock_timestamp(); wanted integer[]; n integer; remaining integer;
begin
  select coalesce(array_agg(distinct p order by p),'{}') into wanted from unnest(p_positions) p;
  if cardinality(wanted)=0 or wanted[1]<1 then raise exception 'TELEGRAM_ROW_POSITION_INVALID'; end if;
  select * into cfg from public.telegram_cs_alert_settings where singleton for update;
  if not found or not cfg.enabled or cfg.chat_id is distinct from p_chat_id
    or cfg.batch_id is distinct from p_batch_id or cfg.lease_expires_at is null
    or cfg.lease_expires_at<=t then return false; end if;
  with ranked as (
    select o.id,row_number() over (order by o.created_at,o.id)::integer as position
    from public.telegram_cs_alert_outbox o join public.cs_messages m on m.id=o.source_id
    where o.batch_id=p_batch_id and o.status='claimed' and o.lease_expires_at>t
      and o.activation_id=cfg.activation_id and o.chat_id=cfg.chat_id
  )
  update public.telegram_cs_alert_outbox o set status='failed',last_error='INVALID_PAYLOAD',
    attempt_count=least(o.attempt_count+1,3),finished_at=t,lease_expires_at=null
    from ranked r where o.id=r.id and r.position=any(wanted);
  get diagnostics n=row_count;
  if n<>cardinality(wanted) then raise exception 'TELEGRAM_ROW_POSITION_INVALID'; end if;
  select count(*) into remaining from public.telegram_cs_alert_outbox where batch_id=p_batch_id and status='claimed';
  if remaining=0 then
    update public.telegram_cs_alert_settings set batch_id=null,lease_expires_at=null where singleton;
  end if;
  return true;
end $$;

revoke all on function public.reject_telegram_cs_alert_rows(uuid,text,integer[]) from public,anon,authenticated;
grant execute on function public.reject_telegram_cs_alert_rows(uuid,text,integer[]) to service_role;

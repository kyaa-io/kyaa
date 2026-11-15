-- Close only the unrenderable rows of a claimed Telegram batch so the rest still sends.
-- Deploy together with the worker; before this exists the worker keeps its old failure mode.
-- Positions are 1-based in the claimed alert array, which is the claim order (created_at,id).
create function public.reject_telegram_alert_rows(p_batch_id uuid,p_chat_id text,p_positions integer[]) returns boolean
language plpgsql security definer set search_path='' as $$
declare cfg public.telegram_alert_settings; t timestamptz:=clock_timestamp(); wanted integer[]; n integer; remaining integer;
begin
  select coalesce(array_agg(distinct p order by p),'{}') into wanted from unnest(p_positions) p;
  if cardinality(wanted)=0 or wanted[1]<1 then raise exception 'TELEGRAM_ROW_POSITION_INVALID'; end if;
  select * into cfg from public.telegram_alert_settings where singleton for update;
  if not found or not cfg.enabled or cfg.chat_id is distinct from p_chat_id
    or cfg.batch_id is distinct from p_batch_id or cfg.lease_expires_at is null
    or cfg.lease_expires_at<=t then return false; end if;
  with ranked as (
    select id,row_number() over (order by created_at,id)::integer as position
    from public.telegram_alert_outbox
    where batch_id=p_batch_id and status='claimed' and lease_expires_at>t
      and activation_id=cfg.activation_id and chat_id=cfg.chat_id
  )
  update public.telegram_alert_outbox o set status='failed',last_error='INVALID_PAYLOAD',
    attempt_count=least(o.attempt_count+1,3),finished_at=t,lease_expires_at=null
    from ranked r where o.id=r.id and r.position=any(wanted);
  get diagnostics n=row_count;
  if n<>cardinality(wanted) then raise exception 'TELEGRAM_ROW_POSITION_INVALID'; end if;
  select count(*) into remaining from public.telegram_alert_outbox where batch_id=p_batch_id and status='claimed';
  if remaining=0 then
    update public.telegram_alert_settings set batch_id=null,lease_expires_at=null where singleton;
  end if;
  return true;
end $$;

revoke all on function public.reject_telegram_alert_rows(uuid,text,integer[]) from public,anon,authenticated;
grant execute on function public.reject_telegram_alert_rows(uuid,text,integer[]) to service_role;

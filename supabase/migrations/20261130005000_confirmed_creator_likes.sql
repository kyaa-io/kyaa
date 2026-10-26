-- Likes may use an operator-verified successful registration receipt while finality catches up.
-- Finalized registrations and confirmed receipts remain distinct; other action gates are unchanged.
create table public.fan_action_confirmed_creators (
  binding_id uuid not null references public.fan_action_bindings(id),
  creator_id uuid not null references public.celebrities(id),
  transaction_hash text not null check(transaction_hash ~ '^0x[0-9a-f]{64}$'),
  confirmed_block_number numeric(78,0) not null check(confirmed_block_number>0),
  confirmed_block_hash text not null check(confirmed_block_hash ~ '^0x[0-9a-f]{64}$'),
  confirmed_at timestamptz not null default clock_timestamp(),
  primary key(binding_id,creator_id)
);
alter table public.fan_action_confirmed_creators enable row level security;
alter table public.fan_action_confirmed_creators force row level security;
revoke all on public.fan_action_confirmed_creators from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fan_action_native_enabled(p_action_code integer, p_app_user_id uuid, p_creator_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_enabled boolean;
  v_binding_id uuid;
begin
  v_enabled := public.fan_action_native_enabled(p_action_code, p_app_user_id);
  if not v_enabled then
    return false;
  end if;

  if p_action_code not in (1, 6, 8, 10) then
    return true;
  end if;

  select route.binding_id
    into v_binding_id
  from public.fan_action_producer_routes route
  where route.action_code = p_action_code;

  v_enabled:=p_creator_id is not null and exists (
    select 1
    from public.fan_action_verified_creators verified
    where verified.binding_id = v_binding_id
      and verified.creator_id = p_creator_id
  );
  if not v_enabled and p_action_code=6 then
    v_enabled:=exists(select 1 from public.fan_action_confirmed_creators confirmed
      where confirmed.binding_id=v_binding_id and confirmed.creator_id=p_creator_id);
  end if;
  if not v_enabled and exists(select 1 from public.fan_action_bindings where id=v_binding_id and binding_version>=2) then
    raise exception 'FAN_ACTION_CONTEXT_NOT_VERIFIED';
  end if;
  return v_enabled;

end;
$function$
;

do $$ begin
  if public.get_fan_ticket_balance('58000000-0000-4000-8000-000000000021','58000000-0000-4000-8000-000000000022')<>7 then raise exception 'Upgrade changed legacy free balance'; end if;
  if to_regclass('public.mobile_benefit_draw_requests') is null or to_regprocedure('public.draw_owned_mobile_benefit(uuid,uuid,uuid,text,timestamptz)') is null then raise exception 'Upgrade did not install mobile benefits'; end if;
  if to_regprocedure('public.create_admin_mobile_benefit_consent(uuid,uuid,text,timestamp with time zone,jsonb,text,uuid)') is null
    or to_regprocedure('public.read_owned_mobile_benefit_free_ticket_missions(uuid,text)')is null
    or not exists(select 1 from information_schema.columns where table_schema='public'and table_name='mobile_benefit_policies'and column_name='daily_limit')
    or not exists(select 1 from information_schema.columns where table_schema='public'and table_name='mobile_store_purchase_intents'and column_name='benefit_policy_id')
    or not exists(select 1 from information_schema.columns where table_schema='public'and table_name='mobile_benefit_awards'and column_name='recipient_deadline_at') then raise exception 'Upgrade did not install configurable gift limits, deadlines, and consent'; end if;
  if exists(select 1 from public.mobile_benefit_policies) then raise exception 'Upgrade unexpectedly seeded a mobile benefit policy'; end if;
  if exists(select 1 from public.benefit_recipient_consent_versions where active and not public.mobile_benefit_consent_documents_complete(documents)) then raise exception 'Upgrade left incomplete recipient consent active'; end if;
end $$;

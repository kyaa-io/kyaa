-- Compensating entries preserve both append-only ledgers. Insufficient
-- remaining mileage aborts the entire transaction for reconciliation.
begin;
lock table public.lucky_ticket_cutover in exclusive mode;
do $$ declare ticket record; begin
  for ticket in select t.*, m.policy_id from public.fan_ticket_ledger t
    join public.mobile_fan_economy_ledger m using (app_user_id, celebrity_id, source_type, source_id)
    where t.source_type = 'lucky_ticket_cutover' and m.asset = 'fan_point'
      and not exists (select 1 from public.fan_ticket_ledger r
        where r.source_type = 'lucky_ticket_cutover_undo' and r.source_id = t.id)
  loop
    perform public.mobile_fan_economy_post(ticket.app_user_id, ticket.celebrity_id, 'fan_point',
      ticket.amount * 100, 'lucky_ticket_cutover_undo', ticket.id, ticket.policy_id);
    perform public.post_fan_ticket_entry(ticket.app_user_id, ticket.celebrity_id, 'credit',
      -ticket.amount, 'lucky_ticket_cutover_undo', ticket.id, extensions.gen_random_uuid(), ticket.policy_version);
  end loop;
end $$;
commit;

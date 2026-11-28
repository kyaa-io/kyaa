-- Extend the existing visibility-checked result projections without changing grants.
do $migration$
declare
  patch record;
  definition text;
begin
  for patch in select * from (values
    ('public.group_raffle_dispatch_before_gifts(text,uuid,uuid,uuid,jsonb,uuid)',
     $old$'enteredTickets',(select coalesce(sum(e.amount),0)$old$,
     $new$'totalTickets',(select coalesce(sum(e.amount),0) from public.group_raffle_entries e where e.raffle_id=r.id having exists (select 1 from jsonb_array_elements(public.group_raffle_list(p_page_id,p_actor)->'raffles') visible where visible->>'id'=r.id::text)),'enteredTickets',(select coalesce(sum(e.amount),0)$new$),
    ('public.group_raffle_dispatch_before_gifts(text,uuid,uuid,uuid,jsonb,uuid)',
     $old$(select coalesce(sum(amount),0) from public.group_raffle_entries where raffle_id=r.id and app_user_id=p_actor)$old$,
     $new$(select coalesce(sum(e.amount),0) from public.group_raffle_entries e where e.raffle_id=r.id and e.app_user_id=p_actor)$new$),
    ('public.group_raffle_dispatch_before_gifts(text,uuid,uuid,uuid,jsonb,uuid)',
     $old$from public.group_raffle_winners w left join public.user_profiles u on u.app_user_id=w.app_user_id where w.raffle_id=r.id and w.status<>'expired'$old$,
     $new$from public.group_raffle_winners winner_row left join public.user_profiles u on u.app_user_id=winner_row.app_user_id where winner_row.raffle_id=r.id and winner_row.status<>'expired'$new$),
    ('public.get_public_raffles(text,public.content_locale,timestamptz)',
     $old$'winnerQuantity',i.winner_quantity$old$,
     $new$'totalTickets',(select coalesce(sum(e.ticket_amount),0) from public.benefit_ticket_entries e where e.benefit_id=i.benefit_id),'winnerQuantity',i.winner_quantity$new$)
  ) as changes(signature, original, replacement) loop
    definition := pg_get_functiondef(patch.signature::regprocedure);
    if position(patch.original in definition) = 0 then
      raise exception 'Raffle detail projection changed in %', patch.signature;
    end if;
    execute replace(definition, patch.original, patch.replacement);
  end loop;
end
$migration$;

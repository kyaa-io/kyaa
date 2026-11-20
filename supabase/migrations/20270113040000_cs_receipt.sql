-- Existing inquiries retain NULL. Only newly committed inquiries enter the queue.
alter table public.cs_inquiries add column receipt_pending boolean;
alter table public.cs_inquiries alter column receipt_pending set default true;
create index cs_receipt_pending_idx on public.cs_inquiries(created_at,id) where receipt_pending;

-- Consume before contacting SES. An ambiguous provider response cannot trigger a resend.
create function public.consume_cs_receipt() returns jsonb
language sql security definer set search_path='' as $$
  with candidate as (
    select i.id, u.verified_email as email, i.locale, m.body
    from public.cs_inquiries i
    join public.app_users u on u.id=i.app_user_id and u.status='active'
    join public.cs_messages m on m.inquiry_id=i.id and m.operation='create'
    where i.receipt_pending and u.verified_email is not null
    order by i.created_at,i.id limit 1 for update of i skip locked
  ), consumed as (
    update public.cs_inquiries i set receipt_pending=false
    from candidate c where i.id=c.id
    returning i.id,c.email,c.locale,c.body
  )
  select to_jsonb(consumed) from consumed;
$$;
revoke all on function public.consume_cs_receipt() from public,anon,authenticated;
grant execute on function public.consume_cs_receipt() to service_role;

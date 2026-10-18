begin;

create function public.mobile_store_get_owned_support_page(
  p_app_user_id uuid, p_celebrity_slug text, p_limit integer default 50,
  p_cursor_created_at timestamptz default null, p_cursor_id uuid default null,
  p_transaction_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_celebrity uuid; v_result jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_limit is null or p_limit not between 1 and 100
    or (p_cursor_created_at is null) <> (p_cursor_id is null)
    or (p_transaction_id is not null and p_cursor_id is not null) then
    raise exception 'MOBILE_STORE_INVALID';
  end if;
  select id into v_celebrity from public.celebrities
    where slug=p_celebrity_slug and status='published' and archived_at is null;
  if v_celebrity is null then raise exception 'MOBILE_STORE_FAVORITE_UNAVAILABLE'; end if;

  with owned as materialized (
    select t.*, i.policy_version, i.product_id as purchase_product_id,
      i.ticket_quantity as purchase_ticket_quantity, i.support_rate_bps as purchase_support_rate_bps,
      e.support_krw as settled_support_krw, e.evidence_at as settlement_evidence_at,
      case when t.support_krw=0 and e.id is null then 'not_applicable'
        when e.id is null then 'pending'
        when e.support_krw=t.support_krw then 'settled'
        else 'refund_correction_required' end as settlement_status
    from public.mobile_store_transactions t
    join public.mobile_store_purchase_intents i on i.id=t.intent_id
    left join lateral (
      select evidence.* from public.mobile_store_support_settlement_evidence evidence
      where evidence.transaction_id=t.id order by evidence.created_at desc,evidence.id desc limit 1
    ) e on true
    where t.app_user_id=p_app_user_id and t.celebrity_id=v_celebrity
  ), candidates as materialized (
    select * from owned
    where (p_transaction_id is null or id=p_transaction_id)
      and (p_cursor_id is null or (created_at,id)<(p_cursor_created_at,p_cursor_id))
    order by created_at desc,id desc limit p_limit+1
  ), page as materialized (
    select * from candidates order by created_at desc,id desc limit p_limit
  )
  select jsonb_build_object(
    'celebrityId',v_celebrity,
    'totalSupportKrw',(select coalesce(sum(support_krw),0) from owned),
    'pendingSupportKrw',(select coalesce(sum(support_krw) filter(where settled_support_krw is null),0) from owned),
    'settledSupportKrw',(select coalesce(sum(settled_support_krw),0) from owned),
    'settlementCorrectionKrw',(select coalesce(sum(greatest(settled_support_krw-support_krw,0)),0) from owned),
    'refundAdjustmentKrw',(select coalesce(-sum(amount_delta_krw) filter(where amount_delta_krw<0),0)
      from public.mobile_store_support_ledger where app_user_id=p_app_user_id and celebrity_id=v_celebrity),
    'nextCursor',case when (select count(*) from candidates)>p_limit then
      (select jsonb_build_object('createdAt',created_at,'id',id) from page order by created_at,id limit 1)
      else null end,
    'purchases',coalesce((select jsonb_agg(jsonb_build_object(
      'transactionId',t.id,'storeTransactionId',t.external_transaction_id,
      'productId',t.purchase_product_id,'policyVersion',t.policy_version,
      'ticketQuantity',t.purchase_ticket_quantity,'ticketReversed',t.ticket_reversed,'supportRateBps',t.purchase_support_rate_bps,
      'amountKrw',t.amount_krw,'refundedKrw',t.refunded_krw,'supportKrw',t.support_krw,
      'state',t.state,'purchasedAt',t.store_event_at,
      'refundStatus',case when t.state='revoked' or (t.amount_krw is not null and t.refunded_krw>=t.amount_krw)
        then 'fully_refunded' when t.refunded_krw>0 then 'partially_refunded' else 'none' end,
      'settlementStatus',t.settlement_status,'settledSupportKrw',t.settled_support_krw,
      'settlementEvidenceAt',t.settlement_evidence_at
    ) order by t.created_at desc,t.id desc) from page t),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(row_data order by created_at desc,id desc) from (
      select l.id,l.created_at,jsonb_build_object(
        'id',l.id,'transactionId',l.transaction_id,'amountDeltaKrw',l.amount_delta_krw,
        'resultingTransactionSupportKrw',l.resulting_support_krw,'cumulativeRefundedKrw',l.cumulative_refunded_krw,
        'correctionType',case when l.amount_delta_krw<0 then 'refund_adjustment' else 'purchase' end,
        'settlementStatus',t.settlement_status,'settlementEvidenceAt',t.settlement_evidence_at,'createdAt',l.created_at
      ) as row_data from public.mobile_store_support_ledger l join page t on t.id=l.transaction_id
      where l.app_user_id=p_app_user_id and l.celebrity_id=v_celebrity
      order by l.created_at desc,l.id desc limit 100
    ) ledger),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

revoke all on function public.mobile_store_get_owned_support_page(uuid,text,integer,timestamptz,uuid,uuid) from public,anon,authenticated;
grant execute on function public.mobile_store_get_owned_support_page(uuid,text,integer,timestamptz,uuid,uuid) to service_role;

commit;

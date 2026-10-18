-- Keep the legacy event projection unchanged for clients with strict response schemas.
create function public.read_celebrity_cheer_event_live_state(
  p_slug text,p_app_user_id uuid default null,p_locale public.content_locale default 'ko'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare event jsonb; at_time timestamptz:=statement_timestamp();
begin
  if p_app_user_id is not null and not exists(select 1 from public.app_users where id=p_app_user_id and status='active')
    then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED'; end if;
  select jsonb_build_object(
    'campaignId',campaign.id,'creatorSlug',creator.slug,'liveEventId',live.id,'liveSlug',live.slug,
    'entryOpensAt',campaign.entry_opens_at,'entryClosesAt',campaign.entry_closes_at,
    'liveStartsAt',live.starts_at,
    'reservationOpensAt',live.reservation_opens_at,'reservationClosesAt',live.reservation_closes_at,
    'reservationAvailable',at_time>=live.reservation_opens_at and at_time<live.reservation_closes_at
      and public.live_effective_status_at(live.id,at_time)='scheduled',
    'status',case when at_time<campaign.entry_opens_at then 'upcoming' when at_time<campaign.entry_closes_at then 'open' else 'closed' end,
    'prizes',(select coalesce(jsonb_agg(jsonb_build_object(
      'benefitId',item.benefit_id,'title',coalesce(localized.title,benefit.slug),
      'imageUrl',item.teaser_image_url,'winnerQuantity',item.winner_quantity
    ) order by item.priority),'[]'::jsonb)
      from public.live_benefit_campaign_items item join public.benefits benefit on benefit.id=item.benefit_id
      left join public.benefit_localizations localized on localized.benefit_id=benefit.id and localized.locale=p_locale
      where item.campaign_id=campaign.id and benefit.publication_status='published' and benefit.archived_at is null),
    'participation',case when p_app_user_id is null then null else jsonb_build_object(
      'entered',entry.id is not null,'enteredAt',entry.entered_at,
      'reserved',exists(select 1 from public.live_reservations reservation where reservation.app_user_id=p_app_user_id and reservation.live_event_id=live.id and reservation.reserved_at<campaign.entry_closes_at),
      'weight',coalesce((select candidate.weight from public.benefit_draw_candidates candidate where candidate.campaign_id=campaign.id and candidate.app_user_id=p_app_user_id order by candidate.benefit_id limit 1),
        case when exists(select 1 from public.live_reservations reservation where reservation.app_user_id=p_app_user_id and reservation.live_event_id=live.id and reservation.reserved_at<campaign.entry_closes_at) then 2 else 1 end)
    ) end
  ) into event
  from public.live_benefit_campaigns campaign
  join public.live_events live on live.id=campaign.live_event_id
  join public.celebrities creator on creator.id=live.celebrity_id
  left join public.benefit_cheer_entries entry on entry.campaign_id=campaign.id and entry.app_user_id=p_app_user_id
  where creator.slug=p_slug and creator.status='published' and creator.archived_at is null
    and campaign.entry_source='cheer' and campaign.status='published' and campaign.cancelled_at is null
    and live.publication_status='published' and live.archived_at is null
  order by campaign.entry_closes_at desc,campaign.id desc limit 1;
  return jsonb_build_object('event',event);
end;
$$;

revoke all on function public.read_celebrity_cheer_event_live_state(text,uuid,public.content_locale)
  from public,anon,authenticated,service_role;
grant execute on function public.read_celebrity_cheer_event_live_state(text,uuid,public.content_locale) to service_role;

create or replace function public.get_owned_benefit_entry_state(
  p_app_user_id uuid,p_benefit_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  result jsonb; v_campaign public.live_benefit_campaigns%rowtype; v_item public.live_benefit_campaign_items%rowtype;
  v_owner uuid; v_total bigint; v_balance bigint; v_verified boolean;
begin
  select c.* into v_campaign from public.live_benefit_campaigns c
  join public.live_benefit_campaign_items i on i.campaign_id=c.id
  where i.benefit_id=p_benefit_id and c.status='published'
  order by c.entry_closes_at desc,c.id desc limit 1;
  if not found then return null; end if;
  select * into strict v_item from public.live_benefit_campaign_items
    where campaign_id=v_campaign.id and benefit_id=p_benefit_id;
  select coalesce(v_campaign.celebrity_id,e.celebrity_id) into v_owner
    from (select 1) x left join public.live_events e on e.id=v_campaign.live_event_id;
  select coalesce(sum(ticket_amount),0) into v_total from public.benefit_ticket_entries
    where app_user_id=p_app_user_id and campaign_id=v_campaign.id and benefit_id=p_benefit_id;
  v_balance:=public.get_fan_ticket_balance(p_app_user_id,v_owner);
  v_verified:=v_campaign.live_event_id is not null or exists(
    select 1 from public.fan_passports p
    where p.app_user_id=p_app_user_id and p.celebrity_id=v_owner and p.business_status='issued'
  );
  result:=jsonb_build_object(
    'campaignId',v_campaign.id,'creatorTicketBalance',v_balance,'enteredTickets',v_total,
    'perFanTicketLimit',v_item.per_fan_ticket_limit,
    'remainingBenefitTickets',case when v_item.per_fan_ticket_limit is null then null else greatest(v_item.per_fan_ticket_limit-v_total,0) end,
    'entryOpensAt',v_campaign.entry_opens_at,'entryClosesAt',v_campaign.entry_closes_at,
    'cancelledAt',v_campaign.cancelled_at,
    'requiresFanVerification',v_campaign.live_event_id is null,'fanVerified',v_verified,
    'canEnter',v_campaign.entry_source='tickets' and v_campaign.cancelled_at is null and v_verified
      and pg_catalog.now()>=v_campaign.entry_opens_at and pg_catalog.now()<v_campaign.entry_closes_at,
    'entries',coalesce((select jsonb_agg(jsonb_build_object(
      'entryId',e.id,'ticketAmount',e.ticket_amount,'enteredAt',e.entered_at
    ) order by e.entered_at desc,e.id desc) from public.benefit_ticket_entries e
      where e.app_user_id=p_app_user_id and e.campaign_id=v_campaign.id and e.benefit_id=p_benefit_id),'[]'::jsonb),
    'fulfillmentPolicy',public.raffle_fulfillment_policy_json(
      v_campaign.id,p_benefit_id,v_item.active_fulfillment_policy_version)
  );
  return result;
end;
$$;

-- Digital delivery has no recipient form; shipping and pickup retain their existing deadline.
create or replace function public.publish_admin_benefit_draw(
  p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,
  p_campaign_id uuid,p_draw_id uuid,p_now timestamptz default pg_catalog.now()
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; v_published_at timestamptz;
begin
  result:=public.publish_admin_benefit_draw_without_recipient_deadlines(
    p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,p_campaign_id,p_draw_id,p_now);
  select published_at into strict v_published_at from public.benefit_draw_publications
    where draw_id=p_draw_id and campaign_id=p_campaign_id;
  update public.benefit_fulfillments fulfillment set
    fulfillment_policy_version=item.active_fulfillment_policy_version,
    recipient_deadline_at=case when item.active_fulfillment_policy_version is null or fulfillment.method='digital' then null
      else v_published_at+interval '168 hours' end
  from public.benefit_draw_winners winner
  join public.live_benefit_campaign_items item
    on item.campaign_id=winner.campaign_id and item.benefit_id=winner.benefit_id
  where fulfillment.winner_id=winner.id and winner.draw_id=p_draw_id
    and fulfillment.fulfillment_policy_version is null;
  return result;
end;
$$;

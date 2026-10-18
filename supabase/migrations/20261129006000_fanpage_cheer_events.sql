-- Cheer campaigns share the existing draw and fulfillment lifecycle without spending tickets.
alter table public.live_benefit_campaigns add column entry_source text not null default 'tickets'
  check (entry_source in ('tickets','cheer'));
alter table public.live_benefit_campaigns add constraint cheer_campaign_requires_live
  check (entry_source <> 'cheer' or live_event_id is not null);

create table public.benefit_cheer_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  campaign_id uuid not null references public.live_benefit_campaigns(id),
  app_user_id uuid not null references public.app_users(id),
  source_message_id uuid references public.fan_lounge_messages(id) on delete set null,
  entered_at timestamptz not null default clock_timestamp(),
  unique(campaign_id,app_user_id)
);
alter table public.benefit_cheer_entries enable row level security;
revoke all on public.benefit_cheer_entries from public,anon,authenticated,service_role;

create function public.guard_cheer_campaign_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.entry_source is distinct from new.entry_source and (
    exists(select 1 from public.benefit_ticket_entries where campaign_id=old.id)
    or exists(select 1 from public.benefit_cheer_entries where campaign_id=old.id)
    or exists(select 1 from public.benefit_draws where campaign_id=old.id)
  ) then raise exception 'FANPAGE_INVALID_REQUEST'; end if;
  return new;
end;
$$;
create trigger guard_cheer_campaign_source before update of entry_source on public.live_benefit_campaigns
for each row execute function public.guard_cheer_campaign_source();
create function public.reject_cheer_ticket_entry() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.live_benefit_campaigns where id=new.campaign_id and entry_source='cheer')
  then raise exception 'FANPAGE_INVALID_REQUEST'; end if;
  return new;
end;
$$;
create trigger reject_cheer_ticket_entry before insert or update on public.benefit_ticket_entries
for each row execute function public.reject_cheer_ticket_entry();

create or replace function public.post_celebrity_cheer(
  p_app_user_id uuid,p_slug text,p_body text,p_idempotency_key uuid,
  p_locale public.content_locale default 'ko'
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; campaign public.live_benefit_campaigns%rowtype; at_time timestamptz;
begin
  result:=public.post_celebrity_lounge_message(p_app_user_id,p_slug,p_body,p_idempotency_key,null,p_locale);
  if (result->>'replayed')::boolean then return result; end if;
  for campaign in select c.* from public.live_benefit_campaigns c
    join public.live_events live on live.id=c.live_event_id
    join public.celebrities creator on creator.id=live.celebrity_id
    where creator.slug=p_slug and c.entry_source='cheer' and c.status='published'
      and c.cancelled_at is null and live.publication_status='published' and live.archived_at is null
    order by c.id for update of c
  loop
    at_time:=clock_timestamp();
    if at_time>=campaign.entry_opens_at and at_time<campaign.entry_closes_at
      and not exists(select 1 from public.benefit_draws where campaign_id=campaign.id)
      and exists(select 1 from public.app_users where id=p_app_user_id and status='active') then
      insert into public.benefit_cheer_entries(campaign_id,app_user_id,source_message_id,entered_at)
        values(campaign.id,p_app_user_id,(result->>'id')::uuid,at_time)
        on conflict(campaign_id,app_user_id) do nothing;
    end if;
  end loop;
  return result;
end;
$$;

create function public.benefit_campaign_candidate_weights(
  p_campaign_id uuid,p_benefit_id uuid,p_as_of timestamptz
) returns table(app_user_id uuid,weight integer) language sql stable security definer set search_path='' as $$
  select entry.app_user_id,sum(entry.ticket_amount)::integer
  from public.benefit_ticket_entries entry
  join public.live_benefit_campaigns campaign on campaign.id=entry.campaign_id
  where campaign.id=p_campaign_id and campaign.entry_source='tickets' and entry.benefit_id=p_benefit_id
  group by entry.app_user_id having sum(entry.ticket_amount)>0
  union all
  select entry.app_user_id,case when exists(
    select 1 from public.live_reservations reservation where reservation.app_user_id=entry.app_user_id
      and reservation.live_event_id=campaign.live_event_id
      and reservation.reserved_at<campaign.entry_closes_at and reservation.reserved_at<=p_as_of
  ) then 2 else 1 end
  from public.benefit_cheer_entries entry
  join public.live_benefit_campaigns campaign on campaign.id=entry.campaign_id
  join public.app_users owner on owner.id=entry.app_user_id and owner.status='active'
  where campaign.id=p_campaign_id and campaign.entry_source='cheer' and entry.entered_at<=p_as_of
    and exists(select 1 from public.live_benefit_campaign_items where campaign_id=p_campaign_id and benefit_id=p_benefit_id);
$$;


create or replace function public.execute_admin_benefit_draw_unpublished(
  p_actor_app_user_id uuid,
  p_actor_admin_allowlist_id uuid,
  p_correlation_id uuid,
  p_campaign_id uuid,
  p_idempotency_key uuid,
  p_now timestamptz default pg_catalog.now()
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_campaign public.live_benefit_campaigns%rowtype;
  v_existing public.benefit_draws%rowtype;
  v_draw_id uuid:=extensions.gen_random_uuid();
  v_seed bytea:=extensions.gen_random_bytes(32);
  v_seed_hash text;
  v_item public.live_benefit_campaign_items%rowtype;
  v_candidate_count integer;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('phase4:benefit-draw:key:'||p_idempotency_key::text,0)
  );
  select * into v_existing from public.benefit_draws where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.campaign_id<>p_campaign_id then
      raise exception 'PHASE4_BENEFIT_DRAW_IDEMPOTENCY_CONFLICT' using errcode='23514';
    end if;
    return jsonb_build_object(
      'drawId',v_existing.id,'campaignId',v_existing.campaign_id,
      'algorithm',v_existing.algorithm,'seedHash',v_existing.seed_hash,
      'executedAt',v_existing.executed_at,
      'candidateCount',(select count(*) from public.benefit_draw_candidates where draw_id=v_existing.id),
      'winners',coalesce((select jsonb_agg(jsonb_build_object(
        'winnerId',w.id,'benefitId',w.benefit_id,'appUserId',w.app_user_id,'weight',c.weight
      ) order by i.priority,c.rank_value,w.app_user_id) from public.benefit_draw_winners w
        join public.benefit_draw_candidates c on c.id=w.candidate_id
        join public.live_benefit_campaign_items i on i.campaign_id=w.campaign_id and i.benefit_id=w.benefit_id
        where w.draw_id=v_existing.id),'[]'::jsonb),'replayed',true
    );
  end if;

  select * into v_campaign from public.live_benefit_campaigns
    where id=p_campaign_id for update;
  if not found then raise exception 'PHASE4_BENEFIT_DRAW_NOT_FOUND'; end if;
  -- The public draw wrapper already holds the campaign; reservations only lock LIVE.
  perform 1 from public.live_events where id=(select live_event_id from public.live_benefit_campaigns where id=p_campaign_id and entry_source='cheer') for update;
  if v_campaign.status<>'published' then raise exception 'PHASE4_BENEFIT_DRAW_NOT_PUBLISHED'; end if;
  if p_now<v_campaign.entry_closes_at then raise exception 'PHASE4_BENEFIT_DRAW_ENTRY_OPEN'; end if;
  if exists(select 1 from public.benefit_draws where campaign_id=p_campaign_id) then
    raise exception 'PHASE4_BENEFIT_DRAW_ALREADY_EXECUTED' using errcode='23514';
  end if;
  if not exists(select 1 from public.live_benefit_campaign_items where campaign_id=p_campaign_id) then
    raise exception 'PHASE4_BENEFIT_DRAW_EMPTY_CAMPAIGN';
  end if;

  v_seed_hash:=encode(extensions.digest(v_seed,'sha256'),'hex');
  insert into public.benefit_draws(
    id,campaign_id,idempotency_key,algorithm,seed_hash,actor_app_user_id,
    actor_admin_allowlist_id,correlation_id,executed_at
  ) values(
    v_draw_id,p_campaign_id,p_idempotency_key,'sha256-weighted-rank-v1',v_seed_hash,
    p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,p_now
  );
  insert into public.benefit_draw_secrets(draw_id,raw_seed) values(v_draw_id,v_seed);

  for v_item in
    select * from public.live_benefit_campaign_items
    where campaign_id=p_campaign_id order by priority,benefit_id
  loop
    with weights as (
      select * from public.benefit_campaign_candidate_weights(p_campaign_id,v_item.benefit_id,p_now)
    ), digests as (
      select w.*,extensions.digest(
        v_seed||pg_catalog.uuid_send(v_item.benefit_id)||pg_catalog.uuid_send(w.app_user_id),
        'sha256'
      ) digest_bytes from weights w
    ), scored as (
      select d.*,public.benefit_digest_uint256(d.digest_bytes) digest_number,
        (public.benefit_digest_uint256(d.digest_bytes)+1)
          /(power(2::numeric,256)+1) uniform_value
      from digests d
    ), ranked as (
      select s.*,
        (-ln(s.uniform_value)/s.weight)::double precision rank_value
      from scored s
    ), ordered as (
      select r.*,row_number() over(order by r.rank_value,r.app_user_id) ordinal
      from ranked r
    )
    insert into public.benefit_draw_candidates(
      draw_id,campaign_id,benefit_id,app_user_id,weight,digest,
      uniform_value,rank_value,result
    ) select v_draw_id,p_campaign_id,v_item.benefit_id,o.app_user_id,o.weight,
      encode(o.digest_bytes,'hex'),o.uniform_value,o.rank_value,
      case when o.ordinal<=v_item.winner_quantity then 'won'::public.benefit_draw_candidate_result
           else 'not_selected'::public.benefit_draw_candidate_result end
    from ordered o;

    insert into public.benefit_draw_winners(
      draw_id,campaign_id,benefit_id,app_user_id,candidate_id,selected_at
    ) select c.draw_id,c.campaign_id,c.benefit_id,c.app_user_id,c.id,p_now
      from public.benefit_draw_candidates c
      where c.draw_id=v_draw_id and c.benefit_id=v_item.benefit_id and c.result='won'
      order by c.rank_value,c.app_user_id;
  end loop;

  insert into public.benefit_fulfillments(winner_id,method,status)
    select w.id,i.fulfillment_method,
      case when i.fulfillment_method='digital' then 'ready'::public.benefit_fulfillment_status
           else 'information_required'::public.benefit_fulfillment_status end
    from public.benefit_draw_winners w
    join public.live_benefit_campaign_items i on i.campaign_id=w.campaign_id and i.benefit_id=w.benefit_id
    where w.draw_id=v_draw_id;
  insert into public.benefit_fulfillment_events(
    fulfillment_id,from_status,to_status,actor_app_user_id,
    actor_admin_allowlist_id,correlation_id,created_at
  ) select f.id,null,f.status,p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,p_now
    from public.benefit_fulfillments f join public.benefit_draw_winners w on w.id=f.winner_id
    where w.draw_id=v_draw_id;

  -- Sanitized in-app intent: only operational IDs, never seed or recipient data.
  insert into public.fan_notifications(
    app_user_id,kind,source_key,benefit_id,scheduled_for
  ) select w.app_user_id,'benefit_available',
      'benefit-draw:'||v_draw_id::text||':'||w.benefit_id::text,w.benefit_id,p_now
    from public.benefit_draw_winners w where w.draw_id=v_draw_id
    on conflict (app_user_id,source_key) do nothing;

  insert into public.audit_logs(
    actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,
    correlation_id,before_after_summary
  ) values(
    p_actor_app_user_id,p_actor_admin_allowlist_id,'benefit_campaign.draw_executed',
    'live_benefit_campaign',p_campaign_id::text,p_correlation_id,
    jsonb_build_object('drawId',v_draw_id,'algorithm','sha256-weighted-rank-v1',
      'seedHash',v_seed_hash,'candidateCount',(select count(*) from public.benefit_draw_candidates where draw_id=v_draw_id),
      'winnerCount',(select count(*) from public.benefit_draw_winners where draw_id=v_draw_id))
  );
  select count(*) into v_candidate_count from public.benefit_draw_candidates where draw_id=v_draw_id;
  return jsonb_build_object(
    'drawId',v_draw_id,'campaignId',p_campaign_id,'algorithm','sha256-weighted-rank-v1',
    'seedHash',v_seed_hash,'executedAt',p_now,'candidateCount',v_candidate_count,
    'winners',coalesce((select jsonb_agg(jsonb_build_object(
      'winnerId',w.id,'benefitId',w.benefit_id,'appUserId',w.app_user_id,'weight',c.weight
    ) order by i.priority,c.rank_value,w.app_user_id) from public.benefit_draw_winners w
      join public.benefit_draw_candidates c on c.id=w.candidate_id
      join public.live_benefit_campaign_items i on i.campaign_id=w.campaign_id and i.benefit_id=w.benefit_id
      where w.draw_id=v_draw_id),'[]'::jsonb),'replayed',false
  );
end;
$$;

-- Patch the applied reservation engine, preserving later canary scopes and the active-account wrapper.
do $$
declare target record; definition text; patched text; changed integer:=0;
begin
  for target in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'reserve_owned_live_event%'
      and p.prosrc like '%live_record public.live_events%'
  loop
    definition:=pg_get_functiondef(target.oid);
    patched:=replace(definition,'  select override.effective_status into effective_status',
      E'  v_occurred_at:=clock_timestamp();\n  select override.effective_status into effective_status');
    patched:=replace(patched,'pg_catalog.now() < live_record.reservation_opens_at','v_occurred_at < live_record.reservation_opens_at');
    patched:=replace(patched,'pg_catalog.now() >= live_record.reservation_closes_at','v_occurred_at >= live_record.reservation_closes_at');
    if patched=definition or position('public.fan_action_native_enabled(2,p_app_user_id,live_record.celebrity_id,live_record.id)' in patched)=0
      then raise exception 'CHEER_RESERVATION_PATCH_CONTRACT_CHANGED'; end if;
    execute patched; changed:=changed+1;
  end loop;
  if changed<>1 then raise exception 'CHEER_RESERVATION_ENGINE_NOT_UNIQUE'; end if;
end;
$$;

create or replace function public.get_admin_benefit_campaigns(
  p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid
) returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_set(item,'{benefits}',coalesce((
    select jsonb_agg(benefit_item || jsonb_build_object(
      'teaserImageUrl',campaign_item.teaser_image_url,
      'activeFulfillmentPolicyVersion',campaign_item.active_fulfillment_policy_version)
      order by (benefit_item->>'priority')::integer,(benefit_item->>'benefitId')::uuid)
    from jsonb_array_elements(item->'benefits') benefit_item
    join public.live_benefit_campaign_items campaign_item
      on campaign_item.campaign_id=c.id and campaign_item.benefit_id=(benefit_item->>'benefitId')::uuid
  ),'[]'::jsonb)) || jsonb_build_object(
    'entrySource',c.entry_source,'liveEventId',c.live_event_id,'celebrityId',c.celebrity_id,
    'publicTeaser',c.public_teaser,'cancelledAt',c.cancelled_at,
    'cancellationReason',c.cancellation_reason,
    'drawPublishedAt',(select p.published_at from public.benefit_draws d join public.benefit_draw_publications p on p.draw_id=d.id where d.campaign_id=c.id)
  ) order by c.created_at desc,c.id desc),'[]'::jsonb)
  from jsonb_array_elements(public.get_admin_benefit_campaigns_base(p_actor_app_user_id,p_actor_admin_allowlist_id)) item
  join public.live_benefit_campaigns c on c.id=(item->>'id')::uuid;
$$;

create or replace function public.get_public_raffles(
  p_celebrity_slug text,p_locale public.content_locale,p_now timestamptz default pg_catalog.now()
) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('raffles',coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'benefitId',i.benefit_id,'title',coalesce(l.title,b.slug),
    'summary',coalesce(l.summary,b.slug),'imageUrl',i.teaser_image_url,
    'winnerQuantity',i.winner_quantity,
    'status',case when c.cancelled_at is not null then 'cancelled'
      when c.status='draft' then 'preparing' when p_now<c.entry_opens_at then 'preparing'
      when p_now<c.entry_closes_at then 'open' else 'closed' end,
    'entryOpensAt',c.entry_opens_at,'entryClosesAt',c.entry_closes_at,
    'resultsPublishedAt',(select publication.published_at from public.benefit_draw_publications publication where publication.campaign_id=c.id),
    'fulfillmentMethod',i.fulfillment_method,'perFanTicketLimit',i.per_fan_ticket_limit,
    'requiresFanVerification',c.live_event_id is null,
    'fulfillmentPolicy',public.raffle_fulfillment_policy_json(c.id,i.benefit_id,i.active_fulfillment_policy_version)
  ) order by c.entry_opens_at nulls last,i.priority,c.id),'[]'::jsonb))
  from public.live_benefit_campaigns c
  left join public.live_events e on e.id=c.live_event_id
  join public.celebrities celebrity
    on celebrity.id=coalesce(c.celebrity_id,e.celebrity_id) and celebrity.slug=p_celebrity_slug
  join public.live_benefit_campaign_items i on i.campaign_id=c.id
  join public.benefits b on b.id=i.benefit_id
  left join public.benefit_localizations l on l.benefit_id=b.id and l.locale=p_locale
  where c.entry_source='tickets' and celebrity.status='published' and celebrity.archived_at is null and b.archived_at is null
    and (c.live_event_id is null or (e.publication_status='published' and e.archived_at is null))
    and ((c.status='published' and b.publication_status='published')
      or (c.status='draft' and c.public_teaser and b.publication_status='draft'));
$$;

create or replace function public.build_owned_raffle_result(
  p_app_user_id uuid,p_campaign_id uuid,p_benefit_id uuid,p_locale public.content_locale
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  result jsonb; v_title text; v_method public.benefit_fulfillment_method;
  v_entry_closes_at timestamptz; v_cheer_entered boolean:=false; v_cancelled boolean; v_entered integer;
  v_publication timestamptz; v_winner uuid; v_fulfillment public.benefit_fulfillments%rowtype;
  v_state text; v_policy_version text; v_recipient_submitted boolean:=false;
  v_carrier text; v_tracking_number text; v_image_url text;
begin
  select case when p_locale='ko' then coalesce(ko.title,en.title,b.slug)
      else coalesce(en.title,ko.title,b.slug) end,
    item.fulfillment_method,c.entry_closes_at,c.cancelled_at is not null,
    item.active_fulfillment_policy_version,item.teaser_image_url
  into v_title,v_method,v_entry_closes_at,v_cancelled,v_policy_version,v_image_url
  from public.live_benefit_campaigns c
  join public.live_benefit_campaign_items item on item.campaign_id=c.id
  join public.benefits b on b.id=item.benefit_id
  left join public.benefit_localizations ko on ko.benefit_id=b.id and ko.locale='ko'
  left join public.benefit_localizations en on en.benefit_id=b.id and en.locale='en'
  where c.id=p_campaign_id and item.benefit_id=p_benefit_id;
  if not found then return null; end if;
  select coalesce(sum(entry.ticket_amount),0)::integer into v_entered
  from public.benefit_ticket_entries entry
  where entry.app_user_id=p_app_user_id and entry.campaign_id=p_campaign_id
    and entry.benefit_id=p_benefit_id;
  select exists(select 1 from public.benefit_cheer_entries where campaign_id=p_campaign_id and app_user_id=p_app_user_id) into v_cheer_entered;
  select publication.published_at into v_publication
  from public.benefit_draws draw
  join public.benefit_draw_publications publication on publication.draw_id=draw.id
  where draw.campaign_id=p_campaign_id;
  if v_publication is not null then
    select winner.id into v_winner from public.benefit_draw_winners winner
    join public.benefit_draw_publications publication on publication.draw_id=winner.draw_id
    where winner.app_user_id=p_app_user_id and winner.campaign_id=p_campaign_id
      and winner.benefit_id=p_benefit_id;
  end if;
  if v_winner is not null then
    select * into strict v_fulfillment from public.benefit_fulfillments
      where winner_id=v_winner;
    v_policy_version:=v_fulfillment.fulfillment_policy_version;
    select exists(select 1 from public.benefit_recipient_private where winner_id=v_winner)
      into v_recipient_submitted;
    if v_fulfillment.method='physical_shipping'
      and v_fulfillment.status in ('shipping_in_transit','shipping_completed') then
      select event.carrier,event.tracking_number into v_carrier,v_tracking_number
      from public.benefit_fulfillment_events event
      where event.fulfillment_id=v_fulfillment.id
        and event.to_status='shipping_in_transit'
      order by event.created_at desc,event.id desc limit 1;
    end if;
  end if;
  v_state:=case when v_cancelled then 'cancelled' when v_entered=0 and not v_cheer_entered then 'not_entered'
    when v_publication is null then 'pending' when v_winner is not null then 'won'
    else 'not_won' end;
  return jsonb_build_object(
    'benefitId',p_benefit_id,'campaignId',p_campaign_id,'title',v_title,
    'imageUrl',v_image_url,
    'benefitHref','/benefits/'||p_benefit_id::text,'state',v_state,
    'enteredTickets',v_entered,'entryClosesAt',v_entry_closes_at,
    'publishedAt',case when v_state in ('won','not_won') then v_publication else null end,
    'winnerId',case when v_state='won' then v_winner else null end,'method',v_method,
    'fulfillmentStatus',case when v_state='won' then v_fulfillment.status else null end,
    'claimDisposition',case when v_state='won' then v_fulfillment.claim_disposition else 'active' end,
    'recipientDeadlineAt',case when v_state='won' then v_fulfillment.recipient_deadline_at else null end,
    'recipientSubmitted',case when v_state='won' then v_recipient_submitted else false end,
    'carrier',case when v_state='won' then v_carrier else null end,
    'trackingNumber',case when v_state='won' then v_tracking_number else null end,
    'recipientEditable',case when v_state='won' then
      v_fulfillment.claim_disposition='active'
      and v_fulfillment.status in ('information_required','ready')
      and (v_fulfillment.recipient_deadline_at is null
        or pg_catalog.statement_timestamp()<v_fulfillment.recipient_deadline_at)
      else false end,
    'policy',public.raffle_fulfillment_policy_json(
      p_campaign_id,p_benefit_id,v_policy_version));
end;
$$;

create or replace function public.get_owned_raffles(
  p_app_user_id uuid,p_locale public.content_locale,p_cursor text default null,p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_cursor_parts text[]; v_cursor_owner uuid; v_cursor_epoch numeric; v_cursor_id uuid;
  v_items jsonb; v_next text; v_count integer;
begin
  if p_app_user_id is null or p_limit not between 1 and 50 then
    raise exception 'RAFFLE_LIST_ARGUMENT_INVALID';
  end if;
  if p_cursor is not null then
    begin
      v_cursor_parts:=string_to_array(convert_from(decode(p_cursor,'hex'),'UTF8'),'|');
      if cardinality(v_cursor_parts)<>3 then raise exception 'invalid'; end if;
      v_cursor_owner:=v_cursor_parts[1]::uuid;
      v_cursor_epoch:=v_cursor_parts[2]::numeric;
      v_cursor_id:=v_cursor_parts[3]::uuid;
    exception when others then raise exception 'RAFFLE_LIST_CURSOR_INVALID'; end;
    if v_cursor_owner<>p_app_user_id then raise exception 'RAFFLE_LIST_CURSOR_OWNER_MISMATCH'; end if;
  end if;
  with owned as (
    select entry.campaign_id,entry.benefit_id,max(entry.entered_at) entered_at,
      item.id item_id
    from public.benefit_ticket_entries entry
    join public.live_benefit_campaign_items item
      on item.campaign_id=entry.campaign_id and item.benefit_id=entry.benefit_id
    where entry.app_user_id=p_app_user_id
    group by entry.campaign_id,entry.benefit_id,item.id
    union all
    select entry.campaign_id,item.benefit_id,entry.entered_at,item.id item_id
    from public.benefit_cheer_entries entry
    join public.live_benefit_campaign_items item on item.campaign_id=entry.campaign_id
    where entry.app_user_id=p_app_user_id
  ), page as (
    select owned.*,row_number() over(order by entered_at desc,item_id desc) rn
    from owned where p_cursor is null
      or (extract(epoch from entered_at),item_id)<(v_cursor_epoch,v_cursor_id)
    order by entered_at desc,item_id desc limit p_limit+1
  )
  select coalesce(jsonb_agg(public.build_owned_raffle_result(
      p_app_user_id,campaign_id,benefit_id,p_locale) order by entered_at desc,item_id desc)
      filter(where rn<=p_limit),'[]'::jsonb),
    count(*)::integer,
    max(case when rn=p_limit then encode(convert_to(
      p_app_user_id::text||'|'||extract(epoch from entered_at)::text||'|'||item_id::text,
      'UTF8'),'hex') end)
  into v_items,v_count,v_next from page;
  if v_count<=p_limit then v_next:=null; end if;
  return jsonb_build_object('items',v_items,'nextCursor',v_next);
end;
$$;

create function public.read_celebrity_cheer_event(
  p_slug text,p_app_user_id uuid default null,p_locale public.content_locale default 'ko'
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare event jsonb; at_time timestamptz:=statement_timestamp();
begin
  if p_app_user_id is not null and not exists(select 1 from public.app_users where id=p_app_user_id and status='active')
    then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED'; end if;
  select jsonb_build_object(
    'campaignId',campaign.id,'creatorSlug',creator.slug,'liveEventId',live.id,'liveSlug',live.slug,
    'entryOpensAt',campaign.entry_opens_at,'entryClosesAt',campaign.entry_closes_at,
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

create function public.read_admin_cheer_event_participants(
  p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_campaign_id uuid,
  p_offset integer default 0,p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare campaign public.live_benefit_campaigns%rowtype; result jsonb; total integer; total_weight integer;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>100 then raise exception 'FANPAGE_INVALID_REQUEST'; end if;
  select * into campaign from public.live_benefit_campaigns where id=p_campaign_id;
  if not found then raise exception 'FANPAGE_NOT_FOUND'; end if;
  if campaign.entry_source<>'cheer' then return jsonb_build_object('entrySource',campaign.entry_source,'total',0,'totalWeight',0,'participants','[]'::jsonb,'nextOffset',null); end if;
  with candidates as (
    select entry.app_user_id,entry.entered_at,
      coalesce((select dc.weight from public.benefit_draw_candidates dc where dc.campaign_id=p_campaign_id and dc.app_user_id=entry.app_user_id order by dc.benefit_id limit 1),
        case when exists(select 1 from public.live_reservations reservation where reservation.app_user_id=entry.app_user_id and reservation.live_event_id=campaign.live_event_id and reservation.reserved_at<campaign.entry_closes_at) then 2 else 1 end) weight
    from public.benefit_cheer_entries entry join public.app_users owner on owner.id=entry.app_user_id and owner.status='active'
    where entry.campaign_id=p_campaign_id
  ), page as (select * from candidates order by entered_at,app_user_id offset p_offset limit p_limit)
  select (select count(*)::integer from candidates),(select coalesce(sum(weight),0)::integer from candidates),
    coalesce((select jsonb_agg(jsonb_build_object('appUserId',app_user_id,'enteredAt',entered_at,'weight',weight) order by entered_at,app_user_id) from page),'[]'::jsonb)
  into total,total_weight,result;
  return jsonb_build_object('entrySource',campaign.entry_source,'total',total,'totalWeight',total_weight,
    'participants',result,'nextOffset',case when p_offset+p_limit<total then p_offset+p_limit else null end);
end;
$$;

revoke all on function public.guard_cheer_campaign_source(),public.reject_cheer_ticket_entry(),
  public.benefit_campaign_candidate_weights(uuid,uuid,timestamptz),
  public.read_celebrity_cheer_event(text,uuid,public.content_locale),
  public.read_admin_cheer_event_participants(uuid,uuid,uuid,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.read_celebrity_cheer_event(text,uuid,public.content_locale),
  public.read_admin_cheer_event_participants(uuid,uuid,uuid,integer,integer) to service_role;

create or replace function public.get_published_benefits(
  p_celebrity_slug text, p_locale public.content_locale, p_now timestamptz default now()
) returns setof jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', benefit.id, 'slug', benefit.slug,
    'entrySource',case when exists(select 1 from public.live_benefit_campaign_items item join public.live_benefit_campaigns campaign on campaign.id=item.campaign_id where item.benefit_id=benefit.id and campaign.entry_source='cheer') then 'cheer' else 'tickets' end,
    'title', localization.title, 'summary', localization.summary,
    'eligibilityLabel', localization.eligibility_label,
    'deliveryLabel', localization.delivery_label,
    'deliveryType', benefit.delivery_type,
    'allocationMode', benefit.allocation_mode,
    'claimOpensAt', benefit.claim_opens_at, 'claimClosesAt', benefit.claim_closes_at,
    'minimumScore', benefit.minimum_score, 'minimumLevel', benefit.minimum_level,
    'requiredStampType', benefit.required_stamp_type,
    'requiredActivityType', benefit.required_activity_type,
    'available', p_now >= benefit.claim_opens_at and p_now < benefit.claim_closes_at
      and benefit.archived_at is null
      and (benefit.stock_limit is null or (
        select count(*) from public.benefit_claims claim where claim.benefit_id = benefit.id
      ) < benefit.stock_limit)
      and (benefit.delivery_type <> 'unique_code' or exists (
        select 1 from public.benefit_unique_codes code
        where code.benefit_id = benefit.id and code.claimed_by_claim_id is null
      ))
  )
  from public.benefits benefit
  join public.celebrities celebrity on celebrity.id = benefit.celebrity_id
  join public.benefit_localizations localization
    on localization.benefit_id = benefit.id and localization.locale = p_locale
  where celebrity.slug = p_celebrity_slug
    and celebrity.status = 'published' and celebrity.archived_at is null
    and benefit.publication_status = 'published' and benefit.archived_at is null
  order by benefit.claim_opens_at, benefit.id;
$$;
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

-- A deliberate admin action closes the cheer pool and draws atomically for on-site demonstrations.
create function public.execute_admin_cheer_event_draw(
  p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,
  p_campaign_id uuid,p_idempotency_key uuid,p_expected_revision integer
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare campaign public.live_benefit_campaigns%rowtype; at_time timestamptz;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  select * into campaign from public.live_benefit_campaigns where id=p_campaign_id for update;
  if not found then raise exception 'PHASE4_BENEFIT_DRAW_NOT_FOUND'; end if;
  if campaign.entry_source<>'cheer' then raise exception 'FANPAGE_INVALID_REQUEST'; end if;
  perform 1 from public.live_events where id=(select live_event_id from public.live_benefit_campaigns where id=p_campaign_id and entry_source='cheer') for update;

  at_time:=clock_timestamp();
  if exists(select 1 from public.benefit_draws where campaign_id=p_campaign_id) then
    return public.execute_admin_benefit_draw(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,p_campaign_id,p_idempotency_key,at_time);
  end if;
  if campaign.status<>'published' or campaign.cancelled_at is not null then raise exception 'PHASE4_BENEFIT_DRAW_NOT_PUBLISHED'; end if;
  if at_time<=campaign.entry_opens_at then raise exception 'PHASE4_BENEFIT_DRAW_ENTRY_OPEN'; end if;
  if p_expected_revision is null or campaign.revision<>p_expected_revision then raise exception 'benefit campaign revision conflict' using errcode='23514'; end if;
  if not exists(select 1 from public.benefit_cheer_entries entry
    join public.app_users owner on owner.id=entry.app_user_id and owner.status='active'
    where entry.campaign_id=p_campaign_id and entry.entered_at<=at_time)
    then raise exception 'PHASE4_BENEFIT_DRAW_EMPTY_CAMPAIGN'; end if;
  if campaign.entry_closes_at>at_time then
    update public.live_benefit_campaigns set entry_closes_at=at_time,revision=revision+1,updated_at=at_time where id=p_campaign_id;
  end if;
  return public.execute_admin_benefit_draw(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,p_campaign_id,p_idempotency_key,at_time);
end;
$$;
revoke all on function public.execute_admin_cheer_event_draw(uuid,uuid,uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.execute_admin_cheer_event_draw(uuid,uuid,uuid,uuid,uuid,integer) to service_role;

-- The prize is awarded by the shared draw, including when legacy claim/application RPCs are called directly.
create function public.reject_cheer_direct_claim() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.live_benefit_campaign_items item
    join public.live_benefit_campaigns campaign on campaign.id=item.campaign_id
    where item.benefit_id=new.benefit_id and campaign.entry_source='cheer')
    then raise exception 'FANPAGE_INVALID_REQUEST'; end if;
  return new;
end;
$$;
create trigger reject_cheer_direct_claim before insert on public.benefit_claims
for each row execute function public.reject_cheer_direct_claim();
create trigger reject_cheer_direct_application before insert on public.benefit_applications
for each row execute function public.reject_cheer_direct_claim();
revoke all on function public.reject_cheer_direct_claim() from public,anon,authenticated,service_role;

-- Gift tab (S5): a published raffle win is a gift, and the fan's "read" of it is remembered by the server, not by one browser.
-- A gift is unread when it was never opened, or when its fulfillment moved on to a later stage than the one the fan last saw.
-- The fan submitting their own recipient details (information_required -> ready) stays in the same stage, so it never lights the gift again.

create function public.benefit_gift_stage(p_status public.benefit_fulfillment_status)
returns integer language sql immutable set search_path='' as $$
  select case p_status
    when 'shipping_in_transit' then 1
    when 'pickup_available' then 1
    when 'shipping_completed' then 2
    when 'pickup_completed' then 2
    when 'digital_delivered' then 2
    else 0 end
$$;

create table public.benefit_gift_reads (
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  reward_result_id uuid not null references public.benefit_draw_candidates(id) on delete restrict,
  seen_stage integer not null check (seen_stage between 0 and 2),
  read_at timestamptz not null default pg_catalog.now(),
  primary key (app_user_id, reward_result_id)
);
revoke all on table public.benefit_gift_reads from anon, authenticated, service_role;
alter table public.benefit_gift_reads enable row level security;

-- Gifts that were announced before this release start as read, so nobody opens the app to a pile of glowing gifts.
insert into public.benefit_gift_reads (app_user_id, reward_result_id, seen_stage)
select w.app_user_id, w.candidate_id, public.benefit_gift_stage(f.status)
from public.benefit_draw_winners w
join public.benefit_draw_publications p on p.draw_id = w.draw_id
join public.benefit_fulfillments f on f.winner_id = w.id
on conflict do nothing;

-- Owned, published wins with their read state. `result` is the same projection the raffle result screen reads.
create function public.get_owned_gifts(p_app_user_id uuid, p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(row_json order by unread desc, updated_at desc, candidate_id desc), '[]'::jsonb)
  from (
    select dc.id candidate_id, (r.reward_result_id is null or public.benefit_gift_stage(f.status) > r.seen_stage) unread, f.updated_at,
      jsonb_build_object(
        'rewardResultId', dc.id,
        'unread', (r.reward_result_id is null or public.benefit_gift_stage(f.status) > r.seen_stage),
        'updatedAt', f.updated_at,
        'result', public.build_owned_raffle_result(p_app_user_id, dc.campaign_id, dc.benefit_id, p_locale)
      ) row_json
    from public.benefit_draw_candidates dc
    join public.benefit_draw_publications p on p.draw_id = dc.draw_id
    join public.benefit_draw_winners w on w.candidate_id = dc.id
    join public.benefit_fulfillments f on f.winner_id = w.id
    left join public.benefit_gift_reads r on r.app_user_id = dc.app_user_id and r.reward_result_id = dc.id
    where dc.app_user_id = p_app_user_id and dc.result = 'won'
    order by 2 desc, 3 desc, 1 desc
    limit 100
  ) gifts
$$;

-- One owned gift, or null for an unknown id, another fan's gift, or a result that was not a win: the caller cannot tell them apart.
create function public.get_owned_gift(p_app_user_id uuid, p_reward_result_id uuid, p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'rewardResultId', dc.id,
    'unread', (r.reward_result_id is null or public.benefit_gift_stage(f.status) > r.seen_stage),
    'updatedAt', f.updated_at,
    'result', public.build_owned_raffle_result(p_app_user_id, dc.campaign_id, dc.benefit_id, p_locale))
  from public.benefit_draw_candidates dc
  join public.benefit_draw_publications p on p.draw_id = dc.draw_id
  join public.benefit_draw_winners w on w.candidate_id = dc.id
  join public.benefit_fulfillments f on f.winner_id = w.id
  left join public.benefit_gift_reads r on r.app_user_id = dc.app_user_id and r.reward_result_id = dc.id
  where dc.id = p_reward_result_id and dc.app_user_id = p_app_user_id and dc.result = 'won'
$$;

-- Unread count, plus the id when exactly one gift is unread (the MY banner opens that gift directly).
create function public.get_owned_gift_unread(p_app_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with unread as (
    select dc.id
    from public.benefit_draw_candidates dc
    join public.benefit_draw_publications p on p.draw_id = dc.draw_id
    join public.benefit_draw_winners w on w.candidate_id = dc.id
    join public.benefit_fulfillments f on f.winner_id = w.id
    left join public.benefit_gift_reads r on r.app_user_id = dc.app_user_id and r.reward_result_id = dc.id
    where dc.app_user_id = p_app_user_id and dc.result = 'won'
      and (r.reward_result_id is null or public.benefit_gift_stage(f.status) > r.seen_stage)
  )
  select jsonb_build_object('unreadCount', (select count(*) from unread)::integer,
    'singleUnreadId', case when (select count(*) from unread) = 1 then (select id from unread) else null end)
$$;

-- Opening a gift marks it read at its current stage (idempotent) and quiets the bell notifications about the same prize.
create function public.mark_owned_gift_read(p_app_user_id uuid, p_reward_result_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_benefit uuid; v_stage integer;
begin
  select dc.benefit_id, public.benefit_gift_stage(f.status) into v_benefit, v_stage
  from public.benefit_draw_candidates dc
  join public.benefit_draw_publications p on p.draw_id = dc.draw_id
  join public.benefit_draw_winners w on w.candidate_id = dc.id
  join public.benefit_fulfillments f on f.winner_id = w.id
  where dc.id = p_reward_result_id and dc.app_user_id = p_app_user_id and dc.result = 'won';
  if not found then return null; end if;
  insert into public.benefit_gift_reads (app_user_id, reward_result_id, seen_stage)
  values (p_app_user_id, p_reward_result_id, v_stage)
  on conflict (app_user_id, reward_result_id) do update
    set seen_stage = greatest(public.benefit_gift_reads.seen_stage, excluded.seen_stage), read_at = pg_catalog.now();
  update public.fan_notifications n set read_at = coalesce(n.read_at, pg_catalog.clock_timestamp())
  where n.app_user_id = p_app_user_id and n.benefit_id = v_benefit and n.read_at is null
    and n.kind in ('benefit_won', 'recipient_information_required', 'fulfillment_meaningful_update');
  return public.get_owned_gift_unread(p_app_user_id);
end $$;

revoke all on function public.benefit_gift_stage(public.benefit_fulfillment_status),
  public.get_owned_gifts(uuid, public.content_locale),
  public.get_owned_gift(uuid, uuid, public.content_locale),
  public.get_owned_gift_unread(uuid),
  public.mark_owned_gift_read(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_owned_gifts(uuid, public.content_locale),
  public.get_owned_gift(uuid, uuid, public.content_locale),
  public.get_owned_gift_unread(uuid),
  public.mark_owned_gift_read(uuid, uuid) to service_role;

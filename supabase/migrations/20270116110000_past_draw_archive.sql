create table public.past_draw_archive (
  round_key text primary key check (round_key ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  source_kind text not null check (source_kind in ('live_campaign', 'group_raffle', 'runmusic', 'notice')),
  source_id text not null check (length(source_id) between 1 and 120),
  notice_slug text not null check (notice_slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  closes_at timestamptz not null check (isfinite(closes_at)),
  results_notice_slug text check (results_notice_slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  published boolean not null default false,
  is_test boolean not null default false,
  unique (source_kind, source_id),
  unique (notice_slug)
);
create table public.past_draw_test_rounds (
  campaign_id uuid primary key references public.live_benefit_campaigns(id) on delete cascade
);
alter table public.past_draw_archive enable row level security;
alter table public.past_draw_test_rounds enable row level security;
revoke all on public.past_draw_archive, public.past_draw_test_rounds from public, anon, authenticated, service_role;
grant select, insert on public.past_draw_archive to service_role;
grant select on public.past_draw_test_rounds to service_role;

create view public.past_draw_public_items with (security_invoker = true) as
select i.id, c.id as campaign_id, c.entry_closes_at
from public.live_benefit_campaign_items i
join public.live_benefit_campaigns c on c.id = i.campaign_id
where c.status = 'published' and c.cancelled_at is null
  and not exists (select 1 from public.past_draw_test_rounds t where t.campaign_id = c.id);
revoke all on public.past_draw_public_items from public, anon, authenticated, service_role;
grant select on public.past_draw_public_items to service_role;

create view public.past_draw_published_archive with (security_invoker = true) as
select a.* from public.past_draw_archive a
where a.published and not a.is_test
  and not exists (
    select 1 from public.past_draw_test_rounds t
    where a.source_kind = 'live_campaign' and t.campaign_id::text = a.source_id
  );
revoke all on public.past_draw_published_archive from public, anon, authenticated, service_role;
grant select on public.past_draw_published_archive to service_role;

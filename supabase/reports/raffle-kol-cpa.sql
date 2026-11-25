-- psql -v starts_at=... -v ends_at=... (timestamps with offset, exclusive end)
-- First tagged visit within the reporting window wins across competing handles.
with first_visit as (
  select distinct on (app_user_id) app_user_id, properties->>'kol' as kol, occurred_at
  from public.fan_product_events
  where source in ('acquisition.identified_handoff','acquisition.session_landing')
    and event_name = 'creator_page_view' and app_user_id is not null
    and properties->>'kol' ~ '^[a-z0-9_]{1,15}$'
    and occurred_at >= :'starts_at'::timestamptz and occurred_at < :'ends_at'::timestamptz
  order by app_user_id, occurred_at, id
)
select v.kol,
  count(*) filter (where u.created_at >= v.occurred_at and u.created_at < :'ends_at'::timestamptz) as signups,
  count(*) filter (where r.entered_at >= v.occurred_at and r.entered_at < :'ends_at'::timestamptz) as entrants
from first_visit v
join public.app_users u on u.id = v.app_user_id
left join public.signup_raffle_entries r on r.app_user_id = v.app_user_id
group by v.kol order by v.kol;

-- Read-only: first authenticated X-campaign touch per member, across this campaign's lifetime.
-- Counts are distinct members. This is measured attribution, not causal acquisition proof.
with touches as (
 select e.*, row_number() over(partition by e.app_user_id order by e.occurred_at,e.created_at,e.id) as touch_rank
 from public.fan_product_events e
 join public.app_users u on u.id=e.app_user_id and u.status='active'
 where e.event_name='creator_page_view' and e.source='x_mission.identified'
 and e.properties->>'source'='x' and e.properties->>'medium'='kol'
 and e.properties->>'campaign'='kol-1113'
), first_touch as (
 select app_user_id, properties->>'kol' as kol, occurred_at,
 nullif(properties->>'flowStartedAt','')::timestamptz as flow_started_at
 from touches where touch_rank=1
), facts as (
 select f.*, exists (
  select 1 from public.fan_product_events signup
  where signup.app_user_id=f.app_user_id and signup.event_name='account_created'
  and signup.source='server.commit_projection'
  and f.flow_started_at is not null
  and signup.occurred_at between f.flow_started_at and f.occurred_at
 ) as new_signup,
 exists (
  select 1 from public.fan_reactions r join public.celebrities c on c.id=r.celebrity_id
  where r.app_user_id=f.app_user_id and c.slug='x-mission-1113'
  and r.business_status='completed' and r.completed_at>=f.occurred_at
 ) as liked
 from first_touch f
)
select kol,count(distinct app_user_id) as identified_members,
 count(distinct case when new_signup then app_user_id end) as confirmed_new_signups,
 count(distinct case when liked then app_user_id end) as liked_members,
 count(distinct case when new_signup and liked then app_user_id end) as confirmed_new_signups_liked
from facts group by kol order by kol;

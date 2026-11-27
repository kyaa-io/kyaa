-- Extend the current contract without losing environment-specific approved ads.
do $$
declare
  existing_rule text;
begin
  select pg_get_expr(conbin, conrelid) into strict existing_rule
  from pg_constraint
  where conrelid = 'public.fan_product_events'::regclass and conname = 'fan_ad_properties';

  alter table public.fan_product_events drop constraint fan_ad_properties;
  execute format($rule$
    alter table public.fan_product_events add constraint fan_ad_properties check ((%s) or (
      event_name in ('ad_impression', 'outbound_link_click')
      and source = 'web.outbound' and app_user_id is null and anonymous_session_hash is not null
      and celebrity_id is null and live_event_id is null and mission_id is null and benefit_id is null
      and properties @> '{"adId":"a14add42-75f4-4483-a0d0-1fd24a87ee71","advertiser":"kyaa"}'::jsonb
      and (event_name <> 'ad_impression' or properties - array['adId','advertiser'] = '{}'::jsonb)
    ) is true)
  $rule$, existing_rule);
end $$;

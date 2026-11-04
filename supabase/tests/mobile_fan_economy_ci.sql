-- CI aggregate for the point/ticket economy. The reward source fixtures start from historical point
-- cutovers, which production creates through activation; this test-only trigger stands in for it.
create function pg_temp.fixture_mobile_fan_cutover() returns trigger language plpgsql as $$ begin
 if new.kind='earning' then insert into public.mobile_fan_earning_cutovers values(new.celebrity_id,new.id,new.effective_at,new.version) on conflict do nothing;end if;return new;end $$;
create trigger fixture_mobile_fan_cutover after insert on public.mobile_fan_economy_policies for each row execute function pg_temp.fixture_mobile_fan_cutover();
\ir mobile_fan_economy.sql
\ir mobile_fan_reward_sources.sql
\ir mobile_fan_free_lucky.sql
drop trigger fixture_mobile_fan_cutover on public.mobile_fan_economy_policies;

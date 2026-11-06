-- 20261211070000: v3 hearts-0 Bronze/Silver -> null; Gold+ unchanged; v1/v2 unchanged. Everything rolls back.
begin;
do $t$
declare r jsonb; pol integer;
begin
  select policy_version into pol from public.reward_policy_activation where singleton = true;
  -- v1/v2 (currently active) output must be unchanged and non-null
  r := public.get_fan_stage_progress(15, 'Silver');
  if r is null or r #>> '{current,key}' <> 'silver-1' then raise exception 'v2 progress changed: %', r; end if;
  set local session_replication_role = replica;
  update public.reward_policy_activation set policy_version = 3 where singleton = true;
  if public.get_fan_stage_progress(0, 'Bronze') is not null then raise exception 'v3 Bronze hearts 0 must be null'; end if;
  if public.get_fan_stage_progress(0, 'Silver') is not null then raise exception 'v3 Silver hearts 0 must be null'; end if;
  r := public.get_fan_stage_progress(1, 'Gold');
  if r #>> '{current,key}' <> 'gold-1' or r #>> '{next,key}' <> 'gold-2' or (r #>> '{next,minimumScore}')::int <> 8 then raise exception 'v3 Gold changed: %', r; end if;
  r := public.get_fan_stage_progress(28, 'Diamond');
  if r #>> '{current,key}' <> 'diamond-1' or r -> 'next' <> 'null'::jsonb then raise exception 'v3 Diamond changed: %', r; end if;
end $t$;
rollback;

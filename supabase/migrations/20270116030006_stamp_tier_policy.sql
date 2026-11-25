begin;

-- Publish the stamp schedule independently of the audited activation pointer.
alter table public.reward_policy_versions no force row level security;
alter table public.reward_policy_tier_milestones no force row level security;
alter table public.reward_policy_tier_stages no force row level security;
alter table public.reward_policy_tier_stages disable trigger reward_policy_tier_stages_immutable;

insert into public.reward_policy_versions values
  (4, 0, 3, 1, 0, 2, 1, 0, 5, 3, '2026-11-25 00:00:00+09');
insert into public.reward_policy_tier_milestones(policy_version, tier_name, minimum_score, tier_rank) values
  (4,'Bronze',0,1), (4,'Silver',30,2), (4,'Gold',100,3), (4,'Platinum',400,4), (4,'Diamond',1000,5);
insert into public.reward_policy_tier_stages(policy_version, stage_key, tier_name, subdivision, stage_rank, minimum_score) values
  (4,'bronze-1','Bronze',1,1,0),
  (4,'silver-1','Silver',1,2,30),
  (4,'silver-2','Silver',2,3,60),
  (4,'gold-1','Gold',1,4,100),
  (4,'gold-2','Gold',2,5,200),
  (4,'gold-3','Gold',3,6,300),
  (4,'platinum-1','Platinum',1,7,400),
  (4,'platinum-2','Platinum',2,8,500),
  (4,'platinum-3','Platinum',3,9,600),
  (4,'platinum-4','Platinum',4,10,750),
  (4,'diamond-1','Diamond',1,11,1000);

alter table public.reward_policy_tier_stages enable trigger reward_policy_tier_stages_immutable;
alter table public.reward_policy_tier_stages force row level security;
alter table public.reward_policy_tier_milestones force row level security;
alter table public.reward_policy_versions force row level security;

create function public.fan_tier_daily_limits(p_tier text)
returns table(free_games integer, vote_mileage integer, draw_entries integer)
language sql immutable parallel safe set search_path = '' as $$
  select limits.games, limits.mileage, limits.entries
  from (values
    ('Bronze',3,500,100), ('Silver',4,600,120), ('Gold',5,800,150),
    ('Platinum',6,1000,200), ('Diamond',7,1500,300)
  ) limits(tier,games,mileage,entries)
  where limits.tier = p_tier
$$;
commit;

-- Before 20261211060000: a mission approved on a page without a creator is not paid by the policy path.
\set expect fail
\ir nonfan_mission_reward_probe.sql

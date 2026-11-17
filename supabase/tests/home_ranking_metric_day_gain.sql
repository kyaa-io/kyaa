-- 20261231110000: the points and likes lists answer dayGain (since today 00:00 KST) and weekGain (seven days) on every row, in every period.
-- Run with psql -v ON_ERROR_STOP=1 against a disposable clean-replay database. Fixtures are rolled back.
begin;
set local session_replication_role = replica;
create temporary table t_clock on commit drop as
  select (((pg_catalog.clock_timestamp() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul') as day_start, pg_catalog.clock_timestamp() as now_at;
insert into public.app_users(id, privy_user_id, verified_email, status) values
  ('dd000000-0000-4000-8000-000000000001', 'did:privy:daygain-1', 'daygain-1@byus.test', 'active'),
  ('dd000000-0000-4000-8000-000000000002', 'did:privy:daygain-2', 'daygain-2@byus.test', 'active'),
  ('dd000000-0000-4000-8000-000000000003', 'did:privy:daygain-3', 'daygain-3@byus.test', 'active'),
  ('dd000000-0000-4000-8000-000000000004', 'did:privy:daygain-4', 'daygain-4@byus.test', 'active'),
  ('dd000000-0000-4000-8000-000000000005', 'did:privy:daygain-5', 'daygain-5@byus.test', 'active');
insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role) values
  ('dd100000-0000-4000-8000-000000000001', 'daygain-liked', 'published', '/d.webp', now(), '{creator}', 'creator'),
  ('dd100000-0000-4000-8000-000000000002', 'daygain-quiet', 'published', '/d.webp', now(), '{creator}', 'creator');
insert into public.group_pages(celebrity_id, kind, name) values
  ('dd100000-0000-4000-8000-000000000001', 'fan', 'daygain liked'), ('dd100000-0000-4000-8000-000000000002', 'fan', 'daygain quiet');
-- Likes on daygain-liked: three since today 00:00 KST, two yesterday. daygain-quiet has one like from three days ago.
insert into public.fan_reactions(id, app_user_id, celebrity_id, blockchain_job_id, completed_at)
select ('dd200000-0000-4000-8000-00000000000' || i)::uuid, ('dd000000-0000-4000-8000-00000000000' || i)::uuid, 'dd100000-0000-4000-8000-000000000001',
       ('dd300000-0000-4000-8000-00000000000' || i)::uuid,
       case when i <= 3 then c.day_start + (c.now_at - c.day_start) / 2 else c.day_start - interval '2 hours' end
  from generate_series(1, 5) i, t_clock c;
insert into public.fan_reactions(id, app_user_id, celebrity_id, blockchain_job_id, completed_at)
select 'dd200000-0000-4000-8000-000000000009', 'dd000000-0000-4000-8000-000000000001', 'dd100000-0000-4000-8000-000000000002',
       'dd300000-0000-4000-8000-000000000009', c.day_start - interval '3 days' from t_clock c;
-- Points of fan 1: +40 today, +25 yesterday, +100 ten days ago, and a spend of 10 today that earning leaves out.
insert into public.mobile_fan_economy_ledger(app_user_id, asset, amount, source_type, source_id, owner_sequence, resulting_balance, group_policy_version, created_at)
select 'dd000000-0000-4000-8000-000000000001', 'fan_point', x.amount, 'daygain_test', ('dd400000-0000-4000-8000-00000000000' || x.n)::uuid, x.n, x.balance, 'v1', x.at
  from t_clock c, lateral (values (1, 100, 100, c.day_start - interval '10 days'), (2, 25, 125, c.day_start - interval '2 hours'),
                                  (3, 40, 165, c.day_start + (c.now_at - c.day_start) / 2), (4, -10, 155, c.day_start + (c.now_at - c.day_start) / 2)) x(n, amount, balance, at);
set local session_replication_role = origin;

select public.refresh_home_rankings(pg_catalog.clock_timestamp());

do $t$
declare per text; r jsonb; row jsonb;
begin
  foreach per in array array['all', 'week', 'day'] loop
    r := public.read_home_creator_ranking_v3('ko', per, 50);
    if (r->>'weekGainDays')::int is distinct from 7 then raise exception 'FAIL creators % weekGainDays %', per, r->>'weekGainDays'; end if;
    select e into row from pg_catalog.jsonb_array_elements(r->'rows') e where e->>'slug' = 'daygain-liked';
    if row is null then raise exception 'FAIL creators % lacks daygain-liked: %', per, r; end if;
    if (row->>'dayGain')::int is distinct from 3 or (row->>'weekGain')::int is distinct from 5 or (row->>'totalLikes')::int is distinct from 5 then
      raise exception 'FAIL creators % liked row: %', per, row;
    end if;
    select e into row from pg_catalog.jsonb_array_elements(r->'rows') e where e->>'slug' = 'daygain-quiet';
    if row is null or (row->>'dayGain')::int is distinct from 0 or (row->>'weekGain')::int is distinct from 1 then
      raise exception 'FAIL creators % quiet row (a quiet day is 0, not null): %', per, row;
    end if;

    r := public.read_home_fan_ranking_v3('dd000000-0000-4000-8000-000000000001', per, 50);
    if (r->>'weekGainDays')::int is distinct from 7 then raise exception 'FAIL fans % weekGainDays %', per, r->>'weekGainDays'; end if;
    select e into row from pg_catalog.jsonb_array_elements(r->'rows') e where (e->>'isMe')::boolean;
    if row is null then raise exception 'FAIL fans % lacks the earning fan: %', per, r; end if;
    if (row->>'dayGain')::int is distinct from 40 or (row->>'weekGain')::int is distinct from 65 or (row->>'totalPoints')::int is distinct from 165 then
      raise exception 'FAIL fans % row: %', per, row;
    end if;
    if jsonb_typeof(row->'dayGain') <> 'number' or jsonb_typeof(row->'weekGain') <> 'number' then raise exception 'FAIL fans % gains are not numbers', per; end if;
  end loop;
  raise notice 'PASS points and likes rows answer dayGain (likes 3, points 40) and weekGain (likes 5, points 65) in all, week and day';
end $t$;
rollback;

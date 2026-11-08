-- 20261219040000: a like on your own fan post pays nothing (0P, no stamp, no log or wallet row); the like itself is saved.
-- A like on someone else's post pays +1P as before, and the reaction daily cap (5 paid likes a day) still holds.
-- Saves real posts through save_fan_post, likes through set_fan_post_like, then awards them the way the like route does
-- (record_dukjil_action 'reaction', source 'post-like:<post id>', request key from award.ts). Local DB only, one transaction, rolled back.
-- Needs a published fan group page whose creator has two members holding the creator's passport (picked from the data).
-- usage: psql -X -v ON_ERROR_STOP=1 -d byus -f supabase/tests/dukjil/dukjil_self_reaction.sql
do $$ begin if inet_server_addr() is not null and host(inet_server_addr()) not in ('127.0.0.1', '::1') then raise exception 'local database only'; end if; end $$;
begin;

create function pg_temp.req(u uuid, a text, s text) returns uuid language sql as $$
  select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid
  from (select encode(extensions.digest('dukjil:'||u||':'||a||':'||s, 'sha256'), 'hex') h) x $$;
-- The award, or the refusal code as {"error": code} (past the cap with the stamp spent too the function raises DUKJIL_DAILY_LIMIT).
create function pg_temp.like_award(u uuid, c uuid, post uuid) returns jsonb language plpgsql as $$
begin
  perform public.set_fan_post_like(u, post, true);
  return public.record_dukjil_action(u, c, 'reaction', 'post-like:' || post, pg_temp.req(u, 'reaction', 'post-like:' || post), '{}'::jsonb);
exception when others then
  if sqlerrm not like '%DUKJIL_DAILY_LIMIT%' then raise; end if;
  return jsonb_build_object('error', sqlerrm);
end $$;
create function pg_temp.post(u uuid, slug text, body text) returns uuid language sql as $$
  select (public.save_fan_post(u, slug, null, body, 'public', '{}'::uuid[], null, extensions.gen_random_uuid()) ->> 'id')::uuid $$;
create function pg_temp.paid_today(u uuid) returns integer language sql as $$
  select count(*)::integer from public.dukjil_action_log where app_user_id = u and action_key = 'reaction' and points > 0 and kst_date = public.dukjil_kst_date() $$;

do $t$
declare
  g uuid; c uuid; slug text; author uuid; liker uuid; p uuid; r jsonb; before_paid integer; before_rows integer; before_stamps integer;
  before_points bigint; i integer; paid integer;
begin
  select gp.id, gp.celebrity_id, ce.slug into g, c, slug from public.group_pages gp
    join public.celebrities ce on ce.id = gp.celebrity_id and ce.status = 'published' and ce.archived_at is null
    where gp.status = 'published' and gp.kind = 'fan' and not gp.anonymous
      and (select count(*) from public.group_memberships m join public.app_users u on u.id = m.app_user_id and u.status = 'active'
           join public.fan_passports fp on fp.app_user_id = m.app_user_id and fp.celebrity_id = gp.celebrity_id where m.page_id = gp.id) >= 2
    order by gp.id limit 1;
  if g is null then raise exception 'fixture: no fan page with two passport-holding members'; end if;
  select m.app_user_id into author from public.group_memberships m join public.app_users u on u.id = m.app_user_id and u.status = 'active'
    join public.fan_passports fp on fp.app_user_id = m.app_user_id and fp.celebrity_id = c where m.page_id = g order by m.app_user_id limit 1;
  select m.app_user_id into liker from public.group_memberships m join public.app_users u on u.id = m.app_user_id and u.status = 'active'
    join public.fan_passports fp on fp.app_user_id = m.app_user_id and fp.celebrity_id = c where m.page_id = g and m.app_user_id <> author
    order by pg_temp.paid_today(m.app_user_id), m.app_user_id limit 1;
  raise notice 'page % creator % author % liker %', g, c, author, liker;

  -- 1. Own post, own like: the like is saved, 0P, no stamp, no log row, nothing in the wallet, the day's cap untouched.
  p := pg_temp.post(author, slug, '내 글에 내가 좋아요');
  before_paid := pg_temp.paid_today(author);
  select count(*) into before_rows from public.dukjil_action_log where app_user_id = author;
  select count(*) into before_stamps from public.community_stamps where app_user_id = author;
  select coalesce(sum(amount), 0) into before_points from public.mobile_fan_economy_ledger where app_user_id = author and asset::text = 'fan_point';
  r := pg_temp.like_award(author, c, p);
  raise notice 'self like -> %', r;
  if (r ->> 'points')::int is distinct from 0 or r ->> 'stampId' is not null or r ->> 'reason' is distinct from 'SELF_REACTION' or (r ->> 'replayed')::boolean then
    raise exception 'self like answered %', r; end if;
  if not exists(select 1 from public.fan_post_likes where post_id = p and app_user_id = author) then raise exception 'self like not saved'; end if;
  if (select count(*) from public.dukjil_action_log where app_user_id = author) <> before_rows then raise exception 'self like wrote a log row'; end if;
  if (select count(*) from public.community_stamps where app_user_id = author) <> before_stamps then raise exception 'self like issued a stamp'; end if;
  if (select coalesce(sum(amount), 0) from public.mobile_fan_economy_ledger where app_user_id = author and asset::text = 'fan_point') <> before_points then raise exception 'self like moved the wallet'; end if;
  -- the same award again (cancel and re-click, or a retry): still 0, still no row
  r := public.record_dukjil_action(author, c, 'reaction', 'post-like:' || p, pg_temp.req(author, 'reaction', 'post-like:' || p), '{}'::jsonb);
  if (r ->> 'points')::int <> 0 or (select count(*) from public.dukjil_action_log where app_user_id = author) <> before_rows then raise exception 'self like retry %', r; end if;
  if pg_temp.paid_today(author) <> before_paid then raise exception 'self like used the cap'; end if;

  -- 2. Someone else's post: +1P (until the day's 5), and the like of the same post never pays twice.
  before_paid := pg_temp.paid_today(liker);
  raise notice 'liker paid likes today before %', before_paid;
  r := pg_temp.like_award(liker, c, p);
  raise notice 'other like -> %', r;
  if before_paid < 5 then
    if (r ->> 'points')::int is distinct from 1 or (r ->> 'replayed')::boolean then raise exception 'other like answered %', r; end if;
    if not exists(select 1 from public.dukjil_action_log where app_user_id = liker and action_key = 'reaction' and source_key = 'post-like:' || p and points = 1 and ledger_id is not null)
      then raise exception 'other like: no paid row'; end if;
  end if;
  r := public.record_dukjil_action(liker, c, 'reaction', 'post-like:' || p, pg_temp.req(liker, 'reaction', 'post-like:' || p), '{}'::jsonb);
  if not (r ->> 'replayed')::boolean then raise exception 'same post paid again %', r; end if;

  -- 3. Daily cap 5: likes on five more posts of the author pay until 5 paid in the day; past that 0P or DUKJIL_DAILY_LIMIT.
  for i in 1 .. 5 loop
    p := pg_temp.post(author, slug, '한도 확인 ' || i);
    paid := pg_temp.paid_today(liker);
    r := pg_temp.like_award(liker, c, p);
    if paid < 5 then
      if (r ->> 'points')::int is distinct from 1 then raise exception 'like % under the cap answered %', i, r; end if;
    elsif not ((r ->> 'points')::int = 0 and r ->> 'reason' like 'POINT_CAP%' or r ->> 'error' like '%DUKJIL_DAILY_LIMIT%') then
      raise exception 'like % past the cap answered %', i, r;
    end if;
  end loop;
  paid := pg_temp.paid_today(liker);
  raise notice 'liker paid likes today after %', paid;
  if paid <> 5 then raise exception 'paid likes today % (want 5)', paid; end if;

  -- 4. The author liking their own posts while the liker is capped: still 0P with no rows (not a cap answer).
  r := pg_temp.like_award(author, c, p);
  if r ->> 'reason' is distinct from 'SELF_REACTION' then raise exception 'self like on capped day %', r; end if;
  raise notice 'RESULT dukjil_self_reaction ok';
end $t$;

rollback;

#!/usr/bin/env bash
# REVIEW-FUNNEL A: a projection that waits on a locked ledger past its 1s lock_timeout must skip only the event; the
# business write commits. Session A holds ACCESS EXCLUSIVE on fan_product_events for about 5 seconds and always rolls back
# (closing the connection also releases it). Session B, while the lock is held, saves a fan board comment (reads fan_posts,
# then the ledger), a cheer (the day's duplicate check reads the ledger first) and a group post (reads group_pages), checks
# that the rows exist without events, and rolls everything back.
# Shared local database: the ledger is blocked for ~5 seconds. Uses the caller's PG* environment. Database: byus.
set -euo pipefail
psql -X -q -v ON_ERROR_STOP=1 -d byus <<'SQL' &
begin;
select pg_sleep(1.5);
lock table public.fan_product_events in access exclusive mode;
select pg_sleep(5);
rollback;
SQL
HOLDER=$!
trap 'kill "$HOLDER" 2>/dev/null || true' EXIT
psql -X -q -v ON_ERROR_STOP=1 -d byus <<'SQL'
begin;
-- Fixtures with triggers off, so this transaction holds no lock on the ledger before the other session takes it.
set local session_replication_role = replica;
do $$
declare
  fan uuid := '95a00000-0000-4000-8000-000000000011';
  celebrity uuid := '95a00000-0000-4000-8000-000000000021';
  post uuid := '95a00000-0000-4000-8000-000000000031';
begin
  insert into public.app_users(id, privy_user_id, verified_email) values (fan, 'did:privy:funnel-lock-fan', 'funnel-lock-fan@byus.test');
  insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role)
    values (celebrity, 'funnel-lock-creator', 'published', '/fixture.webp', now(), '{creator}', 'creator');
  insert into public.fan_posts(id, celebrity_id, app_user_id, body, idempotency_key, create_request_hash)
    values (post, celebrity, fan, 'lock post', gen_random_uuid(), repeat('0', 64));
  insert into public.group_pages(id, kind, name, celebrity_id) values ('95a00000-0000-4000-8000-000000000041', 'fan', 'Lock page', celebrity);
end $$;
set local session_replication_role = origin;
-- The other session takes the ledger lock at 1.5s.
select pg_sleep(2.5);
do $$
declare
  fan uuid := '95a00000-0000-4000-8000-000000000011';
  celebrity uuid := '95a00000-0000-4000-8000-000000000021';
  started timestamptz := clock_timestamp();
  waited interval;
begin
  if not exists (select 1 from pg_locks l where l.relation = 'public.fan_product_events'::regclass
      and l.mode = 'AccessExclusiveLock' and l.granted and l.pid <> pg_backend_pid()) then
    raise exception 'the ledger is not locked by the other session; nothing was tested';
  end if;
  insert into public.fan_post_comments(id, post_id, app_user_id, body, idempotency_key)
    values ('95a00000-0000-4000-8000-000000000051', '95a00000-0000-4000-8000-000000000031', fan, 'lock comment', gen_random_uuid());
  insert into public.fan_lounge_messages(id, celebrity_id, app_user_id, body, idempotency_key)
    values ('95a00000-0000-4000-8000-000000000061', celebrity, fan, 'lock cheer', gen_random_uuid());
  insert into public.group_posts(id, page_id, author_id, title, body, visibility, anonymous)
    values ('95a00000-0000-4000-8000-000000000071', '95a00000-0000-4000-8000-000000000041', fan, 't', 'b', 'public', false);
  waited := clock_timestamp() - started;
  if (select count(*) from public.fan_post_comments where id = '95a00000-0000-4000-8000-000000000051')
     + (select count(*) from public.fan_lounge_messages where id = '95a00000-0000-4000-8000-000000000061')
     + (select count(*) from public.group_posts where id = '95a00000-0000-4000-8000-000000000071') <> 3 then
    raise exception 'business rows missing';
  end if;
  if waited > interval '4.5 seconds' then raise exception 'writes waited % (lock_timeout not applied)', waited; end if;
  raise notice 'FUNNEL_LOCK_WAIT comment, cheer and group post saved while the ledger was locked, in %: PASS', waited;
end $$;
rollback;
SQL
wait "$HOLDER"
trap - EXIT
psql -X -q -At -d byus -c "select 'ledger locks left: ' || count(*) from pg_locks where relation = 'public.fan_product_events'::regclass and mode = 'AccessExclusiveLock'"

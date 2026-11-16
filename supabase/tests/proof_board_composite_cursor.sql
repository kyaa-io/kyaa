-- Local disposable-database contract test for 20261228200000_proof_board_composite_cursor. Every change rolls back.
-- Needs one approved, publish-consented proof submission to copy (any creator). 21 public posts share ONE timestamp (microseconds kept).
\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;

do $$
declare
  t public.certification_submissions; v_ts timestamptz := '2026-11-01 10:00:00.123456+00'; v_ids uuid[] := '{}'; v_sid uuid; v_pid uuid; i integer;
  v_page jsonb; v_seen uuid[] := '{}'; v_cursor_at timestamptz; v_cursor_id uuid; v_n integer; v_new uuid; v_bad uuid[] := '{}';
begin
  select * into t from public.certification_submissions where status = 'approved' and publish_consent and proof_type is not null limit 1;
  if t.id is null then raise exception 'fixture: no approved consented proof submission to copy'; end if;
  -- clear the creator's real proof posts out of the way for this transaction only
  update public.fan_posts set hidden_at = now() where celebrity_id = t.celebrity_id and category = 'proof';

  for i in 1..21 loop
    v_sid := gen_random_uuid(); v_pid := gen_random_uuid();
    insert into public.certification_submissions select (jsonb_populate_record(null::public.certification_submissions,
      to_jsonb(t) || jsonb_build_object('id', v_sid, 'idempotency_key', gen_random_uuid(), 'attempt_number', 100 + i, 'public_post_id', null))).*;
    insert into public.fan_posts (id, celebrity_id, app_user_id, body, idempotency_key, create_request_hash, created_at, category, source_type, source_id)
      values (v_pid, t.celebrity_id, t.app_user_id, 'same-time ' || i, gen_random_uuid(), 'x', v_ts, 'proof', 'certification_submission', v_sid);
    v_ids := v_ids || v_pid;
  end loop;
  -- excluded: hidden, deleted, no consent, not approved. Same timestamp, so a wrong filter would surface them.
  for i in 1..4 loop
    v_sid := gen_random_uuid(); v_pid := gen_random_uuid();
    insert into public.certification_submissions select (jsonb_populate_record(null::public.certification_submissions,
      to_jsonb(t) || jsonb_build_object('id', v_sid, 'idempotency_key', gen_random_uuid(), 'attempt_number', 200 + i, 'public_post_id', null,
        'publish_consent', i <> 3, 'status', case when i = 4 then 'rejected' else 'approved' end, 'rejection_reason', case when i = 4 then 'not approved' end))).*;
    insert into public.fan_posts (id, celebrity_id, app_user_id, body, idempotency_key, create_request_hash, created_at, category, source_type, source_id, hidden_at, deleted_at)
      values (v_pid, t.celebrity_id, t.app_user_id, 'excluded ' || i, gen_random_uuid(), 'x', v_ts, 'proof', 'certification_submission', v_sid,
        case when i = 1 then now() end, case when i = 2 then now() end);
    v_bad := v_bad || v_pid;
  end loop;

  -- page 1 (20 rows), all at the same instant
  v_page := public.read_proof_board(t.celebrity_id, 20);
  if jsonb_array_length(v_page) <> 20 then raise exception 'page 1 expected 20 got %', jsonb_array_length(v_page); end if;
  select array_agg((e->>'postId')::uuid) into v_seen from jsonb_array_elements(v_page) e;
  v_cursor_at := (v_page->19->>'createdAt')::timestamptz; v_cursor_id := (v_page->19->>'postId')::uuid;
  if v_cursor_at <> v_ts then raise exception 'microseconds lost in createdAt: %', v_page->19->>'createdAt'; end if;

  -- a new post appears after page 1; it must not push an unread one out of the next page
  v_new := gen_random_uuid();
  insert into public.certification_submissions select (jsonb_populate_record(null::public.certification_submissions,
    to_jsonb(t) || jsonb_build_object('id', gen_random_uuid(), 'idempotency_key', gen_random_uuid(), 'attempt_number', 300, 'public_post_id', null))).*;
  insert into public.fan_posts (id, celebrity_id, app_user_id, body, idempotency_key, create_request_hash, created_at, category, source_type, source_id)
    select v_new, t.celebrity_id, t.app_user_id, 'newer', gen_random_uuid(), 'x', v_ts + interval '1 hour', 'proof', 'certification_submission', id
      from public.certification_submissions where attempt_number = 300 and app_user_id = t.app_user_id order by submitted_at desc limit 1;

  -- legacy time-only cursor: documents the old gap (the remaining row at the same instant is skipped)
  select jsonb_array_length(public.read_proof_board(t.celebrity_id, 20, v_cursor_at)) into v_n;
  if v_n <> 0 then raise exception 'legacy time-only cursor expected to skip same-instant rows, got %', v_n; end if;

  -- composite cursor: the remaining 1 row, then nothing
  v_page := public.read_proof_board(t.celebrity_id, 20, v_cursor_at, null, v_cursor_id);
  if jsonb_array_length(v_page) <> 1 then raise exception 'page 2 expected 1 got %', jsonb_array_length(v_page); end if;
  v_seen := v_seen || (v_page->0->>'postId')::uuid;
  v_cursor_at := (v_page->0->>'createdAt')::timestamptz; v_cursor_id := (v_page->0->>'postId')::uuid;
  if jsonb_array_length(public.read_proof_board(t.celebrity_id, 20, v_cursor_at, null, v_cursor_id)) <> 0 then raise exception 'page 3 expected empty'; end if;

  if (select count(distinct x) from unnest(v_seen) x) <> 21 or cardinality(v_seen) <> 21 then raise exception 'expected 21 unique posts, got % (% unique)', cardinality(v_seen), (select count(distinct x) from unnest(v_seen) x); end if;
  if not (v_seen @> v_ids and v_ids @> v_seen) then raise exception 'seen ids differ from the 21 fixtures'; end if;
  if v_seen && v_bad then raise exception 'hidden/deleted/unconsented/unapproved post leaked'; end if;
  if v_new = any(v_seen) then raise exception 'post newer than the cursor must not appear on later pages'; end if;
  -- the newer post is the first row of a fresh read
  if (public.read_proof_board(t.celebrity_id, 20)->0->>'postId')::uuid <> v_new then raise exception 'newest post should lead a fresh read'; end if;
  raise notice 'proof_board_composite_cursor: ok';
end $$;

rollback;

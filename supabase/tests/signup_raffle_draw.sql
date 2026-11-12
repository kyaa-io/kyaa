-- 20261226050000_signup_raffle_draw.sql (security follow-up F-03): one stored draw per event.
-- Run after the migration. Everything here rolls back.
begin;
set local role service_role;
do $$
declare
  v_closed timestamptz := now() - interval '1 minute';
  v_open timestamptz := now() + interval '1 day';
  v_admin constant uuid := 'ab260500-0000-4000-8000-0000000000a1';
  v_allow constant uuid := 'ab260500-0000-4000-8000-0000000000a2';
  v_first jsonb; v_again jsonb; v_refused boolean := false;
  v_candidates constant jsonb := '[{"userId":"ab260500-0000-4000-8000-000000000001","entries":3},{"userId":"ab260500-0000-4000-8000-000000000002","entries":1}]';
  v_winner_a constant jsonb := '[{"userId":"ab260500-0000-4000-8000-000000000001","entries":3}]';
  v_winner_b constant jsonb := '[{"userId":"ab260500-0000-4000-8000-000000000002","entries":1}]';
begin
  -- a draw before the close is refused and nothing is kept
  begin
    perform public.record_signup_raffle_draw('test-open-event', v_open, repeat('a',64), v_admin, v_allow, v_candidates, v_winner_a);
  exception when others then
    v_refused := sqlerrm = 'SIGNUP_RAFFLE_NOT_CLOSED';
  end;
  assert v_refused, 'a draw before the close must be refused';
  assert public.read_signup_raffle_draw('test-closed-event') is null, 'no stored draw yet';
  -- the first draw after the close is stored
  v_first := public.record_signup_raffle_draw('test-closed-event', v_closed, repeat('a',64), v_admin, v_allow, v_candidates, v_winner_a);
  assert (v_first->>'created')::boolean and v_first->'winners' = v_winner_a, 'first draw is stored';
  assert v_first->>'seedSha256' = encode(extensions.digest(repeat('a',64), 'sha256'), 'hex'), 'seed hash is kept';
  -- a second draw (another seed, other winners, another admin) returns the stored winners unchanged
  v_again := public.record_signup_raffle_draw('test-closed-event', v_closed, repeat('b',64), 'ab260500-0000-4000-8000-0000000000b1', v_allow, v_candidates, v_winner_b);
  assert not (v_again->>'created')::boolean and v_again->'winners' = v_winner_a and v_again->>'seedSha256' = v_first->>'seedSha256' and v_again->>'drawnAt' = v_first->>'drawnAt', 'second draw returns the first';
  assert public.read_signup_raffle_draw('test-closed-event') = v_again, 'the lookup returns the stored draw';
  assert public.read_signup_raffle_draw('test-open-event') is null, 'a refused draw stores nothing';
  -- a stored draw stays readable even when a later call passes a close time in the future
  v_again := public.record_signup_raffle_draw('test-closed-event', v_open, repeat('c',64), v_admin, v_allow, v_candidates, v_winner_b);
  assert v_again->'winners' = v_winner_a, 'stored draw wins over later input';
  -- malformed seed is refused by the table
  v_refused := false;
  begin
    perform public.record_signup_raffle_draw('test-bad-seed', v_closed, 'request-id', v_admin, v_allow, v_candidates, v_winner_a);
  exception when check_violation then v_refused := true;
  end;
  assert v_refused, 'a seed that is not 32 random bytes in hex must be refused';
end
$$;
-- the API role cannot read or change stored draws directly
do $$
declare v_denied integer := 0;
begin
  begin perform 1 from public.signup_raffle_draws; exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin update public.signup_raffle_draws set winners = '[]'; exception when insufficient_privilege then v_denied := v_denied + 1; end;
  begin delete from public.signup_raffle_draws; exception when insufficient_privilege then v_denied := v_denied + 1; end;
  assert v_denied = 3, 'service_role must not touch signup_raffle_draws directly';
end
$$;
reset role;
do $$
begin
  assert (select count(*) from public.signup_raffle_draws where event_id like 'test-%') = 1, 'exactly one stored draw';
  assert (select drawn_by_app_user_id from public.signup_raffle_draws where event_id = 'test-closed-event') = 'ab260500-0000-4000-8000-0000000000a1', 'the first admin is recorded';
  assert (select relrowsecurity and relforcerowsecurity from pg_catalog.pg_class where oid = 'public.signup_raffle_draws'::regclass), 'row level security is on and forced';
  assert not has_function_privilege('anon', 'public.record_signup_raffle_draw(text,timestamptz,text,uuid,uuid,jsonb,jsonb)', 'execute')
     and not has_function_privilege('authenticated', 'public.record_signup_raffle_draw(text,timestamptz,text,uuid,uuid,jsonb,jsonb)', 'execute')
     and not has_function_privilege('anon', 'public.read_signup_raffle_draw(text)', 'execute')
     and not has_function_privilege('authenticated', 'public.read_signup_raffle_draw(text)', 'execute'), 'only the server role may draw or read the draw';
end
$$;
rollback;

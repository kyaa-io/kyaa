\set ON_ERROR_STOP on
begin;

create function pg_temp.funnel_check(p_condition boolean, p_message text) returns void
language plpgsql as $$ begin
  if p_condition is distinct from true then raise exception '%', p_message; end if;
end $$;
create function pg_temp.funnel_rejects(p_statement text, p_sqlstate text) returns void
language plpgsql as $$ declare caught boolean := false; begin
  begin execute p_statement;
  exception when others then
    if sqlstate <> p_sqlstate then raise exception 'Unexpected error % %: %', sqlstate, sqlerrm, p_statement; end if;
    caught := true;
  end;
  if not caught then raise exception 'Expected % for: %', p_sqlstate, p_statement; end if;
end $$;
create function pg_temp.funnel_events(p_event text, p_entity uuid) returns bigint
language sql as $$
  select count(*) from public.fan_product_events
  where event_name = p_event and idempotency_key = 'server:' || p_event || ':' || p_entity::text
$$;

do $$
declare
  admin_user uuid := '95800000-0000-4000-8000-000000000001';
  admin_allowlist uuid := '95800000-0000-4000-8000-000000000002';
  fan uuid := '95800000-0000-4000-8000-000000000011';
  other_fan uuid := '95800000-0000-4000-8000-000000000012';
  celebrity uuid := '95800000-0000-4000-8000-000000000021';
  quiz uuid := '95800000-0000-4000-8000-000000000031';
  attempt uuid := '95800000-0000-4000-8000-000000000041';
  attendance uuid := '95800000-0000-4000-8000-000000000051';
  cheer uuid := '95800000-0000-4000-8000-000000000061';
  reply uuid := '95800000-0000-4000-8000-000000000062';
  page jsonb := '{"pageKind":"community","entry":true,"channel":"social","device":"mobile","browser":"instagram","os":"ios"}';
  first_result jsonb;
  replay_result jsonb;
  traffic_before jsonb;
  traffic_after jsonb;
  funnel_before jsonb;
  funnel_after jsonb;
  bad jsonb;
begin
  insert into public.app_users(id, privy_user_id, verified_email) values
    (admin_user, 'did:privy:funnel-admin', 'funnel-admin@byus.test'),
    (fan, 'did:privy:funnel-fan', 'funnel-fan@byus.test'),
    (other_fan, 'did:privy:funnel-other', 'funnel-other@byus.test');
  insert into public.admin_allowlist(id, email, role, active) values (admin_allowlist, 'funnel-admin@byus.test', 'viewer', true);

  traffic_before := public.read_admin_web_traffic(admin_user, admin_allowlist, 7);
  funnel_before := public.read_admin_funnel_analytics(admin_user, admin_allowlist, 7);
  perform pg_temp.funnel_check(jsonb_array_length(traffic_before->'trend') = 7, 'trend has one row per UTC day');
  perform pg_temp.funnel_check((traffic_before->>'to')::timestamptz - (traffic_before->>'from')::timestamptz = interval '7 days', '7-day window ends after UTC today');

  -- page_view: anonymous only, fixed keys, replay is idempotent.
  first_result := public.record_product_event_v1(1::smallint, 'page_view', null, repeat('a', 64), null, null, null, null,
    'web.page_view', 'page-view:95800000-0000-4000-8000-000000000101', statement_timestamp(), page);
  replay_result := public.record_product_event_v1(1::smallint, 'page_view', null, repeat('a', 64), null, null, null, null,
    'web.page_view', 'page-view:95800000-0000-4000-8000-000000000101', statement_timestamp(), page);
  perform pg_temp.funnel_check(first_result->>'id' = replay_result->>'id' and (replay_result->>'replayed')::boolean, 'page_view replay');
  perform public.record_product_event_v1(1::smallint, 'page_view', null, repeat('a', 64), null, null, null, null,
    'web.page_view', 'page-view:95800000-0000-4000-8000-000000000102', statement_timestamp(),
    page || '{"pageKind":"login","entry":false,"channel":"internal"}');
  perform public.record_product_event_v1(1::smallint, 'page_view', null, repeat('b', 64), null, null, null, null,
    'web.page_view', 'page-view:95800000-0000-4000-8000-000000000103', statement_timestamp(), page);

  foreach bad in array array[
    page || '{"path":"/community?creator=elina&post=1"}',
    page || '{"pageKind":"/my/settings"}',
    page || '{"entry":"yes"}',
    page || '{"entry":false}',
    page - 'os'
  ] loop
    perform pg_temp.funnel_rejects(format($f$select public.record_product_event_v1(1::smallint,'page_view',null,repeat('a',64),null,null,null,null,
      'web.page_view','page-view:95800000-0000-4000-8000-000000000199',statement_timestamp(),%L::jsonb)$f$, bad), '22023');
  end loop;
  perform pg_temp.funnel_rejects(format($f$select public.record_product_event_v1(1::smallint,'page_view',%L::uuid,null,null,null,null,null,
    'web.page_view','page-view:95800000-0000-4000-8000-000000000198',statement_timestamp(),%L::jsonb)$f$, fan, page), '22023');
  perform pg_temp.funnel_rejects(format($f$select public.record_product_event_v1(1::smallint,'page_view',null,repeat('a',64),null,null,null,null,
    'web.page_view','page-view:not-a-uuid-key',statement_timestamp(),%L::jsonb)$f$, page), '22023');

  -- share_completed: member or anonymous, method and content kind only.
  perform public.record_product_event_v1(1::smallint, 'share_completed', fan, null, null, null, null, null,
    'web.share', 'share:95800000-0000-4000-8000-000000000111:completed', statement_timestamp(), '{"method":"copy","contentType":"post"}');
  perform pg_temp.funnel_rejects($f$select public.record_product_event_v1(1::smallint,'share_completed',null,repeat('a',64),null,null,null,null,
    'web.share','share:95800000-0000-4000-8000-000000000112:completed',statement_timestamp(),'{"method":"copy","contentType":"post","url":"https://kyaa.io/x"}')$f$, '22023');

  -- Server events come only from the business row; a forged projection is refused (below, after fixtures).
  insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role)
    values (celebrity, 'funnel-test-creator', 'published', '/fixture.webp', now(), '{creator}', 'creator');
  insert into public.celebrity_quizzes(id, celebrity_id, version) values (quiz, celebrity, 1);

  perform pg_temp.funnel_rejects(format($f$select public.record_product_event_v1(1::smallint,'cheer_completed',%L::uuid,null,%L::uuid,null,null,null,
    'server.commit_projection','server:cheer_completed:%s',statement_timestamp(),'{"businessEntityId":"%s"}')$f$, fan, celebrity, cheer, cheer), '23514');

  -- Quiz: start, then a failed submission with its reason code.
  insert into public.quiz_attempts(id, app_user_id, celebrity_id, quiz_id, quiz_version, idempotency_key)
    values (attempt, fan, celebrity, quiz, 1, gen_random_uuid());
  perform pg_temp.funnel_check(pg_temp.funnel_events('fan_verification_started', attempt) = 1, 'quiz start projected');
  update public.quiz_attempts set status = 'failed', score = 1, submitted_at = statement_timestamp() where id = attempt;
  perform pg_temp.funnel_check(pg_temp.funnel_events('fan_verification_submitted', attempt) = 1, 'quiz submit projected');
  perform pg_temp.funnel_check((select properties = jsonb_build_object('outcome','failed','reason','score_below_pass','score',1,'businessEntityId',attempt)
    from public.fan_product_events where idempotency_key = 'server:fan_verification_submitted:' || attempt), 'failure reason and score');
  -- Replaying the projection with the same row is idempotent; a different score conflicts.
  replay_result := public.record_product_event_v1(1::smallint, 'fan_verification_submitted', fan, null, celebrity, null, null, null,
    'server.commit_projection', 'server:fan_verification_submitted:' || attempt,
    (select occurred_at from public.fan_product_events where idempotency_key = 'server:fan_verification_submitted:' || attempt),
    jsonb_build_object('outcome','failed','reason','score_below_pass','score',1,'businessEntityId',attempt));
  perform pg_temp.funnel_check((replay_result->>'replayed')::boolean, 'server event replay');
  perform pg_temp.funnel_rejects(format($f$select public.record_product_event_v1(1::smallint,'fan_verification_submitted',%L::uuid,null,%L::uuid,null,null,null,
    'server.commit_projection','server:fan_verification_submitted:%s',statement_timestamp(),'{"outcome":"passed","reason":"none","score":3,"businessEntityId":"%s"}')$f$,
    fan, celebrity, attempt, attempt), '23514');

  -- Daily check-in and cheer (top-level only; a reply is not a cheer).
  insert into public.group_creator_attendance(id, app_user_id, celebrity_id, attendance_date, streak, points, request_key, policy_version)
    values (attendance, fan, celebrity, (statement_timestamp() at time zone 'UTC')::date, 1, 0, gen_random_uuid(), 1);
  perform pg_temp.funnel_check(pg_temp.funnel_events('daily_checkin_completed', attendance) = 1, 'check-in projected');
  insert into public.fan_lounge_messages(id, celebrity_id, app_user_id, body, idempotency_key)
    values (cheer, celebrity, fan, 'funnel cheer', gen_random_uuid());
  insert into public.fan_lounge_messages(id, celebrity_id, app_user_id, body, idempotency_key, reply_to_id)
    values (reply, celebrity, other_fan, 'funnel reply', gen_random_uuid(), cheer);
  perform pg_temp.funnel_check(pg_temp.funnel_events('cheer_completed', cheer) = 1, 'cheer projected');
  perform pg_temp.funnel_check(pg_temp.funnel_events('cheer_completed', reply) = 0, 'reply is not a cheer');

  -- Aggregates move by exactly what this test added.
  traffic_after := public.read_admin_web_traffic(admin_user, admin_allowlist, 7);
  perform pg_temp.funnel_check((traffic_after#>>'{totals,pageviews}')::int - (traffic_before#>>'{totals,pageviews}')::int = 3, 'three page views');
  perform pg_temp.funnel_check((traffic_after#>>'{totals,visitors}')::int - (traffic_before#>>'{totals,visitors}')::int = 2, 'two sessions');
  funnel_after := public.read_admin_funnel_analytics(admin_user, admin_allowlist, 7);
  perform pg_temp.funnel_check((funnel_after#>>'{steps,visitors}')::int - (funnel_before#>>'{steps,visitors}')::int = 2, 'funnel visitors');
  perform pg_temp.funnel_check((funnel_after#>>'{steps,accountCreated}')::int - (funnel_before#>>'{steps,accountCreated}')::int = 0,
    'accounts made inside this transaction share the snapshot of funnel_before');
  -- fan: check-in + cheer + share, other_fan: reply only (a reply is not an activity).
  perform pg_temp.funnel_check((funnel_after#>>'{steps,firstActivity}')::int - (funnel_before#>>'{steps,firstActivity}')::int = 1, 'one first-activity member');
  perform pg_temp.funnel_check(funnel_after->>'pageViewsSince' is not null, 'collection start reported');

  -- Admin gate.
  perform pg_temp.funnel_rejects(format('select public.read_admin_funnel_analytics(%L::uuid,%L::uuid,7)', fan, admin_allowlist), 'P0001');
  perform pg_temp.funnel_rejects(format('select public.read_admin_web_traffic(%L::uuid,%L::uuid,14)', admin_user, admin_allowlist), '22023');
  raise notice 'FUNNEL_EVENTS page_view/share validation, server projections, replay, aggregates, admin gate: PASS';
end $$;

do $$ begin
  if has_function_privilege('anon', 'public.read_admin_web_traffic(uuid,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.read_admin_funnel_analytics(uuid,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.project_funnel_activity_event_v1()', 'execute')
     or not has_function_privilege('service_role', 'public.read_admin_funnel_analytics(uuid,uuid,integer)', 'execute')
     or not has_function_privilege('service_role', 'public.read_admin_web_traffic(uuid,uuid,integer)', 'execute') then
    raise exception 'FUNNEL_EVENTS grants';
  end if;
  raise notice 'FUNNEL_EVENTS grants: PASS';
end $$;

do $$
declare
  fan uuid := '95800000-0000-4000-8000-000000000011';
  celebrity uuid := '95800000-0000-4000-8000-000000000021';
  post uuid := '95800000-0000-4000-8000-000000000071';
  comment uuid := '95800000-0000-4000-8000-000000000072';
begin
  insert into public.fan_posts(id, celebrity_id, app_user_id, body, idempotency_key, create_request_hash)
    values (post, celebrity, fan, 'funnel post', gen_random_uuid(), repeat('0', 64));
  insert into public.fan_post_comments(id, post_id, app_user_id, body, idempotency_key)
    values (comment, post, fan, 'funnel comment', gen_random_uuid());
  perform pg_temp.funnel_check((select properties->>'category' from public.fan_product_events
    where idempotency_key = 'server:post_created:' || post) = 'general', 'post projected');
  perform pg_temp.funnel_check((select properties->>'reply' from public.fan_product_events
    where idempotency_key = 'server:comment_created:' || comment) = 'false', 'comment projected');
  raise notice 'FUNNEL_EVENTS post and comment projections: PASS';
end $$;

rollback;

\set ON_ERROR_STOP on
-- Platform fan ranking (20261213060000): hearts from hidden pages do not count, sanctioned and blocked people leave the list,
-- the row names nobody by id, and an ordinary definer owner works the same. Replay runs as a superuser, so the ordinary owner is built here.
-- Scores are written in a week of 2099, so the real rows in a shared database do not change the result.
begin;
create role platform_fan_ranking_owner nologin nosuperuser nobypassrls;
grant usage on schema public, extensions to platform_fan_ranking_owner;
do $$
declare
  at_ts constant timestamptz := '2099-01-07 12:00+09';
  shown_cel uuid := extensions.gen_random_uuid(); anon_cel uuid := extensions.gen_random_uuid(); hidden_cel uuid := extensions.gen_random_uuid();
  top uuid := extensions.gen_random_uuid(); second uuid := extensions.gen_random_uuid(); sanctioned uuid := extensions.gen_random_uuid();
  anon_only uuid := extensions.gen_random_uuid(); blocker uuid := extensions.gen_random_uuid(); viewer uuid := extensions.gen_random_uuid();
  u uuid; c uuid; result jsonb; nick text; raised boolean; state text; n integer;
begin
  foreach c in array array[shown_cel, anon_cel, hidden_cel] loop
    insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role) values (c, 'pfr-' || left(c::text, 8), 'published', '/fixture.webp', now(), '{creator}', 'creator');
    insert into public.celebrity_localizations(celebrity_id, locale, name, summary, image_alt) values (c, 'ko', '랭킹 검증', '소개', '사진');
  end loop;
  insert into public.group_pages(kind, celebrity_id, name) values ('fan', shown_cel, 'Shown');
  insert into public.group_pages(kind, celebrity_id, name, anonymous) values ('fan', anon_cel, 'Anonymous', true);
  insert into public.group_pages(kind, celebrity_id, name, status) values ('fan', hidden_cel, 'Hidden', 'hidden');
  foreach u in array array[top, second, sanctioned, anon_only, blocker, viewer] loop
    insert into public.app_users(id, privy_user_id, verified_email) values (u, 'did:privy:pfr-' || u, u || '@example.test');
    insert into public.user_profiles(app_user_id, nickname, nickname_normalized) values (u, 'pfr' || left(u::text, 8), 'pfr' || left(u::text, 8));
  end loop;
  insert into public.user_blocks(app_user_id, blocked_app_user_id) values (blocker, viewer);
  set local session_replication_role = replica;
  -- top 4, sanctioned 3, second 2 (+5 on hidden pages that must not count), blocker 1, anon_only only on hidden pages, viewer 1.
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id, created_at)
  select x.cel, x.who, 1, 'passport_page_claim', extensions.gen_random_uuid(), at_ts - interval '1 hour' from (values
    (shown_cel, top), (shown_cel, top), (shown_cel, top), (shown_cel, top),
    (shown_cel, sanctioned), (shown_cel, sanctioned), (shown_cel, sanctioned),
    (shown_cel, second), (shown_cel, second), (anon_cel, second), (anon_cel, second), (anon_cel, second), (hidden_cel, second), (hidden_cel, second),
    (shown_cel, blocker), (shown_cel, viewer), (anon_cel, anon_only), (hidden_cel, anon_only)) as x(cel, who);
  insert into public.app_user_moderation_restrictions(app_user_id, report_id, reason, actor_admin_id) values (sanctioned, extensions.gen_random_uuid(), '랭킹 시험용 제재 사유입니다', extensions.gen_random_uuid());
  set local session_replication_role = origin;
  perform public.refresh_ranking_snapshots(at_ts);

  result := public.read_platform_fan_ranking('week', null, 10, at_ts);
  if exists (select 1 from jsonb_array_elements(result -> 'rows') r where (select array_agg(k order by k) from jsonb_object_keys(r) k) <> array['characterId', 'isMe', 'nickname', 'rank', 'score', 'tier'])
    then raise exception 'Row has other keys: %', result; end if;
  foreach u in array array[top, second, sanctioned, anon_only, blocker, viewer] loop
    if result::text like '%' || u::text || '%' then raise exception 'A member id is in the answer: %', result; end if;
  end loop;
  -- Sanctioned leaves and the ranks close up: top 1, second 2. Hidden-page hearts are not in second's score, and anon_only is not listed.
  if (result -> 'rows' -> 0 ->> 'nickname') <> 'pfr' || left(top::text, 8) or (result -> 'rows' -> 0 ->> 'score')::int <> 4 then raise exception 'Top row wrong: %', result; end if;
  if (result -> 'rows' -> 1 ->> 'nickname') <> 'pfr' || left(second::text, 8) or (result -> 'rows' -> 1 ->> 'score')::int <> 2 or (result -> 'rows' -> 1 ->> 'rank')::int <> 2 then raise exception 'Second row wrong: %', result; end if;
  if result::text like '%pfr' || left(sanctioned::text, 8) || '%' then raise exception 'Sanctioned fan listed: %', result; end if;
  if result::text like '%pfr' || left(anon_only::text, 8) || '%' then raise exception 'Hidden-page hearts counted: %', result; end if;
  if (result -> 'rows' -> 0 ->> 'tier') is null then raise exception 'No grade on a counted fan: %', result; end if;
  if result -> 'me' <> 'null'::jsonb then raise exception 'Signed-out answer has me: %', result; end if;

  -- The viewer: the blocker leaves, the own row is marked and "me" carries the own rank.
  result := public.read_platform_fan_ranking('week', viewer, 10, at_ts);
  if result::text like '%pfr' || left(blocker::text, 8) || '%' then raise exception 'Blocked fan listed: %', result; end if;
  select count(*) into n from jsonb_array_elements(result -> 'rows') r where (r ->> 'isMe')::boolean and r ->> 'nickname' = 'pfr' || left(viewer::text, 8);
  if n <> 1 then raise exception 'Own row not marked: %', result; end if;
  if (result -> 'me' ->> 'inTop')::boolean is not true then raise exception 'me missing: %', result; end if;
  -- The limit holds and an empty period answers an empty list.
  if jsonb_array_length(public.read_platform_fan_ranking('week', null, 1, at_ts) -> 'rows') <> 1 then raise exception 'Limit ignored'; end if;
  if jsonb_array_length(public.read_platform_fan_ranking('week', null, 10, at_ts + interval '7 days') -> 'rows') <> 0 then raise exception 'Empty week has rows'; end if;

  -- Creator tab by fan count: the anonymous and hidden pages are not named, the shown one counts its active members only.
  insert into public.group_memberships(page_id, app_user_id) select g.id, x.who from public.group_pages g, unnest(array[top, second, sanctioned]) as x(who) where g.celebrity_id in (shown_cel, anon_cel, hidden_cel);
  update public.app_users set status = 'disabled' where id = sanctioned;
  result := public.read_creator_fan_ranking('ko', 50);
  if result::text like '%pfr-' || left(anon_cel::text, 8) || '%' or result::text like '%pfr-' || left(hidden_cel::text, 8) || '%' then raise exception 'Hidden page named: %', result; end if;
  if (select (r ->> 'score')::int from jsonb_array_elements(result -> 'rows') r where r ->> 'slug' = 'pfr-' || left(shown_cel::text, 8)) <> 2 then raise exception 'Fan count wrong: %', result; end if;
  if exists (select 1 from jsonb_array_elements(result -> 'rows') r where (select array_agg(k order by k) from jsonb_object_keys(r) k) <> array['imageUrl', 'jjinfanCount', 'name', 'rank', 'score', 'slug'])
    then raise exception 'Creator row has other keys: %', result; end if;
  update public.app_users set status = 'active' where id = sanctioned;

  -- Only the service role calls it.
  raised := false; begin execute 'set local role anon'; perform public.read_platform_fan_ranking('week', null, 10, at_ts); exception when others then get stacked diagnostics state = returned_sqlstate; raised := state = '42501'; end;
  execute 'reset role';
  if not raised then raise exception 'anon may read: %', state; end if;

  -- An ordinary owner: the gap is reported, then the same answer after the access step, exclusions intact, refresh still writes.
  alter function public.read_platform_fan_ranking(text, uuid, integer, timestamptz) owner to platform_fan_ranking_owner;
  alter function public.platform_fan_heart_counted(uuid) owner to platform_fan_ranking_owner;
  alter function public.ranking_scores(text, uuid, timestamptz, timestamptz) owner to platform_fan_ranking_owner;
  alter function public.ranking_my_rank(text, uuid, text, timestamptz, jsonb, uuid) owner to platform_fan_ranking_owner;
  alter function public.refresh_ranking_snapshots(timestamptz) owner to platform_fan_ranking_owner;
  alter function public.read_creator_fan_ranking(text, integer) owner to platform_fan_ranking_owner;
  raised := false; begin perform public.platform_fan_ranking_owner_check(); exception when others then raised := sqlerrm like 'PLATFORM_FAN_RANKING_OWNER_GAP%'; end;
  if not raised then raise exception 'Owner gap not reported'; end if;
  perform public.platform_fan_ranking_owner_access();
  perform public.platform_fan_ranking_owner_check();
  execute 'set local role service_role';
  result := public.read_platform_fan_ranking('week', viewer, 10, at_ts);
  if (result -> 'rows' -> 0 ->> 'score')::int <> 4 or result::text like '%pfr' || left(sanctioned::text, 8) || '%' or result::text like '%pfr' || left(blocker::text, 8) || '%'
    then raise exception 'Answer changed under an ordinary owner: %', result; end if;
  if (select (r ->> 'score')::int from jsonb_array_elements(public.read_creator_fan_ranking('ko', 50) -> 'rows') r where r ->> 'slug' = 'pfr-' || left(shown_cel::text, 8)) <> 3
    then raise exception 'Creator fan count lost under an ordinary owner'; end if;
  execute 'reset role';
  perform public.refresh_ranking_snapshots(at_ts);
  raise notice 'PASS platform fan ranking';
end $$;
rollback;

-- The rollback stands on the current definitions and leaves the three older kinds as they were.
\ir ../rollback/20261213060000_platform_fan_ranking.sql
do $$
begin
  if to_regprocedure('public.read_platform_fan_ranking(text,uuid,integer,timestamptz)') is not null or to_regprocedure('public.read_creator_fan_ranking(text,integer)') is not null then raise exception 'Rollback left a reader'; end if;
  if pg_catalog.pg_get_functiondef('public.ranking_scores(text,uuid,timestamptz,timestamptz)'::regprocedure) like '%fan_hearts%' then raise exception 'Rollback left the score branch'; end if;
  if pg_catalog.pg_get_functiondef('public.refresh_ranking_snapshots(timestamptz)'::regprocedure) like '%fan_hearts%' then raise exception 'Rollback left the refresh kind'; end if;
  perform public.refresh_ranking_snapshots();
  raise notice 'PASS platform fan ranking rollback';
end $$;

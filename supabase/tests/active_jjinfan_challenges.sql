\set ON_ERROR_STOP on
-- Active 찐팬 100 challenges (20261215020000): only campaigns switched on, only pages the platform rankings may name, newest first,
-- live count, no draft wording of a campaign that is off, service role only. Rolled back.
begin;
do $$
declare
  shown uuid := extensions.gen_random_uuid(); off_cel uuid := extensions.gen_random_uuid(); anon_cel uuid := extensions.gen_random_uuid();
  unlisted uuid := extensions.gen_random_uuid(); newer uuid := extensions.gen_random_uuid(); c uuid; result jsonb; raised boolean; state text;
begin
  set local session_replication_role = replica;
  delete from public.jjinfan_challenge_campaigns;
  foreach c in array array[shown, off_cel, anon_cel, unlisted, newer] loop
    insert into public.celebrities(id, slug, status, image_url, published_at, roles, primary_role) values (c, 'ajc-' || left(c::text, 8), 'published', '/fixture.webp', now(), '{creator}', 'creator');
    insert into public.celebrity_localizations(celebrity_id, locale, name, summary, image_alt) values (c, 'ko', '챌린지 ' || left(c::text, 4), '소개', '사진');
  end loop;
  insert into public.group_pages(kind, celebrity_id, name) values ('fan', shown, 'S'), ('fan', off_cel, 'O'), ('fan', newer, 'N');
  insert into public.group_pages(kind, celebrity_id, name, anonymous) values ('fan', anon_cel, 'A', true);
  insert into public.group_pages(kind, celebrity_id, name, listed) values ('fan', unlisted, 'U', false);
  insert into public.jjinfan_challenge_campaigns(celebrity_id, enabled, title, description, updated_by_admin_allowlist_id, updated_at) values
    (shown, true, '켜진 챌린지', '설명', extensions.gen_random_uuid(), now() - interval '2 days'),
    (newer, true, '새 챌린지', '', extensions.gen_random_uuid(), now() - interval '1 day'),
    (off_cel, false, '꺼진 초안 문구', '초안', extensions.gen_random_uuid(), now()),
    (anon_cel, true, '익명 챌린지', '', extensions.gen_random_uuid(), now()),
    (unlisted, true, '비노출 챌린지', '', extensions.gen_random_uuid(), now());
  insert into public.app_users(id, privy_user_id, verified_email) values (off_cel, 'did:privy:ajc-' || off_cel, off_cel || '@example.test');
  -- 찐팬 = a fan holding a heart (passport_hearts > 0), not a title: one title without hearts does not count, one heart does.
  insert into public.app_users(id, privy_user_id, verified_email) values (newer, 'did:privy:ajc-' || newer, newer || '@example.test');
  insert into public.jjinfan_titles(app_user_id, celebrity_id) values (newer, shown);
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id) values (shown, off_cel, 1, 'passport_page_claim', extensions.gen_random_uuid());
  set local session_replication_role = origin;

  result := public.read_active_jjinfan_challenges('ko', 10);
  if jsonb_array_length(result -> 'items') <> 2 then raise exception 'Wrong set: %', result; end if;
  if result -> 'items' -> 0 ->> 'slug' <> 'ajc-' || left(newer::text, 8) or result -> 'items' -> 1 ->> 'slug' <> 'ajc-' || left(shown::text, 8) then raise exception 'Order wrong: %', result; end if;
  if (result -> 'items' -> 1 ->> 'count')::int <> 1 or (result -> 'items' -> 1 ->> 'target')::int <> 100 then raise exception 'Count wrong: %', result; end if;
  if result::text like '%꺼진 초안%' or result::text like '%익명 챌린지%' or result::text like '%비노출%' then raise exception 'Hidden campaign leaked: %', result; end if;
  if exists (select 1 from jsonb_array_elements(result -> 'items') r where (select array_agg(k order by k) from jsonb_object_keys(r) k) <> array['count', 'description', 'endsOn', 'imageUrl', 'name', 'slug', 'target', 'title'])
    then raise exception 'Item has other keys: %', result; end if;
  if jsonb_array_length(public.read_active_jjinfan_challenges('ko', 1) -> 'items') <> 1 then raise exception 'Limit ignored'; end if;
  -- An end date: shown through its last day (KST), then off everywhere, the page gauge included. Replica: the fixture rows skipped their admin key.
  set local session_replication_role = replica;
  update public.jjinfan_challenge_campaigns set ends_on = (now() at time zone 'Asia/Seoul')::date where celebrity_id = shown;
  if not public.read_active_jjinfan_challenges('ko', 10)::text like '%켜진 챌린지%' then raise exception 'Last day hidden'; end if;
  if public.read_jjinfan_gauge(shown) -> 'campaign' ->> 'endsOn' is null then raise exception 'Gauge lacks endsOn: %', public.read_jjinfan_gauge(shown); end if;
  update public.jjinfan_challenge_campaigns set ends_on = (now() at time zone 'Asia/Seoul')::date - 1 where celebrity_id = shown;
  if public.read_active_jjinfan_challenges('ko', 10)::text like '%켜진 챌린지%' then raise exception 'Ended campaign listed'; end if;
  if public.read_jjinfan_gauge(shown) -> 'campaign' <> 'null'::jsonb then raise exception 'Ended campaign on the gauge: %', public.read_jjinfan_gauge(shown); end if;
  update public.jjinfan_challenge_campaigns set ends_on = null where celebrity_id = shown;
  set local session_replication_role = origin;
  set local session_replication_role = replica; update public.celebrities set status = 'draft', published_at = null where id = newer; set local session_replication_role = origin;
  if public.read_active_jjinfan_challenges('ko', 10)::text like '%새 챌린지%' then raise exception 'Unpublished page listed'; end if;
  delete from public.jjinfan_challenge_campaigns;
  if public.read_active_jjinfan_challenges('ko', 10) <> '{"items": []}'::jsonb then raise exception 'Empty answer wrong'; end if;
  raised := false; begin execute 'set local role anon'; perform public.read_active_jjinfan_challenges('ko', 10); exception when others then get stacked diagnostics state = returned_sqlstate; raised := state = '42501'; end;
  execute 'reset role';
  if not raised then raise exception 'anon may read: %', state; end if;
  -- 20261215100000: the gauge reader counts 찐팬 by hearts; the legacy reader keeps the title count and calls no other function, so an owner
  -- that cannot execute the counter still answers it.
  set local session_replication_role = replica;
  insert into public.jjinfan_challenge_campaigns(celebrity_id, enabled, title, updated_by_admin_allowlist_id) values (shown, true, '켜진 챌린지', extensions.gen_random_uuid());
  set local session_replication_role = origin;
  if (public.read_jjinfan_gauge(shown) ->> 'count')::int <> 1 or (public.read_jjinfan_challenge(shown) ->> 'count')::int <> 1 then raise exception 'Gauge counts wrong: % %', public.read_jjinfan_gauge(shown), public.read_jjinfan_challenge(shown); end if;
  insert into public.app_users(id, privy_user_id, verified_email) values (unlisted, 'did:privy:ajc-' || unlisted, unlisted || '@example.test');
  insert into public.creator_heart_ledger(celebrity_id, app_user_id, amount, source_type, source_id) values (shown, unlisted, 1, 'passport_page_claim', extensions.gen_random_uuid());
  if (public.read_jjinfan_gauge(shown) ->> 'count')::int <> 2 or (public.read_jjinfan_challenge(shown) ->> 'count')::int <> 1 then raise exception 'Gauge must count hearts, legacy titles'; end if;
  if pg_get_functiondef('public.read_jjinfan_challenge(uuid)'::regprocedure) ~ 'creator_jjinfan_count|jjinfan_campaign_open' then raise exception 'Legacy reader calls another function'; end if;
  raised := false; begin execute 'set local role anon'; perform public.read_jjinfan_gauge(shown); exception when others then get stacked diagnostics state = returned_sqlstate; raised := state = '42501'; end;
  execute 'reset role';
  if not raised then raise exception 'anon may read the gauge: %', state; end if;
  raise notice 'PASS active jjinfan challenges';
end $$;
rollback;

-- The rollback, inside a transaction that is rolled back too (its own begin/commit would end this one).
begin;
\set QUIET on
-- Rollback for 20261215020000_active_jjinfan_challenges.sql. Roll the web back first: the new home module and card tags read /api/rankings/challenges,
-- and the new admin screen sends an end date. Stored end dates are dropped; campaigns that had ended show again while switched on.
set local lock_timeout = '5s';
drop function public.read_active_jjinfan_challenges(text, integer);

create or replace function public.read_jjinfan_challenge(p_celebrity uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare n bigint; v_campaign jsonb;
begin
  if not exists (select 1 from public.celebrities c where c.id = p_celebrity and c.status = 'published' and c.archived_at is null) then
    raise exception 'CREATOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  select count(*) into n from public.jjinfan_titles t join public.app_users tu on tu.id = t.app_user_id and tu.status = 'active' where t.celebrity_id = p_celebrity and t.revoked_at is null;
  select pg_catalog.jsonb_build_object('title', c.title, 'description', c.description) into v_campaign
    from public.jjinfan_challenge_campaigns c where c.celebrity_id = p_celebrity and c.enabled;
  return pg_catalog.jsonb_build_object('count', n, 'target', 100, 'campaign', v_campaign);
end $$;

create or replace function public.list_jjinfan_challenge_campaigns(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, false);
  return pg_catalog.jsonb_build_object('items', coalesce((
    select pg_catalog.jsonb_agg(row_to_json(r)::jsonb order by r.enabled desc, r.name, r."celebrityId")
    from (
      select c.id as "celebrityId", c.slug, coalesce(
          (select l.name from public.celebrity_localizations l where l.celebrity_id = c.id order by (l.locale = 'ko') desc, l.locale limit 1), c.slug) as name,
        coalesce(j.enabled, false) as enabled, coalesce(j.title, '') as title, coalesce(j.description, '') as description, j.updated_at as "updatedAt",
        (select count(*) from public.jjinfan_titles t join public.app_users tu on tu.id = t.app_user_id and tu.status = 'active' where t.celebrity_id = c.id and t.revoked_at is null) as count
      from public.celebrities c
      left join public.jjinfan_challenge_campaigns j on j.celebrity_id = c.id
      where c.status = 'published' and c.archived_at is null
    ) r), '[]'::jsonb));
end $$;

drop function public.set_jjinfan_challenge_campaign(uuid, uuid, uuid, uuid, boolean, text, text, date, boolean);
create function public.set_jjinfan_challenge_campaign(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_correlation_id uuid, p_celebrity_id uuid, p_enabled boolean, p_title text, p_description text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_description text := pg_catalog.btrim(coalesce(p_description, ''));
  v_before public.jjinfan_challenge_campaigns%rowtype;
  v_row public.jjinfan_challenge_campaigns%rowtype;
begin
  if p_actor_admin_allowlist_id is null or public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, true) is distinct from 'admin' then
    raise exception 'full admin required';
  end if;
  if p_correlation_id is null or p_enabled is null then raise exception 'JJINFAN_CAMPAIGN_INVALID'; end if;
  if pg_catalog.char_length(v_title) > 80 or pg_catalog.char_length(v_description) > 300 or (p_enabled and v_title = '') then raise exception 'JJINFAN_CAMPAIGN_INVALID'; end if;
  if not exists (select 1 from public.celebrities c where c.id = p_celebrity_id and c.status = 'published' and c.archived_at is null) then raise exception 'CREATOR_NOT_FOUND'; end if;
  select * into v_before from public.jjinfan_challenge_campaigns where celebrity_id = p_celebrity_id for update;
  insert into public.jjinfan_challenge_campaigns(celebrity_id, enabled, title, description, updated_by_admin_allowlist_id)
  values (p_celebrity_id, p_enabled, v_title, v_description, p_actor_admin_allowlist_id)
  on conflict (celebrity_id) do update set enabled = excluded.enabled, title = excluded.title, description = excluded.description,
    updated_by_admin_allowlist_id = excluded.updated_by_admin_allowlist_id, updated_at = now()
  returning * into v_row;
  insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
  values (p_actor_app_user_id, p_actor_admin_allowlist_id, 'jjinfan_campaign.updated', 'jjinfan_campaign', p_celebrity_id::text, p_correlation_id,
    pg_catalog.jsonb_build_object('celebrityId', p_celebrity_id, 'beforeEnabled', coalesce(v_before.enabled, false), 'afterEnabled', v_row.enabled, 'beforeTitle', v_before.title, 'afterTitle', v_row.title, 'beforeDescription', v_before.description, 'afterDescription', v_row.description));
  return pg_catalog.jsonb_build_object('celebrityId', v_row.celebrity_id, 'enabled', v_row.enabled, 'title', v_row.title, 'description', v_row.description, 'updatedAt', v_row.updated_at);
end $$;
revoke all on function public.set_jjinfan_challenge_campaign(uuid, uuid, uuid, uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.set_jjinfan_challenge_campaign(uuid, uuid, uuid, uuid, boolean, text, text) to service_role;

do $owner$
declare reader record;
begin
  select o.rolname, o.rolsuper, pg_catalog.pg_has_role(o.oid, c.relowner, 'USAGE') as acts_as_table_owner into reader
    from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid = p.proowner cross join pg_catalog.pg_class c
   where p.oid = 'public.read_jjinfan_challenge(uuid)'::regprocedure and c.oid = 'public.jjinfan_challenge_campaigns'::regclass;
  if reader.rolsuper or reader.acts_as_table_owner then return; end if;
  execute format('revoke select (ends_on) on public.jjinfan_challenge_campaigns from %I', reader.rolname);
end $owner$;
drop function public.jjinfan_campaign_open(boolean, date, timestamptz);
alter table public.jjinfan_challenge_campaigns drop column ends_on;
do $$ begin
  if to_regprocedure('public.read_active_jjinfan_challenges(text,integer)') is not null then raise exception 'Rollback left the reader'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'jjinfan_challenge_campaigns' and column_name = 'ends_on') then raise exception 'Rollback left ends_on'; end if;
  if to_regprocedure('public.set_jjinfan_challenge_campaign(uuid,uuid,uuid,uuid,boolean,text,text)') is null then raise exception 'Rollback did not restore the old save'; end if;
  raise notice 'PASS active jjinfan challenges rollback';
end $$;
rollback;

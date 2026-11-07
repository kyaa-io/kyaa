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
  insert into public.jjinfan_titles(app_user_id, celebrity_id) values (off_cel, shown);
  set local session_replication_role = origin;

  result := public.read_active_jjinfan_challenges('ko', 10);
  if jsonb_array_length(result -> 'items') <> 2 then raise exception 'Wrong set: %', result; end if;
  if result -> 'items' -> 0 ->> 'slug' <> 'ajc-' || left(newer::text, 8) or result -> 'items' -> 1 ->> 'slug' <> 'ajc-' || left(shown::text, 8) then raise exception 'Order wrong: %', result; end if;
  if (result -> 'items' -> 1 ->> 'count')::int <> 1 or (result -> 'items' -> 1 ->> 'target')::int <> 100 then raise exception 'Count wrong: %', result; end if;
  if result::text like '%꺼진 초안%' or result::text like '%익명 챌린지%' or result::text like '%비노출%' then raise exception 'Hidden campaign leaked: %', result; end if;
  if exists (select 1 from jsonb_array_elements(result -> 'items') r where (select array_agg(k order by k) from jsonb_object_keys(r) k) <> array['count', 'description', 'imageUrl', 'name', 'slug', 'target', 'title'])
    then raise exception 'Item has other keys: %', result; end if;
  if jsonb_array_length(public.read_active_jjinfan_challenges('ko', 1) -> 'items') <> 1 then raise exception 'Limit ignored'; end if;
  set local session_replication_role = replica; update public.celebrities set status = 'draft', published_at = null where id = newer; set local session_replication_role = origin;
  if public.read_active_jjinfan_challenges('ko', 10)::text like '%새 챌린지%' then raise exception 'Unpublished page listed'; end if;
  delete from public.jjinfan_challenge_campaigns;
  if public.read_active_jjinfan_challenges('ko', 10) <> '{"items": []}'::jsonb then raise exception 'Empty answer wrong'; end if;
  raised := false; begin execute 'set local role anon'; perform public.read_active_jjinfan_challenges('ko', 10); exception when others then get stacked diagnostics state = returned_sqlstate; raised := state = '42501'; end;
  execute 'reset role';
  if not raised then raise exception 'anon may read: %', state; end if;
  raise notice 'PASS active jjinfan challenges';
end $$;
rollback;

-- 20261219020000: a post pays the 글쓰기 mission at any length, on a fan page and on a creator's group board.
-- Daily cap (3), one payout per post (a retried award replays), PASSPORT_REQUIRED and the comment minimum (5) stay.
-- Saves real posts through save_fan_post and groups_content_dispatch('post'), then awards them the way the web routes do.
-- Local DB only, one transaction, everything rolls back. Needs a published group page with a creator, one member holding that
-- creator's passport and one member without it (picked from the data; the test stops when none is found).
do $$ begin if inet_server_addr() is not null and host(inet_server_addr()) not in ('127.0.0.1', '::1') then raise exception 'local database only'; end if; end $$;
begin;

create function pg_temp.req(u uuid, a text, s text) returns uuid language sql as $$
  select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid
  from (select encode(extensions.digest('dukjil:'||u||':'||a||':'||s, 'sha256'), 'hex') h) x $$;
create function pg_temp.text_params(t text) returns jsonb language sql as $$
  select jsonb_build_object('chars', char_length(t), 'bodyHash', encode(extensions.digest(convert_to(t, 'utf8'), 'sha256'), 'hex')) $$;
create function pg_temp.award(u uuid, c uuid, source text, t text) returns jsonb language sql as $$
  select public.record_dukjil_action(u, c, 'post', source, pg_temp.req(u, 'post', source), pg_temp.text_params(t)) $$;
-- The award, or the refusal code as {"error": code}: past the cap with the stamp spent too the function raises DUKJIL_DAILY_LIMIT.
create function pg_temp.try_award(u uuid, c uuid, source text, t text) returns jsonb language plpgsql as $$
begin return pg_temp.award(u, c, source, t);
exception when others then return jsonb_build_object('error', sqlerrm); end $$;
create function pg_temp.group_post(u uuid, g uuid, title text, body text) returns uuid language sql as $$
  select (public.groups_content_dispatch('post', u, g, null,
    jsonb_build_object('title', title, 'body', body, 'visibility', 'public', 'requestId', extensions.gen_random_uuid())) ->> 'id')::uuid $$;

do $t$
declare
  g uuid; c uuid; slug text; holder uuid; stranger uuid; p uuid; first_paid uuid; r jsonb; paid_before integer; paid integer; i integer;
  texts text[] := array['응', '좋아요', '오늘 무대 최고', '열아홉 글자짜리 짧은 후기 남겨요', '네 번째'];
begin
  select gp.id, gp.celebrity_id, ce.slug into g, c, slug from public.group_pages gp
    join public.celebrities ce on ce.id = gp.celebrity_id and ce.status = 'published' and ce.archived_at is null
    where gp.status = 'published' and not gp.anonymous
      and exists(select 1 from public.group_memberships m join public.fan_passports fp on fp.app_user_id = m.app_user_id and fp.celebrity_id = gp.celebrity_id where m.page_id = gp.id)
      and exists(select 1 from public.group_memberships m where m.page_id = gp.id and not exists(select 1 from public.fan_passports fp where fp.app_user_id = m.app_user_id and fp.celebrity_id = gp.celebrity_id))
    order by gp.id limit 1;
  if g is null then raise exception 'no group page with a passport holder and a member without one'; end if;
  select m.app_user_id into holder from public.group_memberships m join public.fan_passports fp on fp.app_user_id = m.app_user_id and fp.celebrity_id = c
    where m.page_id = g order by m.app_user_id limit 1;
  select m.app_user_id into stranger from public.group_memberships m where m.page_id = g
    and not exists(select 1 from public.fan_passports fp where fp.app_user_id = m.app_user_id and fp.celebrity_id = c) order by m.app_user_id limit 1;
  select count(*) into paid_before from public.dukjil_action_log where app_user_id = holder and action_key = 'post' and points > 0 and kst_date = public.dukjil_kst_date();
  raise notice 'page % creator % holder % stranger % paid today before %', g, c, holder, stranger, paid_before;

  -- 1-19 characters pay on a group board until the day's 3 paid posts; the next one pays nothing (POINT_CAP), saved all the same.
  for i in 1 .. 5 loop
    p := pg_temp.group_post(holder, g, texts[i], texts[i]);
    if p is null or not exists(select 1 from public.group_posts where id = p and author_id = holder) then raise exception 'group post % not saved', i; end if;
    r := pg_temp.try_award(holder, c, p::text, texts[i] || ' ' || texts[i]);
    if paid_before + i <= 3 then
      if (r ->> 'points')::int is distinct from 20 then raise exception 'short group post % (% chars) paid %', i, char_length(texts[i]) * 2 + 1, r; end if;
      if not exists(select 1 from public.dukjil_action_log where app_user_id = holder and action_key = 'post' and source_key = p::text and points = 20) then raise exception 'no paid log row for group post %', i; end if;
      first_paid := coalesce(first_paid, p);
    elsif not ((r ->> 'points')::int = 0 and r ->> 'reason' like 'POINT_CAP%' or r ->> 'error' = 'DUKJIL_DAILY_LIMIT') then
      raise exception 'post % past the cap answered %', i, r;
    end if;
  end loop;
  select count(*) into paid from public.dukjil_action_log where app_user_id = holder and action_key = 'post' and points > 0 and kst_date = public.dukjil_kst_date();
  if paid <> 3 then raise exception 'paid today % (want 3)', paid; end if;

  -- The same post awarded again replays: no second row, nothing paid twice.
  r := pg_temp.award(holder, c, first_paid::text, '응 응');
  if not (r ->> 'replayed')::boolean or (r ->> 'points')::int <> 20 then raise exception 'retry not replayed %', r; end if;
  if (select count(*) from public.dukjil_action_log where app_user_id = holder and action_key = 'post' and source_key = first_paid::text) <> 1 then raise exception 'retry wrote a second row'; end if;
  select count(*) into paid from public.dukjil_action_log where app_user_id = holder and action_key = 'post' and points > 0 and kst_date = public.dukjil_kst_date();
  if paid <> 3 then raise exception 'retry changed the paid count to %', paid; end if;

  -- A fan-page post: a one-character post is past the length rule (the cap is spent, so the answer is the daily cap, not TOO_SHORT).
  p := (public.save_fan_post(holder, slug, null, '짧', 'public', '{}'::uuid[], null, extensions.gen_random_uuid()) ->> 'id')::uuid;
  r := pg_temp.try_award(holder, c, p::text, '짧');
  if not (r ->> 'reason' like 'POINT_CAP%' or r ->> 'error' = 'DUKJIL_DAILY_LIMIT') then raise exception 'fan post answered %', r; end if;

  -- Without the creator's passport: saved, nothing paid.
  p := pg_temp.group_post(stranger, g, '패스포트 없음', '패스포트 없음');
  begin
    r := pg_temp.award(stranger, c, p::text, '패스포트 없음 패스포트 없음');
    raise exception 'stranger was paid %', r;
  exception when others then
    if position('PASSPORT_REQUIRED' in sqlerrm) = 0 then raise; end if;
  end;
  if exists(select 1 from public.dukjil_action_log where app_user_id = stranger and source_key = p::text) then raise exception 'stranger has a log row'; end if;

  -- The other actions keep their minimum: a 3-character comment is still too short.
  begin
    perform public.record_dukjil_action(holder, c, 'comment', 'short-comment-probe', extensions.gen_random_uuid(), pg_temp.text_params('짧은댓'));
    raise exception 'short comment accepted';
  exception when others then
    if position('DUKJIL_CONTENT_TOO_SHORT' in sqlerrm) = 0 then raise; end if;
  end;
  raise notice 'dukjil_post_any_length ok';
end $t$;

rollback;

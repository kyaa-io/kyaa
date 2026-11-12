-- 20261224000400: a comment pays the 댓글 mission at any length (a fan board post, a notice (아티스트 소식), a group board post all award
-- through record_dukjil_action('comment')). What stays: the daily cap (10), one payout per target (oncePerTarget), a retried award
-- replays, PASSPORT_REQUIRED.
-- Local DB only, one transaction, everything rolls back. Needs a published creator with a passport holder and a user without that passport.
do $$ begin if inet_server_addr() is not null and host(inet_server_addr()) not in ('127.0.0.1', '::1') then raise exception 'local database only'; end if; end $$;
begin;

create function pg_temp.req(u uuid, s text) returns uuid language sql as $$
  select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid
  from (select encode(extensions.digest('dukjil:'||u||':comment:'||s, 'sha256'), 'hex') h) x $$;
-- The award the web routes make: the comment id as the source, the post or notice as the once-per-target key.
create function pg_temp.award(u uuid, c uuid, source text, t text, target text) returns jsonb language plpgsql as $$
begin
  return public.record_dukjil_action(u, c, 'comment', source, pg_temp.req(u, source),
    jsonb_build_object('chars', char_length(t), 'bodyHash', encode(extensions.digest(convert_to(t, 'utf8'), 'sha256'), 'hex'), 'isReply', false, 'targetKey', target));
exception when others then return jsonb_build_object('error', sqlerrm); end $$;

do $t$
declare
  c uuid; holder uuid; stranger uuid; r jsonb; paid_before integer; paid integer; i integer; first_source text;
  texts text[] := array['굿', 'ㅋㅋ', '최고', '와 !', '네', '👍', '좋아요', '응원', '굿굿', '짱', '멋져', '열두 번째'];
begin
  select fp.celebrity_id, fp.app_user_id into c, holder from public.fan_passports fp
    join public.celebrities ce on ce.id = fp.celebrity_id and ce.status = 'published' and ce.archived_at is null
    order by fp.celebrity_id, fp.app_user_id limit 1;
  if holder is null then raise exception 'no passport holder of a published creator'; end if;
  select u.id into stranger from public.app_users u where not exists(select 1 from public.fan_passports fp where fp.app_user_id = u.id and fp.celebrity_id = c) order by u.id limit 1;
  select count(*) into paid_before from public.dukjil_action_log where app_user_id = holder and action_key = 'comment' and points > 0 and kst_date = public.dukjil_kst_date();
  raise notice 'creator % holder % stranger % paid today before %', c, holder, stranger, paid_before;

  -- 1 to 5 character comments on different targets pay until the day's 10 paid comments; the next ones pay nothing.
  for i in 1 .. 12 loop
    r := pg_temp.award(holder, c, 'any-length-probe-' || i, texts[i], 'notice:any-length-probe-' || i);
    if paid_before + i <= 10 then
      if (r ->> 'points')::int is distinct from 3 then raise exception 'short comment % (% chars) answered %', i, char_length(texts[i]), r; end if;
      first_source := coalesce(first_source, 'any-length-probe-' || i);
    elsif not ((r ->> 'points')::int = 0 and r ->> 'reason' like 'POINT_CAP%' or r ->> 'error' = 'DUKJIL_DAILY_LIMIT') then
      raise exception 'comment % past the cap answered %', i, r;
    end if;
  end loop;
  select count(*) into paid from public.dukjil_action_log where app_user_id = holder and action_key = 'comment' and points > 0 and kst_date = public.dukjil_kst_date();
  if paid <> greatest(paid_before, 10) then raise exception 'paid today % (want %)', paid, greatest(paid_before, 10); end if;

  if first_source is not null then
    -- The same comment awarded again replays; a second comment on the same target is refused.
    r := pg_temp.award(holder, c, first_source, '굿', 'notice:' || first_source);
    if not (r ->> 'replayed')::boolean or (r ->> 'points')::int <> 3 then raise exception 'retry not replayed %', r; end if;
    r := pg_temp.award(holder, c, first_source || '-again', '또', 'notice:' || first_source);
    if r ->> 'error' is distinct from 'DUKJIL_REPEAT_TARGET' then raise exception 'second comment on one target answered %', r; end if;
  end if;

  -- Without the creator's passport nothing is paid, whatever the length.
  r := pg_temp.award(stranger, c, 'any-length-stranger', '굿', 'notice:any-length-stranger');
  if r ->> 'error' is distinct from 'PASSPORT_REQUIRED' then raise exception 'stranger answered %', r; end if;
  if exists(select 1 from public.dukjil_action_log where app_user_id = stranger and source_key = 'any-length-stranger') then raise exception 'stranger has a log row'; end if;
  raise notice 'dukjil_comment_any_length ok';
end $t$;

rollback;

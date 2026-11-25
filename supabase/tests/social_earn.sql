-- EARN-SOCIAL-ACTIONS-1126 (20270116040003): record_social_earn limits, duplicates, self actions and the on-chain stamp row.
-- Local or disposable database only (loopback or Unix socket); everything rolls back. Needs a published creator with at least
-- eight passport holders that have an embedded wallet (the local seed's s15-test-creator has them).
do $$ begin if inet_server_addr() is not null and not inet_server_addr() << '127.0.0.0/8'::inet then
  raise exception 'Local database required'; end if; end $$;
begin;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'SOCIAL_EARN_TEST: %', label; end if; end $$;

do $$
declare
  today date := public.dukjil_kst_date(public.dukjil_now());
  day_start timestamptz := public.dukjil_kst_date(public.dukjil_now())::timestamp at time zone 'Asia/Seoul';
  creator uuid; fans uuid[]; a uuid; b uuid; post uuid; ids uuid[] := '{}'; id uuid; r jsonb; i integer; n integer;
  balance_before bigint; friendship uuid; conversation uuid; first_message uuid; second_message uuid; stamp uuid;
begin
  select c.id into creator from public.celebrities c where c.status = 'published' and c.archived_at is null
    and (select count(*) from public.fan_passports fp join public.user_wallets w on w.app_user_id = fp.app_user_id
      and w.chain_id = 91342 and w.provider = 'privy' and w.wallet_type = 'embedded' where fp.celebrity_id = c.id) >= 8
    order by c.created_at limit 1;
  perform pg_temp.assert(creator is not null, 'fixture creator');
  -- Fans with no stamp of the two kinds today and no social rows, so the counts below start at zero.
  select array_agg(u) into fans from (select fp.app_user_id u from public.fan_passports fp
    join public.user_wallets w on w.app_user_id = fp.app_user_id and w.chain_id = 91342 and w.provider = 'privy' and w.wallet_type = 'embedded'
    where fp.celebrity_id = creator and public.dukjil_b3_payable(fp.app_user_id)
      and not exists(select 1 from public.community_stamps s where s.app_user_id = fp.app_user_id and s.celebrity_id = creator
        and s.kind in ('reaction', 'comment') and s.issued_at >= day_start)
      and not exists(select 1 from public.social_friendships f where fp.app_user_id in (f.requester_id, f.addressee_id))
      and not exists(select 1 from public.social_dm_conversations c where fp.app_user_id in (c.user_low_id, c.user_high_id))
      and not exists(select 1 from public.dukjil_action_log l where l.app_user_id = fp.app_user_id
        and l.action_key in ('comment_like', 'comment_reply', 'friend_add', 'chat'))
    order by fp.app_user_id limit 8) picked;
  perform pg_temp.assert(cardinality(fans) = 8, 'fixture fans');
  a := fans[1]; b := fans[2];
  balance_before := public.group_wallet_balance(a, 'fan_point');

  -- Fixture rows are written without the tables' own triggers (notifications, filters, other rewards).
  set local session_replication_role = replica;
  insert into public.fan_posts(celebrity_id, app_user_id, body, idempotency_key, create_request_hash)
    values (creator, b, 'social earn fixture post', extensions.gen_random_uuid(), repeat('0', 64)) returning fan_posts.id into post;
  for i in 1..21 loop
    insert into public.fan_post_comments(post_id, app_user_id, body, idempotency_key)
      values (post, b, 'fixture comment ' || i, extensions.gen_random_uuid()) returning fan_post_comments.id into id;
    ids := ids || id;
    insert into public.mobile_content_comment_reactions(target_type, target_id, app_user_id, emoji) values ('fan_post_comment', id, a, '❤');
  end loop;
  set local session_replication_role = origin;

  -- comment_like: 20 a day, once per comment, the first one issues the day's reaction stamp with a chain lane.
  r := public.record_social_earn(a, 'comment_like', ids[1]);
  perform pg_temp.assert((r ->> 'points')::integer = 1 and not (r ->> 'replayed')::boolean, 'first like pays 1');
  stamp := (r ->> 'stampId')::uuid;
  perform pg_temp.assert(stamp is not null, 'first like issues a stamp');
  perform pg_temp.assert(exists(select 1 from public.community_stamps s where s.id = stamp and s.kind = 'reaction' and s.celebrity_id = creator
    and (s.blockchain_job_id is not null or to_jsonb(s) ->> 'fan_action_outbox_id' is not null or to_jsonb(s) ->> 'onchain_hold_reason' is not null)),
    'stamp row has a chain lane or a hold');
  r := public.record_social_earn(a, 'comment_like', ids[1]);
  perform pg_temp.assert((r ->> 'replayed')::boolean, 'same comment replays');
  for i in 2..20 loop
    r := public.record_social_earn(a, 'comment_like', ids[i]);
    perform pg_temp.assert((r ->> 'points')::integer = 1 and r ->> 'stampId' is null, 'like ' || i || ' pays 1 without a second stamp');
  end loop;
  r := public.record_social_earn(a, 'comment_like', ids[21]);
  perform pg_temp.assert((r ->> 'points')::integer = 0 and (r ->> 'capped')::boolean, '21st like is capped');
  perform pg_temp.assert(public.group_wallet_balance(a, 'fan_point') = balance_before + 20, 'likes add exactly 20');
  select count(*) into n from public.community_stamps s where s.app_user_id = a and s.celebrity_id = creator and s.kind = 'reaction' and s.issued_at >= day_start;
  perform pg_temp.assert(n = 1, 'one reaction stamp for the day');
  -- own comment and a like that is not there
  r := public.record_social_earn(b, 'comment_like', ids[1]);
  perform pg_temp.assert(r ->> 'reason' = 'SOCIAL_EARN_NOT_FOUND', 'no reaction row, no pay');
  set local session_replication_role = replica;
  insert into public.mobile_content_comment_reactions(target_type, target_id, app_user_id, emoji) values ('fan_post_comment', ids[1], b, '❤');
  set local session_replication_role = origin;
  r := public.record_social_earn(b, 'comment_like', ids[1]);
  perform pg_temp.assert(r ->> 'reason' = 'SELF_ACTION' and (r ->> 'points')::integer = 0, 'own comment pays nothing');

  -- comment_reply: 10 a day, once per parent, nothing for a reply to yourself.
  set local session_replication_role = replica;
  for i in 1..11 loop
    insert into public.fan_post_comments(post_id, parent_id, app_user_id, body, idempotency_key)
      values (post, ids[i], a, 'fixture reply ' || i, extensions.gen_random_uuid()) returning fan_post_comments.id into id;
    r := public.record_social_earn(a, 'comment_reply', id);
    perform pg_temp.assert((r ->> 'points')::integer = case when i <= 10 then 1 else 0 end, 'reply ' || i);
    perform pg_temp.assert((r ->> 'stampId' is not null) = (i = 1), 'comment stamp only on the first reply ' || i);
  end loop;
  perform pg_temp.assert((r ->> 'capped')::boolean, '11th reply is capped');
  insert into public.fan_post_comments(post_id, parent_id, app_user_id, body, idempotency_key)
    values (post, ids[1], a, 'second reply to the same comment', extensions.gen_random_uuid()) returning fan_post_comments.id into id;
  r := public.record_social_earn(a, 'comment_reply', id);
  perform pg_temp.assert(r ->> 'reason' = 'DUKJIL_REPEAT_TARGET', 'second reply to the same comment');
  insert into public.fan_post_comments(post_id, parent_id, app_user_id, body, idempotency_key)
    values (post, ids[2], b, 'reply to my own comment', extensions.gen_random_uuid()) returning fan_post_comments.id into id;
  r := public.record_social_earn(b, 'comment_reply', id);
  perform pg_temp.assert(r ->> 'reason' = 'SELF_ACTION', 'reply to own comment');

  -- friend_add: the requester is paid on acceptance, 5 a day, a pair pays once whoever asks later.
  for i in 2..7 loop
    insert into public.social_friendships(requester_id, addressee_id, status, request_id, payload_hash, accepted_at)
      values (a, fans[i], case when i = 2 then 'pending' else 'accepted' end, extensions.gen_random_uuid(), repeat('0', 64), case when i > 2 then now() end)
      returning social_friendships.id into id;
    if i = 2 then friendship := id; end if;
  end loop;
  r := public.record_social_earn(b, 'friend_add', friendship);
  perform pg_temp.assert(r ->> 'reason' = 'SOCIAL_EARN_NOT_FOUND', 'pending friendship pays nothing');
  update public.social_friendships set status = 'accepted', accepted_at = now() where social_friendships.id = friendship;
  balance_before := public.group_wallet_balance(a, 'fan_point');
  r := public.record_social_earn(b, 'friend_add', friendship);
  perform pg_temp.assert((r ->> 'points')::integer = 1, 'acceptance pays');
  perform pg_temp.assert(public.group_wallet_balance(a, 'fan_point') = balance_before + 1, 'the requester is the one paid');
  perform pg_temp.assert(not exists(select 1 from public.dukjil_action_log l where l.app_user_id = b and l.action_key = 'friend_add'), 'the accepter is not paid');
  r := public.record_social_earn(fans[8], 'friend_add', friendship);
  perform pg_temp.assert(r ->> 'reason' = 'SOCIAL_EARN_NOT_FOUND', 'an outsider cannot trigger it');
  n := 0;
  for id in select f.id from public.social_friendships f where f.requester_id = a and f.id <> friendship loop
    r := public.record_social_earn(a, 'friend_add', id); n := n + (r ->> 'points')::integer;
  end loop;
  perform pg_temp.assert(n = 4 and (r ->> 'capped')::boolean, 'five friend rewards a day');
  -- unfriend, then the other side asks: the pair was paid already
  update public.social_friendships set status = 'unfriended', ended_at = now() where social_friendships.id = friendship;
  insert into public.social_friendships(requester_id, addressee_id, status, request_id, payload_hash, accepted_at)
    values (b, a, 'accepted', extensions.gen_random_uuid(), repeat('1', 64), now()) returning social_friendships.id into id;
  r := public.record_social_earn(a, 'friend_add', id);
  perform pg_temp.assert(r ->> 'reason' = 'PAIR_PAID' and (r ->> 'points')::integer = 0, 'a pair pays once');

  -- chat: one a conversation a day, only in an accepted conversation, only the sender.
  insert into public.social_dm_conversations(user_low_id, user_high_id, requester_id, status, request_id, payload_hash)
    values (least(a, b), greatest(a, b), a, 'pending', extensions.gen_random_uuid(), repeat('0', 64)) returning social_dm_conversations.id into conversation;
  insert into public.social_dm_messages(conversation_id, sender_id, body, request_id, payload_hash)
    values (conversation, a, 'hello', extensions.gen_random_uuid(), repeat('0', 64)) returning social_dm_messages.id into first_message;
  insert into public.social_dm_messages(conversation_id, sender_id, body, request_id, payload_hash)
    values (conversation, a, 'hello again', extensions.gen_random_uuid(), repeat('1', 64)) returning social_dm_messages.id into second_message;
  r := public.record_social_earn(a, 'chat', first_message);
  perform pg_temp.assert(r ->> 'reason' = 'SOCIAL_EARN_NOT_FOUND', 'a request not yet accepted pays nothing');
  update public.social_dm_conversations set status = 'accepted' where social_dm_conversations.id = conversation;
  r := public.record_social_earn(b, 'chat', first_message);
  perform pg_temp.assert(r ->> 'reason' = 'SOCIAL_EARN_NOT_FOUND', 'only the sender');
  r := public.record_social_earn(a, 'chat', first_message);
  perform pg_temp.assert((r ->> 'points')::integer = 1 and r ->> 'stampId' is null and not (r ->> 'replayed')::boolean, 'first message of the day pays');
  r := public.record_social_earn(a, 'chat', second_message);
  perform pg_temp.assert((r ->> 'replayed')::boolean, 'second message in the same conversation the same day replays');
  select count(*) into n from public.dukjil_action_log l where l.app_user_id = a and l.action_key = 'chat';
  perform pg_temp.assert(n = 1, 'one chat row');
  set local session_replication_role = origin;

  -- every paid row is a wallet row the history can name
  perform pg_temp.assert(not exists(select 1 from public.dukjil_action_log l
    left join public.mobile_fan_economy_ledger e on e.id = l.ledger_id and e.source_type = 'dukjil_action' and e.source_id = l.id and e.amount = 1
    where l.app_user_id = a and l.action_key in ('comment_like', 'comment_reply', 'friend_add', 'chat') and e.id is null), 'ledger rows');
  begin
    perform public.record_social_earn(a, 'post', ids[1]);
    raise exception 'SOCIAL_EARN_TEST: unknown action accepted';
  exception when raise_exception then
    if sqlerrm not like '%UNKNOWN_ACTION%' then raise; end if;
  end;
end $$;
select 'SOCIAL_EARN_TEST PASS' as result;
rollback;

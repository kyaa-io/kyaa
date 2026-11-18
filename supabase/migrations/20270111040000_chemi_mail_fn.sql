-- The shared notification sink requires a fan notification FK. Keep Chemi
-- deliveries independent and follow the same redacted, database-only sink pattern.
create table public.chemi_mail_test_sink (
  mail_id uuid primary key references public.chemi_mail_outbox(id) on delete cascade,
  template_key text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.chemi_mail_test_sink enable row level security;
revoke all on public.chemi_mail_test_sink from public, anon, authenticated, service_role;

create function public.chemi_mail_channel(p_user uuid) returns uuid
language sql stable set search_path = '' as $$
  select c.id from public.fan_notification_channels c
  join public.app_users u on u.id = c.app_user_id and u.status = 'active'
  where c.app_user_id = p_user and c.kind = 'email' and c.status = 'eligible'
    and c.verified_at is not null and not public.email_channel_delivery_blocked(c.id, now())
  order by c.verified_at desc, c.id limit 1
$$;

create function public.chemi_reminder_set(p_user uuid, p_kind text, p_content text, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  send_day date := (now() at time zone 'Asia/Seoul')::date + 1;
  send_at timestamptz := (send_day + time '09:00') at time zone 'Asia/Seoul';
  reminder uuid;
begin
  perform public.chemi_lock_user(p_user);
  if p_kind is null or p_kind not in ('tomorrow', 'free_ask', 'minor_limit')
    or p_content is null or p_content not in ('', 'saju', 'fortune', 'star', 'tarot')
    or p_enabled is null then
    raise exception 'CHEMI_INVALID';
  end if;
  if p_enabled then
    if public.chemi_mail_channel(p_user) is null then
      raise exception 'CHEMI_MAIL_UNVERIFIED';
    end if;
    insert into public.chemi_remind_requests(user_id, kind, content, send_date, status)
    values (p_user, p_kind, p_content, send_day, 'queued')
    on conflict (user_id, kind, content, send_date) do update set status = 'queued'
    returning id into reminder;
    perform public.chemi_mail_enqueue(p_user, 'remind', 'requested', 'remind:' || reminder, '{}'::jsonb, send_at);
    update public.chemi_mail_outbox set status = 'pending'
    where dedupe_key = 'remind:' || reminder and status = 'cancelled';
  else
    update public.chemi_remind_requests set status = 'cancelled'
    where user_id = p_user and kind = p_kind and content = p_content
      and send_date = send_day
    returning id into reminder;
    update public.chemi_mail_outbox set status = 'cancelled'
    where dedupe_key = 'remind:' || reminder and status = 'pending';
  end if;
  return jsonb_build_object('sendAt', send_at);
end $$;

create function public.chemi_mail_render(p_kind text, p_category text, p_payload jsonb, p_marketing boolean)
returns text language plpgsql immutable set search_path = '' as $$
declare
  body text;
begin
  if p_kind in ('receipt', 'refund') and p_category = 'transactional' then
    if not coalesce(p_payload->>'orderNo' ~ '^C-[0-9]{8}-[0-9]{4,6}$' and
      p_payload->>'amountKrw' ~ '^[1-9][0-9]{0,9}$', false) then return null; end if;
    return (case p_kind when 'receipt' then '[kyaa] 케미 결제 영수증' else '[kyaa] 케미 환불 완료' end)
      || E'\n주문 번호 ' || (p_payload->>'orderNo')
      || E'\n금액 ' || (p_payload->>'amountKrw') || E'원\n'
      || '주식회사 셀리랩 · 대표 김보석 · 사업자등록번호 736-86-03473 · 서울특별시 강남구 도산대로28길 46, 6층';
  end if;
  if p_kind = 'friend' and p_category = 'friend' then
    body := E'[kyaa] 케미 친구 알림\n케미에서 새로운 친구 소식을 확인해 주세요.';
  elsif p_kind = 'remind' and p_category = 'requested' then
    body := E'[kyaa] 신청한 케미 알림\n케미에서 다시 확인해 주세요.';
  elsif p_kind = 'lucky_draw' and p_category = 'marketing_ok' and p_marketing then
    body := '[광고] [kyaa] 케미 소식';
  else
    return null;
  end if;
  if p_marketing then body := body || E'\n케미 럭키드로우 소식을 확인해 보세요.'; end if;
  return body;
end $$;

-- One transaction owns each row lock, records the sink result and completes
-- delivery. A rollback releases the lock and leaves the row ready to retry.
create function public.chemi_mail_drain_test(p_environment text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  job public.chemi_mail_outbox%rowtype;
  body text;
  sent integer := 0;
begin
  if p_environment is distinct from 'dev' then raise exception 'CHEMI_MAIL_TEST_DEV_ONLY'; end if;
  for job in
    select * from public.chemi_mail_outbox
    where status = 'pending' and send_after <= now()
    order by send_after, id limit 50 for update skip locked
  loop
    body := null;
    if public.chemi_mail_channel(job.user_id) is not null
      and (job.category <> 'friend' or coalesce((select friend_activity_notifications and activity_email_notifications
        from public.notification_preferences where app_user_id = job.user_id), true)) then
      body := public.chemi_mail_render(job.kind, job.category, job.payload, coalesce((
        select marketing_notifications from public.notification_preferences where app_user_id = job.user_id
      ), false));
    end if;
    if body is null then
      update public.chemi_mail_outbox set status = 'cancelled', last_error_code = 'CHEMI_MAIL_INELIGIBLE' where id = job.id;
      continue;
    end if;
    insert into public.chemi_mail_test_sink(mail_id, template_key, payload_hash)
    values (job.id, 'chemi:' || job.kind, encode(extensions.digest(body, 'sha256'), 'hex'));
    update public.chemi_mail_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1 where id = job.id;
    sent := sent + 1;
  end loop;
  return sent;
end $$;

revoke all on function public.chemi_mail_channel(uuid), public.chemi_reminder_set(uuid,text,text,boolean),
  public.chemi_mail_render(text,text,jsonb,boolean), public.chemi_mail_drain_test(text)
  from public, anon, authenticated, service_role;
grant execute on function public.chemi_reminder_set(uuid,text,text,boolean), public.chemi_mail_drain_test(text) to service_role;

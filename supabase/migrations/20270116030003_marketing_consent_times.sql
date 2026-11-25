begin;
set local lock_timeout = '5s';

alter table public.notification_preferences
  add column marketing_consented_at timestamptz,
  add column marketing_withdrawn_at timestamptz;

-- Capture transitions from web, mobile and the one-click unsubscribe path.
create function public.record_marketing_consent_time() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.marketing_notifications then
      new.marketing_consented_at := statement_timestamp();
    end if;
  elsif new.marketing_notifications is distinct from old.marketing_notifications then
    if new.marketing_notifications then
      new.marketing_consented_at := statement_timestamp();
    else
      new.marketing_withdrawn_at := statement_timestamp();
    end if;
  end if;
  if (tg_op = 'INSERT' and new.marketing_notifications)
     or (tg_op = 'UPDATE' and new.marketing_notifications is distinct from old.marketing_notifications) then
    insert into public.chemi_mail_outbox(user_id, kind, category, dedupe_key, payload)
    values (new.app_user_id, 'marketing_consent', 'transactional', 'marketing-consent:' || extensions.gen_random_uuid(),
      jsonb_build_object('enabled', new.marketing_notifications, 'processedAt',
        to_char(statement_timestamp() at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') || ' KST'));
  end if;
  return new;
end $$;

create trigger record_marketing_consent_time
before insert or update of marketing_notifications on public.notification_preferences
for each row execute function public.record_marketing_consent_time();

create or replace function public.fan_web_patch_notification_preferences(p_app_user_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if jsonb_typeof(p_patch) <> 'object' or exists (select 1 from jsonb_each(p_patch) x
    where x.key not in ('marketing_notifications','activity_email_notifications','live_reminders','survey_reminders','benefit_notifications','reply_notifications','official_post_notifications','schedule_notifications','artist_activity_notifications','artist_online_notifications','social_notifications','friend_activity_notifications','participation_notifications')
      or jsonb_typeof(x.value) <> 'boolean') then
    raise exception 'INVALID_NOTIFICATION_PREFERENCES' using errcode = '22023'; end if;
  insert into public.notification_preferences(app_user_id) values (p_app_user_id) on conflict do nothing;
  update public.notification_preferences set
    marketing_notifications = coalesce((p_patch ->> 'marketing_notifications')::boolean, marketing_notifications),
    activity_email_updated_at = case when p_patch ? 'activity_email_notifications' and activity_email_notifications is distinct from (p_patch->>'activity_email_notifications')::boolean then now() else activity_email_updated_at end,
    activity_email_updated_via = case when p_patch ? 'activity_email_notifications' and activity_email_notifications is distinct from (p_patch->>'activity_email_notifications')::boolean then 'settings' else activity_email_updated_via end,
    activity_email_notifications = coalesce((p_patch->>'activity_email_notifications')::boolean,activity_email_notifications),
    live_reminders = coalesce((p_patch ->> 'live_reminders')::boolean, live_reminders),
    survey_reminders = coalesce((p_patch ->> 'survey_reminders')::boolean, survey_reminders),
    benefit_notifications = coalesce((p_patch ->> 'benefit_notifications')::boolean, benefit_notifications),
    reply_notifications = coalesce((p_patch ->> 'reply_notifications')::boolean, reply_notifications),
    official_post_notifications = coalesce((p_patch ->> 'official_post_notifications')::boolean, official_post_notifications),
    schedule_notifications = coalesce((p_patch ->> 'schedule_notifications')::boolean, schedule_notifications),
    artist_activity_notifications = coalesce((p_patch ->> 'artist_activity_notifications')::boolean, artist_activity_notifications),
    artist_online_notifications = coalesce((p_patch ->> 'artist_online_notifications')::boolean, artist_online_notifications),
    social_notifications = coalesce((p_patch ->> 'social_notifications')::boolean, social_notifications),
    friend_activity_notifications = coalesce((p_patch ->> 'friend_activity_notifications')::boolean, friend_activity_notifications),
    participation_notifications = coalesce((p_patch ->> 'participation_notifications')::boolean, participation_notifications)
    where app_user_id = p_app_user_id;
end $$;

create or replace function public.chemi_mail_render(p_kind text, p_category text, p_payload jsonb, p_marketing boolean)
returns text language plpgsql immutable set search_path = '' as $$
declare
  body text;
begin
  if p_kind = 'marketing_consent' and p_category = 'transactional' then
    return E'[kyaa] 수신 동의 처리 결과\n전송자: 주식회사 셀리랩(kyaa)\n처리 일시: ' || (p_payload->>'processedAt')
      || E'\n처리 내용: 이벤트·혜택 안내 이메일 수신 '
      || case when (p_payload->>'enabled')::boolean then '동의' else '철회' end;
  end if;
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

create table public.signup_raffle_popup_views (
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  event_id text not null,
  primary key(app_user_id, event_id)
);
alter table public.signup_raffle_popup_views enable row level security;
revoke all on public.signup_raffle_popup_views from public, anon, authenticated;

create function public.claim_signup_raffle_popup(p_user uuid, p_event text, p_start timestamptz, p_end timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('signup-raffle:' || p_user::text, 0));
  if now() not between p_start and p_end or exists (
    select 1 from public.signup_raffle_entries where app_user_id = p_user
  ) then return false; end if;
  insert into public.signup_raffle_popup_views values (p_user, p_event) on conflict do nothing;
  return found;
end $$;
revoke all on function public.claim_signup_raffle_popup(uuid,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_signup_raffle_popup(uuid,text,timestamptz,timestamptz) to service_role;
commit;

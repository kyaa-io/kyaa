-- Populate only on the DEV database with the dedicated negative group ID.
create table public.dev_telegram_certification_target (
  chat_id text primary key check (chat_id ~ '^-[0-9]+$')
);
alter table public.dev_telegram_certification_target enable row level security;
revoke all on public.dev_telegram_certification_target from public, anon, authenticated, service_role;

create table public.dev_telegram_certification_cards (
  id uuid primary key default extensions.gen_random_uuid(),
  submission_id uuid not null references public.certification_submissions(id) on delete cascade,
  revision bigint not null,
  assist_hint text check (assist_hint in ('possible_duplicate', 'original_check')),
  queued_at timestamptz not null default now(),
  claimed_at timestamptz,
  chat_id text,
  message_id bigint,
  has_photo boolean not null default false,
  unique (submission_id, revision)
);

-- Only a separately reviewed, redacted JPEG may be staged here by DEV operators.
-- The worker has no access to original upload paths through this queue.
create table public.dev_telegram_certification_media (
  card_id uuid primary key references public.dev_telegram_certification_cards(id) on delete cascade,
  redacted_jpeg bytea not null check (octet_length(redacted_jpeg) between 4 and 2000000),
  confirmed_at timestamptz not null,
  confirmed_by uuid not null references public.admin_allowlist(id)
);

create table public.dev_telegram_certification_audit (
  card_id uuid primary key,
  submission_id uuid not null,
  actor uuid not null,
  allowlist_id uuid not null,
  telegram_user_id bigint not null,
  decision text not null,
  reason text,
  reviewed_at timestamptz not null default clock_timestamp()
);

alter table public.dev_telegram_certification_cards enable row level security;
alter table public.dev_telegram_certification_media enable row level security;
alter table public.dev_telegram_certification_audit enable row level security;
revoke all on public.dev_telegram_certification_cards, public.dev_telegram_certification_media,
  public.dev_telegram_certification_audit from public, anon, authenticated, service_role;
grant select (id, chat_id, message_id, has_photo), update (message_id, has_photo)
  on public.dev_telegram_certification_cards to service_role;

create function public.enqueue_dev_telegram_certification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.dev_telegram_certification_target)
    and new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.dev_telegram_certification_cards(submission_id, revision)
    values (new.id, new.review_revision) on conflict do nothing;
  end if;
  return new;
end $$;

create trigger enqueue_dev_telegram_certification after insert or update of status
on public.certification_submissions for each row execute function public.enqueue_dev_telegram_certification();

create function public.claim_dev_telegram_certification(p_chat text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare card public.dev_telegram_certification_cards;
begin
  if not exists (select 1 from public.dev_telegram_certification_target where chat_id = p_chat) or exists (
    select 1 from public.telegram_certification_review_settings where chat_id = p_chat
  ) then return null; end if;
  select c.* into card from public.dev_telegram_certification_cards c
  join public.certification_submissions s on s.id = c.submission_id
  where c.claimed_at is null and c.revision = s.review_revision and s.status = 'pending'
    and c.queued_at >= now() - interval '1 day'
  order by c.queued_at, c.id limit 1 for update of c skip locked;
  if not found then return null; end if;
  update public.dev_telegram_certification_cards set claimed_at = now(), chat_id = p_chat where id = card.id;
  return (
    select jsonb_build_object(
      'id', card.id, 'proof', s.proof_type is not null,
      'submittedAt', c.queued_at, 'assistHint', c.assist_hint,
      'nickname', case when length(btrim(p.nickname)) > 1 then left(btrim(p.nickname), 1) || '***' else '***' end,
      'photo', (select encode(m.redacted_jpeg, 'base64')
        from public.dev_telegram_certification_media m join public.admin_allowlist a on a.id = m.confirmed_by
        where m.card_id = card.id and a.active and a.role <> 'viewer' and m.confirmed_at <= now())
    )
    from public.certification_submissions s
    join public.dev_telegram_certification_cards c on c.id = card.id
    left join public.user_profiles p on p.app_user_id = s.app_user_id where s.id = card.submission_id
  );
end $$;

create function public.review_dev_telegram_certification(
  p_card uuid, p_chat text, p_message bigint, p_telegram bigint, p_actor uuid, p_action text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  card public.dev_telegram_certification_cards;
  sub public.certification_submissions;
  allow_id uuid;
  reason text;
  decision text;
begin
  if not exists (select 1 from public.dev_telegram_certification_target where chat_id = p_chat) then
    raise exception 'DEV_TELEGRAM_TARGET_DISABLED';
  end if;
  select a.id into allow_id from public.admin_allowlist a
    join public.app_users u on u.id = p_actor and u.status = 'active' and u.verified_email = a.email
    where a.active and a.role <> 'viewer';
  perform public.assert_certification_admin(p_actor, allow_id);
  select * into card from public.dev_telegram_certification_cards where id = p_card
    and chat_id = p_chat and message_id = p_message for update;
  if not found then raise exception 'DEV_TELEGRAM_CARD_MISMATCH'; end if;
  select * into strict sub from public.certification_submissions where id = card.submission_id;
  if sub.review_revision <> card.revision or sub.status <> 'pending' then
    return jsonb_build_object('status', sub.status, 'photo', card.has_photo);
  end if;
  if p_action = 'reasons' then return jsonb_build_object('status', 'reasons', 'photo', card.has_photo); end if;
  reason := case p_action when 'unclear' then '증빙 내용을 확인하기 어려워요.'
    when 'mismatch' then '신청 내용과 증빙이 일치하지 않아요.'
    when 'missing' then '심사에 필요한 정보가 빠져 있어요.' end;
  if p_telegram is null or p_telegram <= 0 or (p_action is distinct from 'approve' and reason is null) then
    raise exception 'DEV_TELEGRAM_ACTION_INVALID';
  end if;
  decision := case when p_action = 'approve' then 'approved' else 'rejected' end;
  begin
    if sub.proof_type is null then
      perform public.review_admin_certification_submission(p_actor, allow_id, card.id, sub.id, card.id,
        card.revision, case when decision = 'approved' then 'approve' else 'reject' end, reason);
    else
      if (public.review_certification_proof(p_actor, sub.id, card.revision, decision, reason)->>'replayed')::boolean then
        return jsonb_build_object('status', decision, 'photo', card.has_photo);
      end if;
    end if;
    insert into public.dev_telegram_certification_audit(card_id, submission_id, actor, allowlist_id, telegram_user_id, decision, reason)
    values (card.id, sub.id, p_actor, allow_id, p_telegram, decision, reason);
  exception when raise_exception then
    select * into strict sub from public.certification_submissions where id = card.submission_id;
    if sub.review_revision = card.revision and sub.status = 'pending' then raise; end if;
    decision := sub.status::text;
  end;
  return jsonb_build_object('status', decision, 'photo', card.has_photo);
end $$;

revoke all on function public.enqueue_dev_telegram_certification(),
  public.claim_dev_telegram_certification(text),
  public.review_dev_telegram_certification(uuid,text,bigint,bigint,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_dev_telegram_certification(text),
  public.review_dev_telegram_certification(uuid,text,bigint,bigint,uuid,text) to service_role;

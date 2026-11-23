-- Channel operator invitations: a full admin may name a channel operator by email
-- before that person has a kyaa account. The invitation grants nothing by itself.
-- When an active account whose verified (sign-in) email equals the invited email
-- is created or reaches that email, the pending invitation is accepted and the
-- existing channel_operators grant is created for that one channel only.
-- No token is issued: the verified email is the only proof of the recipient.
--
-- Rollback: see supabase/rollback/20270116010000_channel_operator_invitations.sql.

create table public.channel_operator_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  recipient_email text not null check (
    length(recipient_email) <= 254 and recipient_email = lower(btrim(recipient_email))
    and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  locale text not null check (locale in ('ko', 'en')),
  origin text not null check (origin in ('https://dev.kyaa.io', 'https://kyaa.io') or origin ~ '^http://(localhost|127\.0\.0\.1):[0-9]{2,5}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  expires_at timestamptz not null,
  invited_by_app_user_id uuid not null references public.app_users(id) on delete restrict,
  invited_by_admin_allowlist_id uuid not null references public.admin_allowlist(id) on delete restrict,
  accepted_app_user_id uuid references public.app_users(id) on delete restrict,
  channel_operator_id uuid references public.channel_operators(id) on delete restrict,
  accepted_at timestamptz,
  cancelled_by_admin_allowlist_id uuid references public.admin_allowlist(id) on delete restrict,
  cancelled_at timestamptz,
  mail_status text not null default 'pending' check (mail_status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  mail_provider_message_id text check (length(mail_provider_message_id) <= 200),
  mail_sent_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint channel_operator_invitations_state_shape check (
    (status = 'pending' and accepted_at is null and cancelled_at is null)
    or (status = 'accepted' and accepted_at is not null and accepted_app_user_id is not null and channel_operator_id is not null)
    or (status = 'cancelled' and cancelled_at is not null and cancelled_by_admin_allowlist_id is not null)
    or (status = 'expired' and accepted_at is null and cancelled_at is null)
  )
);
create unique index channel_operator_invitations_pending_pair
  on public.channel_operator_invitations (celebrity_id, recipient_email) where status = 'pending';
create index channel_operator_invitations_email_pending
  on public.channel_operator_invitations (recipient_email) where status = 'pending';
create index channel_operator_invitations_mail_due
  on public.channel_operator_invitations (created_at) where mail_status = 'pending';
create index channel_operator_invitations_channel
  on public.channel_operator_invitations (celebrity_id, created_at desc);

alter table public.channel_operator_invitations enable row level security;
alter table public.channel_operator_invitations force row level security;
revoke all on public.channel_operator_invitations from public, anon, authenticated, service_role;

-- Accept every pending, unexpired invitation for one account. Called with the
-- account's own row; a second active account on the same email blocks acceptance
-- exactly as grant_channel_operator refuses an ambiguous email.
create function public.accept_channel_operator_invitations(p_app_user_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_email text; v_inv public.channel_operator_invitations%rowtype; v_grant uuid; v_count integer := 0;
begin
  select verified_email into v_email from public.app_users where id = p_app_user_id and status = 'active';
  if v_email is null then return 0; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('channel-operator-invitation:' || v_email, 0));
  if (select count(*) from public.app_users where status = 'active' and verified_email = v_email) <> 1 then return 0; end if;
  for v_inv in
    select * from public.channel_operator_invitations
    where recipient_email = v_email and status = 'pending' and expires_at > clock_timestamp()
    order by created_at for update
  loop
    -- An invitation from an admin who is no longer a full admin grants nothing.
    if not exists (select 1 from public.admin_allowlist a where a.id = v_inv.invited_by_admin_allowlist_id and a.active and a.role = 'admin') then
      continue;
    end if;
    insert into public.channel_operators(celebrity_id, app_user_id, granted_by_admin_allowlist_id)
    values (v_inv.celebrity_id, p_app_user_id, v_inv.invited_by_admin_allowlist_id)
    on conflict (celebrity_id, app_user_id) where status = 'active' do nothing
    returning id into v_grant;
    if v_grant is null then
      select id into v_grant from public.channel_operators where celebrity_id = v_inv.celebrity_id and app_user_id = p_app_user_id and status = 'active';
    else
      insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, before_after_summary)
      values (v_inv.invited_by_app_user_id, v_inv.invited_by_admin_allowlist_id, 'channel_operator.granted', 'channel_operator', v_grant::text,
        jsonb_build_object('celebrityId', v_inv.celebrity_id, 'targetAppUserId', p_app_user_id, 'afterStatus', 'active', 'invitationId', v_inv.id));
    end if;
    update public.channel_operator_invitations
      set status = 'accepted', accepted_app_user_id = p_app_user_id, channel_operator_id = v_grant, accepted_at = clock_timestamp(),
        mail_status = case when mail_status = 'pending' then 'cancelled' else mail_status end, updated_at = clock_timestamp()
      where id = v_inv.id;
    insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, before_after_summary)
    values (p_app_user_id, null, 'channel_operator_invitation.accepted', 'channel_operator_invitation', v_inv.id::text,
      jsonb_build_object('celebrityId', v_inv.celebrity_id, 'channelOperatorId', v_grant, 'beforeStatus', 'pending', 'afterStatus', 'accepted'));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create function public.app_users_accept_channel_operator_invitations()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' and exists (select 1 from public.channel_operator_invitations where recipient_email = new.verified_email and status = 'pending') then
    perform public.accept_channel_operator_invitations(new.id);
  end if;
  return null;
end $$;
create trigger app_users_accept_channel_operator_invitations
  after insert or update of verified_email, status on public.app_users
  for each row execute function public.app_users_accept_channel_operator_invitations();

-- Invite by email. A matching account (now or by the time the lock is held) is
-- granted directly through grant_channel_operator; otherwise a pending invitation
-- is stored and queued for one email.
create function public.invite_channel_operator(
  p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_correlation_id uuid,
  p_celebrity_id uuid, p_target_email text, p_locale text, p_origin text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(p_target_email)); v_matches integer; v_row public.channel_operator_invitations%rowtype; v_grant jsonb;
begin
  perform public.assert_channel_grant_admin(p_actor_app_user_id, p_actor_admin_allowlist_id);
  if p_correlation_id is null then raise exception 'correlation id is required'; end if;
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or v_email ~ '[[:cntrl:]]'
    or p_locale is null or p_locale not in ('ko', 'en') then
    raise exception 'operator invitation invalid';
  end if;
  if not exists (select 1 from public.celebrities where id = p_celebrity_id) then raise exception 'channel not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('channel-operator-invitation:' || v_email, 0));
  select count(*) into v_matches from public.app_users where status = 'active' and verified_email = v_email;
  if v_matches > 1 then raise exception 'operator candidate ambiguous'; end if;
  if v_matches = 1 then
    v_grant := public.grant_channel_operator(p_actor_app_user_id, p_actor_admin_allowlist_id, p_correlation_id, p_celebrity_id, v_email);
    return jsonb_build_object('kind', 'granted', 'id', v_grant->>'id', 'status', v_grant->>'status', 'replayed', (v_grant->>'replayed')::boolean);
  end if;
  update public.channel_operator_invitations
    set status = 'expired', mail_status = case when mail_status = 'pending' then 'cancelled' else mail_status end, updated_at = clock_timestamp()
    where celebrity_id = p_celebrity_id and recipient_email = v_email and status = 'pending' and expires_at <= clock_timestamp();
  if exists (select 1 from public.channel_operator_invitations where celebrity_id = p_celebrity_id and recipient_email = v_email and status = 'pending') then
    raise exception 'operator invitation exists';
  end if;
  if (select count(*) from public.channel_operator_invitations
      where invited_by_admin_allowlist_id = p_actor_admin_allowlist_id and created_at > clock_timestamp() - interval '1 hour') >= 30 then
    raise exception 'operator invitation rate limited';
  end if;
  insert into public.channel_operator_invitations(celebrity_id, recipient_email, locale, origin, expires_at, invited_by_app_user_id, invited_by_admin_allowlist_id)
  values (p_celebrity_id, v_email, p_locale, p_origin, clock_timestamp() + interval '14 days', p_actor_app_user_id, p_actor_admin_allowlist_id)
  returning * into v_row;
  insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
  values (p_actor_app_user_id, p_actor_admin_allowlist_id, 'channel_operator_invitation.created', 'channel_operator_invitation', v_row.id::text, p_correlation_id,
    jsonb_build_object('celebrityId', p_celebrity_id, 'recipientEmailSha256', encode(extensions.digest(v_email, 'sha256'), 'hex'),
      'expiresAt', v_row.expires_at, 'afterStatus', 'pending'));
  return jsonb_build_object('kind', 'invited', 'id', v_row.id, 'status', v_row.status, 'expiresAt', v_row.expires_at, 'replayed', false);
end $$;

create function public.cancel_channel_operator_invitation(
  p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_correlation_id uuid, p_celebrity_id uuid, p_invitation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.channel_operator_invitations%rowtype; v_replayed boolean := false;
begin
  perform public.assert_channel_grant_admin(p_actor_app_user_id, p_actor_admin_allowlist_id);
  if p_correlation_id is null then raise exception 'correlation id is required'; end if;
  -- An invitation of another channel is indistinguishable from a missing one.
  select * into v_row from public.channel_operator_invitations where id = p_invitation_id and celebrity_id = p_celebrity_id for update;
  if not found then raise exception 'operator invitation not found'; end if;
  if v_row.status = 'cancelled' then
    v_replayed := true;
  elsif v_row.status <> 'pending' or v_row.expires_at <= clock_timestamp() then
    raise exception 'operator invitation not pending';
  else
    update public.channel_operator_invitations
      set status = 'cancelled', cancelled_at = clock_timestamp(), cancelled_by_admin_allowlist_id = p_actor_admin_allowlist_id,
        mail_status = case when mail_status = 'pending' then 'cancelled' else mail_status end, updated_at = clock_timestamp()
      where id = v_row.id returning * into v_row;
    insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
    values (p_actor_app_user_id, p_actor_admin_allowlist_id, 'channel_operator_invitation.cancelled', 'channel_operator_invitation', v_row.id::text, p_correlation_id,
      jsonb_build_object('celebrityId', v_row.celebrity_id, 'beforeStatus', 'pending', 'afterStatus', 'cancelled'));
  end if;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'replayed', v_replayed);
end $$;

create function public.list_channel_operator_invitations(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_celebrity_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_channel_grant_admin(p_actor_app_user_id, p_actor_admin_allowlist_id);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.recipient_email,
      'status', case when i.status = 'pending' and i.expires_at <= clock_timestamp() then 'expired' else i.status end,
      'mailStatus', i.mail_status, 'createdAt', i.created_at, 'expiresAt', i.expires_at,
      'acceptedAt', i.accepted_at, 'cancelledAt', i.cancelled_at) order by i.created_at desc, i.id)
    from (select * from public.channel_operator_invitations where celebrity_id = p_celebrity_id order by created_at desc, id limit 100) i), '[]'::jsonb));
end $$;

-- Mail queue. Claim marks the row 'sending' before the provider call, so an
-- ambiguous provider result is never sent twice.
create function public.claim_channel_operator_invitation_email(p_origin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.channel_operator_invitations%rowtype;
begin
  if p_origin not in ('https://dev.kyaa.io', 'https://kyaa.io') then raise exception 'operator invitation invalid'; end if;
  select * into v_row from public.channel_operator_invitations
    where mail_status = 'pending' and status = 'pending' and expires_at > clock_timestamp() and origin = p_origin
    order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.channel_operator_invitations set mail_status = 'sending', updated_at = clock_timestamp() where id = v_row.id;
  return jsonb_build_object('id', v_row.id, 'email', v_row.recipient_email, 'locale', v_row.locale, 'origin', v_row.origin,
    'expiresAt', v_row.expires_at,
    'channelName', coalesce(
      (select l.name from public.celebrity_localizations l where l.celebrity_id = v_row.celebrity_id and l.locale::text = v_row.locale),
      (select l.name from public.celebrity_localizations l where l.celebrity_id = v_row.celebrity_id and l.locale::text = 'ko'),
      (select c.slug from public.celebrities c where c.id = v_row.celebrity_id)));
end $$;

create function public.finish_channel_operator_invitation_email(p_id uuid, p_outcome text, p_provider_id text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_outcome not in ('sent', 'failed') or (p_outcome = 'sent' and (nullif(btrim(p_provider_id), '') is null or length(p_provider_id) > 200)) then
    raise exception 'operator invitation invalid';
  end if;
  update public.channel_operator_invitations
    set mail_status = p_outcome, mail_provider_message_id = case when p_outcome = 'sent' then p_provider_id end,
      mail_sent_at = case when p_outcome = 'sent' then clock_timestamp() end, updated_at = clock_timestamp()
    where id = p_id and mail_status = 'sending';
  return found;
end $$;

revoke all on function public.accept_channel_operator_invitations(uuid) from public, anon, authenticated, service_role;
revoke all on function public.app_users_accept_channel_operator_invitations() from public, anon, authenticated, service_role;
revoke all on function public.invite_channel_operator(uuid, uuid, uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.cancel_channel_operator_invitation(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_channel_operator_invitations(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.claim_channel_operator_invitation_email(text) from public, anon, authenticated, service_role;
revoke all on function public.finish_channel_operator_invitation_email(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.invite_channel_operator(uuid, uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.cancel_channel_operator_invitation(uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.list_channel_operator_invitations(uuid, uuid, uuid) to service_role;
grant execute on function public.claim_channel_operator_invitation_email(text) to service_role;
grant execute on function public.finish_channel_operator_invitation_email(uuid, text, text) to service_role;

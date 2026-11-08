-- 261107-2 E3: a short invite address, kyaa.io/i/<7 letters>, for the existing invite code and its landing page.
-- The short address only points at (code, destination). It lives as long as the code is usable: the code itself never
-- expires and cannot be changed, and an inviter who is no longer active makes it unresolvable, as the code would be at redeem.
-- An operator can revoke one address with revoked_at; the owner then gets a new one for the same destination.
-- Rollback: supabase/rollback/20261216032000_community_invite_short_links.sql.
begin;
set local lock_timeout = '5s';

create table public.community_invite_short_links(
  slug text primary key check (slug ~ '^[a-hjkmnp-z2-9]{7}$'),
  app_user_id uuid not null references public.community_stamp_invite_codes(app_user_id),
  destination text not null check (destination ~ '^/$' or destination ~ '^/pages/groups/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or destination ~ '^/[a-z0-9][a-z0-9-]{0,79}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz
);
create unique index community_invite_short_links_owner_destination on public.community_invite_short_links(app_user_id, destination) where revoked_at is null;
alter table public.community_invite_short_links enable row level security;
alter table public.community_invite_short_links force row level security;
revoke all on public.community_invite_short_links from public, anon, authenticated, service_role;

create function public.create_community_invite_short_link(p_app_user_id uuid, p_destination text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_slug text; alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789'; bytes bytea; i integer;
begin
  if p_destination is null or p_destination !~ '^(/|/pages/groups/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|/[a-z0-9][a-z0-9-]{0,79})$' then
    raise exception 'COMMUNITY_STAMP_INVALID_REQUEST' using errcode = '22023'; end if;
  -- Makes the code if this fan has none yet, with the same lock and checks as the invite screen.
  perform public.get_community_stamp_invite_code(p_app_user_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community-stamp:invite-short:' || p_app_user_id::text, 0));
  select slug into v_slug from public.community_invite_short_links where app_user_id = p_app_user_id and destination = p_destination and revoked_at is null;
  while v_slug is null loop
    bytes := extensions.gen_random_bytes(7); v_slug := '';
    for i in 0..6 loop v_slug := v_slug || substr(alphabet, 1 + get_byte(bytes, i) % length(alphabet), 1); end loop;
    insert into public.community_invite_short_links(slug, app_user_id, destination) values (v_slug, p_app_user_id, p_destination)
      on conflict (slug) do nothing;
    if not found then v_slug := null; end if;
  end loop;
  return jsonb_build_object('slug', v_slug);
end $$;

create function public.resolve_community_invite_short_link(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  if p_slug is null or p_slug !~ '^[a-hjkmnp-z2-9]{7}$' then raise exception 'COMMUNITY_STAMP_NOT_FOUND' using errcode = 'P0002'; end if;
  select c.code, l.destination into r from public.community_invite_short_links l
    join public.community_stamp_invite_codes c on c.app_user_id = l.app_user_id
    join public.app_users u on u.id = l.app_user_id and u.status = 'active'
    where l.slug = p_slug and l.revoked_at is null;
  if not found then raise exception 'COMMUNITY_STAMP_NOT_FOUND' using errcode = 'P0002'; end if;
  return jsonb_build_object('code', r.code, 'destination', r.destination);
end $$;

-- Same owner as get_community_stamp_invite_code, whatever role applies the file. Only the service role calls these.
do $$
declare owner_name name := pg_get_userbyid((select proowner from pg_proc where oid = 'public.get_community_stamp_invite_code(uuid)'::regprocedure)); f text;
begin
  foreach f in array array['create_community_invite_short_link(uuid,text)', 'resolve_community_invite_short_link(text)'] loop
    execute format('alter function public.%s owner to %I', f, owner_name);
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  execute format('alter table public.community_invite_short_links owner to %I', owner_name);
end $$;
commit;
notify pgrst, 'reload schema';

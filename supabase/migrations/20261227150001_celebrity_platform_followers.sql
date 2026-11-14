-- Per-platform follower counts of a creator (instagram, tiktok, youtube, chzzk; new platforms come from adding a value to the
-- social_platform enum). One row = a count somebody confirmed; no row = unconfirmed (never shown). follower_count 0 is a confirmed zero.
-- The table references celebrities only: save_admin_celebrity deletes and re-inserts celebrity_social_links, and a cascade from that
-- table would wipe these counts on every creator save. celebrities.fan_count is untouched.
-- source_text keeps what the platform screen showed ("1.2만", "50K"); significant_digits marks a rounded count (1.2만 -> 2), null = exact.
create table public.celebrity_platform_followers (
  celebrity_id uuid not null references public.celebrities(id) on delete cascade,
  platform public.social_platform not null,
  follower_count bigint not null check (follower_count >= 0),
  source_text text check (source_text is null or char_length(source_text) between 1 and 40),
  significant_digits smallint check (significant_digits is null or significant_digits between 1 and 6),
  source_kind text not null check (source_kind in ('manual', 'collector')),
  source_url text check (source_url is null or source_url ~ '^https://'),
  entered_by uuid references public.admin_allowlist(id) on delete set null,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (celebrity_id, platform)
);
alter table public.celebrity_platform_followers enable row level security;
alter table public.celebrity_platform_followers force row level security;
revoke all on table public.celebrity_platform_followers from public, anon, authenticated;

-- Admin read (every field). p_celebrity null = all creators.
create function public.read_admin_platform_followers(p_actor uuid, p_celebrity uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_content_editor(p_actor, false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'celebrityId', f.celebrity_id, 'platform', f.platform, 'count', f.follower_count, 'sourceText', f.source_text,
      'digits', f.significant_digits, 'sourceKind', f.source_kind, 'sourceUrl', f.source_url, 'checkedAt', f.checked_at
    ) order by f.celebrity_id, f.platform)
    from public.celebrity_platform_followers f
    where p_celebrity is null or f.celebrity_id = p_celebrity
  ), '[]'::jsonb);
end $$;

-- Admin write. p_items = [{platform, count, digits, sourceText}]; count null removes the row (back to unconfirmed), 0 saves a confirmed zero.
-- Only the platforms named in p_items change.
create function public.save_admin_platform_followers(p_actor uuid, p_correlation uuid, p_celebrity uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  v_platform public.social_platform;
  v_count bigint;
  v_digits smallint;
  v_text text;
  before_rows jsonb;
  after_rows jsonb;
begin
  perform public.require_content_editor(p_actor, true);
  if p_correlation is null then raise exception 'correlation id is required'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 12 then
    raise exception 'invalid platform follower items';
  end if;
  perform 1 from public.celebrities c where c.id = p_celebrity and c.archived_at is null for update;
  if not found then raise exception 'content not found'; end if;
  before_rows := public.read_admin_platform_followers(p_actor, p_celebrity);
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'invalid platform follower items'; end if;
    v_platform := (item->>'platform')::public.social_platform;
    if jsonb_typeof(item->'count') = 'null' or item->'count' is null then
      delete from public.celebrity_platform_followers where celebrity_id = p_celebrity and platform = v_platform;
      continue;
    end if;
    if jsonb_typeof(item->'count') <> 'number' or (item->>'count') !~ '^[0-9]{1,13}$' then
      raise exception 'invalid platform follower count';
    end if;
    v_count := (item->>'count')::bigint;
    v_digits := case when jsonb_typeof(item->'digits') = 'number' then (item->>'digits')::smallint else null end;
    v_text := nullif(btrim(coalesce(item->>'sourceText', '')), '');
    if v_digits is not null and v_digits not between 1 and 6 then raise exception 'invalid platform follower digits'; end if;
    insert into public.celebrity_platform_followers(
      celebrity_id, platform, follower_count, source_text, significant_digits, source_kind, source_url, entered_by, checked_at
    ) values (
      p_celebrity, v_platform, v_count, v_text, v_digits, 'manual',
      (select s.url from public.celebrity_social_links s where s.celebrity_id = p_celebrity and s.platform = v_platform and s.active),
      p_actor, now()
    )
    on conflict (celebrity_id, platform) do update
      set follower_count = excluded.follower_count, source_text = excluded.source_text, significant_digits = excluded.significant_digits,
          source_kind = 'manual', source_url = excluded.source_url, entered_by = excluded.entered_by, checked_at = excluded.checked_at, updated_at = now();
  end loop;
  after_rows := public.read_admin_platform_followers(p_actor, p_celebrity);
  insert into public.audit_logs(actor_admin_allowlist_id, action, entity_type, entity_id, before_after_summary, correlation_id)
  values (p_actor, 'celebrity.platform_followers.updated', 'celebrity', p_celebrity::text,
    jsonb_build_object('before', before_rows, 'after', after_rows), p_correlation);
  return after_rows;
end $$;

-- Public read for the ranking: count, rounding and the platform's own wording (source_text) for published creators; no address, source kind, operator or time.
-- Order: the admin's channel order, then platforms without a channel row.
create function public.read_celebrity_platform_followers(p_slugs text[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(t.slug, t.items), '{}'::jsonb) from (
    select c.slug, jsonb_agg(jsonb_build_object('platform', f.platform, 'count', f.follower_count, 'digits', f.significant_digits, 'text', f.source_text)
      order by coalesce(s.position, 100), f.platform) as items
    from public.celebrity_platform_followers f
    join public.celebrities c on c.id = f.celebrity_id and c.status = 'published' and c.archived_at is null
    left join public.celebrity_social_links s on s.celebrity_id = f.celebrity_id and s.platform = f.platform
    where c.slug = any (p_slugs)
    group by c.slug
  ) t;
$$;

revoke all on function public.read_admin_platform_followers(uuid, uuid), public.save_admin_platform_followers(uuid, uuid, uuid, jsonb),
  public.read_celebrity_platform_followers(text[]) from public, anon, authenticated;
grant execute on function public.read_admin_platform_followers(uuid, uuid), public.save_admin_platform_followers(uuid, uuid, uuid, jsonb),
  public.read_celebrity_platform_followers(text[]) to service_role;

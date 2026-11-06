-- 찐팬 100명 게이지: an administrator picks the creators that take part and writes the title and description the fans read.
-- Off unless an administrator turns it on. The count stays the live count of active jjinfan_titles and the target stays 100.
-- Web and database may ship in either order: the old web ignores the new `campaign` key and the new web treats its absence as off.
--
-- Rollback: see supabase/rollback/20261212080000_jjinfan_challenge_campaigns.sql.
begin;

create table public.jjinfan_challenge_campaigns (
  celebrity_id uuid primary key references public.celebrities(id) on delete cascade,
  enabled boolean not null default false,
  title text not null default '' check (char_length(title) <= 80 and title = btrim(title)),
  description text not null default '' check (char_length(description) <= 300),
  updated_by_admin_allowlist_id uuid not null references public.admin_allowlist(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jjinfan_challenge_campaigns_title_when_enabled check (not enabled or title <> '')
);
alter table public.jjinfan_challenge_campaigns enable row level security;
revoke all on public.jjinfan_challenge_campaigns from public, anon, authenticated, service_role;

-- Same signature and same count. A disabled or unset creator answers campaign null, so an administrator's draft wording never leaves the server.
create or replace function public.read_jjinfan_challenge(p_celebrity uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare n bigint; v_campaign jsonb;
begin
  if not exists (select 1 from public.celebrities c where c.id = p_celebrity and c.status = 'published' and c.archived_at is null) then
    raise exception 'CREATOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  select count(*) into n from public.jjinfan_titles t join public.app_users tu on tu.id = t.app_user_id and tu.status = 'active' where t.celebrity_id = p_celebrity and t.revoked_at is null;
  select pg_catalog.jsonb_build_object('title', c.title, 'description', c.description) into v_campaign
    from public.jjinfan_challenge_campaigns c where c.celebrity_id = p_celebrity and c.enabled;
  return pg_catalog.jsonb_build_object('count', n, 'target', 100, 'campaign', v_campaign);
end $$;
revoke all on function public.read_jjinfan_challenge(uuid) from public, anon, authenticated;
grant execute on function public.read_jjinfan_challenge(uuid) to service_role;

create function public.list_jjinfan_challenge_campaigns(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, false);
  return pg_catalog.jsonb_build_object('items', coalesce((
    select pg_catalog.jsonb_agg(row_to_json(r)::jsonb order by r.enabled desc, r.name, r."celebrityId")
    from (
      select c.id as "celebrityId", c.slug, coalesce(
          (select l.name from public.celebrity_localizations l where l.celebrity_id = c.id order by (l.locale = 'ko') desc, l.locale limit 1), c.slug) as name,
        coalesce(j.enabled, false) as enabled, coalesce(j.title, '') as title, coalesce(j.description, '') as description, j.updated_at as "updatedAt",
        (select count(*) from public.jjinfan_titles t join public.app_users tu on tu.id = t.app_user_id and tu.status = 'active' where t.celebrity_id = c.id and t.revoked_at is null) as count
      from public.celebrities c
      left join public.jjinfan_challenge_campaigns j on j.celebrity_id = c.id
      where c.status = 'published' and c.archived_at is null
    ) r), '[]'::jsonb));
end $$;

create function public.set_jjinfan_challenge_campaign(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid, p_correlation_id uuid, p_celebrity_id uuid, p_enabled boolean, p_title text, p_description text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_description text := pg_catalog.btrim(coalesce(p_description, ''));
  v_before public.jjinfan_challenge_campaigns%rowtype;
  v_row public.jjinfan_challenge_campaigns%rowtype;
begin
  if p_actor_admin_allowlist_id is null or public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, true) is distinct from 'admin' then
    raise exception 'full admin required';
  end if;
  if p_correlation_id is null or p_enabled is null then raise exception 'JJINFAN_CAMPAIGN_INVALID'; end if;
  if pg_catalog.char_length(v_title) > 80 or pg_catalog.char_length(v_description) > 300 or (p_enabled and v_title = '') then raise exception 'JJINFAN_CAMPAIGN_INVALID'; end if;
  if not exists (select 1 from public.celebrities c where c.id = p_celebrity_id and c.status = 'published' and c.archived_at is null) then raise exception 'CREATOR_NOT_FOUND'; end if;
  select * into v_before from public.jjinfan_challenge_campaigns where celebrity_id = p_celebrity_id for update;
  insert into public.jjinfan_challenge_campaigns(celebrity_id, enabled, title, description, updated_by_admin_allowlist_id)
  values (p_celebrity_id, p_enabled, v_title, v_description, p_actor_admin_allowlist_id)
  on conflict (celebrity_id) do update set enabled = excluded.enabled, title = excluded.title, description = excluded.description,
    updated_by_admin_allowlist_id = excluded.updated_by_admin_allowlist_id, updated_at = now()
  returning * into v_row;
  insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, correlation_id, before_after_summary)
  values (p_actor_app_user_id, p_actor_admin_allowlist_id, 'jjinfan_campaign.updated', 'jjinfan_campaign', p_celebrity_id::text, p_correlation_id,
    pg_catalog.jsonb_build_object('celebrityId', p_celebrity_id, 'beforeEnabled', coalesce(v_before.enabled, false), 'afterEnabled', v_row.enabled, 'beforeTitle', v_before.title, 'afterTitle', v_row.title, 'beforeDescription', v_before.description, 'afterDescription', v_row.description));
  return pg_catalog.jsonb_build_object('celebrityId', v_row.celebrity_id, 'enabled', v_row.enabled, 'title', v_row.title, 'description', v_row.description, 'updatedAt', v_row.updated_at);
end $$;

revoke all on function public.list_jjinfan_challenge_campaigns(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_jjinfan_challenge_campaign(uuid, uuid, uuid, uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.list_jjinfan_challenge_campaigns(uuid, uuid) to service_role;
grant execute on function public.set_jjinfan_challenge_campaign(uuid, uuid, uuid, uuid, boolean, text, text) to service_role;

-- Fail here rather than at the first admin save if the applying role cannot reach what these functions touch.
do $check$
declare need record;
begin
  for need in select * from (values ('celebrities', 'select'), ('celebrity_localizations', 'select'), ('jjinfan_titles', 'select'), ('app_users', 'select'), ('admin_allowlist', 'select'), ('audit_logs', 'insert')) as v(tbl, priv) loop
    if not pg_catalog.has_table_privilege(current_user, 'public.' || need.tbl, need.priv) then
      raise exception 'JJINFAN_CAMPAIGN_OWNER_PRIVILEGE_MISSING: % on %', need.priv, need.tbl;
    end if;
  end loop;
end $check$;

commit;

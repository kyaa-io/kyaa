-- Rollback of 20261220021500_home_notice_linked_page.sql. Run after the web rollback. Stops while any notice is linked
-- (HOME_NOTICE_LINK_ROLLBACK_HAS_LINKS) so no chosen link is lost silently; unlink first. Drops the 13-argument save and restores the 20261220021000
-- definitions of list_admin_home_notices and the public reads, and removes only policies named home_n1link_owner_%.
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from public.home_notices where linked_group_page_id is not null) then raise exception 'HOME_NOTICE_LINK_ROLLBACK_HAS_LINKS'; end if;
end $$;
do $policy$
declare p record;
begin
  for p in select polname, polrelid::regclass rel from pg_catalog.pg_policy where polname like 'home\_n1link\_owner\_%' loop
    execute format('drop policy %I on %s', p.polname, p.rel);
  end loop;
end
$policy$;
drop function public.list_admin_home_notice_link_targets(uuid,uuid);
drop function public.save_admin_home_notice(uuid,uuid,uuid,uuid,integer,text,text,boolean,text,jsonb,text,jsonb,uuid);

create or replace function public.list_admin_home_notices(p_actor_app_user_id uuid, p_actor_admin_allowlist_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_admin(p_actor_app_user_id, p_actor_admin_allowlist_id, false);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', n.id, 'slug', n.slug, 'category', n.category, 'publication_status', n.publication_status, 'pinned', n.pinned,
      'published_at', n.published_at, 'archived_at', n.archived_at, 'archive_reason', n.archive_reason,
      'revision', n.revision, 'created_at', n.created_at,
      'home_notice_localizations', coalesce((select jsonb_agg(jsonb_build_object('locale', l.locale, 'title', l.title, 'body_json', l.body_json) order by l.locale)
        from public.home_notice_localizations l where l.notice_id = n.id), '[]'::jsonb))
    order by n.created_at desc, n.id desc) from public.home_notices n), '[]'::jsonb);
end $$;


create or replace function public.read_public_home_notices(
  p_locale public.content_locale,
  p_before_pinned boolean default null,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if p_locale is null or p_limit is null or p_limit < 1 or p_limit > 20 then raise exception 'invalid home notice page' using errcode = '22023'; end if;
  if (p_before_pinned is null) <> (p_before is null) or (p_before is null) <> (p_before_id is null) then
    raise exception 'invalid home notice cursor' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(x.item order by x.pinned desc, x.published_at desc, x.id desc), '[]'::jsonb) into v_rows from (
    select n.pinned, n.published_at, n.id, jsonb_build_object('id', n.id, 'slug', n.slug, 'category', n.category, 'pinned', n.pinned,
      'publishedAt', n.published_at, 'title', l.title) item
    from public.home_notices n
    join public.home_notice_localizations l on l.notice_id = n.id and l.locale = p_locale
    where n.publication_status = 'published' and n.archived_at is null
      and (p_before is null or (n.pinned, n.published_at, n.id) < (p_before_pinned, p_before, p_before_id))
    order by n.pinned desc, n.published_at desc, n.id desc
    limit p_limit + 1) x;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(e.value order by e.ordinality) from jsonb_array_elements(v_rows) with ordinality e where e.ordinality <= p_limit), '[]'::jsonb),
    'hasMore', jsonb_array_length(v_rows) > p_limit);
end $$;


create or replace function public.read_public_home_notice(p_locale public.content_locale, p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', n.id, 'slug', n.slug, 'category', n.category, 'pinned', n.pinned,
    'publishedAt', n.published_at, 'title', l.title, 'body', l.body_json)
  from public.home_notices n
  join public.home_notice_localizations l on l.notice_id = n.id and l.locale = p_locale
  where n.slug = p_slug and n.publication_status = 'published' and n.archived_at is null;
$$;


drop function public.home_notice_link_json(uuid);
drop function public.home_notice_link_target_ok(uuid);
alter table public.home_notices drop column linked_group_page_id;
notify pgrst, 'reload schema';
commit;

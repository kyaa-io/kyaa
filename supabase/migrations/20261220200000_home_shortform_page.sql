-- Paginate the same public short-form feed without changing the home preview.
create function public.read_public_home_shortform_page(p_locale public.content_locale, p_offset integer default 0, p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_locale is null or p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 12 then
    raise exception 'invalid home shorts page' using errcode = '22023';
  end if;
  return (select jsonb_build_object('items', coalesce(jsonb_agg(x.item order by x.published_at desc, x.video_id) filter (where x.row_no <= p_limit), '[]'::jsonb), 'hasMore', count(*) > p_limit)
    from (select s.published_at, s.video_id, row_number() over (order by s.published_at desc, s.video_id) as row_no,
      jsonb_build_object('id', s.id, 'videoId', s.video_id, 'title', s.title,
        'creator', public.home_creator_json(s.celebrity_id, p_locale), 'href', s.href) as item
      from (select * from public.home_shortform where public.home_gallery_creator_public(celebrity_id)
        order by published_at desc, video_id offset p_offset limit p_limit + 1) s) x);
end $$;
revoke all on function public.read_public_home_shortform_page(public.content_locale,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.read_public_home_shortform_page(public.content_locale,integer,integer) to service_role;
do $$
declare owner_name text;
begin
  select r.rolname into owner_name from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner
    where p.oid='public.read_public_home_shortform_page(public.content_locale,integer,integer)'::regprocedure;
  if owner_name in ('anon','authenticated','service_role','public') then raise exception 'invalid shortform function owner'; end if;
  execute format('grant select on public.home_shortform to %I', owner_name);
  execute format('create policy %I on public.home_shortform for select to %I using (true)', 'home_shortform_page_owner_read', owner_name);
end $$;

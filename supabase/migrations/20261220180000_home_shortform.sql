-- Public short-form videos are independent of LIVE events.
create table public.home_shortform (
  id uuid primary key default extensions.gen_random_uuid(),
  celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  video_id text not null unique check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null check (length(btrim(title)) between 1 and 300),
  href text not null check (href = 'https://www.youtube.com/watch?v=' || video_id),
  published_at timestamptz not null
);
alter table public.home_shortform enable row level security;
revoke all on public.home_shortform from public, anon, authenticated, service_role;

create function public.read_public_home_shortform(p_locale public.content_locale, p_limit integer default 6)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_locale is null or p_limit is null or p_limit not between 1 and 12 then raise exception 'invalid home shorts page' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(x.item order by x.published_at desc, x.video_id) from (
    select s.published_at, s.video_id, jsonb_build_object('id', s.id, 'videoId', s.video_id,
      'title', s.title, 'creator', public.home_creator_json(s.celebrity_id, p_locale), 'href', s.href) item
    from public.home_shortform s where public.home_gallery_creator_public(s.celebrity_id)
    order by s.published_at desc, s.video_id limit p_limit
  ) x), '[]'::jsonb);
end $$;

revoke all on function public.read_public_home_shortform(public.content_locale,integer) from public, anon, authenticated, service_role;
grant execute on function public.read_public_home_shortform(public.content_locale,integer) to service_role;

do $$
declare owner_name text;
begin
  select r.rolname into owner_name from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner
    where p.oid='public.read_public_home_shortform(public.content_locale,integer)'::regprocedure;
  if owner_name in ('anon','authenticated','service_role','public') then raise exception 'invalid shortform function owner'; end if;
  execute format('grant select on public.home_shortform to %I', owner_name);
  execute format('create policy %I on public.home_shortform for select to %I using (true)', 'home_shortform_owner_read', owner_name);
end $$;

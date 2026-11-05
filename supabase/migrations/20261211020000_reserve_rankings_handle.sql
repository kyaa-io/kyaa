-- Reserve the static top-level path /rankings (app route) so no creator can take it as a public handle.
-- Follows 20261209090000_operator_celebrity_public_handle.sql, the latest owner of celebrities_slug_not_reserved:
-- same guard, drop/add of the same constraint, same comment. An existing creator using this slug raises 23514
-- and the whole migration rolls back, so no constraint changes until that row is handled.
begin;
set local lock_timeout = '5s';
do $$
declare
  conflict text;
begin
  select string_agg(slug, ', ' order by slug) into conflict
  from public.celebrities
  where slug in ('rankings');
  if conflict is not null then
    raise exception 'reserved celebrity handle conflicts: %', conflict using errcode = '23514';
  end if;
end $$;
alter table public.celebrities drop constraint celebrities_slug_not_reserved;
alter table public.celebrities add constraint celebrities_slug_not_reserved check (slug <> all (array[
  'account-deletion','admin','api','auth','benefits','bias','c','celebrities','community','connect','creator','credits','events','fandom','fans','go','groups','guide',
  'instagram-link-preview','live','login','my','notifications','o','onboarding','open-app','operator','pages','passports',
  'privacy','rankings','runmusic-notice','s','settings','stamps','support','t','terms','videos','fonts','images','share','_next','.well-known'
]::text[]));
comment on constraint celebrities_slug_not_reserved on public.celebrities is
  'Root public handles must not collide with top-level app routes or public asset directories.';
commit;

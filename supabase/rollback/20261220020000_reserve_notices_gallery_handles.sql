-- Rollback of 20261220020000_reserve_notices_gallery_handles.sql: back to the 20261211020000 array (notices and gallery free again).
-- Run after the web rollback that removes /notices and /gallery.
begin;
set local lock_timeout = '5s';
alter table public.celebrities drop constraint celebrities_slug_not_reserved;
alter table public.celebrities add constraint celebrities_slug_not_reserved check (slug <> all (array[
  'account-deletion','admin','api','auth','benefits','bias','c','celebrities','community','connect','creator','credits','events','fandom','fans','go','groups','guide',
  'instagram-link-preview','live','login','my','notifications','o','onboarding','open-app','operator','pages','passports',
  'privacy','rankings','runmusic-notice','s','settings','stamps','support','t','terms','videos','fonts','images','share','_next','.well-known'
]::text[]));
comment on constraint celebrities_slug_not_reserved on public.celebrities is
  'Root public handles must not collide with top-level app routes or public asset directories.';
commit;

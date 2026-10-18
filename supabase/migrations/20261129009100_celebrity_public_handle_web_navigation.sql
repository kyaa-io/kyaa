-- Preserve existing creator handles; fail before changing the constraint on any collision.
begin;
set local lock_timeout = '5s';
do $$begin
 if exists(select 1 from public.celebrities where slug in('account-deletion','fandom','support'))then
  raise exception 'reserved celebrity handle conflicts with an app entry path'using errcode='23514';
 end if;
end $$;
alter table public.celebrities drop constraint celebrities_slug_not_reserved;
alter table public.celebrities add constraint celebrities_slug_not_reserved check(slug<>all(array[
 'account-deletion','admin','api','benefits','bias','c','celebrities','community','connect','creator','credits','fandom','fans','go','guide',
 'instagram-link-preview','live','login','my','notifications','o','onboarding','open-app','pages','passports',
 'privacy','s','settings','stamps','support','t','terms','fonts','images','share','_next','.well-known'
]::text[]));
comment on constraint celebrities_slug_not_reserved on public.celebrities is
 'Root public handles must not collide with top-level app routes or public asset directories.';
commit;

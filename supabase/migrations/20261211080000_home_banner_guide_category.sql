-- Adds the 'guide' banner category: home-slide only banners that the events and group lists skip.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid='public.home_banners'::regclass and contype='c' and pg_get_constraintdef(oid) like '%category%'
  loop
    execute format('alter table public.home_banners drop constraint %I',c.conname);
  end loop;
end $$;
alter table public.home_banners add constraint home_banners_category_check
  check (category in ('event','group','fanpage','announcement','live','guide'));

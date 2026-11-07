-- A fan group links to /{slug}, and that page reads published_celebrities,
-- which needs a fan count. The directory only checks the creator status, so
-- clearing the count on a published creator in the CMS kept the group listed
-- while its page answered 404. Publication already requires a count; keep it.
-- Rollback: drop trigger celebrities_keep_published_fan_count on public.celebrities;
--           drop function public.celebrities_keep_published_fan_count();
create or replace function public.celebrities_keep_published_fan_count() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.status='published' and new.fan_count is null and old.fan_count is not null then
  raise exception 'published celebrity requires fan count';
 end if;
 return new;
end $$;
revoke all on function public.celebrities_keep_published_fan_count() from public,anon,authenticated;
drop trigger if exists celebrities_keep_published_fan_count on public.celebrities;
create trigger celebrities_keep_published_fan_count before update of fan_count,status on public.celebrities
 for each row execute function public.celebrities_keep_published_fan_count();

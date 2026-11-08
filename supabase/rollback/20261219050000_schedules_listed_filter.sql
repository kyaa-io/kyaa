-- Rollback of 20261219050000_schedules_listed_filter.sql: the cross-creator schedule list shows schedules of unlisted creators again.
-- The read policy the migration may have created (schedules_listed_owner_<role> on group_pages) is dropped; a select grant stays.
-- The app needs no change first. A second run stops at SCHEDULES_LISTED_FILTER_ROLLBACK_SHAPE.
begin;
set local lock_timeout = '5s';

do $patch$
declare
  sig constant regprocedure := 'public.fan_web_list_schedules(uuid,public.content_locale,timestamptz,timestamptz,text,timestamptz,uuid,integer)'::regprocedure;
  original constant text := '(p_celebrity_slug is null or c.slug=p_celebrity_slug)';
  patched constant text := '((p_celebrity_slug is null and not exists(select 1 from public.group_pages lp where lp.celebrity_id=c.id and lp.kind=''fan'' and not lp.listed)) or c.slug=p_celebrity_slug)';
  definition text := pg_catalog.pg_get_functiondef(sig);
begin
  if (length(definition) - length(replace(definition, patched, ''))) / length(patched) <> 1 then raise exception 'SCHEDULES_LISTED_FILTER_ROLLBACK_SHAPE'; end if;
  execute replace(definition, patched, original);
end
$patch$;

do $policy$
declare p record;
begin
  for p in select polname from pg_catalog.pg_policy where polrelid = 'public.group_pages'::regclass and polname like 'schedules\_listed\_owner\_%' loop
    execute format('drop policy %I on public.group_pages', p.polname);
  end loop;
end
$policy$;

notify pgrst, 'reload schema';
commit;

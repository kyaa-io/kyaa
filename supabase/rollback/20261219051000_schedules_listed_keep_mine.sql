-- Rollback of 20261219051000_schedules_listed_keep_mine.sql: back to the 20261219050000 rule (the viewer's own schedules of an unlisted
-- creator drop out of the cross-creator list again). Policies it may have created (schedules_keep_mine_owner_<role>) are dropped; select
-- grants stay. A second run stops at SCHEDULES_KEEP_MINE_ROLLBACK_SHAPE. Roll this back before 20261219050000.
begin;
set local lock_timeout = '5s';

do $patch$
declare
  sig constant regprocedure := 'public.fan_web_list_schedules(uuid,public.content_locale,timestamptz,timestamptz,text,timestamptz,uuid,integer)'::regprocedure;
  original constant text := '((p_celebrity_slug is null and not exists(select 1 from public.group_pages lp where lp.celebrity_id=c.id and lp.kind=''fan'' and not lp.listed)) or c.slug=p_celebrity_slug)';
  patched constant text := '((p_celebrity_slug is null and (not exists(select 1 from public.group_pages lp where lp.celebrity_id=c.id and lp.kind=''fan'' and not lp.listed)'
    || ' or (p_app_user_id is not null and (exists(select 1 from public.schedule_subscriptions mine where mine.schedule_id=s.id and mine.app_user_id=p_app_user_id)'
    || ' or exists(select 1 from public.schedule_suggestions mine where mine.schedule_id=s.id and mine.app_user_id=p_app_user_id))))) or c.slug=p_celebrity_slug)';
  definition text := pg_catalog.pg_get_functiondef(sig);
begin
  if (length(definition) - length(replace(definition, patched, ''))) / length(patched) <> 1 then raise exception 'SCHEDULES_KEEP_MINE_ROLLBACK_SHAPE'; end if;
  execute replace(definition, patched, original);
end
$patch$;

do $policy$
declare p record;
begin
  for p in select polname, polrelid::regclass rel from pg_catalog.pg_policy
            where polrelid in ('public.schedule_subscriptions'::regclass, 'public.schedule_suggestions'::regclass) and polname like 'schedules\_keep\_mine\_owner\_%' loop
    execute format('drop policy %I on %s', p.polname, p.rel);
  end loop;
end
$policy$;

notify pgrst, 'reload schema';
commit;

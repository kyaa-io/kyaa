-- Rollback of 20261220080000_group_post_edited_at.sql: group posts answer without `editedAt` again and edit times are forgotten.
-- The wrapper is dropped and the function it called gets its name and its service_role grant back. Dropping edited_at discards
-- the recorded edit times; applying the migration again starts from "never edited". Roll back in reverse order: if a later
-- migration wrapped this wrapper, the check below stops at GROUP_POST_EDITED_AT_ROLLBACK_SHAPE. A second run stops there too
-- because the renamed function no longer exists.
begin;
set local lock_timeout = '5s';

do $shape$
begin
  if to_regprocedure('public.groups_content_dispatch_before_edited_at(text,uuid,uuid,uuid,jsonb,uuid)') is null then
    raise exception 'GROUP_POST_EDITED_AT_ROLLBACK_SHAPE: migration is not applied';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure), 'group_post_edited_items') = 0 then
    raise exception 'GROUP_POST_EDITED_AT_ROLLBACK_SHAPE: the current dispatcher is not this migration''s wrapper';
  end if;
end $shape$;

drop function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid);
alter function public.groups_content_dispatch_before_edited_at(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch;
drop function public.group_post_edited_items(jsonb);
alter table public.group_posts drop column edited_at;
revoke all on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;

notify pgrst, 'reload schema';
commit;

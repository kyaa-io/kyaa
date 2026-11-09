-- Rollback of 20261220060000_group_operator_mark.sql: posts, comments and post-detail answer without `operator` again.
-- The wrapper is dropped and the function it called gets its name and its service_role grant back. A second run stops at
-- GROUP_OPERATOR_MARK_ROLLBACK_SHAPE because the renamed function no longer exists.
begin;
set local lock_timeout = '5s';

do $shape$
begin
  if to_regprocedure('public.groups_content_dispatch_before_operator_mark(text,uuid,uuid,uuid,jsonb,uuid)') is null then
    raise exception 'GROUP_OPERATOR_MARK_ROLLBACK_SHAPE: migration is not applied';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure), 'group_operator_mark_items') = 0 then
    raise exception 'GROUP_OPERATOR_MARK_ROLLBACK_SHAPE: the current dispatcher is not this migration''s wrapper';
  end if;
end $shape$;

drop function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid);
alter function public.groups_content_dispatch_before_operator_mark(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_content_dispatch;
drop function public.group_operator_mark_items(uuid,jsonb);
revoke all on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;

notify pgrst, 'reload schema';
commit;

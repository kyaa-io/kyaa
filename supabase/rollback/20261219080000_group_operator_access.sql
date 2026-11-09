-- Rollback of 20261219080000_group_operator_access.sql. 감독 승인 필요: 운영자 members 응답에 가입 답변 원문이 다시 나간다.
-- Roll back 20261219084000, 20261219082000 and 20261219081000 first (they call the helpers dropped here).
-- group_role_audit is kept as a record (its triggers and the capture trigger on group_memberships go away).
begin;
set local lock_timeout = '5s';
drop function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid);
alter function public.groups_dispatch_before_operator_access(text,uuid,uuid,uuid,jsonb,uuid) rename to groups_dispatch;
grant execute on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) to service_role;

do $patch$
declare
  sig constant regprocedure := 'public.groups_dispatch_before_content(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure;
  anchor constant text := $n$'role',m.role,$n$ || chr(10) || $n$ 'joinedAt',case when member_role in ('owner','manager') then m.joined_at end$n$;
  restored constant text := $n$'role',m.role,'answer',case when member_role in ('owner','manager') then m.answer end,$n$ || chr(10) || $n$ 'joinedAt',case when member_role in ('owner','manager') then m.joined_at end$n$;
  definition text := pg_catalog.pg_get_functiondef(sig);
begin
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then raise exception 'GROUP_OPERATOR_ACCESS_ROLLBACK_SHAPE'; end if;
  execute replace(definition, anchor, restored);
end $patch$;

drop trigger group_role_audit_capture on public.group_memberships;
drop function public.group_role_audit_capture();
drop function public.group_operator_consume_read(uuid,uuid,text);
drop function public.group_operator_require(uuid,uuid);
drop function public.group_operator_role(uuid,uuid);
drop function public.group_operator_read_limit();
drop table public.group_operator_read_budgets;
notify pgrst, 'reload schema';
commit;

-- Rollback of 20261219040000_dukjil_self_reaction_no_points.sql: a like on your own post pays the reaction reward again.
-- Nothing to undo in data: self likes during the migration wrote no log, ledger or stamp rows.
begin;
set local lock_timeout = '5s';

do $patch$
declare
  sig constant regprocedure := 'public.record_dukjil_action(uuid,uuid,text,text,uuid,jsonb)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(sig);
  inserted constant text := $a$  -- 20261219040000: a like on your own post pays nothing (no points, no stamp, no log row); the like itself stays.
  if p_action_key = 'reaction' and p_source_key ~ '^post-like:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists(select 1 from public.fan_posts fp where fp.id = pg_catalog.substr(p_source_key, 11)::uuid and fp.app_user_id = p_user) then
    return jsonb_build_object('points', 0, 'stampId', null, 'capped', false, 'reason', 'SELF_REACTION', 'replayed', false);
  end if;
$a$;
begin
  if pg_catalog.strpos(definition, inserted) = 0 then return; end if;
  execute pg_catalog.replace(definition, inserted, '');
end
$patch$;

commit;

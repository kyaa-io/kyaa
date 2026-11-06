-- Independent review follow-ups (2026-11-06) to 20261211110000 and 20261211120000.
-- 1. A sanction that revokes a title on an already void stamp answers replayed:false, so the admin panel does not show it as "already handled". A repeat still answers replayed:true.
-- 2. The audit row of that sanction carries the admin's reason. passport_stamp_voids is immutable, so nothing else records it.
-- 3. The shared passport's default branch leaves voided community stamps out, like the explicit branch.
-- 4. void_passport_stamp takes the wallet lock before the stamp row, the same order as the content correction path. The two used to deadlock on the same stamp;
--    one side failed and the data stayed correct, so this removes a failed request and changes no result. A void that waited and lost the race answers as a replay.
-- Reverse: restore void_passport_stamp and passport_sanction_voided_stamp from 20261211110000 and remove the shared passport condition.

create function public.passport_sanction_voided_stamp(p_actor uuid, p_stamp uuid, p_prior_sanction boolean, p_sanction boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare st public.community_stamps; v_allow uuid; changed boolean := false;
begin
  if coalesce(p_sanction, false) then
    select a.id into v_allow from public.admin_allowlist a join public.app_users u on u.verified_email = a.email
     where u.id = p_actor and u.status = 'active' and a.active and a.role <> 'viewer' limit 1;
    if v_allow is null then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end if;
  end if;
  select * into st from public.community_stamps where id = p_stamp;
  if st.id is null or st.celebrity_id is null then return jsonb_build_object('revoked', false, 'changed', false); end if;
  if coalesce(p_sanction, false) then
    perform public.group_wallet_lock_target(st.app_user_id);
    update public.jjinfan_titles set revoked_at = pg_catalog.clock_timestamp()
     where app_user_id = st.app_user_id and celebrity_id = st.celebrity_id and revoked_at is null;
    changed := found;
    if changed then
      insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, before_after_summary)
        values (p_actor, v_allow, 'passport.stamp.sanction_after_void', 'community_stamp', st.id::text,
          jsonb_build_object('appUserId', st.app_user_id, 'celebrityId', st.celebrity_id, 'reason', p_reason));
    end if;
  end if;
  return jsonb_build_object('changed', changed, 'revoked', (coalesce(p_sanction, false) or coalesce(p_prior_sanction, false))
     and exists(select 1 from public.jjinfan_titles t where t.app_user_id = st.app_user_id and t.celebrity_id = st.celebrity_id and t.revoked_at is not null));
end $$;
revoke all on function public.passport_sanction_voided_stamp(uuid, uuid, boolean, boolean, text) from public, anon, authenticated, service_role;

do $migration$
declare
  def text;
  void_replay constant text := $v$return (select jsonb_build_object('stampId', st.id, 'replayed', not (s.x ->> 'changed')::boolean, 'pointCorrection', 'none', 'jjinfanRevoked', (s.x ->> 'revoked')::boolean)
      from (select public.passport_sanction_voided_stamp(p_actor, st.id, false, p_sanction, p_reason) as x) s);$v$;
  a1 constant text := $a$return jsonb_build_object('stampId', prior.stamp_id, 'replayed', true, 'pointCorrection', prior.point_correction,
      'jjinfanRevoked', case when prior.stamp_id = p_stamp_id then public.passport_sanction_voided_stamp(p_actor, prior.stamp_id, prior.sanction, p_sanction) else false end);$a$;
  b1 constant text := $b$return (select jsonb_build_object('stampId', prior.stamp_id, 'replayed', not coalesce((s.x ->> 'changed')::boolean, false), 'pointCorrection', prior.point_correction,
        'jjinfanRevoked', coalesce((s.x ->> 'revoked')::boolean, false))
      from (select case when prior.stamp_id = p_stamp_id then public.passport_sanction_voided_stamp(p_actor, prior.stamp_id, prior.sanction, p_sanction, p_reason) end as x) s);$b$;
  a2 constant text := $a$return jsonb_build_object('stampId', st.id, 'replayed', true, 'pointCorrection', 'none',
      'jjinfanRevoked', public.passport_sanction_voided_stamp(p_actor, st.id, false, p_sanction));$a$;
  a3 constant text := $a$select * into st from public.community_stamps where id = p_stamp_id for update;$a$;
  b3 constant text := $b$select * into st from public.community_stamps where id = p_stamp_id;$b$;
  a4 constant text := $a$else perform public.group_wallet_lock(st.app_user_id, true); end if;$a$;
begin
  select pg_get_functiondef('public.void_passport_stamp(uuid,uuid,text,boolean,text)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, a1, ''))) / length(a1) <> 1 or (length(def) - length(replace(def, a2, ''))) / length(a2) <> 1
     or (length(def) - length(replace(def, a3, ''))) / length(a3) <> 1 or (length(def) - length(replace(def, a4, ''))) / length(a4) <> 1 then
    raise exception 'VOID_FOLLOWUP_ANCHOR_CHANGED'; end if;
  def := replace(def, a1, b1);
  def := replace(def, a2, void_replay);
  def := replace(def, a3, b3);
  def := replace(def, a4, a4 || E'\n  -- wallet lock first, then the stamp row (same order as the content correction path); a void that waited on the lock may have lost the race\n  select * into st from public.community_stamps where id = p_stamp_id for update;\n  if st.revoked_at is not null then\n    ' || void_replay || E'\n  end if;');
  execute def;
end $migration$;

drop function public.passport_sanction_voided_stamp(uuid, uuid, boolean, boolean);

do $migration$
declare
  def text;
  a constant text := $a$(select count(*) from public.community_stamps cs where cs.app_user_id=p.app_user_id and cs.celebrity_id=p.celebrity_id)$a$;
  b constant text := $b$(select count(*) from public.community_stamps cs where cs.app_user_id=p.app_user_id and cs.celebrity_id=p.celebrity_id and cs.revoked_at is null)$b$;
begin
  select pg_get_functiondef('public.read_shared_passport_activity(text)'::regprocedure) into strict def;
  if (length(def) - length(replace(def, a, ''))) / length(a) <> 1 then raise exception 'SHARED_PASSPORT_ANCHOR_CHANGED'; end if;
  execute replace(def, a, b);
end $migration$;

-- Function owner rights (P1/P2 42501 lesson): an internal owner role that differs from a callee's owner needs EXECUTE.
do $owner$
declare r record;
begin
  for r in
    select distinct o.rolname, c.oid::regprocedure::text as sig
      from pg_catalog.pg_proc f
      join pg_catalog.pg_roles o on o.oid = f.proowner
      join pg_catalog.pg_proc c on c.pronamespace = 'public'::regnamespace
     where f.pronamespace = 'public'::regnamespace
       and f.proname in ('void_passport_stamp', 'passport_sanction_voided_stamp')
       and c.proname in ('passport_sanction_voided_stamp', 'group_wallet_lock_target')
       and not o.rolsuper and o.rolname not in ('anon', 'authenticated', 'service_role', 'public')
       and not pg_catalog.has_function_privilege(o.oid, c.oid, 'EXECUTE')
  loop
    execute format('grant execute on function %s to %I', r.sig, r.rolname);
  end loop;
end $owner$;

notify pgrst, 'reload schema';

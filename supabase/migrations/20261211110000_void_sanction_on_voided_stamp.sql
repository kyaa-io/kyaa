-- A sanction sent for a stamp that is already void did nothing and answered as an ordinary replay: the title stayed active (room entry, page 2 claims,
-- challenge count), and an admin who voided a fraudulent proof first and sanctioned second had no way to take the title back on that stamp.
-- Now that sanction revokes the title, once, and writes an audit row (passport_stamp_voids is immutable, so its original row stays as it was).
-- The rule itself (D9: a sanction revokes the title and the hearts stay) does not change. Hearts, points and slots are not touched here.
-- The replay answer also becomes true only when the title really is revoked; before, a sanction on a member with no title answered false, then true on replay.
-- Reverse: restore void_passport_stamp from 20261210132000 and drop passport_sanction_voided_stamp.

create function public.passport_sanction_voided_stamp(p_actor uuid, p_stamp uuid, p_prior_sanction boolean, p_sanction boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare st public.community_stamps; v_allow uuid; changed boolean := false;
begin
  select * into st from public.community_stamps where id = p_stamp;
  if st.id is null or st.celebrity_id is null then return false; end if;
  if coalesce(p_sanction, false) then
    select a.id into v_allow from public.admin_allowlist a join public.app_users u on u.verified_email = a.email
     where u.id = p_actor and u.status = 'active' and a.active and a.role <> 'viewer' limit 1;
    if v_allow is null then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end if;
    perform public.group_wallet_lock_target(st.app_user_id);
    update public.jjinfan_titles set revoked_at = pg_catalog.clock_timestamp()
     where app_user_id = st.app_user_id and celebrity_id = st.celebrity_id and revoked_at is null;
    changed := found;
    if changed then
      insert into public.audit_logs(actor_app_user_id, actor_admin_allowlist_id, action, entity_type, entity_id, before_after_summary)
        values (p_actor, v_allow, 'passport.stamp.sanction_after_void', 'community_stamp', st.id::text,
          jsonb_build_object('appUserId', st.app_user_id, 'celebrityId', st.celebrity_id));
    end if;
  end if;
  return (coalesce(p_sanction, false) or coalesce(p_prior_sanction, false))
     and exists(select 1 from public.jjinfan_titles t where t.app_user_id = st.app_user_id and t.celebrity_id = st.celebrity_id and t.revoked_at is not null);
end $$;
revoke all on function public.passport_sanction_voided_stamp(uuid, uuid, boolean, boolean) from public, anon, authenticated, service_role;

do $migration$
declare
  def text; patched text;
  a1 constant text := $a$'jjinfanRevoked', exists(select 1 from public.passport_stamp_voids v where v.id = prior.id and v.sanction));$a$;
  b1 constant text := $b$'jjinfanRevoked', case when prior.stamp_id = p_stamp_id then public.passport_sanction_voided_stamp(p_actor, prior.stamp_id, prior.sanction, p_sanction) else false end);$b$;
  a2 constant text := $a$return jsonb_build_object('stampId', st.id, 'replayed', true, 'pointCorrection', 'none', 'jjinfanRevoked', false);$a$;
  b2 constant text := $b$return jsonb_build_object('stampId', st.id, 'replayed', true, 'pointCorrection', 'none',
      'jjinfanRevoked', public.passport_sanction_voided_stamp(p_actor, st.id, false, p_sanction));$b$;
begin
  select pg_get_functiondef('public.void_passport_stamp(uuid,uuid,text,boolean,text)'::regprocedure) into strict def;
  if position(a1 in def) = 0 or position(a2 in def) = 0 then raise exception 'VOID_SANCTION_ANCHOR_CHANGED'; end if;
  patched := replace(replace(def, a1, b1), a2, b2);
  execute patched;
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

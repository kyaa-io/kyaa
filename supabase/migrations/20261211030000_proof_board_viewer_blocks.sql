-- PASSPORT-RENEWAL P3 follow-up (PR-P3-UI-6): the public proof board leaves out authors the viewer blocked.
-- read_proof_board gains an optional viewer. Direction matches the general feeds (public.fan_web_blocked): a block in either direction hides the post.
-- Without a viewer the result is unchanged. The author id is still never returned. The old three-argument signature is dropped so no overload remains.
-- Reverse: redefine read_proof_board(uuid, integer, timestamptz) as in 20261210240000 plus the voided-stamp condition of 20261210250000.

drop function public.read_proof_board(uuid, integer, timestamptz);

create function public.read_proof_board(p_celebrity uuid, p_limit integer default 20, p_before timestamptz default null, p_viewer uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with page as (
    select p.id as post_id, p.app_user_id, p.body, p.created_at, s.id as submission_id, s.proof_type, s.amount_visible
      from public.fan_posts p
      join public.certification_submissions s on s.id = p.source_id and p.source_type = 'certification_submission'
     where p.celebrity_id = p_celebrity and p.category = 'proof' and p.visibility = 'public'
       and p.deleted_at is null and p.hidden_at is null
       and s.status = 'approved' and s.publish_consent = true and s.proof_type is not null
       and not exists (select 1 from public.dukjil_action_log l join public.community_stamps cs on cs.id = l.stamp_id
                        where l.app_user_id = s.app_user_id and l.action_key = 'proof' and l.source_key = s.id::text
                          and cs.revoked_at is not null)
       and (p_viewer is null or not public.fan_web_blocked(p_viewer, p.app_user_id))
       and (p_before is null or p.created_at < p_before)
     order by p.created_at desc, p.id desc
     limit least(greatest(coalesce(p_limit, 20), 1), 50))
  select coalesce(jsonb_agg(jsonb_build_object('postId', g.post_id, 'body', g.body, 'createdAt', g.created_at,
    'submissionId', g.submission_id, 'proofType', g.proof_type, 'amountVisible', g.amount_visible,
    'imageObjectPath', g.image_path, 'jjinfanRank', g.rank) order by g.created_at desc, g.post_id desc), '[]'::jsonb)
  from (
    select pg.*,
      (select u.object_path from public.certification_uploads u where u.consumed_submission_id = pg.submission_id and u.purged_at is null
        order by u.created_at desc, u.id desc limit 1) as image_path,
      (select (select count(*) from public.jjinfan_titles t2 where t2.celebrity_id = t.celebrity_id
                and (t2.achieved_at, t2.app_user_id) <= (t.achieved_at, t.app_user_id))::integer
         from public.jjinfan_titles t where t.app_user_id = pg.app_user_id and t.celebrity_id = p_celebrity and t.revoked_at is null) as rank
    from page pg) g
$$;

revoke all on function public.read_proof_board(uuid, integer, timestamptz, uuid) from public, anon, authenticated, service_role;
grant execute on function public.read_proof_board(uuid, integer, timestamptz, uuid) to service_role;

-- The function owner calls fan_web_blocked: same owner-EXECUTE rule as p3_grant_isolation_owner_execute (20261210250000), checked instead of assumed.
do $migration$
declare o oid;
begin
  select proowner into o from pg_catalog.pg_proc where oid = 'public.read_proof_board(uuid,integer,timestamptz,uuid)'::regprocedure;
  if not pg_catalog.has_function_privilege(o, 'public.fan_web_blocked(uuid,uuid)'::regprocedure, 'execute') then
    execute pg_catalog.format('grant execute on function public.fan_web_blocked(uuid,uuid) to %I', (select rolname from pg_catalog.pg_roles where oid = o));
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.read_proof_board(uuid,integer,timestamptz,uuid)'::regprocedure, 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'public.read_proof_board(uuid,integer,timestamptz,uuid)'::regprocedure, 'execute')
     or not pg_catalog.has_function_privilege('service_role', 'public.read_proof_board(uuid,integer,timestamptz,uuid)'::regprocedure, 'execute') then
    raise exception 'PROOF_BOARD_VIEWER_GRANT_MISMATCH' using errcode = 'P0001';
  end if;
end $migration$;

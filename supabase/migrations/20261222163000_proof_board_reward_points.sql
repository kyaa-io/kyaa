-- PROOF-TAB-1630: show the actual historical policy award; missing receipt stays null.
create or replace function public.read_proof_board(p_celebrity uuid, p_limit integer default 20, p_before timestamptz default null, p_viewer uuid default null)
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
    'awardedPoints', (select l.points from public.dukjil_action_log l where l.app_user_id = g.app_user_id and l.action_key = 'proof' and l.source_key = g.submission_id::text),
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


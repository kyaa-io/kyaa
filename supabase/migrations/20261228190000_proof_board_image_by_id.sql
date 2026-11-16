-- Resolve one public image without a timestamp pagination window. Same visibility conditions as read_proof_board
-- (20261222163000): approved, publish consent, public, not deleted/hidden, stamp not revoked.
create function public.read_proof_board_image(p_celebrity uuid, p_post uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('postId', p.id, 'imageObjectPath',
    (select u.object_path from public.certification_uploads u
      where u.consumed_submission_id = s.id and u.purged_at is null
      order by u.created_at desc, u.id desc limit 1))), '[]'::jsonb)
  from public.fan_posts p
  join public.certification_submissions s on s.id = p.source_id and p.source_type = 'certification_submission'
  where p.id = p_post and p.celebrity_id = p_celebrity
    and p.category = 'proof' and p.visibility = 'public'
    and p.deleted_at is null and p.hidden_at is null
    and s.status = 'approved' and s.publish_consent = true and s.proof_type is not null
    and not exists (select 1 from public.dukjil_action_log l join public.community_stamps cs on cs.id = l.stamp_id
                     where l.app_user_id = s.app_user_id and l.action_key = 'proof' and l.source_key = s.id::text
                       and cs.revoked_at is not null)
$$;
revoke all on function public.read_proof_board_image(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.read_proof_board_image(uuid, uuid) to service_role;

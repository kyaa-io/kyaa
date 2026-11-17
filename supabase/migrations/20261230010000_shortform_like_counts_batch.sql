-- /shorts popularity order: like totals of many public videos in one read instead of one read_shortform_participation call per video.
-- Same rules as the likeCount of read_shortform_participation (20261220210000): the video must be a home short of a public creator and only likes of
-- active members count. Nothing about any member is returned; a video that is not public is left out of the answer (the single read gives null).
-- At most 200 video ids per call. Order: this migration first, then the web. Rollback: supabase/rollback/20261230010000_shortform_like_counts_batch.sql.
begin;
set local lock_timeout = '5s';

create function public.read_public_shortform_like_counts(p_video_ids text[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_video_ids is null or cardinality(p_video_ids) not between 1 and 200 then
    raise exception 'invalid shortform like batch' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_object_agg(s.video_id, coalesce(l.likes, 0))
      from public.home_shortform s
      left join (
        select r.video_id, count(*) likes
          from public.shortform_reactions r
          join public.app_users u on u.id = r.app_user_id and u.status = 'active'
         where r.reaction = 'like' and r.video_id = any (p_video_ids)
         group by r.video_id) l on l.video_id = s.video_id
     where s.video_id = any (p_video_ids) and public.home_gallery_creator_public(s.celebrity_id)), '{}'::jsonb);
end $$;

revoke all on function public.read_public_shortform_like_counts(text[]) from public, anon, authenticated, service_role;
grant execute on function public.read_public_shortform_like_counts(text[]) to service_role;

-- Same owner as read_shortform_participation, which already holds the grants and policies on the tables read here (20261220210000);
-- otherwise stop instead of counting zero likes under row security.
do $owner$
begin
  if (select p.proowner from pg_catalog.pg_proc p where p.oid = 'public.read_public_shortform_like_counts(text[])'::regprocedure)
     is distinct from
     (select p.proowner from pg_catalog.pg_proc p where p.oid = 'public.read_shortform_participation(text,uuid)'::regprocedure) then
    raise exception 'SHORTFORM_LIKE_COUNTS_OWNER_GAP: the new read must have the same owner as read_shortform_participation';
  end if;
end
$owner$;

notify pgrst, 'reload schema';
commit;

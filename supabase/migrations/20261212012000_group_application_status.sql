-- [10] An applicant reads where each of their own applications stands. Only the applicant's rows, and no reviewer identity.
-- Applications still waiting return no reason: a resubmitted application keeps the previous reviewer note in its row.
-- New function only. Old web does not call it, so the order against the web does not matter except that this goes first.
begin;
set local lock_timeout='5s';
create function public.group_application_status(p_actor uuid,p_item_id uuid default null,p_limit integer default 20)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
  'id',x.id,'kind',x.kind,'name',x.name,'status',x.status,
  'reason',case when x.status in('changes_requested','approved','rejected')then x.reason end,
  'pageId',x.page_id,'pageSlug',x.slug,'submissionRevision',x.submission_revision,'submittedAt',x.created_at,
  'reviewedAt',case when x.status in('changes_requested','approved','rejected')then x.reviewed_at end
 )order by x.created_at desc,x.id desc),'[]'::jsonb))
 from(
  select a.id,a.kind,a.name,a.status,a.reason,a.page_id,c.slug,a.submission_revision,a.created_at,a.reviewed_at
  from public.group_applications a
  left join public.group_pages p on p.id=a.page_id
  left join public.celebrities c on c.id=p.celebrity_id and c.status='published' and c.archived_at is null
  where a.applicant_id=p_actor and(p_item_id is null or a.id=p_item_id)
  order by a.created_at desc,a.id desc
  limit least(greatest(coalesce(p_limit,20),1),50)
 )x
$$;
revoke all on function public.group_application_status(uuid,uuid,integer)from public,anon,authenticated;
grant execute on function public.group_application_status(uuid,uuid,integer)to service_role;
commit;

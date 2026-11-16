-- Run after SNS fixtures or against DEV; changes are rolled back.
begin;
do $$
declare nid uuid; original_time timestamptz; cms_time timestamptz;
begin
  select n.id,p.source_published_at,n.published_at into nid,original_time,cms_time
  from public.sns_ingest_posts p join public.celebrity_notices n on n.id=p.notice_id
  join public.home_shortform h on h.source_notice_id=n.id
  where n.publication_status='published' limit 1;
  if nid is null then raise exception 'requires a published ingested short'; end if;
  update public.sns_ingest_posts set source_published_at='2026-01-02T03:04:05Z' where notice_id=nid;
  perform public.sync_home_shortform_notice(nid);
  if (select published_at from public.home_shortform where source_notice_id=nid) is distinct from '2026-01-02T03:04:05Z'::timestamptz then
    raise exception 'short must use source time';
  end if;
  if (select published_at from public.celebrity_notices where id=nid) is distinct from cms_time then
    raise exception 'CMS publication time must be preserved';
  end if;
end $$;
rollback;

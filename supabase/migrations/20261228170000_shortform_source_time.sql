begin;
set local lock_timeout = '5s';
create or replace function public.sync_home_shortform_notice(p_notice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_href text; v_title text; v_celebrity uuid; v_published timestamptz;
begin
  select public.home_shortform_notice_link(n.id), btrim(l.title), n.celebrity_id, coalesce((select p.source_published_at from public.sns_ingest_posts p where p.notice_id = n.id), n.published_at)
    into v_href, v_title, v_celebrity, v_published
    from public.celebrity_notices n
    join public.celebrity_notice_localizations l on l.notice_id = n.id and l.locale = 'ko'
    where n.id = p_notice_id and n.publication_status = 'published' and n.archived_at is null and n.visibility = 'public';
  if v_href is null or coalesce(v_title, '') = '' then return; end if;
  insert into public.home_shortform(celebrity_id, video_id, title, href, published_at, platform, source_notice_id)
    values (v_celebrity, split_part(v_href, '/video/', 2), left(v_title, 300), v_href, v_published, 'tiktok', p_notice_id)
  on conflict (source_notice_id) do update set title = excluded.title, published_at = excluded.published_at
    where public.home_shortform.video_id = excluded.video_id;
exception when unique_violation then
  -- The same TikTok video already belongs to another notice; the first notice keeps it.
  return;
end $$;


-- Preserve manual rows and all existing creator interleaving functions.
select public.sync_home_shortform_notice(s.source_notice_id)
from public.home_shortform s join public.sns_ingest_posts p on p.notice_id=s.source_notice_id;
commit;

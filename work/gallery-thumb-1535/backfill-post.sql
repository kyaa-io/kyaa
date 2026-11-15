-- DRAFT ONLY. Supervisor supplies :notice_id, :source_url, :media_id and actual normalized image metadata.
-- Never rewrite notice localizations, original text or source URL.
-- Apply both new migrations plus the SNS ingest prerequisite before this procedure.
-- 1. Verify notice/source association and original platform cover in the reviewed manifest.
-- 2. Insert video_thumbnails metadata with sns-ingest/<notice UUID>/<media UUID>.webp
--    and matching -thumbnail.webp path. This reserves the paths for the common S3 uploader.
--    The video-only reservation allows a reviewed public notice without changing publication status.
--    Run this metadata insert only after confirming the original source link in the notice:
insert into public.video_thumbnails(id,notice_id,source_url,storage_path,thumbnail_path,width,height,byte_size,sha256,source_host)
select :'media_id'::uuid, :'notice_id'::uuid, :'source_url',
 'sns-ingest/'||:'notice_id'||'/'||:'media_id'||'.webp',
 'sns-ingest/'||:'notice_id'||'/'||:'media_id'||'-thumbnail.webp',
 :'width'::integer, :'height'::integer, :'byte_size'::integer, :'sha256', :'source_host'
where public.fan_web_content_visible(null,'notice',:'notice_id'::uuid)
 and exists(select 1 from public.celebrity_notice_localizations l where l.notice_id=:'notice_id'::uuid
   and jsonb_path_exists(l.body_json,'lax $.**.attrs.href ? (@ == $url)',jsonb_build_object('url',:'source_url')))
on conflict (id) do nothing;
-- 3. Download with the existing allowedImageUrl/fetchImage boundary, normalize and upload both files.
-- 4. This post check must return 1 before considering a row complete:
select count(*) as ready_objects
from public.video_thumbnails t
where t.id = :'media_id'::uuid and t.notice_id = :'notice_id'::uuid
  and t.source_url = :'source_url'
  and exists(select 1 from public.s3_storage_objects o where o.bucket_id='mobile-media' and o.name=t.storage_path and o.state='ready')
  and exists(select 1 from public.s3_storage_objects o where o.bucket_id='mobile-media' and o.name=t.thumbnail_path and o.state='ready');
-- Roll back any metadata-only row if upload fails; do not publish a broken thumbnail.

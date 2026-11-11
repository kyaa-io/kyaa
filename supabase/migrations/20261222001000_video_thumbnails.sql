begin;
create table public.video_thumbnails (
  id uuid primary key,
  notice_id uuid not null references public.celebrity_notices(id) on delete restrict,
  storage_path text not null unique check (storage_path ~ '^sns-ingest/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  thumbnail_path text not null unique check (thumbnail_path ~ '^sns-ingest/[0-9a-f-]{36}/[0-9a-f-]{36}-thumbnail\.webp$'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  byte_size integer not null check (byte_size between 1 and 8388608),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  source_host text not null,
  source_url text not null,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.video_thumbnails enable row level security;
alter table public.video_thumbnails force row level security;
revoke all on public.video_thumbnails from public,anon,authenticated;
grant all on public.video_thumbnails to service_role;
create index video_thumbnails_source_idx on public.video_thumbnails(source_url);
create function public.sns_ingest_register_video_thumbnail(
  p_run_id uuid, p_notice_id uuid, p_media_id uuid, p_storage_path text, p_thumbnail_path text,
  p_width integer, p_height integer, p_byte_size integer, p_sha256 text, p_source_host text
) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_storage_path <> 'sns-ingest/'||p_notice_id::text||'/'||p_media_id::text||'.webp'
    or p_thumbnail_path <> 'sns-ingest/'||p_notice_id::text||'/'||p_media_id::text||'-thumbnail.webp' then
    raise exception 'SNS_INGEST_INVALID_MEDIA' using errcode='22023';
  end if;
  if not exists(select 1 from public.sns_ingest_posts p join public.celebrity_notices n on n.id=p.notice_id
    where p.notice_id=p_notice_id and p.last_run_id=p_run_id and n.publication_status='draft'
      and n.archived_at is null and n.ever_published_at is null) then
    raise exception 'SNS_INGEST_NOTICE_NOT_WRITABLE' using errcode='P0002';
  end if;
  -- The body references at most two; retries of a held draft may register replacements.
  if (select count(*) from public.video_thumbnails where notice_id=p_notice_id)>=10 then
    raise exception 'SNS_INGEST_TOO_MANY_MEDIA' using errcode='22023';
  end if;
  insert into public.video_thumbnails(id,notice_id,storage_path,thumbnail_path,width,height,byte_size,sha256,source_host,source_url)
    values(p_media_id,p_notice_id,p_storage_path,p_thumbnail_path,p_width,p_height,p_byte_size,p_sha256,p_source_host,(select source_url from public.sns_ingest_posts where notice_id=p_notice_id));
end $$;

create or replace function public.authorize_public_official_media_read(p_asset_id uuid,p_variant text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((
    select jsonb_build_object(
      'storagePath',case when p_variant='thumbnail'then a.thumbnail_path else a.storage_path end,
      'contentType',case when p_variant='thumbnail'then'image/webp'else a.content_type end)
    from public.mobile_media_assets a
    where a.id=p_asset_id and p_variant in('original','thumbnail') and a.kind in('image','video')
      and a.state='ready'and a.storage_deleted_at is null and a.cleanup_requested_at is null
      and a.attached_type='notice'and a.access_scope='notice'
      and public.fan_web_content_visible(null,'notice',a.attached_id)),(
    select jsonb_build_object(
      'storagePath',case when p_variant='thumbnail'then m.thumbnail_path else m.storage_path end,
      'contentType','image/webp')
    from (select id,notice_id,storage_path,thumbnail_path from public.sns_ingest_media union all select id,notice_id,storage_path,thumbnail_path from public.video_thumbnails) m
    where m.id=p_asset_id and p_variant in('original','thumbnail')
      and public.fan_web_content_visible(null,'notice',m.notice_id)
      and exists(select 1 from public.s3_storage_objects o where o.bucket_id='mobile-media' and o.name=m.storage_path and o.state='ready')
      and exists(select 1 from public.s3_storage_objects o where o.bucket_id='mobile-media' and o.name=m.thumbnail_path and o.state='ready')));
$$;

create function public.read_public_video_thumbnails(p_hrefs text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(source_url,'/api/public/notice-media/'||id::text||'?variant=thumbnail'),'{}'::jsonb)
 from (select distinct on (source_url) source_url,id from public.video_thumbnails
 where source_url=any(p_hrefs) and cardinality(p_hrefs)<=100
 and public.fan_web_content_visible(null,'notice',notice_id)
 and exists(select 1 from public.s3_storage_objects o where o.bucket_id='mobile-media' and o.name=video_thumbnails.storage_path and o.state='ready')
 and exists(select 1 from public.s3_storage_objects o where o.bucket_id='mobile-media' and o.name=video_thumbnails.thumbnail_path and o.state='ready')
 order by source_url,created_at desc,id) covers;
$$;
revoke all on function public.sns_ingest_register_video_thumbnail(uuid,uuid,uuid,text,text,integer,integer,integer,text,text) from public,anon,authenticated;
revoke all on function public.read_public_video_thumbnails(text[]) from public,anon,authenticated;
grant execute on function public.sns_ingest_register_video_thumbnail(uuid,uuid,uuid,text,text,integer,integer,integer,text,text) to service_role;
grant execute on function public.read_public_video_thumbnails(text[]) to service_role;
commit;

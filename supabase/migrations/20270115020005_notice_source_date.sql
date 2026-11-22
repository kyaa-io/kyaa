begin;
set local lock_timeout='5s';

alter table public.celebrity_notices add column source_published_at timestamptz;
alter table public.celebrity_notices add column display_published_at timestamptz
  generated always as (coalesce(source_published_at,published_at)) stored;

create function public.copy_ingested_notice_date() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.celebrity_notices set source_published_at=new.source_published_at
    where id=new.notice_id and source_published_at is distinct from new.source_published_at;
  return new;
end $$;
revoke all on function public.copy_ingested_notice_date() from public,anon,authenticated;
create trigger copy_ingested_notice_date after insert or update of source_published_at on public.sns_ingest_posts
  for each row execute function public.copy_ingested_notice_date();
update public.celebrity_notices n set source_published_at=s.source_published_at
  from public.sns_ingest_posts s where n.id=s.notice_id and s.source_published_at is not null;

create function public.set_notice_source_date(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,
  p_correlation_id uuid,p_celebrity_id uuid,p_notice_id uuid,p_expected_revision integer,p_source_published_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.fan_web_lock_active_user(p_actor_app_user_id);
  perform public.assert_channel_writer(p_actor_app_user_id,p_actor_admin_allowlist_id,p_celebrity_id);
  update public.celebrity_notices set source_published_at=p_source_published_at,revision=revision+1
    where id=p_notice_id and celebrity_id=p_celebrity_id and revision=p_expected_revision and archived_at is null;
  if not found then raise exception 'NOTICE_DATE_REVISION_CONFLICT'; end if;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)
    values(p_actor_app_user_id,p_actor_admin_allowlist_id,'notice.source_date.updated','celebrity_notice',p_notice_id::text,p_correlation_id,jsonb_build_object('sourcePublishedAt',p_source_published_at));
end $$;

create function public.save_dated_celebrity_notice(
  p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_notice_id uuid,
  p_expected_revision integer,p_celebrity_id uuid,p_slug text,p_pinned boolean,p_title_ko text,p_body_ko jsonb,
  p_title_en text,p_body_en jsonb,p_source_published_at timestamptz,p_post_type text default null,p_visibility text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
  if p_post_type is null and p_visibility is null then
    saved:=public.save_admin_celebrity_notice(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,p_notice_id,
      p_expected_revision,p_celebrity_id,p_slug,p_pinned,p_title_ko,p_body_ko,p_title_en,p_body_en);
  else
    saved:=public.save_admin_celebrity_notice(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,p_notice_id,
      p_expected_revision,p_celebrity_id,p_slug,p_pinned,p_title_ko,p_body_ko,p_title_en,p_body_en,p_post_type,p_visibility);
  end if;
  update public.celebrity_notices set source_published_at=p_source_published_at where id=saved;
  return saved;
end $$;

do $$
declare f regprocedure;
begin
  for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace
    and proname in ('set_notice_source_date','save_dated_celebrity_notice') loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
  f:='public.sync_home_shortform_notice(uuid)'::regprocedure;
  execute replace(pg_get_functiondef(f),
    'coalesce((select p.source_published_at from public.sns_ingest_posts p where p.notice_id = n.id), n.published_at)',
    'n.display_published_at');
  f:='public.read_fan_notices(uuid,text,public.content_locale,timestamptz,uuid,integer,boolean)'::regprocedure;
  execute replace(pg_get_functiondef(f),'published_at','display_published_at');
  for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace
    and proname in ('read_unified_creator_feed','read_fan_notice','read_owned_mobile_latest_official_post',
      'read_public_home_gallery_page','read_public_home_gallery_photos','read_public_home_shorts')
    and prosrc like '%n.published_at%' loop
    execute replace(pg_get_functiondef(f),'n.published_at','n.display_published_at');
  end loop;
end $$;
create trigger home_shortform_source_date_sync after update of source_published_at on public.celebrity_notices
  for each row when (old.source_published_at is distinct from new.source_published_at)
  execute function public.home_shortform_notice_sync_trigger();
notify pgrst,'reload schema';
commit;

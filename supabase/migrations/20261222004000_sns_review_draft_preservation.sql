begin;
set local lock_timeout='5s';
alter table public.sns_ingest_posts add column machine_revision integer;
create or replace function public.sns_ingest_save_draft(
  p_run_id uuid, p_slug text, p_source_url text, p_source_published_at timestamptz,
  p_title text, p_body jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.sns_ingest_runs; n public.celebrity_notices; v_id uuid; v_src text; v_media uuid; v_status text;
begin
  select * into r from public.sns_ingest_runs where id=p_run_id and finished_at is null;
  if not found then raise exception 'SNS_INGEST_RUN_NOT_FOUND' using errcode='P0002'; end if;
  if p_slug !~ ('^'||r.platform||'-[0-9a-f]{16}$') then raise exception 'SNS_INGEST_INVALID_SLUG' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.celebrity_id::text||p_slug,0));
  select * into n from public.celebrity_notices where celebrity_id=r.celebrity_id and slug=p_slug for update;
  if found then
    if n.publication_status='published' then
      return jsonb_build_object('status','duplicate','noticeId',n.id,'revision',n.revision);
    end if;
    if n.archived_at is not null or n.ever_published_at is not null or n.post_type<>'artist_post'
      or n.visibility<>'public' or n.notice_kind<>'standard' or n.pinned
      or not exists(select 1 from public.sns_ingest_posts where notice_id=n.id) then
      return jsonb_build_object('status','blocked','noticeId',n.id,'revision',n.revision);
    end if;
    -- A previous run's draft belongs to review, including interrupted uploads.
    if exists(select 1 from public.sns_ingest_posts where notice_id=n.id
      and (last_run_id<>p_run_id or machine_revision is distinct from n.revision)) then
      return jsonb_build_object('status','held','noticeId',n.id,'revision',n.revision);
    end if;
    v_id:=n.id; v_status:='restored';
  else
    v_id:=extensions.gen_random_uuid(); v_status:='created';
  end if;
  -- Body images must be this notice's own ingested media.
  for v_src in select value#>>'{}' from jsonb_path_query(p_body,'strict $.**.attrs.src') x(value) loop
    if v_src !~ '^/api/public/notice-media/[0-9a-f-]{36}$' then raise exception 'SNS_INGEST_INVALID_MEDIA' using errcode='22023'; end if;
    v_media:=substring(v_src from '[0-9a-f-]{36}$')::uuid;
    if not exists(select 1 from public.sns_ingest_media where id=v_media and notice_id=v_id) then
      raise exception 'SNS_INGEST_INVALID_MEDIA' using errcode='22023';
    end if;
  end loop;
  if v_status='created' then
    insert into public.celebrity_notices(id,celebrity_id,slug,pinned,post_type,visibility)
      values(v_id,r.celebrity_id,p_slug,false,'artist_post','public');
  else
    update public.celebrity_notices set revision=revision+1 where id=v_id;
  end if;
  insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json) values
    (v_id,'ko',p_title,p_body),(v_id,'en',p_title,p_body)
    on conflict(notice_id,locale) do update set title=excluded.title,body_json=excluded.body_json;
  insert into public.sns_ingest_posts(notice_id,celebrity_id,platform,slug,source_url,source_published_at,created_run_id,last_run_id)
    values(v_id,r.celebrity_id,r.platform,p_slug,p_source_url,p_source_published_at,p_run_id,p_run_id)
    on conflict(notice_id) do update set source_url=excluded.source_url,source_published_at=excluded.source_published_at,last_run_id=p_run_id;
  insert into public.audit_logs(action,entity_type,entity_id,correlation_id,before_after_summary)
    values(case when v_status='created' then 'notice.sns_ingest.created' else 'notice.sns_ingest.restored' end,
      'celebrity_notice',v_id::text,r.correlation_id,jsonb_build_object('runId',p_run_id,'slug',p_slug,'celebrityId',r.celebrity_id));
  update public.sns_ingest_posts set machine_revision=(select revision from public.celebrity_notices where id=v_id) where notice_id=v_id;
  return jsonb_build_object('status',v_status,'noticeId',v_id,'revision',(select revision from public.celebrity_notices where id=v_id));
end $$;

notify pgrst, 'reload schema';
commit;

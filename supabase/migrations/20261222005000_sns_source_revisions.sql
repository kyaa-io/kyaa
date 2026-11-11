-- Keep raw recollection separate from the human-reviewed draft. Historical migrations stay immutable.
begin;
set local lock_timeout='5s';
create table public.sns_ingest_source_revisions (
  notice_id uuid not null references public.sns_ingest_posts(notice_id) on delete restrict,
  revision integer not null check (revision>0),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  source_payload jsonb not null check (jsonb_typeof(source_payload)='object'),
  run_id uuid not null references public.sns_ingest_runs(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  primary key (notice_id,revision)
);
alter table public.sns_ingest_source_revisions enable row level security;
alter table public.sns_ingest_source_revisions force row level security;
revoke all on public.sns_ingest_source_revisions from public,anon,authenticated,service_role;

create function public.sns_ingest_record_source(p_run_id uuid,p_notice_id uuid,p_source jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.celebrity_notices; previous public.sns_ingest_source_revisions; source_hash text; next_revision integer;
begin
  select * into n from public.celebrity_notices where id=p_notice_id for update;
  if not found or n.publication_status<>'draft' or n.archived_at is not null or n.ever_published_at is not null
    or not exists(select 1 from public.sns_ingest_posts p join public.sns_ingest_runs r
      on r.celebrity_id=p.celebrity_id and r.platform=p.platform
      where p.notice_id=n.id and r.id=p_run_id and r.finished_at is null
        and p_source->>'sourceUrl'=p.source_url) then
    raise exception 'SNS_INGEST_NOTICE_NOT_WRITABLE' using errcode='P0002';
  end if;
  if jsonb_typeof(p_source) is distinct from 'object' or jsonb_typeof(p_source->'text') is distinct from 'string'
    or jsonb_typeof(p_source->'images') is distinct from 'array' then
    raise exception 'SNS_INGEST_INVALID_SOURCE' using errcode='22023';
  end if;
  source_hash:=encode(extensions.digest(convert_to(p_source::text,'UTF8'),'sha256'),'hex');
  select * into previous from public.sns_ingest_source_revisions where notice_id=n.id order by revision desc limit 1;
  if found and previous.source_hash=source_hash then
    return jsonb_build_object('status','unchanged','revision',previous.revision);
  end if;
  next_revision:=coalesce(previous.revision,0)+1;
  insert into public.sns_ingest_source_revisions(notice_id,revision,source_hash,source_payload,run_id)
    values(n.id,next_revision,source_hash,p_source,p_run_id);
  return jsonb_build_object('status','recorded','revision',next_revision);
end $$;
revoke all on function public.sns_ingest_record_source(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sns_ingest_record_source(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;

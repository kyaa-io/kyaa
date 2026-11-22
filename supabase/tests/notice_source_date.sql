begin;
do $$
declare
  actor uuid:=gen_random_uuid(); allow_id uuid:=gen_random_uuid(); creator uuid:=gen_random_uuid();
  run_id uuid:=gen_random_uuid(); nid uuid; item record; actual timestamptz;
  doc jsonb:='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"원문"}]}]}';
begin
  insert into public.app_users(id,privy_user_id,verified_email) values(actor,'did:privy:source-date','source-date@example.test');
  insert into public.admin_allowlist(id,email,role,active) values(allow_id,'source-date@example.test','operator',true);
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
    values(creator,'source-date','published','/images/qa.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(creator,'ko','시험','소개','사진');
  insert into public.sns_ingest_runs(id,celebrity_id,platform,account_url,correlation_id)
    values(run_id,creator,'instagram','https://www.instagram.com/example/',gen_random_uuid());
  for item in select * from (values ('manual','2026-10-16T02:00Z'::timestamptz),
    ('instagram-1234567890abcdef','2026-10-11T10:12Z'::timestamptz),('ordinary',null)) r(slug,source_at) loop
    if item.slug='manual' then
      nid:=public.save_dated_celebrity_notice(actor,allow_id,gen_random_uuid(),null,null,creator,item.slug,false,'원문',doc,'원문',doc,
        item.source_at - interval '1 day','artist_post','public');
    else
      nid:=public.save_admin_celebrity_notice(actor,allow_id,gen_random_uuid(),null,null,creator,item.slug,false,'원문',doc,'원문',doc,'notice','public');
    end if;
    if item.slug like 'instagram-%' then
      insert into public.sns_ingest_posts(notice_id,celebrity_id,platform,slug,source_url,source_published_at,created_run_id,last_run_id)
        values(nid,creator,'instagram',item.slug,'https://www.instagram.com/p/test/',item.source_at,run_id,run_id);
    end if;
    perform public.set_admin_celebrity_notice_state(actor,allow_id,gen_random_uuid(),nid,(select revision from public.celebrity_notices where id=nid),'publish',null);
    select published_at into strict actual from public.celebrity_notices where id=nid;
    if item.slug='manual' then
      perform public.set_notice_source_date(actor,allow_id,gen_random_uuid(),creator,nid,(select revision from public.celebrity_notices where id=nid),item.source_at);
    end if;
    if (public.read_fan_notice(null,'source-date',item.slug,'ko')->>'publishedAt')::timestamptz is distinct from coalesce(item.source_at,actual)
      or (select published_at from public.celebrity_notices where id=nid) is distinct from actual then raise exception 'incorrect date for %',item.slug; end if;
  end loop;
  if (public.read_fan_notices(null,'source-date')->'notices'->1->>'slug') is distinct from 'manual' then raise exception 'incorrect list order'; end if;
end $$;
rollback;

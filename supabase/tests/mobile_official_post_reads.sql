do $$ begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Official read tests require disposable local byus_clean'; end if;
end $$;
begin;
do $$ declare
  a uuid:='92700000-0000-4000-8000-000000000001'; b uuid:='92700000-0000-4000-8000-000000000002';
  creator uuid:='92700000-0000-4000-8000-000000000010'; older uuid:='92700000-0000-4000-8000-000000000011';
  latest uuid:='92700000-0000-4000-8000-000000000012'; standard uuid:='92700000-0000-4000-8000-000000000013';
  item jsonb; first_read timestamptz; rejected boolean;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values(a,'did:privy:official-read-a','official-read-a@example.test'),(b,'did:privy:official-read-b','official-read-b@example.test');
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(creator,'official-read','published','/official.jpg',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(creator,'ko','공식','설명','공식'),(creator,'en','Official','Summary','Official');
  insert into public.celebrity_notices(id,celebrity_id,slug,post_type,pinned,publication_status,published_at,ever_published_at) values
    (older,creator,'older','artist_post',true,'published',now()-interval '2 days',now()),
    (latest,creator,'latest','artist_post',false,'published',now()-interval '1 day',now()),
    (standard,creator,'standard','notice',true,'published',now(),now());
  insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)
    select n.id,l.locale,l.title,'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Official body"}]}]}'::jsonb
    from unnest(array[older,latest,standard]) n(id)
    cross join (values('ko'::public.content_locale,'공식 새 글'),('en'::public.content_locale,'Official new post')) l(locale,title);
  item:=public.read_owned_mobile_latest_official_post(a,'official-read','en');
  if item->>'id' is distinct from latest::text or item->>'title' is distinct from 'Official new post' or item->>'readAt' is not null
    or item::text like '%'||a::text||'%' then raise exception 'latest preview selection or owner privacy invalid'; end if;
  insert into public.fan_notifications(app_user_id,kind,source_key,scheduled_for,deep_link,payload,web_only) values
    (a,'official_post','web:official-read:a',now()-interval '1 second','/my',jsonb_build_object('targetId',latest,'targetType','notice','revision',1),true),
    (b,'official_post','web:official-read:b',now()-interval '1 second','/my',jsonb_build_object('targetId',latest,'targetType','notice','revision',1),true);
  first_read:=public.mark_owned_mobile_official_post_read(a,'official-read','latest','ko');
  if first_read is null or public.mark_owned_mobile_official_post_read(a,'official-read','latest','ko') is distinct from first_read
    or public.read_owned_mobile_latest_official_post(a,'official-read','ko')->>'readAt' is null
    or public.read_owned_mobile_latest_official_post(b,'official-read','ko')->>'readAt' is not null
    or (select read_at from public.fan_notifications where source_key='web:official-read:a') is null
    or (select read_at from public.fan_notifications where source_key='web:official-read:b') is not null then raise exception 'read state did not persist only for the owner'; end if;
  update public.celebrity_notices set visibility='members' where id=latest;
  if public.read_owned_mobile_latest_official_post(a,'official-read','ko')->>'id' is distinct from older::text then raise exception 'member-only source leaked to nonmember'; end if;
  rejected:=false; begin perform public.mark_owned_mobile_official_post_read(a,'official-read','latest','ko');
    exception when others then if sqlerrm='FAN_WEB_NOT_FOUND' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'inaccessible source marked read'; end if;
  rejected:=false; begin perform public.mark_owned_mobile_official_post_read(a,'official-read','standard','ko');
    exception when others then if sqlerrm='FAN_WEB_NOT_FOUND' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'ordinary notice treated as an artist post'; end if;
  update public.celebrity_notices set publication_status='draft',published_at=null where id=older;
  if public.read_owned_mobile_latest_official_post(a,'official-read','ko') is not null then raise exception 'unpublished source still offered'; end if;
  if (select count(*) from public.mobile_official_post_reads where app_user_id=a)<>1
    or has_table_privilege('service_role','public.mobile_official_post_reads','select')
    or has_function_privilege('authenticated','public.read_owned_mobile_latest_official_post(uuid,text,public.content_locale)','execute') then raise exception 'read storage or privileges invalid'; end if;
  update public.app_users set status='disabled' where id=a;
  rejected:=false; begin perform public.read_owned_mobile_latest_official_post(a,'official-read','ko');
    exception when others then if sqlerrm='FAN_WEB_ACTIVE_ACCOUNT_REQUIRED' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'disabled owner retained preview'; end if;
end $$;
rollback;

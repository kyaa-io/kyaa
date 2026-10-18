begin;
do $$
declare
  owner uuid:='5d100000-0000-4000-8000-000000000001';
  creator uuid:='5d100000-0000-4000-8000-000000000002';
  event_id uuid:='5d100000-0000-4000-8000-000000000003';
  space_id uuid:='5d100000-0000-4000-8000-000000000004';
  live_id uuid:='5d100000-0000-4000-8000-000000000005';
  brand_id uuid:='5d100000-0000-4000-8000-000000000006';
  allow_id uuid:='5d100000-0000-4000-8000-000000000007';
  benefit_id uuid:='5d100000-0000-4000-8000-000000000008';
  policy_id uuid:='5d100000-0000-4000-8000-000000000009';
  banner_id uuid:='5d100000-0000-4000-8000-000000000010';
  value jsonb; next_page jsonb; cursor jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email)
    values(owner,'did:privy:participation-catalog','participation-catalog@example.test');
  insert into public.admin_allowlist(id,email,role,active)
    values(allow_id,'participation-catalog@example.test','admin',true);
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
    values(creator,'participation-catalog','draft','/favorite.webp','{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
    values(creator,'ko','통합 일정','설명','이미지'),(creator,'en','Catalog favorite','Summary','Image');
  update public.celebrities set status='published',published_at=now()where id=creator;
  insert into public.mobile_participation_events(
    id,slug,celebrity_id,event_kind,policy_version,state,starts_at,ends_at,title_ko,title_en,hero_url,featured_rank
  )values(event_id,'catalog-event',creator,'general','v1','published',now()-interval'1 hour',now()+interval'1 hour','행사','Event','/event.webp',1);
  insert into public.mobile_participation_spaces(
    id,slug,celebrity_id,policy_version,state,opens_at,closes_at,title_ko,title_en,image_url,created_by_admin_id
  )values(space_id,'catalog-space',creator,'v1','published',now()-interval'1 hour',now()+interval'1 hour','공간','Space','/space.webp',allow_id);
  insert into public.brands(id,slug,status,logo_url,logo_alt,published_at)
    values(brand_id,'catalog-brand','published','/brand.webp','Brand',now());
  insert into public.live_events(id,slug,celebrity_id,brand_id,publication_status,content_status,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,approved_hero_url,fan_code_hash,published_at)
    values(live_id,'catalog-live',creator,brand_id,'published','scheduled',now()+interval'1 day',now()+interval'25 hours',now()-interval'1 day',now()+interval'12 hours','https://youtube.com/watch?v=catalogtest','/live.webp',extensions.crypt('123456',extensions.gen_salt('bf',12)),now());
  insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt)
    values(live_id,'ko','LIVE','설명','이미지'),(live_id,'en','LIVE','Description','Image');
  insert into public.home_banners(id,kind,publication_status,sort_order)values(banner_id,'announcement','published',2);
  insert into public.home_banner_localizations(banner_id,locale,href)values(banner_id,'en','/live/catalog-live');
  insert into public.benefits(id,slug,celebrity_id,publication_status,delivery_type,claim_opens_at,claim_closes_at)
    values(benefit_id,'catalog-goods',creator,'draft','text',now()-interval'1 hour',now()+interval'2 hours');
  insert into public.benefit_localizations(benefit_id,locale,title,summary,eligibility_label,delivery_label)
    values(benefit_id,'ko','굿즈','설명','응모권 1장','디지털'),(benefit_id,'en','Goods','Summary','One ticket','Digital');
  insert into public.benefit_delivery_vault(benefit_id,delivery_type,secret_value)values(benefit_id,'text','private-value-never-listed');
  update public.benefits set publication_status='published',published_at=now()where id=benefit_id;
  insert into public.mobile_benefit_policies(id,benefit_id,mode,policy_version,ticket_cost,enabled,opens_at,closes_at)
    values(policy_id,benefit_id,'instant_draw','v1',1,false,now()-interval'1 hour',now()+interval'1 hour');
  insert into public.mobile_benefit_instant_prizes(policy_id,outcome,weight,inventory_limit,fulfillment_method)
    values(policy_id,'won',1,1,'digital');
  update public.mobile_benefit_policies set enabled=true where id=policy_id;

  value:=public.read_owned_mobile_participation_catalog(owner,'en','ongoing','all','participation-catalog',null,null,null,1);
  if jsonb_array_length(value->'items')<>1 or value#>>'{items,0,kind}'<>'event'
    or value#>>'{items,0,favorite,name}'<>'Catalog favorite'
    or jsonb_array_length(value->'featured')<>2 then raise exception'initial catalog invalid: %',value;end if;
  if not exists(select 1 from jsonb_array_elements(value->'favorites')f
    where f->>'slug'='participation-catalog'and f->>'name'='Catalog favorite')
    then raise exception'favorite filter is missing published localized creator';end if;
  cursor:=value->'nextCursor';
  next_page:=public.read_owned_mobile_participation_catalog(owner,'en','ongoing','all','participation-catalog',
    (cursor->>'at')::timestamptz,(cursor->>'id')::uuid,cursor->>'kind',1);
  if next_page#>>'{items,0,kind}'<>'space' or next_page->'nextCursor'<>'null'::jsonb
    then raise exception'cursor repeated/skipped same-time items: %',next_page;end if;

  value:=public.read_owned_mobile_participation_catalog(owner,'en','ongoing','goods','participation-catalog',null,null,null,20);
  if jsonb_array_length(value->'items')<>0 then raise exception'tester-only goods leaked';end if;
  insert into public.mobile_store_sandbox_testers(app_user_id,enabled)values(owner,true);
  value:=public.read_owned_mobile_participation_catalog(owner,'en','ongoing','goods','participation-catalog',null,null,null,20);
  if value#>>'{items,0,id}'<>benefit_id::text or value::text like'%private-value-never-listed%'
    then raise exception'goods projection invalid';end if;
  value:=public.read_owned_mobile_participation_catalog(owner,'en','upcoming','live','participation-catalog',null,null,null,20);
  if value#>>'{items,0,id}'<>live_id::text or value#>>'{items,0,phase}'<>'upcoming'
    then raise exception'live status projection invalid';end if;

  update public.mobile_participation_events set state='ended'where id=event_id;
  value:=public.read_owned_mobile_participation_catalog(owner,'en','past','event','participation-catalog',null,null,null,20);
  if value#>>'{items,0,id}'<>event_id::text or jsonb_array_length(value->'featured')<>1
    then raise exception'ended event remained featured or lost history';end if;
  update public.celebrities set status='draft',published_at=null where id=creator;
  value:=public.read_owned_mobile_participation_catalog(owner,'en','ongoing','all','participation-catalog',null,null,null,20);
  if value->'items'<>'[]'::jsonb or value->'featured'<>'[]'::jsonb then raise exception'private favorite leaked';end if;
  if exists(select 1 from jsonb_array_elements(value->'favorites')f where f->>'slug'='participation-catalog')
    then raise exception'private favorite leaked through filter';end if;
  if has_function_privilege('anon','public.read_owned_mobile_participation_catalog(uuid,public.content_locale,text,text,text,timestamptz,uuid,text,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.read_owned_mobile_participation_catalog(uuid,public.content_locale,text,text,text,timestamptz,uuid,text,integer)','EXECUTE')
    then raise exception'catalog RPC exposed directly';end if;
end $$;
rollback;

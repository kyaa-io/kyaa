-- Disposable local PostgreSQL integration contract. Every fixture is rolled back.
begin;

do $$
declare actor uuid:=extensions.gen_random_uuid(); allow_id uuid:=extensions.gen_random_uuid(); viewer uuid:=extensions.gen_random_uuid(); viewer_allow uuid:=extensions.gen_random_uuid(); inactive uuid:=extensions.gen_random_uuid(); inactive_allow uuid:=extensions.gen_random_uuid(); operator_id uuid:=extensions.gen_random_uuid(); operator_allow uuid:=extensions.gen_random_uuid(); creator uuid; template public.live_events; asset uuid:=extensions.gen_random_uuid(); i integer; live_id uuid;
begin
 insert into public.app_users(id,privy_user_id,verified_email,status) values
 (actor,'did:privy:home-banner-'||actor,'home-banner@example.invalid','active'),
 (viewer,'did:privy:home-banner-viewer-'||viewer,'home-banner-viewer@example.invalid','active'),
 (inactive,'did:privy:home-banner-inactive-'||inactive,'home-banner-inactive@example.invalid','active'),
 (operator_id,'did:privy:home-banner-operator-'||operator_id,'home-banner-operator@example.invalid','active');
 insert into public.admin_allowlist(id,email,role,active) values
 (allow_id,'home-banner@example.invalid','admin',true),(viewer_allow,'home-banner-viewer@example.invalid','viewer',true),
 (inactive_allow,'home-banner-inactive@example.invalid','admin',false),(operator_allow,'home-banner-operator@example.invalid','operator',true);
 select * into template from public.live_events where publication_status='published' limit 1;
 if template.id is null then raise exception 'home banner test requires seeded published LIVE fixture'; end if;
 creator:=template.celebrity_id;
 if not exists(select 1 from public.celebrity_localizations where celebrity_id=creator and locale='ko')
   or not exists(select 1 from public.celebrity_localizations where celebrity_id=creator and locale='en') then raise exception 'home banner test requires seeded celebrity localizations'; end if;
 insert into public.public_image_assets(id,content_sha256,storage_path,url,width,height,mime_type,byte_size,created_by_app_user_id,created_by_admin_allowlist_id)
 values(asset,repeat('a',64),'public-image-assets/'||repeat('a',64)||'.webp','https://example.invalid/storage/v1/object/public/cms-assets/public-image-assets/'||repeat('a',64)||'.webp',1440,640,'image/webp',100,actor,allow_id);
 for i in 1..4 loop
   live_id:=extensions.gen_random_uuid();
   insert into public.live_events(id,slug,celebrity_id,brand_id,publication_status,content_status,starts_at,ends_at,reservation_opens_at,reservation_closes_at,youtube_url,approved_hero_url,fan_code_hash,published_at)
   values(live_id,'home-banner-live-'||i||'-'||replace(live_id::text,'-',''),creator,template.brand_id,'published','scheduled',now()+(i||' days')::interval,now()+(i||' days')::interval+interval '1 hour',now()-interval '1 day',now()+(i||' days')::interval-interval '1 hour',template.youtube_url,template.approved_hero_url,template.fan_code_hash,now());
   insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt)
   values(live_id,'ko','정기 라이브 '||i,'예정 라이브','라이브 이미지'),(live_id,'en','Regular live '||i,'Upcoming live','Live image');
 end loop;
 perform set_config('byus.home_banner.actor',actor::text,true); perform set_config('byus.home_banner.allow',allow_id::text,true);
 perform set_config('byus.home_banner.creator',creator::text,true); perform set_config('byus.home_banner.asset',asset::text,true);
 perform set_config('byus.home_banner.viewer',viewer::text,true); perform set_config('byus.home_banner.viewer_allow',viewer_allow::text,true);
 perform set_config('byus.home_banner.inactive',inactive::text,true); perform set_config('byus.home_banner.inactive_allow',inactive_allow::text,true);
 perform set_config('byus.home_banner.operator',operator_id::text,true); perform set_config('byus.home_banner.operator_allow',operator_allow::text,true);
end $$;

set local role service_role;
do $$
declare actor uuid:=current_setting('byus.home_banner.actor')::uuid; allow_id uuid:=current_setting('byus.home_banner.allow')::uuid; asset uuid:=current_setting('byus.home_banner.asset')::uuid;
 viewer uuid:=current_setting('byus.home_banner.viewer')::uuid; viewer_allow uuid:=current_setting('byus.home_banner.viewer_allow')::uuid;
 loc jsonb; saved jsonb; id uuid; caught boolean; row jsonb;
begin
 loc:=jsonb_build_object('title','Running','description','','ctaLabel','Open','href','/pages/groups/10000000-0000-4000-8000-000000000003','alt','Running','desktopAssetId',asset,'mobileAssetId',null);
 loc:=jsonb_build_object('ko',loc,'en',loc);
 saved:=public.save_admin_managed_banner(actor,allow_id,gen_random_uuid(),null,0,'announcement',null,loc,'groups','group');id:=(saved->>'id')::uuid;
 if exists(select 1 from jsonb_array_elements(public.read_published_discovery_banners('ko')) x where x->>'id'=id::text) then raise exception 'draft leaked';end if;
 perform public.set_admin_home_banner_publication(actor,allow_id,gen_random_uuid(),id,1,'published');
 select value into row from jsonb_array_elements(public.read_published_discovery_banners('ko')) where value->>'id'=id::text;
 if row is null or row->>'category'<>'group' or row->>'placement'<>'groups' or row->>'href'<>loc->'ko'->>'href' then raise exception 'discovery destination or metadata lost';end if;
 if exists(select 1 from jsonb_array_elements(public.read_published_home_banners('ko')) x where x->>'id'=id::text) then raise exception 'groups banner leaked to home';end if;
 -- Legacy callers must preserve metadata while still enforcing the same revision.
 perform public.save_admin_home_banner(actor,allow_id,gen_random_uuid(),id,2,'announcement',null,loc);
 select value into row from jsonb_array_elements(public.get_admin_home_banner_manager(actor,allow_id)->'items') where value->>'id'=id::text;
 if row->>'category'<>'group' or row->>'placement'<>'groups' or row->>'revision'<>'3' then raise exception 'legacy save reset metadata';end if;
 caught:=false;begin perform public.save_admin_managed_banner(actor,allow_id,gen_random_uuid(),id,2,'announcement',null,loc,'both','event');exception when others then if sqlerrm like '%revision conflict%' then caught:=true;else raise;end if;end;
 if not caught then raise exception 'stale update accepted';end if;
 caught:=false;begin perform public.save_admin_managed_banner(viewer,viewer_allow,gen_random_uuid(),id,3,'announcement',null,loc,'both','event');exception when others then if sqlerrm like '%read-only%' then caught:=true;else raise;end if;end;
 if not caught then raise exception 'viewer update accepted';end if;
 caught:=false;begin perform public.save_admin_managed_banner(actor,allow_id,gen_random_uuid(),id,3,'announcement',null,loc,'wrong','event');exception when check_violation then caught:=true;end;
 if not caught then raise exception 'invalid placement accepted';end if;
 caught:=false;begin perform public.save_admin_managed_banner(actor,allow_id,gen_random_uuid(),id,3,'announcement',null,loc,'both','wrong');exception when check_violation then caught:=true;end;
 if not caught then raise exception 'invalid category accepted';end if;
 perform public.save_admin_managed_banner(actor,allow_id,gen_random_uuid(),id,3,'announcement',null,loc,'both','event');
 if not exists(select 1 from jsonb_array_elements(public.read_published_home_banners('ko')) x where x->>'id'=id::text and x->>'category'='event') then raise exception 'both missing from home';end if;
 if not exists(select 1 from jsonb_array_elements(public.read_published_discovery_banners('en')) x where x->>'id'=id::text and x->>'category'='event') then raise exception 'both missing from discovery';end if;
 if has_function_privilege('anon','public.read_published_discovery_banners(public.content_locale)','execute') or has_function_privilege('authenticated','public.save_admin_managed_banner(uuid,uuid,uuid,uuid,integer,public.home_banner_kind,uuid,jsonb,text,text)','execute') then raise exception 'public RPC privilege leak';end if;
end $$;
rollback;

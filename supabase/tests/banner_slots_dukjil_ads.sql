\set ON_ERROR_STOP on
-- Verify the three PC side slots with disposable fixtures.
begin;
do $$
declare actor uuid:=extensions.gen_random_uuid();allow_id uuid:=extensions.gen_random_uuid();viewer uuid:=extensions.gen_random_uuid();viewer_allow uuid:=extensions.gen_random_uuid();asset uuid:=extensions.gen_random_uuid();
begin
 insert into public.app_users(id,privy_user_id,verified_email,status)values(actor,'did:privy:banner-slot-'||actor,'banner-slot@example.invalid','active'),(viewer,'did:privy:banner-slot-viewer-'||viewer,'banner-slot-viewer@example.invalid','active');
 insert into public.admin_allowlist(id,email,role,active)values(allow_id,'banner-slot@example.invalid','admin',true),(viewer_allow,'banner-slot-viewer@example.invalid','viewer',true);
 insert into public.public_image_assets(id,content_sha256,storage_path,url,width,height,mime_type,byte_size,created_by_app_user_id,created_by_admin_allowlist_id)
 values(asset,repeat('b',64),'public-image-assets/'||repeat('b',64)||'.webp','https://example.invalid/storage/v1/object/public/cms-assets/public-image-assets/'||repeat('b',64)||'.webp',1440,360,'image/webp',100,actor,allow_id);
 perform set_config('byus.banner_slot.actor',actor::text,true);perform set_config('byus.banner_slot.allow',allow_id::text,true);perform set_config('byus.banner_slot.asset',asset::text,true);
 perform set_config('byus.banner_slot.viewer',viewer::text,true);perform set_config('byus.banner_slot.viewer_allow',viewer_allow::text,true);
end $$;
update public.home_banners set publication_status='draft' where placement like 'dukjil_%';
set local role service_role;
do $$
declare
 actor uuid:=current_setting('byus.banner_slot.actor')::uuid;
 allow_id uuid:=current_setting('byus.banner_slot.allow')::uuid;
 asset uuid:=current_setting('byus.banner_slot.asset')::uuid;
 loc jsonb;
 slot text;
 banner_id uuid;
 expected jsonb:='{}';
begin
 loc:=jsonb_build_object('title','Example','description','','ctaLabel','View','href','https://example.invalid','alt','Example','desktopAssetId',asset,'mobileAssetId',null);
 loc:=jsonb_build_object('ko',loc,'en',loc);
 foreach slot in array array['dukjil_side','dukjil_side_2','dukjil_side_3'] loop
   banner_id:=(public.save_admin_managed_banner(actor,allow_id,gen_random_uuid(),null,0,'announcement',null,loc,slot,'ad')->>'id')::uuid;
   if public.read_published_slot_banners('ko','dukjil') ? slot then raise exception 'Draft visible in %',slot; end if;
   perform public.set_admin_home_banner_publication(actor,allow_id,gen_random_uuid(),banner_id,1,'published');
   expected:=expected||jsonb_build_object(slot,jsonb_build_object('id',banner_id,'category','ad'));
 end loop;
 foreach slot in array array['dukjil_side','dukjil_side_2','dukjil_side_3'] loop
   if ((public.read_published_slot_banners('en','dukjil')->slot) @> (expected->slot)) is distinct from true then
     raise exception 'Published banner missing from %',slot;
   end if;
   if public.read_published_slot_banners('ko','home') ? slot or public.read_published_slot_banners('ko','fanpage') ? slot then
     raise exception 'Banner leaked from % into another area',slot;
   end if;
 end loop;
 raise notice 'PASS Dukjil side banner slots';
end $$;
rollback;

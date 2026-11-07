\set ON_ERROR_STOP on
-- Managed banner slots (20261215050000). Disposable: every fixture is rolled back.
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
-- Earlier published slot banners on this database would change the answers below.
update public.home_banners set publication_status='draft' where placement in('home_below_board','home_between_events','fanpage_below_gallery','fanpage_second');
set local role service_role;
do $$
declare actor uuid:=current_setting('byus.banner_slot.actor')::uuid;allow_id uuid:=current_setting('byus.banner_slot.allow')::uuid;asset uuid:=current_setting('byus.banner_slot.asset')::uuid;
 viewer uuid:=current_setting('byus.banner_slot.viewer')::uuid;viewer_allow uuid:=current_setting('byus.banner_slot.viewer_allow')::uuid;
 loc jsonb;first_id uuid;second_id uuid;fan_id uuid;caught boolean;result jsonb;
begin
 loc:=jsonb_build_object('title','찐팬100 챌린지','description','','ctaLabel','응원하기','href','/elina?locale=ko','alt','찐팬100 챌린지','desktopAssetId',asset,'mobileAssetId',null);
 loc:=jsonb_build_object('ko',loc,'en',loc||'{"title":"Fan 100","ctaLabel":"Cheer","alt":"Fan 100"}');
 -- Empty slots answer an empty object, so the page folds them.
 if public.read_published_slot_banners('ko','home')<>'{}'::jsonb or public.read_published_slot_banners('ko','fanpage')<>'{}'::jsonb then raise exception 'Empty slots not empty';end if;
 first_id:=(public.save_admin_managed_banner(actor,allow_id,gen_random_uuid(),null,0,'announcement',null,loc,'home_below_board','event')->>'id')::uuid;
 second_id:=(public.save_admin_managed_banner(actor,allow_id,gen_random_uuid(),null,0,'announcement',null,loc,'home_below_board','event')->>'id')::uuid;
 fan_id:=(public.save_admin_managed_banner(actor,allow_id,gen_random_uuid(),null,0,'announcement',null,loc,'fanpage_second','ad')->>'id')::uuid;
 -- Drafts stay out.
 if public.read_published_slot_banners('ko','home')<>'{}'::jsonb then raise exception 'Draft slot banner shown';end if;
 perform public.set_admin_home_banner_publication(actor,allow_id,gen_random_uuid(),first_id,1,'published');
 perform public.set_admin_home_banner_publication(actor,allow_id,gen_random_uuid(),second_id,1,'published');
 perform public.set_admin_home_banner_publication(actor,allow_id,gen_random_uuid(),fan_id,1,'published');
 -- One banner per slot, first in the managed order; the other area and the other slot stay apart.
 result:=public.read_published_slot_banners('ko','home');
 if result->'home_below_board'->>'id'<>first_id::text or result ? 'home_between_events' or result ? 'fanpage_second' then raise exception 'Home slots wrong: %',result;end if;
 if public.read_published_slot_banners('en','fanpage')->'fanpage_second'->>'title'<>'Fan 100' or public.read_published_slot_banners('en','fanpage')->'fanpage_second'->>'category'<>'ad' then raise exception 'Fan page slot wrong';end if;
 -- The sliders never show a slot banner.
 if exists(select 1 from jsonb_array_elements(public.read_published_home_banners('ko')||public.read_published_discovery_banners('ko'))x where x->>'id' in(first_id::text,second_id::text,fan_id::text))then raise exception 'Slot banner reached a slider';end if;
 -- Reorder moves the second banner into the slot.
 perform public.reorder_admin_home_banners(actor,allow_id,gen_random_uuid(),(select jsonb_agg(jsonb_build_object('id',i->>'id','expectedRevision',(i->>'revision')::integer)order by case when i->>'id'=second_id::text then 0 else 1 end,(i->>'sortOrder')::integer,i->>'id')from jsonb_array_elements(public.get_admin_home_banner_manager(actor,allow_id)->'items')i));
 if public.read_published_slot_banners('ko','home')->'home_below_board'->>'id'<>second_id::text then raise exception 'Reorder not applied';end if;
 -- Same admin rules: viewers cannot place a banner, a made-up slot is refused, a bad area is refused.
 caught:=false;begin perform public.save_admin_managed_banner(viewer,viewer_allow,gen_random_uuid(),null,0,'announcement',null,loc,'home_between_events','event');exception when others then caught:=sqlerrm like '%read-only%';end;
 if not caught then raise exception 'Viewer placed a banner';end if;
 caught:=false;begin perform public.save_admin_managed_banner(actor,allow_id,gen_random_uuid(),null,0,'announcement',null,loc,'home_slot_3','event');exception when check_violation then caught:=true;end;
 if not caught then raise exception 'Unknown slot accepted';end if;
 caught:=false;begin perform public.read_published_slot_banners('ko','groups');exception when others then caught:=sqlerrm='invalid banner area';end;
 if not caught then raise exception 'Unknown area accepted';end if;
 raise notice 'PASS banner slots';
end $$;
reset role;
do $$declare caught boolean:=false;begin
 begin execute 'set local role anon';perform public.read_published_slot_banners('ko','home');exception when insufficient_privilege then caught:=true;end;
 execute 'reset role';
 if not caught then raise exception 'anon may read slot banners';end if;
end $$;
rollback;

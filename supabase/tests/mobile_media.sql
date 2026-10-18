begin;
do $$
declare owner_id constant uuid:='76000000-0000-4000-8000-000000000001'; peer_id constant uuid:='76000000-0000-4000-8000-000000000002'; asset_id uuid; job jsonb; result jsonb; conversation_id uuid; message_id uuid; post_id uuid; failed boolean:=false;
begin
 insert into public.app_users(id,privy_user_id,verified_email)values(owner_id,'did:privy:media-owner','media-owner@example.test'),(peer_id,'did:privy:media-peer','media-peer@example.test');
 result:=public.reserve_owned_mobile_media(owner_id,'image','dm','image/jpeg',128,'76100000-0000-4000-8000-000000000001');asset_id:=(result->>'assetId')::uuid;
 if result->>'replayed'<>'false'or result->>'storagePath'<>owner_id::text||'/'||asset_id::text||'/original.jpg'then raise exception'reservation contract failed';end if;
 if(public.reserve_owned_mobile_media(owner_id,'image','dm','image/jpeg',128,'76100000-0000-4000-8000-000000000001')->>'assetId')::uuid<>asset_id then raise exception'reservation replay failed';end if;
 begin perform public.reserve_owned_mobile_media(owner_id,'image','dm','image/png',128,'76100000-0000-4000-8000-000000000001');exception when others then failed:=sqlerrm like'%MEDIA_CONFLICT%';end;if not failed then raise exception'reservation conflict accepted';end if;
 perform public.queue_owned_mobile_media_validation(owner_id,asset_id);job:=public.claim_mobile_media_validation(asset_id);
 if job is null or job->>'state'<>'processing'then raise exception'validation claim failed';end if;
 perform public.finish_mobile_media_validation(asset_id,(job->>'assetVersion')::integer,(job->>'jobId')::uuid,'image/jpeg',20,10,null);
 if(public.read_owned_mobile_media(owner_id,asset_id)->>'state')<>'ready'then raise exception'ready transition failed';end if;
 failed:=false;begin perform public.reserve_owned_mobile_media(owner_id,'image','dm','image/jpeg',128,'76100000-0000-4000-8000-000000000001');exception when others then failed:=sqlerrm like'%MEDIA_CONFLICT%';end;if not failed then raise exception'ready upload issued another token';end if;

 insert into public.social_dm_conversations(user_low_id,user_high_id,requester_id,status,request_id,payload_hash)values(least(owner_id,peer_id),greatest(owner_id,peer_id),owner_id,'accepted','76100000-0000-4000-8000-000000000010','fixture')returning id into conversation_id;
 result:=public.send_social_dm_message(owner_id,conversation_id,'',asset_id,'76100000-0000-4000-8000-000000000002');message_id:=(result->>'id')::uuid;
 if result->>'assetId'<>asset_id::text or not exists(select 1 from public.mobile_media_assets where id=asset_id and attached_type='dm_message'and attached_id=message_id and access_scope='dm')then raise exception'DM attachment failed';end if;
 result:=public.read_social_dm_messages(peer_id,conversation_id,null,null,50);
 if result#>>'{messages,0,attachment,assetId}'<>asset_id::text then raise exception'DM read attachment failed';end if;
 if public.authorize_mobile_media_read(peer_id,asset_id,'original')is null then raise exception'DM recipient access failed';end if;
 perform public.delete_owned_social_dm_message(owner_id,message_id);
 if public.authorize_mobile_media_read(owner_id,asset_id,'original')is not null or public.authorize_mobile_media_read(peer_id,asset_id,'original')is null then raise exception'per-viewer DM deletion policy failed';end if;
 insert into public.user_blocks(app_user_id,blocked_app_user_id)values(peer_id,owner_id);
 if public.authorize_mobile_media_read(peer_id,asset_id,'original')is not null then raise exception'block did not revoke media';end if;

 insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values('76000000-0000-4000-8000-000000000010','media-test','draft','/media.webp','{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values('76000000-0000-4000-8000-000000000010','ko','미디어','소개','미디어'),('76000000-0000-4000-8000-000000000010','en','Media','Summary','Media');update public.celebrities set status='published',published_at=clock_timestamp()where slug='media-test';
 result:=public.reserve_owned_mobile_media(owner_id,'image','fan_post','image/webp',256,'76100000-0000-4000-8000-000000000004');asset_id:=(result->>'assetId')::uuid;perform public.queue_owned_mobile_media_validation(owner_id,asset_id);job:=public.claim_mobile_media_validation(asset_id);perform public.finish_mobile_media_validation(asset_id,(job->>'assetVersion')::integer,(job->>'jobId')::uuid,'image/webp',30,40,null);
 result:=public.save_fan_post(owner_id,'media-test',null,'photo','public',array[asset_id],null,'76100000-0000-4000-8000-000000000005');post_id:=(result->>'id')::uuid;
 if public.fan_web_post_json(owner_id,post_id)#>>'{assets,0,id}'<>asset_id::text or public.authorize_mobile_media_read(owner_id,asset_id,'thumbnail')is null then raise exception'fan post media binding failed';end if;
 perform public.remove_fan_post(owner_id,post_id);if not exists(select 1 from public.mobile_media_assets where id=asset_id and state='cancelled'and cleanup_requested_at is not null)then raise exception'fan post deletion cleanup missing';end if;

 result:=public.reserve_owned_mobile_media(owner_id,'image','fan_post','image/png',200,'76100000-0000-4000-8000-000000000003');asset_id:=(result->>'assetId')::uuid;perform public.queue_owned_mobile_media_validation(owner_id,asset_id);job:=public.claim_mobile_media_validation(asset_id);perform public.cancel_owned_mobile_media(owner_id,asset_id);
 failed:=false;begin perform public.finish_mobile_media_validation(asset_id,(job->>'assetVersion')::integer,(job->>'jobId')::uuid,'image/png',10,10,null);exception when others then failed:=sqlerrm like'%MEDIA_CONFLICT%';end;if not failed then raise exception'stale completion revived cancelled media';end if;
 if not exists(select 1 from public.mobile_media_assets where id=asset_id and state='cancelled'and cleanup_requested_at is not null)then raise exception'cancel cleanup missing';end if;
 result:=public.reserve_owned_mobile_media(owner_id,'image','dm','image/jpeg',300,'76100000-0000-4000-8000-000000000006');asset_id:=(result->>'assetId')::uuid;result:=public.queue_owned_mobile_media_validation(owner_id,asset_id);update public.mobile_media_assets set state='processing'where id=asset_id;update public.mobile_media_validation_jobs set status='processing',attempts=4,lease_expires_at=clock_timestamp()-interval'1 second'where id=(result->>'jobId')::uuid;perform public.claim_mobile_media_validation(asset_id);if not exists(select 1 from public.mobile_media_assets where id=asset_id and state='rejected'and failure_code='MEDIA_VALIDATION_TIMEOUT')then raise exception'exhausted lease did not terminate';end if;
 raise notice'MOBILE_MEDIA private upload, validation CAS, DM authorization and cleanup: PASS';
end $$;
rollback;

\set ON_ERROR_STOP on
begin;
do $$declare owner_id uuid;reader_id uuid;outsider_id uuid;page uuid:=gen_random_uuid();other_page uuid:=gen_random_uuid();room uuid:=gen_random_uuid();other_room uuid:=gen_random_uuid();asset uuid;foreign_asset uuid;request_id uuid:=gen_random_uuid();result jsonb;again jsonb;report_id uuid;admin_id uuid:=gen_random_uuid();admin_actor uuid:=gen_random_uuid();begin
 select id into owner_id from public.app_users where status='active' order by id limit 1;
 select id into reader_id from public.app_users where status='active' and id<>owner_id order by id limit 1;
 select id into outsider_id from public.app_users where status='active' and id not in(owner_id,reader_id) order by id limit 1;
 if outsider_id is null then raise exception 'Need three active local fixture users';end if;
 insert into public.group_pages(id,kind,name)values(page,'hobby','Room photo test'),(other_page,'hobby','Other private room');
 insert into public.group_memberships(page_id,app_user_id,role)values(page,owner_id,'owner'),(page,reader_id,'member'),(other_page,outsider_id,'owner');
 insert into public.group_rooms(id,page_id,name,status,minimum_tier)values(room,page,'Photo room','open','Member'),(other_room,other_page,'Other room','open','Member');
 result:=public.reserve_owned_mobile_media(owner_id,'image','group_post','image/png',100,gen_random_uuid());asset:=(result->>'assetId')::uuid;
 result:=public.reserve_owned_mobile_media(reader_id,'image','group_post','image/png',100,gen_random_uuid());foreign_asset:=(result->>'assetId')::uuid;
 -- Validation workers own this transition in the actual upload path; a deterministic SQL fixture represents their completed result.
 update public.mobile_media_assets set state='ready',width=24,height=16,actual_byte_size=100 where id in(asset,foreign_asset);
 begin
  perform public.groups_content_dispatch('message',owner_id,page,room,jsonb_build_object('body','','assetId',foreign_asset,'requestId',gen_random_uuid()));raise exception 'Another owner asset accepted';
 exception when raise_exception then if sqlerrm<>'GROUPS_INVALID_REQUEST' then raise;end if;end;
 result:=public.groups_content_dispatch('message',owner_id,page,room,jsonb_build_object('body','','assetId',asset,'requestId',request_id));
 again:=public.groups_content_dispatch('message',owner_id,page,room,jsonb_build_object('body','','assetId',asset,'requestId',request_id));
 if result<>again or(select count(*)from public.group_messages where asset_id=asset)<>1 then raise exception 'Retry duplicated photo';end if;
 if public.authorize_mobile_media_read(reader_id,asset,'original')is null then raise exception 'Room member cannot view photo';end if;
 if public.authorize_group_media_read(null,asset,'original')is not null then raise exception 'Anonymous photo exposure';end if;
 if public.authorize_mobile_media_read(outsider_id,asset,'original')is not null then raise exception 'Other room member photo exposure';end if;
 result:=public.groups_content_dispatch('messages',reader_id,page,room,'{}');
 if not exists(select 1 from jsonb_array_elements(result->'items')item where item->'asset'->>'id'=asset::text and item->>'body'='')then raise exception 'Photo absent from room messages';end if;
 begin
  perform public.groups_content_dispatch('message',outsider_id,page,room,jsonb_build_object('body','','assetId',foreign_asset,'requestId',gen_random_uuid()));raise exception 'Other room member sent photo';
 exception when raise_exception then if sqlerrm not like 'GROUPS_FORBIDDEN%' and sqlerrm<>'GROUPS_NOT_FOUND'then raise;end if;end;
 begin
  perform public.groups_content_dispatch('message',owner_id,page,room,jsonb_build_object('body','','assetId',asset,'requestId',gen_random_uuid()));raise exception 'Attached asset reused';
 exception when raise_exception then if sqlerrm<>'GROUPS_INVALID_REQUEST'then raise;end if;end;
 update public.group_rooms set status='readonly' where id=room;
 begin
  perform public.groups_content_dispatch('message',reader_id,page,room,jsonb_build_object('body','','assetId',foreign_asset,'requestId',gen_random_uuid()));raise exception 'Readonly member sent photo';
 exception when raise_exception then if sqlerrm not like 'GROUPS_FORBIDDEN%' and sqlerrm<>'GROUPS_NOT_FOUND'then raise;end if;end;
 delete from public.group_memberships where page_id=page and app_user_id=reader_id;
 if public.authorize_mobile_media_read(reader_id,asset,'original')is not null then raise exception 'Revoked member retained access';end if;
 insert into public.app_users(id,privy_user_id,status,verified_email)values(admin_actor,'did:privy:room-photo-'||admin_actor,'active','room-photo-'||admin_actor||'@example.test');
 insert into public.admin_allowlist(id,email,role)values(admin_id,'room-photo-'||admin_actor||'@example.test','viewer');
 result:=public.groups_content_dispatch('report',owner_id,page,null,jsonb_build_object('targetType','message','targetId',(select id from public.group_messages where asset_id=asset),'reason','Photo test','requestId',gen_random_uuid()));
 select id into report_id from public.group_reports where target_id=(select id from public.group_messages where asset_id=asset);
 result:=public.groups_content_dispatch('report-evidence',admin_actor,page,report_id,'{}',admin_id);
 if not exists(select 1 from jsonb_array_elements(result->'attachments')item where item->>'id'=asset::text)then raise exception 'Reported photo missing from evidence';end if;
 if public.authorize_group_report_media_read(admin_actor,admin_id,page,report_id,asset,'original',gen_random_uuid())is null then raise exception 'Nonmember admin cannot inspect photo';end if;
 if public.authorize_group_report_media_read(admin_actor,admin_id,other_page,report_id,asset,'original',gen_random_uuid())is not null then raise exception 'Other page report read exposed photo';end if;
 begin
  perform public.authorize_group_report_media_read(owner_id,admin_id,page,report_id,asset,'original',gen_random_uuid());raise exception 'Nonadmin read evidence';
 exception when raise_exception then if sqlerrm<>'GROUPS_FORBIDDEN'then raise;end if;end;
 update public.group_messages set removed_at=now()where asset_id=asset;
 if public.authorize_group_report_media_read(admin_actor,admin_id,page,report_id,asset,'original',gen_random_uuid())is not null then raise exception 'Deleted evidence photo exposed';end if;
 if public.authorize_mobile_media_read(owner_id,asset,'original')is not null then raise exception 'Removed message retained access';end if;
end $$;
rollback;

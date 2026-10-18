begin;

do $$
declare owner_id uuid:='b1130000-0000-4000-8000-000000000001';
  other_id uuid:='b1130000-0000-4000-8000-000000000002';
  favorite_id uuid:='b1130000-0000-4000-8000-000000000003';
  result jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (owner_id,'did:privy:source-states-owner','source-states-owner@example.test'),
    (other_id,'did:privy:source-states-other','source-states-other@example.test');
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
    values(favorite_id,'source-states-favorite','draft','/source-states.webp','{artist}','idol');
  insert into public.social_friendships(
    id,requester_id,addressee_id,celebrity_id,status,request_id,payload_hash,
    created_at,accepted_at,ended_at
  ) values(
    'b1130000-0000-4000-8000-000000000004',owner_id,other_id,favorite_id,
    'unfriended','b1130000-0000-4000-8000-000000000005','first-friend-history',
    '2026-09-01T00:00:00Z','2026-09-02T00:00:00Z','2026-09-03T00:00:00Z'
  );

  result:=public.read_owned_mobile_stamp_opportunities(owner_id,'ko');
  if jsonb_array_length(result->'items')<>3
    or result#>>'{items,0,kind}'<>'first_friend'
    or result#>>'{items,1,target,type}'<>'invitations'
    or result#>>'{items,2,target,type}'<>'passports'
    or not (result#>>'{items,0,earned}')::boolean
    or exists(select 1 from public.social_friendships friendship
      where friendship.status='accepted'
        and owner_id in(friendship.requester_id,friendship.addressee_id)) then
    raise exception 'owner opportunity projection mismatch: %',result;
  end if;

  if has_function_privilege('anon','public.read_owned_mobile_stamp_opportunities(uuid,public.content_locale)','execute')
    or has_function_privilege('authenticated','public.read_owned_mobile_stamp_opportunities(uuid,public.content_locale)','execute') then
    raise exception 'stamp opportunity projection exposed outside service role';
  end if;

  update public.app_users set status='disabled' where id=owner_id;
  begin
    perform public.read_owned_mobile_stamp_opportunities(owner_id,'ko');
    raise exception 'disabled owner unexpectedly read opportunity projection';
  exception when others then
    if sqlerrm not like '%FAN_WEB_ACTIVE_ACCOUNT_REQUIRED%'
      and sqlerrm not like '%MOBILE_PROFILE_NOT_FOUND%' then raise; end if;
  end;
end $$;

rollback;

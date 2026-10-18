do $$begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local byus_clean required';end if;
end$$;
begin;
create or replace function public.byus_day_rsvp_now() returns timestamptz language sql volatile security definer set search_path='' as $$select '2026-10-10 12:00:00+09'::timestamptz$$;
do $$<<behavior>>
declare
  owner uuid:='7b100000-0000-4000-8000-000000000001';
  peer uuid:='7b100000-0000-4000-8000-000000000002';
  artist uuid:='7b100000-0000-4000-8000-000000000003';
  event_id uuid:='7b100000-0000-4000-8000-000000000004';
  request_id uuid:='7b100000-0000-4000-8000-000000000005';
  duplicate_id uuid:='7b100000-0000-4000-8000-000000000006';
  secret_envelope text:='v1.'||repeat('a',16)||'.'||repeat('b',22)||'.'||repeat('c',18);
  result jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email)values(owner,'did:privy:web-event-owner','web-event-owner@example.test'),(peer,'did:privy:web-event-peer','web-event-peer@example.test');
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values(artist,'web-event','draft','/event.webp','{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(artist,'ko','행사','설명','사진'),(artist,'en','Event','Description','Photo');
  update public.celebrities set status='published',published_at=clock_timestamp()where id=artist;
  insert into public.mobile_participation_events(id,slug,celebrity_id,event_kind,policy_version,state,starts_at,ends_at,title_ko,title_en,application_url)
    values(event_id,'web-event',artist,'byus_day','web-v1','published',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days','웹 행사','Web event','https://byus.kr/connect/byus-day?source=app#rsvp');
  result:=public.create_owned_mobile_event_application_link(owner,event_id,repeat('a',64));
  if result->>'linkSupported'<>'true' or result->>'applicationUrl'<>'https://byus.kr/connect/byus-day?source=app#rsvp' then raise exception 'Link preparation changed destination';end if;
  update public.mobile_participation_events set application_url='https://byus.kr/connect/kyaa-wave?source=app#rsvp'where id=event_id;
  result:=public.create_owned_mobile_event_application_link(owner,event_id,repeat('d',64));
  if result->>'linkSupported'<>'true' or result->>'applicationUrl'<>'https://byus.kr/connect/kyaa-wave?source=app#rsvp' then raise exception 'Canonical form link unsupported';end if;
  result:=public.read_owned_mobile_participation_event_v2(owner,event_id,'ko');
  if result#>>'{event,webApplication,status}'<>'not_linked' then raise exception 'Opening a link counted as a submission';end if;
  perform public.submit_mobile_linked_byus_day_rsvp(repeat('a',64),request_id,'ko','김테스트','Test Kim','+821012345678','테스트','테스트','event@example.test','KR',secret_envelope,true,repeat('1',64),repeat('2',64));
  perform public.submit_mobile_linked_byus_day_rsvp(repeat('a',64),request_id,'ko','김테스트','Test Kim','+821012345678','테스트','테스트','event@example.test','KR',secret_envelope,true,repeat('1',64),repeat('2',64));
  if (select count(*)from public.mobile_event_applications where app_user_id=owner)<>1 or exists(select 1 from public.mobile_participation_checkins x where x.event_id=behavior.event_id and x.app_user_id=owner) then raise exception 'Receipt duplicated or granted admission';end if;
  result:=public.read_owned_mobile_participation_event_v2(owner,event_id,'en');
  if result#>>'{event,webApplication,status}'<>'received' or result#>>'{event,webApplication,receivedAt}' is null then raise exception 'Owner receipt missing';end if;
  if (result#>'{event,webApplication}') ?| array['rsvpId','name','email','phone','residentRegistrationNumber','appUserId'] then raise exception 'Applicant details leaked';end if;
  result:=public.read_owned_mobile_participation_event_v2(peer,event_id,'ko');
  if result#>>'{event,webApplication,status}'<>'not_linked' then raise exception 'Another account read the receipt';end if;
  begin
    perform public.submit_mobile_linked_byus_day_rsvp(repeat('a',64),request_id,'ko','김테스트','Test Kim','+821012345678','테스트','테스트','event@example.test','KR',secret_envelope,true,repeat('1',64),repeat('3',64));
    raise exception 'Changed retry accepted';
  exception when others then if sqlerrm<>'RSVP_IDEMPOTENCY_CONFLICT'then raise;end if;end;
  begin
    perform public.submit_mobile_linked_byus_day_rsvp(repeat('a',64),duplicate_id,'ko','김테스트','Test Kim','+821012345678','테스트','테스트','event@example.test','KR',secret_envelope,true,repeat('1',64),repeat('2',64));
    raise exception 'Consumed link accepted a new request';
  exception when others then if sqlerrm<>'RSVP_IDEMPOTENCY_CONFLICT'then raise;end if;end;
  perform public.create_owned_mobile_event_application_link(peer,event_id,repeat('b',64));
  perform public.submit_mobile_linked_byus_day_rsvp(repeat('b',64),duplicate_id,'ko','김테스트','Test Kim','+821012345678','테스트','테스트','event@example.test','KR',secret_envelope,true,repeat('4',64),repeat('2',64));
  if exists(select 1 from public.mobile_event_applications where app_user_id=peer) then raise exception 'Matching contacts were used as ownership proof';end if;
  perform public.create_owned_mobile_event_application_link(peer,event_id,repeat('c',64));
  update public.mobile_event_application_links set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour'where code_hash=repeat('c',64);
  begin
    perform public.submit_mobile_linked_byus_day_rsvp(repeat('c',64),duplicate_id,'ko','김테스트','Test Kim','+821012345678','테스트','테스트','event@example.test','KR',secret_envelope,true,repeat('4',64),repeat('2',64));
    raise exception 'Expired link accepted';
  exception when others then if sqlerrm<>'RSVP_APPLICATION_LINK_INVALID'then raise;end if;end;
  update public.mobile_participation_events set state='ended'where id=event_id;
  result:=public.read_owned_mobile_participation_event_v2(owner,event_id,'ko');
  if result#>>'{event,webApplication,status}'<>'received' then raise exception 'Event closure removed existing receipt';end if;
  update public.app_users set status='disabled'where id=owner;
  if exists(select 1 from public.mobile_event_applications where app_user_id=owner) or exists(select 1 from public.mobile_event_application_links where app_user_id=owner) then raise exception 'Account disable left app linkage';end if;
  if not exists(select 1 from public.byus_day_rsvps where id=request_id) then raise exception 'App deletion altered web-owned RSVP';end if;
  if has_table_privilege('authenticated','public.mobile_event_applications','SELECT') or has_function_privilege('authenticated','public.create_owned_mobile_event_application_link(uuid,uuid,text)','EXECUTE') then raise exception 'Direct linkage access exposed';end if;
end$$;
rollback;

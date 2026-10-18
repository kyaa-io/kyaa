begin;
do $$
declare owner uuid:='5e100000-0000-4000-8000-000000000001';other_user uuid:='5e100000-0000-4000-8000-000000000002';creator uuid:='5e100000-0000-4000-8000-000000000003';event_id uuid:='5e100000-0000-4000-8000-000000000004';v_card_id uuid:='5e100000-0000-4000-8000-000000000005';request_key uuid:='5e100000-0000-4000-8000-000000000006';value jsonb;
begin
 insert into public.app_users(id,privy_user_id,verified_email)values(owner,'did:privy:card-owner','card-owner@example.test'),(other_user,'did:privy:card-other','card-other@example.test');
 insert into public.celebrities(id,slug,status,image_url,roles,primary_role)values(creator,'card-source','draft','/card.webp','{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','카드','설명','이미지'),(creator,'en','Card','Summary','Image');
 update public.celebrities set status='published',published_at=clock_timestamp()where id=creator;
 insert into public.mobile_participation_events(id,slug,celebrity_id,event_kind,policy_version,state,starts_at,ends_at,title_ko,title_en)values(event_id,'card-event',creator,'byus_day','event-v1','published',clock_timestamp()-interval'1 hour',clock_timestamp()+interval'1 hour','카드 행사','Card event');
 insert into public.mobile_commemorative_cards(id,source_event_id,slug,policy_version,state,opens_at,closes_at,title_ko,title_en,subtitle_ko,subtitle_en,caption_ko,caption_en,image_url,member_options)values(v_card_id,event_id,'card-2026','card-v1','published',clock_timestamp()-interval'1 hour',clock_timestamp()+interval'1 hour','기념 카드','Commemorative card','행사','Event','공식 카드','Official card','/cards/card.webp','[{"key":"gyuri","nameKo":"규리","nameEn":"Gyuri"}]');
 value:=public.read_owned_mobile_participation_event_v2(owner,event_id,'ko');
 if value#>>'{event,commemorativeCardId}'<>v_card_id::text then raise exception'event card projection missing: %',value;end if;
 value:=public.read_owned_mobile_commemorative_card(owner,v_card_id,'en');
 if value->>'eligible'<>'false'or value->>'eligibilityReason'<>'checkin_required'then raise exception'card eligibility leaked: %',value;end if;
 begin perform public.claim_owned_mobile_commemorative_card(owner,v_card_id,'gyuri',request_key,'card-v1','ko');raise exception'claim without checkin succeeded';exception when others then if sqlerrm not like'%MOBILE_PARTICIPATION_VISIT_REQUIRED%'then raise;end if;end;
 insert into public.mobile_participation_checkins(event_id,app_user_id,status,source,policy_version)values(event_id,owner,'valid','linked_web','event-v1');
 value:=public.claim_owned_mobile_commemorative_card(owner,v_card_id,'gyuri',request_key,'card-v1','ko');
 if value#>>'{ownership,memberKey}'<>'gyuri'or value->>'claimedAlready'<>'false'then raise exception'claim invalid: %',value;end if;
 value:=public.claim_owned_mobile_commemorative_card(owner,v_card_id,'gyuri',request_key,'card-v1','ko');
 if value->>'claimedAlready'<>'true'or value->>'replayed'<>'true'or(select count(*)from public.mobile_commemorative_card_claims where card_id=v_card_id and app_user_id=owner)<>1 then raise exception'duplicate claim invalid: %',value;end if;
 value:=public.read_owned_mobile_commemorative_card_share(owner,v_card_id,'ko');
 if value->>'member'<>'규리'or value?'appUserId'then raise exception'share payload invalid: %',value;end if;
 begin perform public.read_owned_mobile_commemorative_card_share(other_user,v_card_id,'ko');raise exception'unowned share succeeded';exception when others then if sqlerrm not like'%MOBILE_PARTICIPATION_FORBIDDEN%'then raise;end if;end;
end$$;
rollback;

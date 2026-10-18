do $$declare value jsonb;begin
insert into public.mobile_commemorative_cards(id,source_event_id,slug,policy_version,state,opens_at,closes_at,title_ko,title_en,caption_ko,caption_en,image_url,member_options)values('5e000000-0000-4000-8000-000000000004','5e000000-0000-4000-8000-000000000003','card-upgrade-card','card-v1','published',clock_timestamp()-interval'1 hour',clock_timestamp()+interval'1 hour','카드','Card','카드','Card','/card.webp','[{"key":"member","nameKo":"멤버","nameEn":"Member"}]');
value:=public.read_owned_mobile_participation_event_v2('5e000000-0000-4000-8000-000000000001','5e000000-0000-4000-8000-000000000003','ko');
if value#>>'{event,commemorativeCardId}'<>'5e000000-0000-4000-8000-000000000004'then raise exception'upgrade event card projection missing: %',value;end if;
value:=public.claim_owned_mobile_commemorative_card('5e000000-0000-4000-8000-000000000001','5e000000-0000-4000-8000-000000000004','member','5e000000-0000-4000-8000-000000000005','card-v1','ko');
if value#>>'{ownership,memberKey}'<>'member'then raise exception'upgrade card claim failed: %',value;end if;
end$$;

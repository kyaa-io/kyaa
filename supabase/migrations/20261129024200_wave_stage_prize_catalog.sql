-- Only the two approved event campaigns are upgraded; a clean database has neither.
do $$
declare c record; old_benefit public.benefits%rowtype; coffee_id uuid:='adf58d92-c330-4e37-a4bf-6acbdd027a80'; campaign_count integer;
begin
 select count(*) into campaign_count from public.live_benefit_campaigns where id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe');
 if campaign_count=0 then return; end if;
 if campaign_count<>2 then raise exception 'WAVE_STAGE_CATALOG_CAMPAIGN_MISMATCH'; end if;
 perform 1 from public.live_benefit_campaigns where id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe') order by id for update;
 if exists(select 1 from public.benefit_draws where campaign_id in('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb','c3930f7f-bd2b-4e58-8cec-b3c61f8463fe')) then raise exception 'WAVE_STAGE_CATALOG_DRAW_EXISTS'; end if;
 for c in select * from (values
 ('aedf77a4-52e9-4acd-aa7a-79ceee5ca8eb'::uuid,'fde5ff1b-ac41-4c20-902b-034cba972023'::uuid,'changha','29a1f87a-1632-4851-9e38-de3d350cfcfa'::uuid,'112b7574-dcf2-4db1-9e8a-fd7b93b6750d'::uuid),
 ('c3930f7f-bd2b-4e58-8cec-b3c61f8463fe'::uuid,'45fcead7-24f3-46aa-98ce-84dfe8c8e75b'::uuid,'wena','e7595eb5-ed0e-4740-b548-abdbddc1ee53'::uuid,'e65e482f-181e-4803-9b85-80c7afdd1bc2'::uuid)
 ) approved(campaign_id,live_id,creator_slug,starbucks_id,hotel_id) loop
  if not exists(select 1 from public.live_benefit_campaigns campaign join public.live_events live on live.id=campaign.live_event_id join public.celebrities creator on creator.id=live.celebrity_id where campaign.id=c.campaign_id and live.id=c.live_id and live.slug=c.creator_slug||'-kyaa-wave-20261022' and creator.slug=c.creator_slug and campaign.entry_source='cheer' and campaign.status='published' and campaign.revision=4 and campaign.cancelled_at is null and live.publication_status='published' and live.archived_at is null)
    or (select count(*) from public.live_benefit_campaign_items where campaign_id=c.campaign_id)<>2
    or not exists(select 1 from public.live_benefit_campaign_items where campaign_id=c.campaign_id and benefit_id=c.hotel_id and winner_quantity=5)
    or not exists(select 1 from public.live_benefit_campaign_items where campaign_id=c.campaign_id and benefit_id=c.starbucks_id and winner_quantity=10)
    then raise exception 'WAVE_STAGE_CATALOG_CAMPAIGN_MISMATCH'; end if;
  select * into strict old_benefit from public.benefits where id=c.starbucks_id and slug=c.creator_slug||'-kyaa-wave-starbucks-20261022';
  if c.creator_slug='changha' then
   insert into public.benefits select * from jsonb_populate_record(null::public.benefits,to_jsonb(old_benefit)||jsonb_build_object('id',coffee_id,'slug','changha-kyaa-wave-coffee-chat-20261022','stock_limit',20,'delivery_type','text','revision',1,'created_at',clock_timestamp(),'updated_at',clock_timestamp()));
   insert into public.benefit_delivery_vault(benefit_id,delivery_type,secret_value) values(coffee_id,'text','당첨자에게 커피챗 일정과 장소를 별도 안내합니다.');
   insert into public.benefit_localizations(benefit_id,locale,title,summary,eligibility_label,delivery_label)
   select coffee_id,locale,case when locale='ko' then '창하와 커피챗' else 'Coffee chat with Changha' end,
   case when locale='ko' then '응원 댓글 참여자 중 20명을 추첨합니다.' else '20 cheer participants will be selected.' end,eligibility_label,
   case when locale='ko' then '당첨자에게 별도 안내합니다.' else 'Winners will receive further details.' end
   from public.benefit_localizations where benefit_id=c.starbucks_id;
   insert into public.live_benefit_campaign_items(campaign_id,benefit_id,priority,winner_quantity,fulfillment_method,stage_prize_kind) values(c.campaign_id,coffee_id,3,20,'digital','coffee_chat');
  end if;
  update public.live_benefit_campaign_items set draw_enabled=false where campaign_id=c.campaign_id and benefit_id=c.starbucks_id;
  if not found then raise exception 'WAVE_STAGE_CATALOG_ITEM_MISMATCH'; end if;
  update public.benefits set publication_status='draft',published_at=null,revision=revision+1,updated_at=clock_timestamp() where id=c.starbucks_id;
  update public.live_benefit_campaign_items set winner_quantity=5,stage_prize_kind='hotel_coffee' where campaign_id=c.campaign_id and benefit_id=c.hotel_id;
  update public.live_benefit_campaigns set revision=revision+1,updated_at=clock_timestamp() where id=c.campaign_id;
 end loop;
end $$;

-- Preserve immutable fulfillment policies while excluding retired campaign items.
-- Each replacement is guarded so drift fails the migration instead of silently skipping it.
do $$ declare change record; definition text;
begin
 for change in select * from(values
 ('public.execute_admin_benefit_draw_unpublished(uuid,uuid,uuid,uuid,uuid,timestamptz)',
  'where campaign_id=p_campaign_id order by priority,benefit_id','where campaign_id=p_campaign_id and draw_enabled order by priority,benefit_id'),
 ('public.read_celebrity_cheer_event(text,uuid,public.content_locale)',
  'where item.campaign_id=campaign.id and benefit.publication_status=', 'where item.draw_enabled and item.campaign_id=campaign.id and benefit.publication_status='),
 ('public.read_celebrity_cheer_event_live_state(text,uuid,public.content_locale)',
  'where item.campaign_id=campaign.id and benefit.publication_status=', 'where item.draw_enabled and item.campaign_id=campaign.id and benefit.publication_status='),
 ('public.get_public_raffles(text,public.content_locale,timestamptz)',
  'join public.live_benefit_campaign_items i on i.campaign_id=c.id','join public.live_benefit_campaign_items i on i.campaign_id=c.id and i.draw_enabled'),
 ('public.get_owned_raffles(uuid,public.content_locale,text,integer)',
  'where entry.app_user_id=p_app_user_id','where item.draw_enabled and entry.app_user_id=p_app_user_id'),
 ('public.build_owned_raffle_result(uuid,uuid,uuid,public.content_locale)',
  'where c.id=p_campaign_id and item.benefit_id=p_benefit_id','where item.draw_enabled and c.id=p_campaign_id and item.benefit_id=p_benefit_id'),
 ('public.get_owned_benefit_entry_state(uuid,uuid)',
  'where i.benefit_id=p_benefit_id and c.status=', 'where i.draw_enabled and i.benefit_id=p_benefit_id and c.status=')
 ) patches(signature,old_text,new_text) loop
  select pg_get_functiondef(change.signature::regprocedure) into definition;
  if position(change.old_text in definition)=0 then raise exception 'WAVE_STAGE_FUNCTION_DRIFT: %',change.signature; end if;
  execute replace(definition,change.old_text,change.new_text);
 end loop;
end $$;

-- Optional country preference and public-only sharing for owned benefit goods.

alter table public.mobile_app_settings
  alter column region_code drop default,
  alter column region_code drop not null;

create or replace function public.mobile_patch_owned_settings(p_app_user_id uuid,p_expected_revision bigint,p_patch jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.mobile_app_settings%rowtype; allowed text[]:=array['preferredLocale','regionCode','qrVisible','pushEnabled','topics']; topics jsonb;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_expected_revision is null or jsonb_typeof(p_patch)<>'object' or exists(select 1 from jsonb_object_keys(p_patch) k where not(k=any(allowed))) then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 if p_patch?'preferredLocale' and (jsonb_typeof(p_patch->'preferredLocale')<>'string' or p_patch->>'preferredLocale' not in('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr')) then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 if p_patch?'regionCode' and not (p_patch->'regionCode'='null'::jsonb or (jsonb_typeof(p_patch->'regionCode')='string' and p_patch->>'regionCode'~'^[A-Z]{2}$')) then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 if p_patch?'qrVisible' and jsonb_typeof(p_patch->'qrVisible')<>'boolean' or p_patch?'pushEnabled' and jsonb_typeof(p_patch->'pushEnabled')<>'boolean' then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 topics:=coalesce(p_patch->'topics','{}'::jsonb);
 if jsonb_typeof(topics)<>'object' or exists(select 1 from jsonb_each(topics) x where x.key not in('schedule','benefit','community','marketing','participation') or jsonb_typeof(x.value)<>'boolean') then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 insert into public.mobile_app_settings(app_user_id) values(p_app_user_id) on conflict do nothing;
 select * into strict s from public.mobile_app_settings where app_user_id=p_app_user_id for update;
 if s.revision<>p_expected_revision then raise exception 'MOBILE_SETTINGS_REVISION_CONFLICT' using errcode='40001'; end if;
 if p_patch?'preferredLocale' then update public.app_users set preferred_locale=p_patch->>'preferredLocale' where id=p_app_user_id; end if;
 update public.mobile_app_settings set
  region_code=case when p_patch?'regionCode' then p_patch->>'regionCode' else region_code end,
  qr_visible=coalesce((p_patch->>'qrVisible')::boolean,qr_visible),
  push_enabled=coalesce((p_patch->>'pushEnabled')::boolean,push_enabled),
  revision=revision+1
 where app_user_id=p_app_user_id;
 insert into public.notification_preferences(app_user_id) values(p_app_user_id) on conflict do nothing;
 update public.notification_preferences set
  live_reminders=coalesce((topics->>'schedule')::boolean,live_reminders),schedule_notifications=coalesce((topics->>'schedule')::boolean,schedule_notifications),
  benefit_notifications=coalesce((topics->>'benefit')::boolean,benefit_notifications),reply_notifications=coalesce((topics->>'community')::boolean,reply_notifications),official_post_notifications=coalesce((topics->>'community')::boolean,official_post_notifications),
  marketing_notifications=coalesce((topics->>'marketing')::boolean,marketing_notifications),participation_notifications=coalesce((topics->>'participation')::boolean,participation_notifications)
 where app_user_id=p_app_user_id;
 return public.mobile_get_owned_settings(p_app_user_id);
end $$;

create or replace function public.read_owned_mobile_benefit_good(p_app_user_id uuid,p_award_id uuid,p_locale public.content_locale default 'ko') returns jsonb
language plpgsql security definer set search_path='' as $$ declare result jsonb;consent_version text;consent_document jsonb;begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select version,documents->(p_locale::text) into consent_version,consent_document from public.benefit_recipient_consent_versions where active and effective_at<=pg_catalog.statement_timestamp()and public.mobile_benefit_consent_documents_complete(documents)order by effective_at desc,version desc limit 1;
  select jsonb_build_object('id',a.id,'benefitId',a.benefit_id,'title',l.title,'imageUrl',ip.image_url,'fulfillmentMethod',a.fulfillment_method,'fulfillmentStatus',a.fulfillment_status,'wonAt',a.created_at,'digitalDelivery',a.digital_delivery_value,'recipientDeadlineAt',a.recipient_deadline_at,
    'shareUrl',case when b.publication_status='published'and b.archived_at is null then '/benefits/'||b.id::text else null end,
    'recipientPolicy',case when a.fulfillment_method='digital'or consent_version is null then null else jsonb_build_object('consentVersion',consent_version,'title',consent_document->>'title','body',consent_document->>'body','documentUrl',consent_document->'documentUrl','items',consent_document->'items','requiredFields',case when a.fulfillment_method='physical_shipping'then jsonb_build_array('name','phone','postalCode','address1','address2')else jsonb_build_array('name','phone')end)end)into result
    from public.mobile_benefit_awards a join public.mobile_benefit_instant_prizes ip on ip.id=a.prize_id join public.benefits b on b.id=a.benefit_id join public.benefit_localizations l on l.benefit_id=a.benefit_id and l.locale=p_locale where a.id=p_award_id and a.app_user_id=p_app_user_id;
  if result is null then select jsonb_build_object('id',w.id,'benefitId',w.benefit_id,'title',l.title,'imageUrl',item.teaser_image_url,'fulfillmentMethod',f.method,'fulfillmentStatus',f.status,'wonAt',w.selected_at,'digitalDelivery',null,'recipientDeadlineAt',f.recipient_deadline_at,
    'shareUrl',case when b.publication_status='published'and b.archived_at is null then '/benefits/'||b.id::text else null end,
    'recipientPolicy',case when f.method='digital'or consent_version is null then null else jsonb_build_object('consentVersion',consent_version,'title',consent_document->>'title','body',consent_document->>'body','documentUrl',consent_document->'documentUrl','items',consent_document->'items','requiredFields',case when f.method='physical_shipping'then jsonb_build_array('name','phone','postalCode','address1','address2')else jsonb_build_array('name','phone')end)end)into result
    from public.benefit_draw_winners w join public.benefit_fulfillments f on f.winner_id=w.id join public.live_benefit_campaign_items item on item.campaign_id=w.campaign_id and item.benefit_id=w.benefit_id join public.benefits b on b.id=w.benefit_id join public.benefit_localizations l on l.benefit_id=w.benefit_id and l.locale=p_locale where w.id=p_award_id and w.app_user_id=p_app_user_id;end if;
  if result is null then raise exception'MOBILE_BENEFIT_AWARD_NOT_FOUND';end if;return result;
end $$;

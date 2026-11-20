begin;
set local lock_timeout = '5s';

alter table public.fan_product_events
  drop constraint fan_product_events_event_name_check,
  add constraint fan_product_events_event_name_check check (event_name in (
    'creator_page_view','live_page_view','live_cta_click','benefit_page_view',
    'reaction_completed','passport_issued','reservation_completed',
    'attendance_completed','mission_completed','ticket_credited','ticket_debited',
    'journey_completed','collectible_claimed','benefit_entered','benefit_won',
    'fulfillment_completed','signup_guide_view','signup_guide_cta','login_started',
    'login_result','account_created','profile_completed','outbound_link_click',
    'browser_handoff','page_view','share_completed','fan_verification_started','fan_verification_submitted',
    'daily_checkin_completed','post_created','comment_created','cheer_completed'
  )) not valid;
alter table public.fan_product_events validate constraint fan_product_events_event_name_check;

do $patch$
declare
  old_body text := pg_get_functiondef('public.record_product_event_v1(smallint,text,uuid,text,uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb)'::regprocedure);
  body text;
begin
  body := replace(old_body,'''login_result'',''account_created'',''profile_completed'',''outbound_link_click''','''browser_handoff'',''login_result'',''account_created'',''profile_completed'',''outbound_link_click''');
  if body = old_body then raise exception 'Missing event list'; end if;
  body := replace(body, '''google'',''apple'',''test'',''unknown''','''google'',''apple'',''email'',''test'',''unknown''');
  body := replace(body, '''instagram'',''kakao'',''safari'',''chrome'',''other''','''instagram'',''threads'',''facebook'',''line'',''x'',''tiktok'',''telegram'',''webview'',''kakao'',''safari'',''chrome'',''other''');
  body := replace(body, '  if p_event_name in (''ticket_credited'', ''ticket_debited'') then', $rules$
  if p_event_name = 'browser_handoff' and (
    p_source <> 'web.login' or not (p_properties ?& array['app','step'])
    or p_properties - array['app','step'] <> '{}'::jsonb
    or coalesce(p_properties->>'app','') not in ('instagram','threads','facebook','line','x','tiktok','telegram','kakao','webview')
    or coalesce(p_properties->>'step','') not in ('attempt','arrival','overlay','continue')
  ) then raise exception 'PRODUCT_EVENT_INVALID' using errcode = '22023'; end if;
  if p_event_name in ('ticket_credited', 'ticket_debited') then$rules$);
  if position('if p_event_name = ''browser_handoff''' in body) = 0 then raise exception 'Missing validation'; end if;
  execute body;
end $patch$;
commit;

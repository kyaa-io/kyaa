-- Disposable clean-chain DB only; all fixture changes roll back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.translation_error(p_sql text,p_expected text) returns void language plpgsql as $$
begin execute p_sql; raise exception 'missing error %',p_expected;
exception when others then if sqlerrm='missing error '||p_expected or position(p_expected in sqlerrm)=0 then raise; end if; end $$;
do $$
declare a uuid:='dc260000-0000-4000-8000-000000000001';b uuid:='dc260000-0000-4000-8000-000000000002';h text:=repeat('a',64);s text:=repeat('b',64);i integer;
begin
  if current_database()<>'byus_clean' then raise exception 'disposable database required';end if;
  insert into public.app_users(id,privy_user_id,verified_email) values(a,'did:privy:display-translation-a','display-a@byus.test'),(b,'did:privy:display-translation-b','display-b@byus.test');
  if has_table_privilege('anon','public.display_translations','select') or has_table_privilege('authenticated','public.display_translations','select') or has_function_privilege('anon','public.read_display_translation(uuid,text,text,text)','execute') or has_function_privilege('authenticated','public.reserve_display_translation_request(uuid,text,integer)','execute') then raise exception 'display translation public ACL leak';end if;
  perform public.save_display_translation(a,h,s,'ru','["Привет"]');
  if public.read_display_translation(a,h,s,'ru')->>'translatedText'<>'["Привет"]' then raise exception 'owner cache failed';end if;
  if public.read_display_translation(b,h,s,'ru') is not null or public.read_display_translation(null,h,s,'ru') is not null or public.read_display_translation(a,repeat('c',64),s,'ru') is not null or public.read_display_translation(a,h,s,'en') is not null or public.read_display_translation(a,h,repeat('d',64),'ru') is not null then raise exception 'cache identity/source/locale isolation failed';end if;
  perform public.save_display_translation(null,repeat('e',64),s,'ru','["Открытый текст"]');
  if (select expires_at>clock_timestamp()+interval '24 hours' from public.display_translations where requester_hash=repeat('e',64)) then raise exception 'guest TTL too long';end if;
  update public.display_translations set expires_at=clock_timestamp()-interval '1 second' where requester_hash=repeat('e',64);
  if public.read_display_translation(null,repeat('e',64),s,'ru') is not null then raise exception 'expired cache visible';end if;
  if exists(select 1 from public.display_translations where requester_hash=repeat('e',64)) then raise exception 'expired cache not removed';end if;
  update public.app_users set status='disabled' where id=a;
  if exists(select 1 from public.display_translations where app_user_id=a) then raise exception 'disabled account retained cache';end if;
  perform pg_temp.translation_error(format('select public.read_display_translation(%L,%L,%L,%L)',a,h,s,'ru'),'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
  update public.app_users set status='active' where id=a;
  delete from public.content_translation_requests;delete from public.display_translation_requests;
  perform public.reserve_content_translation_request(a,6000);perform public.reserve_display_translation_request(a,h,4000);
  perform pg_temp.translation_error(format('select public.reserve_content_translation_request(%L,1)',a),'TRANSLATION_RATE_LIMITED');
  perform pg_temp.translation_error(format('select public.reserve_display_translation_request(%L,%L,1)',a,h),'TRANSLATION_RATE_LIMITED');
  perform public.reserve_display_translation_request(b,repeat('c',64),10000);
  perform pg_temp.translation_error(format('select public.reserve_display_translation_request(null,%L,1)',repeat('e',64)),'TRANSLATION_RATE_LIMITED');
  delete from public.content_translation_requests;delete from public.display_translation_requests;
  for i in 1..5 loop perform public.reserve_content_translation_request(a,1);perform public.reserve_display_translation_request(a,h,1);end loop;
  perform pg_temp.translation_error(format('select public.reserve_content_translation_request(%L,1)',a),'TRANSLATION_RATE_LIMITED');
  perform pg_temp.translation_error(format('select public.reserve_display_translation_request(%L,%L,1)',a,h),'TRANSLATION_RATE_LIMITED');
  delete from public.content_translation_requests;delete from public.display_translation_requests;
  for i in 1..10 loop perform public.reserve_display_translation_request(null,h,1);end loop;
  perform pg_temp.translation_error(format('select public.reserve_display_translation_request(null,%L,1)',h),'TRANSLATION_RATE_LIMITED');
  raise notice 'DISPLAY_TRANSLATION_PASS owner/guest/source/locale cache isolation, expiry, disable cleanup, service ACL, shared character/rate budgets';
end $$;
rollback;

-- Disposable SQL fixture, included inside each caller's rollback transaction.
create or replace function pg_temp.group_scope_fixture(p_actor uuid,p_checked_in boolean default false)returns uuid language plpgsql as $$
declare creator uuid;page uuid;begin
 select id into creator from public.celebrities where slug='kyaa-wave-fanpage';
 if creator is null then
  creator:=extensions.gen_random_uuid();
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'kyaa-wave-fanpage','published','/fixture-wave.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','WAVE 검증','검증 페이지','검증 이미지'),(creator,'en','WAVE fixture','Test page','Test image');
 end if;
 select id into page from public.group_pages where celebrity_id=creator;
 if page is null then insert into public.group_pages(kind,celebrity_id,name)values('fan',creator,'WAVE fixture')returning id into page;end if;
 insert into public.group_memberships(page_id,app_user_id)values(page,p_actor)on conflict do nothing;
 if p_checked_in then insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint)values(p_actor,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',md5('group-scope:'||p_actor)||md5('group-scope:'||p_actor))on conflict(event_key,app_user_id)do nothing;end if;
 return page;
end $$;

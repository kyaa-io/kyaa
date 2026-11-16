-- Disposable database only, after the platform follower collector migration.
begin;
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %', label; end if; end $$;
do $$
declare artist uuid := 'fa400000-0000-4000-8000-0000000000b9';
  insta text := 'https://www.instagram.com/follower.test/';
  tiktok text := 'https://www.tiktok.com/@follower.test';
  stamp timestamptz := '2026-11-16T00:00:00Z';
  fn text := 'public.save_collected_platform_followers(uuid,text,text,bigint,smallint,text,timestamptz)';
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
    values (artist,'platform-follower-test','published','/images/creator.webp',now(),'{creator}','creator');
  insert into public.celebrity_social_links(celebrity_id,platform,url,position) values(artist,'instagram',insta,0),(artist,'tiktok',tiktok,1);
  perform pg_temp.expect(public.save_collected_platform_followers(artist,'instagram',insta,4283000,4::smallint,'428.3만',stamp),'rounded saved');
  perform pg_temp.expect((select follower_count = 4283000 and significant_digits = 4 and source_text = '428.3만' and source_kind = 'collector'
    and source_url = insta and checked_at = stamp from public.celebrity_platform_followers
    where celebrity_id = artist and platform = 'instagram'),'rounded fields saved');
  perform pg_temp.expect(public.save_collected_platform_followers(artist,'tiktok',tiktok,20868849,null,null,stamp),'exact saved');
  perform pg_temp.expect((select significant_digits is null and source_text is null from public.celebrity_platform_followers
    where celebrity_id = artist and platform = 'tiktok'),'exact has no rounding');
  perform pg_temp.expect(public.save_collected_platform_followers(artist,'tiktok',tiktok,21000000,3::smallint,'21M',stamp + interval '7 day'),'newer replaces');
  perform pg_temp.expect((select follower_count = 21000000 and source_text = '21M' from public.celebrity_platform_followers
    where celebrity_id = artist and platform = 'tiktok'),'newer fields saved');
  perform pg_temp.expect(not public.save_collected_platform_followers(artist,'tiktok',tiktok,1,null,null,stamp),'older ignored');
  update public.celebrity_platform_followers set follower_count = 999, source_text = null, significant_digits = null, source_kind = 'manual'
    where celebrity_id = artist and platform = 'instagram';
  perform pg_temp.expect(not public.save_collected_platform_followers(artist,'instagram',insta,5000000,2::smallint,'500만',stamp + interval '1 day'),'manual wins');
  perform pg_temp.expect((select follower_count = 999 and source_kind = 'manual' from public.celebrity_platform_followers
    where celebrity_id = artist and platform = 'instagram'),'manual row preserved');
  perform pg_temp.expect(not public.save_collected_platform_followers(artist,'tiktok','https://www.tiktok.com/@other',5,null,null,stamp + interval '8 day'),'other account refused');
  update public.celebrity_social_links set active = false where celebrity_id = artist and platform = 'tiktok';
  perform pg_temp.expect(not public.save_collected_platform_followers(artist,'tiktok',tiktok,5,null,null,stamp + interval '8 day'),'inactive link refused');
  begin
    perform public.save_collected_platform_followers(artist,'youtube','https://www.youtube.com/@x',5,null,null,stamp);
    raise exception 'FAIL youtube refused';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform pg_temp.expect(not has_function_privilege('anon',fn,'execute'),'anon denied');
  perform pg_temp.expect(not has_function_privilege('authenticated',fn,'execute'),'authenticated denied');
  perform pg_temp.expect(has_function_privilege('service_role',fn,'execute'),'service allowed');
end $$;
rollback;

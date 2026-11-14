-- Disposable database only, after the follower collector migration.
begin;
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %', label; end if; end $$;
do $$
declare artist uuid := 'fa400000-0000-4000-8000-0000000000a9';
  channel text := 'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa';
  stamp timestamptz := '2026-11-14T00:00:00Z';
begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
    values (artist,'youtube-follower-test','published','/images/creator.webp',now(),'{creator}','creator');
  insert into public.celebrity_social_links(celebrity_id,platform,url) values(artist,'youtube',channel);
  perform pg_temp.expect(public.save_collected_youtube_followers(artist,channel,123000,stamp),'first result saved');
  perform pg_temp.expect(not public.save_collected_youtube_followers(artist,channel,456000,stamp - interval '1 day'),'older result ignored');
  perform pg_temp.expect((select follower_count = 123000 and significant_digits = 3 and source_kind = 'collector'
    and source_url = channel and checked_at = stamp from public.celebrity_platform_followers
    where celebrity_id = artist and platform = 'youtube'),'collector fields saved');
  update public.celebrity_platform_followers set follower_count = 999, source_kind = 'manual'
    where celebrity_id = artist and platform = 'youtube';
  perform pg_temp.expect(not public.save_collected_youtube_followers(artist,channel,456000,stamp + interval '1 day'),'manual wins');
  perform pg_temp.expect((select follower_count = 999 and checked_at = stamp from public.celebrity_platform_followers
    where celebrity_id = artist and platform = 'youtube'),'manual row preserved');
  perform pg_temp.expect(not public.save_collected_youtube_followers(artist,'https://www.youtube.com/@other',456000,stamp),'wrong source refused');
  perform pg_temp.expect(not has_function_privilege('anon','public.save_collected_youtube_followers(uuid,text,bigint,timestamptz)','execute'),'anon denied');
  perform pg_temp.expect(not has_function_privilege('authenticated','public.save_collected_youtube_followers(uuid,text,bigint,timestamptz)','execute'),'authenticated denied');
  perform pg_temp.expect(has_function_privilege('service_role','public.save_collected_youtube_followers(uuid,text,bigint,timestamptz)','execute'),'service allowed');
end $$;
rollback;

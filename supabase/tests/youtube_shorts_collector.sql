begin;
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL %',label; end if; end $$;
do $$
declare artist uuid:='fa400000-0000-4000-8000-0000000000b9'; channel text:='https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa'; stamp timestamptz:='2026-11-16T00:00:00Z';
begin
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(artist,'youtube-shorts-test','published','/images/creator.webp',now(),'{creator}','creator');
insert into public.celebrity_social_links(celebrity_id,platform,url) values(artist,'youtube',channel);
perform pg_temp.expect(public.save_collected_youtube_shorts(artist,channel,'abcdefghijk',' 원문 그대로 ',stamp,stamp),'save');
perform pg_temp.expect((select title=' 원문 그대로 ' from public.home_shortform where video_id='abcdefghijk'),'original preserved');
perform pg_temp.expect(not public.save_collected_youtube_shorts(artist,channel,'abcdefghijk','old',stamp,stamp-interval '1 day'),'old ignored');
perform pg_temp.expect(not public.save_collected_youtube_shorts(artist,'wrong','abcdefghijl','wrong',stamp,stamp),'wrong channel refused');
insert into public.home_shortform(celebrity_id,video_id,title,href,published_at) values(artist,'abcdefghijm','manual','https://www.youtube.com/watch?v=abcdefghijm',stamp);
perform pg_temp.expect(not public.save_collected_youtube_shorts(artist,channel,'abcdefghijm','changed',stamp,stamp),'manual preserved');
perform public.check_collected_youtube_short('abcdefghijk',true,stamp+interval '8 days');
perform pg_temp.expect((select unavailable_at is not null from public.home_shortform where video_id='abcdefghijk'),'hidden');
perform pg_temp.expect(public.read_shortform_participation('abcdefghijk',null) is null,'participation hidden');
perform pg_temp.expect(public.read_shortform_comments('abcdefghijk',null,'ko',null,null) is null,'comments hidden');
perform pg_temp.expect(not has_function_privilege('anon','public.save_collected_youtube_shorts(uuid,text,text,text,timestamptz,timestamptz)','execute'),'anon denied');
update public.celebrity_social_links set active=false where celebrity_id=artist;
perform pg_temp.expect(not public.save_collected_youtube_shorts(artist,channel,'abcdefghijk','disabled',stamp,stamp),'inactive refused');
end $$;
rollback;

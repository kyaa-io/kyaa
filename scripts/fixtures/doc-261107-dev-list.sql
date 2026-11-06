-- DEV ONLY, read-only. What the doc-261107 fixture has in this database right now, for the cleanup record.
select jsonb_build_object(
 'users',(select count(*) from public.app_users where id::text like 'd2611001-%'),
 'creator',(select count(*) from public.celebrities where id='d2611002-0000-4000-8000-000000000001'),
 'pages',(select count(*) from public.group_pages where id::text like 'd2611003-%'),
 'fanPosts',(select count(*) from public.fan_posts where id::text like 'd2611004-%'),
 'fanComments',(select count(*) from public.fan_post_comments where id::text like 'd2611005-%'),
 'groupPosts',(select count(*) from public.group_posts where id::text like 'd2611006-%'),
 'groupComments',(select count(*) from public.group_comments where id::text like 'd2611007-%'),
 'rooms',(select count(*) from public.group_rooms where id::text like 'd2611008-%'),
 'passports',(select count(*) from public.fan_passports where celebrity_id='d2611002-0000-4000-8000-000000000001'),
 'stoppedJobs',(select count(*) from public.blockchain_jobs where operation_key like 'doc-261107:%'),
 'friendships',(select count(*) from public.social_friendships where payload_hash='doc-261107-fixture'),
 'markedMemberships',(select count(*) from public.group_memberships where answer='doc-261107-fixture'),
 'artistBindings',(select count(*) from public.group_artist_bindings where app_user_id='d2611001-0000-4000-8000-000000000121'),
 'gaugeTitles',(select count(*) from public.jjinfan_titles where celebrity_id='d2611002-0000-4000-8000-000000000001'),
 'fixtureRowsWithOtherAuthors',(select count(*) from public.fan_post_comments c join public.fan_posts p on p.id=c.post_id where p.id::text like 'd2611004-%' and c.id::text not like 'd2611005-%')
) doc261107_list;

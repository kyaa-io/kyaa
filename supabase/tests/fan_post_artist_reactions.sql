-- Synthetic data only. Run on a disposable/local migrated DB; everything rolls back.
begin;
do $$
declare c uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid();
 art uuid:=gen_random_uuid(); art2 uuid:=gen_random_uuid(); fan uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid();
 liked uuid:=gen_random_uuid(); commented uuid:=gen_random_uuid(); quiet uuid:=gen_random_uuid(); own uuid:=gen_random_uuid();
 removed uuid:=gen_random_uuid(); fan_only uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); r jsonb;
 slug text:='react-'||substr(gen_random_uuid()::text,1,8); slug2 text:='react2-'||substr(gen_random_uuid()::text,1,8);
begin
 insert into public.app_users(id,privy_user_id,verified_email) values
  (art,'did:privy:ar-'||art,art||'@example.test'),(art2,'did:privy:ar-'||art2,art2||'@example.test'),(fan,'did:privy:ar-'||fan,fan||'@example.test');
 insert into public.admin_allowlist(id,email,active,role) values (adm,adm||'@example.test',true,'admin');
 insert into public.celebrities(id,slug,image_url,roles,primary_role,status,published_at,ever_published_at) values
  (c,slug,'https://example.test/x.png',array['artist']::public.celebrity_role[],'idol','published',now(),now()),
  (c2,slug2,'https://example.test/x.png',array['artist']::public.celebrity_role[],'idol','published',now(),now());
 insert into public.group_pages(id,kind,name,celebrity_id) values (p,'fan','react page',c),(p2,'fan','other react page',c2);
 insert into public.group_artist_bindings(page_id,app_user_id,verified_by) values (p,art,adm),(p2,art2,adm);
 insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash) values
  (liked,c,fan,'liked',gen_random_uuid(),'h1'),(commented,c,fan,'commented',gen_random_uuid(),'h2'),(quiet,c,fan,'quiet',gen_random_uuid(),'h3'),
  (own,c,art,'artist own',gen_random_uuid(),'h4'),(removed,c,fan,'removed comment',gen_random_uuid(),'h5'),(fan_only,c,fan,'fan reactions',gen_random_uuid(),'h6'),
  (other,c,fan,'other artist',gen_random_uuid(),'h7');
 insert into public.fan_post_likes(post_id,app_user_id) values (liked,art),(own,art),(fan_only,fan),(other,art2);
 insert into public.fan_post_comments(post_id,app_user_id,body,idempotency_key) values (commented,art,'hello',gen_random_uuid()),(fan_only,fan,'me too',gen_random_uuid());
 insert into public.fan_post_comments(post_id,app_user_id,body,idempotency_key,deleted_at) values (removed,art,'gone',gen_random_uuid(),now());

 r:=public.fan_post_artist_reactions(array[liked,commented,quiet,own,removed,fan_only,other,gen_random_uuid()]);
 if r is distinct from (select jsonb_agg(x order by x) from unnest(array[liked,commented]) x) then raise exception 'unexpected reacted set: %',r; end if;
 if public.fan_post_artist_reactions(array[]::uuid[])<>'[]'::jsonb then raise exception 'empty input'; end if;
 if public.fan_post_artist_reactions(null)<>'[]'::jsonb then raise exception 'null input'; end if;
 -- a suspended artist account no longer marks
 update public.app_users set status='disabled' where id=art;
 if public.fan_post_artist_reactions(array[liked,commented])<>'[]'::jsonb then raise exception 'inactive artist must not mark'; end if;
end $$;
do $$
begin
 if has_function_privilege('anon','public.fan_post_artist_reactions(uuid[])','execute')
  or has_function_privilege('authenticated','public.fan_post_artist_reactions(uuid[])','execute') then raise exception 'API roles must not execute'; end if;
 if not has_function_privilege('service_role','public.fan_post_artist_reactions(uuid[])','execute') then raise exception 'service role must execute'; end if;
end $$;
rollback;

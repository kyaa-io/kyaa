-- Disposable latest-chain database. All content and audit entries roll back.
begin;
do $$
declare
  author_id uuid := gen_random_uuid(); manager_id uuid := gen_random_uuid();
  creator uuid := gen_random_uuid(); notice uuid := gen_random_uuid(); fan_post uuid := gen_random_uuid();
  page_id uuid := gen_random_uuid(); group_post uuid := gen_random_uuid();
  fan uuid := gen_random_uuid(); notice_c uuid := gen_random_uuid(); group_c uuid := gen_random_uuid();
  args jsonb := jsonb_build_object('postId',group_post,'body','edited');
begin
  insert into public.app_users(id,privy_user_id,verified_email)
    select id,'did:privy:'||id,id||'@example.test' from unnest(array[author_id,manager_id]) id;
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
    values(creator,'comment-edit-example','published','/images/creator.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(creator,'ko','예시','소개','사진');
  insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at)
    values(notice,creator,'example','published',now(),now());
  insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json) values(notice,'ko','공지','{"type":"doc","content":[]}');
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash)
    values(fan_post,creator,author_id,'example',gen_random_uuid(),'example');
  insert into public.fan_post_comments(id,post_id,app_user_id,body,idempotency_key) values(fan,fan_post,author_id,'original',gen_random_uuid());
  insert into public.celebrity_notice_comments(id,notice_id,app_user_id,body,idempotency_key) values(notice_c,notice,author_id,'original',gen_random_uuid());
  insert into public.group_pages(id,kind,name)values(page_id,'hobby','Example');
  insert into public.group_memberships(page_id,app_user_id,role) values(page_id,author_id,'member'),(page_id,manager_id,'owner');
  insert into public.group_posts(id,page_id,author_id,title,body,visibility,anonymous) values(group_post,page_id,author_id,'Example','Example','public',false);
  insert into public.group_comments(id,post_id,author_id,body,anonymous) values(group_c,group_post,author_id,'original',true);
  begin perform public.edit_fan_post_comment(manager_id,fan,'foreign'); raise exception 'foreign fan edit allowed'; exception when no_data_found then null; end;
  begin perform public.edit_owned_notice_comment(manager_id,notice_c,'foreign'); raise exception 'foreign notice edit allowed'; exception when no_data_found then null; end;
  begin perform public.group_member_comments('comment-remove',manager_id,page_id,group_c,args,null); raise exception 'manager used author delete'; exception when raise_exception then if sqlerrm<>'GROUPS_NOT_FOUND' then raise; end if; end;
  perform public.edit_fan_post_comment(author_id,fan,'edited');
  perform public.edit_owned_notice_comment(author_id,notice_c,'edited');
  perform public.group_member_comments('comment-edit',author_id,page_id,group_c,args,null);
  if not exists(select 1 from public.fan_post_comments where id=fan and body='edited' and revision=2)
     or not exists(select 1 from public.celebrity_notice_comments where id=notice_c and body='edited' and edited_at is not null)
     or not exists(select 1 from public.group_comments where id=group_c and body='edited' and edited_at is not null) then raise exception 'edit missing'; end if;
  perform public.delete_owned_fan_post_comment(author_id,fan);
  perform public.delete_owned_notice_comment(author_id,notice_c);
  perform public.group_member_comments('comment-remove',author_id,page_id,group_c,args,null);
  if (select count(*) from public.audit_logs where actor_app_user_id=author_id and entity_id in(fan::text,notice_c::text,group_c::text) and action in('comment.edit','comment.delete'))<>6 then raise exception 'audit missing'; end if;
end $$;
rollback;

\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
do $$
declare p uuid:=gen_random_uuid(); owner_id uuid:=gen_random_uuid(); fan uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); post_id uuid; request uuid:=gen_random_uuid(); r jsonb; doc jsonb:='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"본문"}]}]}';
begin
 insert into public.app_users(id,privy_user_id,verified_email) select x,'did:privy:rich-'||x,x||'@example.test' from unnest(array[owner_id,fan,outsider]) x;
 insert into public.group_pages(id,kind,name) values (p,'hobby','rich page');
 insert into public.group_memberships(page_id,app_user_id,role) values (p,owner_id,'owner'),(p,fan,'member');
 -- Group post: the document is stored through the dispatch and read back on the detail only.
 r:=public.groups_content_dispatch('post',fan,p,null,jsonb_build_object('title','제목','body','본문','visibility','public','assetIds','[]'::jsonb,'bodyDoc',doc,'requestId',request));
 post_id:=(r->>'id')::uuid;
 if (select body_doc from public.group_posts where id=post_id) is distinct from doc then raise exception 'document not stored'; end if;
 r:=public.groups_content_dispatch('post-detail',outsider,p,post_id,'{"format":"rich"}'::jsonb);
 if r->'bodyDoc' is distinct from doc or r->>'body'<>'본문' then raise exception 'rich detail must carry the document and the plain body: %',r; end if;
 r:=public.groups_content_dispatch('post-detail',outsider,p,post_id,'{}'::jsonb);
 if r?'bodyDoc' then raise exception 'a reader that did not ask must not receive the document'; end if;
 r:=public.groups_content_dispatch('posts',null,p,null,'{}'::jsonb);
 if (r->'items'->0)?'bodyDoc' then raise exception 'lists must not carry the document'; end if;
 -- Replaying the same request must not bring back an older document.
 r:=public.groups_content_dispatch('post-edit',fan,p,post_id,jsonb_build_object('title','제목','body','둘째','visibility','public','bodyDoc','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"둘째"}]}]}'::jsonb,'requestId',gen_random_uuid()));
 r:=public.groups_content_dispatch('post',fan,p,null,jsonb_build_object('title','제목','body','본문','visibility','public','assetIds','[]'::jsonb,'bodyDoc',doc,'requestId',request));
 if (select body_doc->'content'->0->'content'->0->>'text' from public.group_posts where id=post_id)<>'둘째' then raise exception 'replay rewrote the document'; end if;
 -- A plain edit (older web, mobile app) changes the body and keeps the document.
 r:=public.groups_content_dispatch('post-edit',fan,p,post_id,jsonb_build_object('title','제목','body','평문 수정','visibility','public','requestId',gen_random_uuid()));
 if (select body from public.group_posts where id=post_id)<>'평문 수정' then raise exception 'plain edit must change the body'; end if;
 if (select body_doc->'content'->0->'content'->0->>'text' from public.group_posts where id=post_id)<>'둘째' then raise exception 'plain edit must keep the document'; end if;
 r:=public.groups_content_dispatch('post-detail',fan,p,post_id,'{}'::jsonb);
 if r?'bodyDoc' then raise exception 'plain detail must omit the document'; end if;
 -- Someone else cannot write a document on this post.
 begin
  r:=public.groups_content_dispatch('post-edit',owner_id,p,post_id,jsonb_build_object('title','탈취','body','탈취','visibility','public','bodyDoc',doc,'requestId',gen_random_uuid()));
  raise exception 'another member edited the post';
 exception when others then if sqlerrm<>'GROUPS_FORBIDDEN' then raise; end if; end;
 if (select body_doc->'content'->0->'content'->0->>'text' from public.group_posts where id=post_id)<>'둘째' then raise exception 'forbidden edit changed the document'; end if;
 -- A document at the web's limit fits its column.
 update public.group_posts set body_doc=jsonb_build_object('type','doc','content',(select jsonb_agg(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',repeat('가',39))))) from generate_series(1,1900))) where id=post_id;
 if octet_length((select body_doc::text from public.group_posts where id=post_id))<=262144 then raise exception 'size probe is below the web limit'; end if;
 -- Past the column limit it is refused.
 begin update public.group_posts set body_doc=jsonb_build_object('type','doc','pad',repeat('가',200000)) where id=post_id; raise exception 'size check missing';
 exception when check_violation then null; end;
 -- The column refuses anything but a document.
 begin update public.group_posts set body_doc='"text"'::jsonb where id=post_id; raise exception 'shape check missing';
 exception when check_violation then null; end;
end $$;
do $$
declare creator uuid:=gen_random_uuid(); fan_page uuid:=gen_random_uuid(); author uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); slug text:='rich-'||substr(gen_random_uuid()::text,1,8); w jsonb; pid uuid; k uuid:=gen_random_uuid(); doc jsonb:='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"본문"}]}]}';
begin
 insert into public.app_users(id,privy_user_id,verified_email) select x,'did:privy:rich-'||x,x||'@example.test' from unnest(array[author,stranger]) x;
 insert into public.celebrities(id,slug,image_url,roles,primary_role,status,published_at,ever_published_at) values (creator,slug,'https://example.test/x.png',array['artist']::public.celebrity_role[],'idol','published',now(),now());
 insert into public.group_pages(id,kind,name,celebrity_id) values (fan_page,'fan','rich fan page',creator);
 insert into public.group_memberships(page_id,app_user_id,role) values (fan_page,author,'member');
 w:=public.save_fan_post_rich(author,slug,null,E'제목\n본문','public','{}'::uuid[],null,k,doc);
 pid:=(w->>'id')::uuid;
 if public.read_fan_post_body_doc(null,pid) is distinct from doc then raise exception 'public fan document unreadable'; end if;
 if public.read_fan_post(null,pid,'ko')->'post'?'bodyDoc' then raise exception 'plain read must not carry the document'; end if;
 w:=public.save_fan_post_rich(author,slug,null,E'제목\n본문','public','{}'::uuid[],null,k,'{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb);
 if not (w->>'replayed')::boolean or public.read_fan_post_body_doc(null,pid) is distinct from doc then raise exception 'replay rewrote the fan document'; end if;
 w:=public.save_fan_post(author,slug,pid,E'제목\n평문','public','{}'::uuid[],1,null);
 if public.read_fan_post_body_doc(null,pid) is distinct from doc then raise exception 'plain fan edit must keep the document'; end if;
 if (select body from public.fan_posts where id=pid)<>E'제목\n평문' then raise exception 'plain fan edit must change the body'; end if;
 w:=public.save_fan_post_rich(author,slug,pid,E'제목\n다시','members','{}'::uuid[],(w->>'revision')::int,null,doc);
 if public.read_fan_post_body_doc(author,pid) is distinct from doc then raise exception 'author cannot read a members document'; end if;
 if public.read_fan_post_body_doc(stranger,pid) is not null or public.read_fan_post_body_doc(null,pid) is not null then raise exception 'members document leaked'; end if;
 begin w:=public.save_fan_post_rich(stranger,slug,pid,E'제목\n탈취','public','{}'::uuid[],1,null,doc); raise exception 'stranger edited the post';
 exception when others then if sqlerrm not like 'FAN_WEB_%' then raise; end if; end;
 if has_function_privilege('anon','public.save_fan_post_rich(uuid,text,uuid,text,text,uuid[],integer,uuid,jsonb)','execute') or has_function_privilege('authenticated','public.read_fan_post_body_doc(uuid,uuid)','execute') then raise exception 'API role can reach the rich functions'; end if;
 if not has_function_privilege('service_role','public.save_fan_post_rich(uuid,text,uuid,text,text,uuid[],integer,uuid,jsonb)','execute') then raise exception 'service_role lost save_fan_post_rich'; end if;
 -- Account deletion empties the row and takes the document with it.
 update public.fan_posts set body='',deleted_at=coalesce(deleted_at,clock_timestamp()) where id=pid;
 if (select body_doc from public.fan_posts where id=pid) is not null then raise exception 'account deletion must remove the document'; end if;
 raise notice 'PASS rich post body';
end $$;
rollback;

-- Rollback file: a stored document does not stop it, posts keep their text, and the migration applies again.
begin;
insert into public.app_users(id,privy_user_id,verified_email) values ('7a000000-0000-4000-8000-000000000001','did:privy:rich-rollback','rich-rollback@example.test');
insert into public.group_pages(id,kind,name) values ('7a000000-0000-4000-8000-000000000002','hobby','rich rollback page');
insert into public.group_posts(id,page_id,author_id,title,body,visibility,anonymous,category,body_doc) values ('7a000000-0000-4000-8000-000000000003','7a000000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000001','제목','되돌려도 남는 글','public',false,'free','{"type":"doc","content":[{"type":"paragraph"}]}');
commit;
\ir ../rollback/20261212030100_rich_post_body_size.sql
\ir ../rollback/20261212030000_rich_post_body.sql
do $$begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name in('fan_posts','group_posts') and column_name='body_doc') then raise exception 'rollback left body_doc'; end if;
 if to_regprocedure('public.save_fan_post_rich(uuid,text,uuid,text,text,uuid[],integer,uuid,jsonb)') is not null or to_regprocedure('public.read_fan_post_body_doc(uuid,uuid)') is not null or to_regprocedure('public.groups_content_dispatch_before_rich_body(text,uuid,uuid,uuid,jsonb,uuid)') is not null then raise exception 'rollback left a function'; end if;
 if to_regprocedure('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)') is null then raise exception 'rollback lost the dispatch'; end if;
 if not has_function_privilege('service_role','public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','execute') or has_function_privilege('anon','public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','execute') then raise exception 'rollback changed dispatch access'; end if;
 if (select body from public.group_posts where id='7a000000-0000-4000-8000-000000000003')<>'되돌려도 남는 글' then raise exception 'rollback lost the post text'; end if;
 if (public.groups_content_dispatch('post-detail',null,'7a000000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000003','{}'::jsonb)->>'body')<>'되돌려도 남는 글' then raise exception 'dispatch does not read after rollback'; end if;
 raise notice 'PASS rich post body rollback';
end $$;
\ir ../migrations/20261212030000_rich_post_body.sql
\ir ../migrations/20261212030100_rich_post_body_size.sql
do $$begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='group_posts' and column_name='body_doc') or to_regprocedure('public.save_fan_post_rich(uuid,text,uuid,text,text,uuid[],integer,uuid,jsonb)') is null then raise exception 'migration did not apply again'; end if;
 delete from public.group_posts where id='7a000000-0000-4000-8000-000000000003';
 delete from public.group_pages where id='7a000000-0000-4000-8000-000000000002';
 raise notice 'PASS rich post body reapply';
end $$;

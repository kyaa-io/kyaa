-- Run after 20261104000000_notice_comment_threads.sql. All fixtures roll back.
begin;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
declare caught boolean:=false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm)=0 then
      raise exception 'Unexpected error %, wanted %',sqlerrm,expected;
    end if;
    caught:=true;
  end;
  if not caught then raise exception 'Expected error was not raised: %',expected; end if;
end $$;

do $$
declare
  creator uuid:=extensions.gen_random_uuid();
  notice uuid:=extensions.gen_random_uuid();
  owner uuid:=extensions.gen_random_uuid();
  other_user uuid:=extensions.gen_random_uuid();
  quiz uuid:=extensions.gen_random_uuid();
  attempt uuid:=extensions.gen_random_uuid();
  pass uuid:=extensions.gen_random_uuid();
  passport uuid:=extensions.gen_random_uuid();
  passport_job uuid:=extensions.gen_random_uuid();
  parent_comment uuid;
  reply uuid;
  slug text:='notice-thread-'||replace(creator::text,'-','');
  result jsonb;
  again jsonb;
  idem uuid:=extensions.gen_random_uuid();
  root_idem uuid:=extensions.gen_random_uuid();
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (owner,'did:privy:notice-thread-'||owner::text,owner::text||'@example.test'),
    (other_user,'did:privy:notice-thread-'||other_user::text,other_user::text||'@example.test');
  insert into public.user_profiles(app_user_id,nickname,nickname_normalized) values
    (owner,'답글 작성자','답글 작성자'),(other_user,'반응 작성자','반응 작성자');
  insert into public.celebrities(id,slug,status,image_url,published_at,fan_count,roles,primary_role)
    values(creator,slug,'published','/notice-thread.webp',clock_timestamp(),1,'{artist}','idol');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)
    values(creator,'ko','댓글 스레드','댓글 스레드','댓글 스레드');
  insert into public.celebrity_notices(id,celebrity_id,slug,publication_status,published_at,ever_published_at)
    values(notice,creator,'thread-notice','published',clock_timestamp(),clock_timestamp());
  insert into public.celebrity_notice_localizations(notice_id,locale,title,body_json)
    values(notice,'ko','댓글 스레드 공지','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"본문"}]}]}'::jsonb);

  insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at)
    values(quiz,creator,1,'published',clock_timestamp());
  insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at)
    values(attempt,owner,creator,quiz,1,extensions.gen_random_uuid(),'passed',3,clock_timestamp());
  insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id)
    values(pass,owner,creator,attempt);
  insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload)
    values(passport_job,'passport',passport,'notice-thread-passport-'||passport::text,'{}');
  alter table public.fan_passports disable trigger fan_passports_validate_blockchain_job_link;
  insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id,issued_at)
    values(passport,owner,creator,pass,passport_job,clock_timestamp());
  alter table public.fan_passports enable trigger fan_passports_validate_blockchain_job_link;

  result:=public.read_celebrity_fanpage_for_viewer(slug,null,'ko');
  if result->>'viewerCanParticipate'<>'false' then raise exception 'guest participation projection mismatch: %',result; end if;
  result:=public.read_celebrity_fanpage_for_viewer(slug,other_user,'ko');
  if result->>'viewerCanParticipate'<>'false' then raise exception 'nonmember participation projection mismatch: %',result; end if;
  result:=public.read_celebrity_fanpage_for_viewer(slug,owner,'ko');
  if result->>'viewerCanParticipate'<>'true' then raise exception 'member participation projection mismatch: %',result; end if;

  result:=public.post_celebrity_notice_comment(owner,slug,'thread-notice','원댓글',extensions.gen_random_uuid());
  parent_comment:=(result->>'id')::uuid;
  result:=public.post_celebrity_notice_reply(other_user,slug,'thread-notice','답글',idem,parent_comment);
  reply:=(result->>'id')::uuid;
  again:=public.post_celebrity_notice_reply(other_user,slug,'thread-notice','답글',idem,parent_comment);
  if again->>'id'<>reply::text or again->>'replayed'<>'true' then raise exception 'reply replay failed: %',again; end if;
  perform pg_temp.expect_error(
    format('select public.post_celebrity_notice_reply(%L,%L,%L,%L,%L,%L)',other_user,slug,'thread-notice','다른 답글',idem,parent_comment),
    'FANPAGE_IDEMPOTENCY_CONFLICT'
  );
  perform pg_temp.expect_error(
    format('select public.post_celebrity_notice_reply(%L,%L,%L,%L,%L,%L)',other_user,slug,'thread-notice','답글',extensions.gen_random_uuid(),extensions.gen_random_uuid()),
    'FANPAGE_NOT_FOUND'
  );
  result:=public.read_celebrity_notice_comments(slug,'thread-notice',other_user,null,null,20,'ko');
  select item into again from jsonb_array_elements(result->'comments') item where item->>'id'=reply::text;
  if again is null
    or again->>'parentId'<>parent_comment::text
    or again->>'parentNickname'<>'답글 작성자'
    or again->'reactions'<>'[]'::jsonb then
    raise exception 'reply projection mismatch: %',result;
  end if;
  insert into public.user_blocks(app_user_id,blocked_app_user_id) values(other_user,owner);
  result:=public.read_celebrity_notice_comments(slug,'thread-notice',other_user,null,null,20,'ko');
  if not exists(
    select 1 from jsonb_array_elements(result->'comments') item where item->>'id'=reply::text
  ) then raise exception 'visible reply disappeared with blocked parent: %',result; end if;
  if exists(
    select 1 from jsonb_array_elements(result->'comments') item
    where item->>'id'=reply::text and (item->>'parentId' is not null or item->>'parentNickname' is not null)
  ) then raise exception 'blocked parent identity leaked through reply: %',result; end if;
  delete from public.user_blocks where app_user_id=other_user and blocked_app_user_id=owner;

  result:=public.set_notice_comment_reaction(owner,reply,'heart',true);
  if result<>jsonb_build_object('emoji','heart','count',1,'selected',true) then raise exception 'first reaction mismatch: %',result; end if;
  result:=public.set_notice_comment_reaction(owner,reply,'heart',true);
  if result->>'count'<>'1' then raise exception 'reaction retry duplicated: %',result; end if;
  result:=public.set_notice_comment_reaction(other_user,reply,'heart',true);
  if result->>'count'<>'2' then raise exception 'reaction aggregate mismatch: %',result; end if;
  result:=public.read_celebrity_notice_comments(slug,'thread-notice',owner,null,null,20,'ko');
  select item into again from jsonb_array_elements(result->'comments') item where item->>'id'=reply::text;
  if again#>>'{reactions,0,emoji}'<>'heart'
    or again#>>'{reactions,0,count}'<>'2'
    or again#>>'{reactions,0,selected}'<>'true' then
    raise exception 'reaction owner projection mismatch: %',result;
  end if;
  perform public.set_notice_comment_reaction(owner,reply,'heart',false);
  result:=public.read_celebrity_notice_comments(slug,'thread-notice',owner,null,null,20,'ko');
  select item into again from jsonb_array_elements(result->'comments') item where item->>'id'=reply::text;
  if again#>>'{reactions,0,count}'<>'1'
    or again#>>'{reactions,0,selected}'<>'false' then
    raise exception 'reaction removal projection mismatch: %',result;
  end if;
  perform pg_temp.expect_error(
    format('select public.set_notice_comment_reaction(%L,%L,%L,true)',owner,reply,'unsupported'),
    'FANPAGE_INVALID_REQUEST'
  );
  perform pg_temp.expect_error(
    format('update public.celebrity_notice_comments set parent_id=id where id=%L',reply),
    'celebrity_notice_comments_parent_not_self'
  );
  perform pg_temp.expect_error(
    format('select public.post_celebrity_notice_comment(%L,%L,%L,%L,%L)',other_user,slug,'thread-notice','답글',idem),
    'FANPAGE_IDEMPOTENCY_CONFLICT'
  );
  perform public.post_celebrity_notice_comment(other_user,slug,'thread-notice','새 원댓글',root_idem);
  perform pg_temp.expect_error(
    format('select public.post_celebrity_notice_reply(%L,%L,%L,%L,%L,%L)',other_user,slug,'thread-notice','새 원댓글',root_idem,parent_comment),
    'FANPAGE_IDEMPOTENCY_CONFLICT'
  );

  if has_table_privilege('service_role','public.celebrity_notice_comment_reactions','SELECT')
    or has_function_privilege('anon','public.post_celebrity_notice_reply(uuid,text,text,text,uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.set_notice_comment_reaction(uuid,uuid,text,boolean)','EXECUTE')
    or not has_function_privilege('service_role','public.read_celebrity_fanpage_for_viewer(text,uuid,public.content_locale)','EXECUTE') then
    raise exception 'notice comment thread ACL mismatch';
  end if;
  raise notice 'PASS notice replies, idempotency, reaction aggregation/removal, participation projection and ACL';
end $$;
rollback;

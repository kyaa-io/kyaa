begin;

alter table public.mobile_participation_posts
  add column answer_to_id uuid references public.mobile_participation_posts(id) on delete restrict,
  add constraint mobile_participation_posts_answer_not_self check(answer_to_id is null or answer_to_id<>id);
create unique index mobile_participation_posts_one_valid_answer
  on public.mobile_participation_posts(answer_to_id)where answer_to_id is not null and status='valid';

alter function public.read_owned_mobile_participation_context_v2(uuid,text,uuid,public.content_locale,timestamptz,uuid,integer)
  rename to read_owned_mobile_participation_context_before_live_qa_answers;
create function public.read_owned_mobile_participation_context_v2(
  p_app_user_id uuid,p_context_type text,p_context_id uuid,p_locale public.content_locale,
  p_after timestamptz,p_after_id uuid,p_limit integer
)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare result jsonb;items jsonb;
begin
  result:=public.read_owned_mobile_participation_context_before_live_qa_answers(
    p_app_user_id,p_context_type,p_context_id,p_locale,p_after,p_after_id,p_limit
  );
  if result is null or result#>>'{access,allowed}'<>'true'then return result;end if;
  select coalesce(jsonb_agg(
    item.value||jsonb_build_object(
      'answerToId',post.answer_to_id,
      'author',case when post.answer_to_id is null then
        coalesce(item.value->'author','{}'::jsonb)||jsonb_build_object('role','fan')
      else jsonb_build_object(
        'nickname',case p_locale when'en'then
          coalesce(localization_en.name,localization_ko.name,'Artist')
        else coalesce(localization_ko.name,localization_en.name,'Artist')end,
        'avatarUrl',celebrity.image_url,'role','artist'
      )end
    )order by item.position
  ),'[]'::jsonb)into items
  from jsonb_array_elements(result->'items')with ordinality item(value,position)
  join public.mobile_participation_posts post on post.id=(item.value->>'id')::uuid
  join public.mobile_participation_contexts context on context.id=post.context_id
  join public.celebrities celebrity on celebrity.id=context.celebrity_id
  left join public.celebrity_localizations localization_ko
    on localization_ko.celebrity_id=celebrity.id and localization_ko.locale='ko'
  left join public.celebrity_localizations localization_en
    on localization_en.celebrity_id=celebrity.id and localization_en.locale='en';
  return jsonb_set(result,'{items}',items);
end$$;

create function public.answer_owned_mobile_participation_question(
  p_app_user_id uuid,p_question_id uuid,p_body text,p_request_key uuid
)returns jsonb language plpgsql security definer set search_path=''as $$
declare
  question public.mobile_participation_posts%rowtype;
  receipt public.mobile_participation_post_requests%rowtype;
  answer_id uuid:=extensions.gen_random_uuid();
  answer_body text:=btrim(coalesce(p_body,''));
  request_hash text;
  response jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if not exists(
    select 1 from public.admin_allowlist allowlist
    join public.app_users actor on actor.verified_email=allowlist.email
    where actor.id=p_app_user_id and actor.status='active'
      and allowlist.active and allowlist.role<>'viewer'
  )then raise exception'MOBILE_PARTICIPATION_FORBIDDEN';end if;
  if p_request_key is null or length(answer_body)not between 1 and 5000
    then raise exception'MOBILE_PARTICIPATION_INVALID';end if;
  request_hash:=md5(jsonb_build_array('answer',p_question_id,answer_body)::text);
  select*into receipt from public.mobile_participation_post_requests
  where app_user_id=p_app_user_id and request_key=p_request_key;
  if found then
    if receipt.payload_hash<>request_hash then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;
    return receipt.result||jsonb_build_object('replayed',true);
  end if;
  select post.*into question from public.mobile_participation_posts post
  join public.mobile_participation_contexts context on context.id=post.context_id
  where post.id=p_question_id and post.kind='question'and post.status='valid'
    and context.context_type='live'and context.state='published'for update of post;
  if not found then raise exception'MOBILE_PARTICIPATION_NOT_FOUND';end if;
  if exists(select 1 from public.mobile_participation_posts where answer_to_id=question.id and status='valid')
    then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;
  insert into public.mobile_participation_posts(
    id,context_id,app_user_id,kind,body,request_key,payload_hash,answer_to_id
  )values(answer_id,question.context_id,p_app_user_id,'post',answer_body,p_request_key,request_hash,question.id);
  response:=jsonb_build_object(
    'id',answer_id,'revision',1,'removed',false,'replayed',false,'answerToId',question.id
  );
  insert into public.mobile_participation_post_requests(
    app_user_id,request_key,operation,post_id,payload_hash,result
  )values(p_app_user_id,p_request_key,'create',answer_id,request_hash,response);
  return response;
end$$;

revoke all on function public.read_owned_mobile_participation_context_before_live_qa_answers(uuid,text,uuid,public.content_locale,timestamptz,uuid,integer),
  public.read_owned_mobile_participation_context_v2(uuid,text,uuid,public.content_locale,timestamptz,uuid,integer),
  public.answer_owned_mobile_participation_question(uuid,uuid,text,uuid)from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_participation_context_v2(uuid,text,uuid,public.content_locale,timestamptz,uuid,integer),
  public.answer_owned_mobile_participation_question(uuid,uuid,text,uuid)to service_role;

commit;

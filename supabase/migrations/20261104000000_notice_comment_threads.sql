-- Mobile notice comment replies and bounded reactions.
alter table public.celebrity_notice_comments
  add column if not exists parent_id uuid
  references public.celebrity_notice_comments(id) on delete set null;

alter table public.celebrity_notice_comments
  drop constraint if exists celebrity_notice_comments_parent_not_self;
alter table public.celebrity_notice_comments
  add constraint celebrity_notice_comments_parent_not_self
  check (parent_id is null or parent_id <> id);

create index if not exists celebrity_notice_comments_parent_idx
  on public.celebrity_notice_comments(parent_id,created_at,id)
  where parent_id is not null;

create table if not exists public.celebrity_notice_comment_reactions (
  comment_id uuid not null references public.celebrity_notice_comments(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  emoji text not null check (emoji in ('heart','thumbs_up','clap','laugh','star')),
  created_at timestamptz not null default now(),
  primary key(comment_id,app_user_id,emoji)
);
create index if not exists celebrity_notice_comment_reactions_user_idx
  on public.celebrity_notice_comment_reactions(app_user_id,created_at desc);
alter table public.celebrity_notice_comment_reactions enable row level security;
alter table public.celebrity_notice_comment_reactions force row level security;
revoke all on public.celebrity_notice_comment_reactions from public,anon,authenticated,service_role;


create or replace function public.read_celebrity_fanpage_for_viewer(
  p_slug text,p_app_user_id uuid,p_locale public.content_locale
) returns jsonb language sql stable security definer set search_path='' as $$
  with creator as (
    select c.id from public.celebrities c
    where c.slug=p_slug and c.status='published' and c.archived_at is null
  ), summary as (
    select public.read_celebrity_fanpage(p_slug,p_locale) value
  )
  select case when summary.value is null then null else summary.value || jsonb_build_object(
    'viewerCanParticipate',coalesce(public.fan_web_is_member(p_app_user_id,creator.id),false)
  ) end from summary left join creator on true;
$$;

create or replace function public.read_celebrity_notice_comments(
  p_slug text,p_notice_slug text,p_app_user_id uuid,p_before timestamptz,p_before_id uuid,p_limit integer,p_locale public.content_locale
) returns jsonb language sql stable security definer set search_path='' as $$
  with notice as (
    select n.id from public.celebrity_notices n join public.celebrities c on c.id=n.celebrity_id
    where c.slug=p_slug and c.status='published' and c.archived_at is null and n.slug=p_notice_slug and n.publication_status='published' and n.archived_at is null and public.fan_web_content_target(p_app_user_id,'notice',n.id,p_locale) is not null
  ), visible as (
    select x.* from public.celebrity_notice_comments x join notice n on n.id=x.notice_id join public.app_users u on u.id=x.app_user_id and u.status='active'
    where x.removed_at is null and public.fan_web_content_target(p_app_user_id,'notice_comment',x.id,p_locale) is not null
  ), page as (
    select v.*,coalesce(nullif(btrim(profile.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end) nickname,
      '/images/avatars/'||coalesce(avatar.selected_character_id,'star-pink')||'.webp' avatar_url,
      case when parent.id is null then null else coalesce(nullif(btrim(parent_profile.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end) end parent_nickname
    from visible v
    left join public.user_profiles profile on profile.app_user_id=v.app_user_id
    left join public.app_user_avatars avatar on avatar.app_user_id=v.app_user_id
    left join visible parent on parent.id=v.parent_id
    left join public.user_profiles parent_profile on parent_profile.app_user_id=parent.app_user_id
    where p_before is null or (v.created_at,v.id)<(p_before,p_before_id)
    order by v.created_at desc,v.id desc limit least(greatest(p_limit,1),50)
  )
  select jsonb_build_object(
    'total',(select count(*) from visible),
    'comments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',page.id,'body',page.body,'nickname',page.nickname,'avatarUrl',page.avatar_url,
      'createdAt',page.created_at,'isOwner',coalesce(page.app_user_id=p_app_user_id,false),
      'parentId',case when page.parent_nickname is null then null else page.parent_id end,
      'parentNickname',page.parent_nickname,
      'reactions',coalesce((select jsonb_agg(jsonb_build_object(
        'emoji',reaction.emoji,'count',reaction.count,'selected',reaction.selected
      ) order by array_position(array['heart','thumbs_up','clap','laugh','star'],reaction.emoji)) from (
        select r.emoji,count(*)::integer count,coalesce(bool_or(r.app_user_id=p_app_user_id),false) selected
        from public.celebrity_notice_comment_reactions r where r.comment_id=page.id group by r.emoji
      ) reaction),'[]'::jsonb)
    ) order by page.created_at desc,page.id desc) from page),'[]'::jsonb)
  ) from notice;
$$;

create or replace function public.post_celebrity_notice_comment(
  p_app_user_id uuid,p_slug text,p_notice_slug text,p_body text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_notice uuid;v_existing public.celebrity_notice_comments%rowtype;v_id uuid;v_body text:=btrim(p_body);
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if not exists(select 1 from public.app_users where id=p_app_user_id and status='active') then
    raise exception 'FANPAGE_FORBIDDEN' using errcode='42501'; end if;
  if p_idempotency_key is null or v_body is null or length(v_body) not between 1 and 1000 then
    raise exception 'FANPAGE_INVALID_REQUEST' using errcode='22023'; end if;
  select n.id into v_notice from public.celebrity_notices n join public.celebrities c on c.id=n.celebrity_id
    where c.slug=p_slug and c.status='published' and c.archived_at is null and n.slug=p_notice_slug
      and n.publication_status='published' and n.archived_at is null for share of n,c;
  if v_notice is null or not public.fan_web_content_visible(p_app_user_id,'notice',v_notice) then
    raise exception 'FANPAGE_NOT_FOUND' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fanpage:comment:'||p_app_user_id::text,0));
  select * into v_existing from public.celebrity_notice_comments
    where app_user_id=p_app_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.notice_id<>v_notice or v_existing.body<>v_body or v_existing.parent_id is not null then
      raise exception 'FANPAGE_IDEMPOTENCY_CONFLICT' using errcode='23514'; end if;
    return jsonb_build_object('id',v_existing.id,'replayed',true);
  end if;
  if (select count(*) from public.celebrity_notice_comments where app_user_id=p_app_user_id and created_at>now()-interval '1 minute')>=5 then
    raise exception 'FANPAGE_RATE_LIMITED' using errcode='P0001'; end if;
  insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key,parent_id)
    values(v_notice,p_app_user_id,v_body,p_idempotency_key,null) returning id into v_id;
  return jsonb_build_object('id',v_id,'replayed',false);
end $$;

create or replace function public.post_celebrity_notice_reply(
  p_app_user_id uuid,p_slug text,p_notice_slug text,p_body text,p_idempotency_key uuid,p_parent_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_notice uuid;v_parent public.celebrity_notice_comments%rowtype;v_existing public.celebrity_notice_comments%rowtype;v_id uuid;v_body text:=btrim(p_body);
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_idempotency_key is null or p_parent_id is null or v_body is null or length(v_body) not between 1 and 1000 then
    raise exception 'FANPAGE_INVALID_REQUEST' using errcode='22023'; end if;
  select n.id into v_notice from public.celebrity_notices n join public.celebrities c on c.id=n.celebrity_id
    where c.slug=p_slug and c.status='published' and c.archived_at is null and n.slug=p_notice_slug
      and n.publication_status='published' and n.archived_at is null for share of n,c;
  if v_notice is null or not public.fan_web_content_visible(p_app_user_id,'notice',v_notice) then
    raise exception 'FANPAGE_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_parent from public.celebrity_notice_comments
    where id=p_parent_id and notice_id=v_notice and removed_at is null for share;
  if not found or not public.fan_web_content_visible(p_app_user_id,'notice_comment',p_parent_id) then
    raise exception 'FANPAGE_NOT_FOUND' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fanpage:comment:'||p_app_user_id::text,0));
  select * into v_existing from public.celebrity_notice_comments where app_user_id=p_app_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.notice_id<>v_notice or v_existing.body<>v_body or v_existing.parent_id is distinct from p_parent_id then
      raise exception 'FANPAGE_IDEMPOTENCY_CONFLICT' using errcode='23514'; end if;
    return jsonb_build_object('id',v_existing.id,'replayed',true);
  end if;
  if (select count(*) from public.celebrity_notice_comments where app_user_id=p_app_user_id and created_at>now()-interval '1 minute')>=5 then
    raise exception 'FANPAGE_RATE_LIMITED' using errcode='P0001'; end if;
  insert into public.celebrity_notice_comments(notice_id,app_user_id,body,idempotency_key,parent_id)
    values(v_notice,p_app_user_id,v_body,p_idempotency_key,p_parent_id) returning id into v_id;
  return jsonb_build_object('id',v_id,'replayed',false);
end $$;

create or replace function public.set_notice_comment_reaction(
  p_app_user_id uuid,p_comment_id uuid,p_emoji text,p_selected boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_comment_id is null or p_emoji is null or p_emoji not in ('heart','thumbs_up','clap','laugh','star') or p_selected is null then
    raise exception 'FANPAGE_INVALID_REQUEST' using errcode='22023'; end if;
  if not exists(select 1 from public.celebrity_notice_comments c where c.id=p_comment_id and c.removed_at is null)
    or not public.fan_web_content_visible(p_app_user_id,'notice_comment',p_comment_id) then
    raise exception 'FANPAGE_NOT_FOUND' using errcode='P0002'; end if;
  if p_selected then
    insert into public.celebrity_notice_comment_reactions(comment_id,app_user_id,emoji)
      values(p_comment_id,p_app_user_id,p_emoji) on conflict do nothing;
  else
    delete from public.celebrity_notice_comment_reactions
      where comment_id=p_comment_id and app_user_id=p_app_user_id and emoji=p_emoji;
  end if;
  select count(*)::integer into v_count from public.celebrity_notice_comment_reactions
    where comment_id=p_comment_id and emoji=p_emoji;
  return jsonb_build_object('emoji',p_emoji,'count',v_count,'selected',p_selected);
end $$;

revoke all on function public.post_celebrity_notice_reply(uuid,text,text,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.set_notice_comment_reaction(uuid,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.read_celebrity_fanpage_for_viewer(text,uuid,public.content_locale) from public,anon,authenticated;
grant execute on function public.post_celebrity_notice_reply(uuid,text,text,text,uuid,uuid) to service_role;
grant execute on function public.set_notice_comment_reaction(uuid,uuid,text,boolean) to service_role;
grant execute on function public.read_celebrity_fanpage_for_viewer(text,uuid,public.content_locale) to service_role;

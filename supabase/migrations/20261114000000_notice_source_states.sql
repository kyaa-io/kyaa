begin;

create table public.celebrity_notice_likes (
  notice_id uuid not null references public.celebrity_notices(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(notice_id,app_user_id)
);
create index celebrity_notice_likes_user_idx on public.celebrity_notice_likes(app_user_id);
alter table public.celebrity_notice_likes enable row level security;
alter table public.celebrity_notice_likes force row level security;
revoke all on public.celebrity_notice_likes from public,anon,authenticated,service_role;
create trigger fan_web_owner_write before insert or update on public.celebrity_notice_likes
  for each row execute function public.fan_web_guard_owner_write('app_user_id');
create trigger fan_web_owner_write before insert or update on public.celebrity_notice_comment_reactions
  for each row execute function public.fan_web_guard_owner_write('app_user_id');

create or replace function public.read_fan_notice(p_app_user_id uuid,p_slug text,p_notice_slug text,p_locale public.content_locale default 'ko')
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',n.id,'slug',n.slug,'title',l.title,'body',l.body_json,'pinned',n.pinned,'kind',n.notice_kind,
    'postType',n.post_type,'visibility',n.visibility,'revision',n.revision,'publishedAt',n.published_at,
    'likeCount',(select count(*) from public.celebrity_notice_likes reaction
      join public.app_users reactor on reactor.id=reaction.app_user_id and reactor.status='active' where reaction.notice_id=n.id),
    'liked',exists(select 1 from public.celebrity_notice_likes reaction
      join public.app_users reactor on reactor.id=reaction.app_user_id and reactor.status='active'
      where reaction.notice_id=n.id and reaction.app_user_id=p_app_user_id))
  from public.celebrity_notices n join public.celebrities c on c.id=n.celebrity_id
  join public.celebrity_notice_localizations l on l.notice_id=n.id and l.locale=p_locale
  where c.slug=p_slug and n.slug=p_notice_slug and public.fan_web_content_target(p_app_user_id,'notice',n.id,p_locale) is not null;
$$;

create function public.set_celebrity_notice_liked(p_app_user_id uuid,p_slug text,p_notice_slug text,p_liked boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_notice uuid;v_count integer;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_liked is null then raise exception 'FANPAGE_INVALID_REQUEST' using errcode='22023'; end if;
  select notice.id into v_notice from public.celebrity_notices notice
    join public.celebrities creator on creator.id=notice.celebrity_id
    where creator.slug=p_slug and notice.slug=p_notice_slug
      and notice.publication_status='published' and notice.archived_at is null
      and creator.status='published' and creator.archived_at is null
    for share of notice,creator;
  if v_notice is null or not public.fan_web_content_visible(p_app_user_id,'notice',v_notice) then
    raise exception 'FANPAGE_NOT_FOUND' using errcode='P0002'; end if;
  if p_liked then
    insert into public.celebrity_notice_likes(notice_id,app_user_id) values(v_notice,p_app_user_id) on conflict do nothing;
  else
    delete from public.celebrity_notice_likes where notice_id=v_notice and app_user_id=p_app_user_id;
  end if;
  select count(*)::integer into v_count from public.celebrity_notice_likes reaction
    join public.app_users reactor on reactor.id=reaction.app_user_id and reactor.status='active'
    where reaction.notice_id=v_notice;
  return jsonb_build_object('liked',p_liked,'likeCount',v_count);
end $$;

-- Present one reaction per person without rewriting historical rows.
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
      'isFriend',exists(select 1 from public.social_friendships friendship
        join public.celebrity_notices friend_notice on friend_notice.id=page.notice_id
          and friend_notice.celebrity_id=friendship.celebrity_id
        where friendship.status='accepted' and (
          (friendship.requester_id=p_app_user_id and friendship.addressee_id=page.app_user_id)
          or(friendship.addressee_id=p_app_user_id and friendship.requester_id=page.app_user_id))),
      'parentId',case when page.parent_nickname is null then null else page.parent_id end,
      'parentNickname',page.parent_nickname,
      'reactions',coalesce((select jsonb_agg(jsonb_build_object(
        'emoji',reaction.emoji,'count',reaction.count,'selected',reaction.selected
      ) order by array_position(array['heart','thumbs_up','clap','laugh','star'],reaction.emoji)) from (
        select r.emoji,count(*)::integer count,coalesce(bool_or(r.app_user_id=p_app_user_id),false) selected
        from (select distinct on (reaction.app_user_id) reaction.app_user_id,reaction.emoji
          from public.celebrity_notice_comment_reactions reaction
          join public.app_users reactor on reactor.id=reaction.app_user_id and reactor.status='active'
          where reaction.comment_id=page.id
          order by reaction.app_user_id,reaction.created_at desc,reaction.emoji) r group by r.emoji
      ) reaction),'[]'::jsonb)
    ) order by page.created_at desc,page.id desc) from page),'[]'::jsonb)
  ) from notice;
$$;

create or replace function public.set_notice_comment_reaction(
  p_app_user_id uuid,p_comment_id uuid,p_emoji text,p_selected boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_comment uuid;v_current text;v_count integer;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_comment_id is null or p_emoji is null or p_emoji not in ('heart','thumbs_up','clap','laugh','star') or p_selected is null then
    raise exception 'FANPAGE_INVALID_REQUEST' using errcode='22023'; end if;
  select comment.id into v_comment from public.celebrity_notice_comments comment
    join public.celebrity_notices notice on notice.id=comment.notice_id
    join public.celebrities creator on creator.id=notice.celebrity_id
    join public.app_users author on author.id=comment.app_user_id
    where comment.id=p_comment_id and comment.removed_at is null
      and notice.publication_status='published' and notice.archived_at is null
      and creator.status='published' and creator.archived_at is null and author.status='active'
    for share of comment,notice,creator,author;
  if v_comment is null or not public.fan_web_content_visible(p_app_user_id,'notice_comment',p_comment_id) then
    raise exception 'FANPAGE_NOT_FOUND' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('notice-reaction:'||p_comment_id::text||':'||p_app_user_id::text,0));
  select emoji into v_current from public.celebrity_notice_comment_reactions
    where comment_id=p_comment_id and app_user_id=p_app_user_id
    order by created_at desc,emoji limit 1;
  if p_selected then
    delete from public.celebrity_notice_comment_reactions
      where comment_id=p_comment_id and app_user_id=p_app_user_id and emoji<>p_emoji;
    insert into public.celebrity_notice_comment_reactions(comment_id,app_user_id,emoji)
      values(p_comment_id,p_app_user_id,p_emoji) on conflict do nothing;
  else
    -- Legacy multiple choices stay intact until their owner changes that target.
    delete from public.celebrity_notice_comment_reactions
      where comment_id=p_comment_id and app_user_id=p_app_user_id
        and (v_current=p_emoji or emoji=p_emoji);
  end if;
  select count(*)::integer into v_count from (
    select distinct on (reaction.app_user_id) reaction.emoji
    from public.celebrity_notice_comment_reactions reaction
    join public.app_users reactor on reactor.id=reaction.app_user_id and reactor.status='active'
    where reaction.comment_id=p_comment_id
    order by reaction.app_user_id,reaction.created_at desc,reaction.emoji
  ) selected where selected.emoji=p_emoji;
  return jsonb_build_object('emoji',p_emoji,'count',v_count,'selected',p_selected);
end $$;

revoke all on function public.read_celebrity_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale),
  public.set_notice_comment_reaction(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.read_celebrity_notice_comments(text,text,uuid,timestamptz,uuid,integer,public.content_locale),
  public.set_notice_comment_reaction(uuid,uuid,text,boolean) to service_role;

alter function public.scrub_account_deletion(uuid) rename to scrub_account_deletion_before_notice_source_states;
create function public.scrub_account_deletion(p_app_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.scrub_account_deletion_before_notice_source_states(p_app_user_id);
  delete from public.celebrity_notice_likes where app_user_id=p_app_user_id;
  delete from public.celebrity_notice_comment_reactions where app_user_id=p_app_user_id;
end $$;
revoke all on function public.read_fan_notice(uuid,text,text,public.content_locale),
  public.set_celebrity_notice_liked(uuid,text,text,boolean),
  public.scrub_account_deletion_before_notice_source_states(uuid),public.scrub_account_deletion(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.read_fan_notice(uuid,text,text,public.content_locale),
  public.set_celebrity_notice_liked(uuid,text,text,boolean),public.scrub_account_deletion(uuid) to service_role;

commit;

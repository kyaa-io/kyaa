begin;

alter table public.celebrity_notice_comments
  add column is_official boolean not null default false;

create function public.set_notice_comment_official_author()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_slug text;
  v_post_type text;
  v_capability jsonb;
begin
  select creator.slug,notice.post_type::text into v_slug,v_post_type
  from public.celebrity_notices notice
  join public.celebrities creator on creator.id=notice.celebrity_id
  where notice.id=new.notice_id;

  new.is_official:=false;
  if v_post_type='artist_post' then
    v_capability:=public.read_owned_mobile_official_capability(new.app_user_id,v_slug,'ko');
    new.is_official:=coalesce((v_capability->>'canPublish')::boolean,false);
  end if;
  return new;
end $$;

revoke all on function public.set_notice_comment_official_author()
  from public,anon,authenticated,service_role;

create trigger notice_comment_official_author
  before insert on public.celebrity_notice_comments
  for each row execute function public.set_notice_comment_official_author();

create or replace function public.read_celebrity_notice_comments(
  p_slug text,p_notice_slug text,p_app_user_id uuid,p_before timestamptz,p_before_id uuid,p_limit integer,p_locale public.content_locale
) returns jsonb language sql stable security definer set search_path='' as $$
  with notice as (
    select n.id,c.image_url celebrity_image_url,l.name celebrity_name
    from public.celebrity_notices n
    join public.celebrities c on c.id=n.celebrity_id
    join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    where c.slug=p_slug and c.status='published' and c.archived_at is null
      and n.slug=p_notice_slug and n.publication_status='published' and n.archived_at is null
      and public.fan_web_content_target(p_app_user_id,'notice',n.id,p_locale) is not null
  ), visible as (
    select x.*,n.celebrity_name,n.celebrity_image_url
    from public.celebrity_notice_comments x
    join notice n on n.id=x.notice_id
    join public.app_users u on u.id=x.app_user_id and u.status='active'
    where x.removed_at is null
      and public.fan_web_content_target(p_app_user_id,'notice_comment',x.id,p_locale) is not null
  ), page as (
    select v.*,
      case when v.is_official then v.celebrity_name
        else coalesce(nullif(btrim(profile.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end) end nickname,
      case when v.is_official then v.celebrity_image_url
        else '/images/avatars/'||coalesce(avatar.selected_character_id,'star-pink')||'.webp' end avatar_url,
      case when parent.id is null then null
        when parent.is_official then parent.celebrity_name
        else coalesce(nullif(btrim(parent_profile.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end) end parent_nickname
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
      'isOfficial',page.is_official,
      'isFriend',case when page.is_official then false else exists(select 1 from public.social_friendships friendship
        join public.celebrity_notices friend_notice on friend_notice.id=page.notice_id
          and friend_notice.celebrity_id=friendship.celebrity_id
        where friendship.status='accepted' and (
          (friendship.requester_id=p_app_user_id and friendship.addressee_id=page.app_user_id)
          or(friendship.addressee_id=p_app_user_id and friendship.requester_id=page.app_user_id))) end,
      'parentId',case when page.parent_nickname is null then null else page.parent_id end,
      'parentNickname',page.parent_nickname,
      'reactions',coalesce((select jsonb_agg(jsonb_build_object(
        'emoji',reaction.emoji,'count',reaction.count,'selected',reaction.selected
      ) order by array_position(array['heart','thumbs_up','clap','laugh','star'],reaction.emoji)) from (
        select r.emoji,count(*)::integer count,coalesce(bool_or(r.app_user_id=p_app_user_id),false) selected
        from (select distinct on (comment_reaction.app_user_id) comment_reaction.app_user_id,comment_reaction.emoji
          from public.celebrity_notice_comment_reactions comment_reaction
          join public.app_users reactor on reactor.id=comment_reaction.app_user_id and reactor.status='active'
          where comment_reaction.comment_id=page.id
          order by comment_reaction.app_user_id,comment_reaction.created_at desc,comment_reaction.emoji) r group by r.emoji
      ) reaction),'[]'::jsonb)
    ) order by page.created_at desc,page.id desc) from page),'[]'::jsonb)
  ) from notice;
$$;

commit;

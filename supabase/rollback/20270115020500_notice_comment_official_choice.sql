-- Rollback for 20270115020500_notice_comment_official_choice.sql: restores the allowlist-based trigger of 20261118000000.
-- Rows written while the migration was live keep their stored is_official value.
begin;
create or replace function public.set_notice_comment_official_author()
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
-- read_admin_notice_comments as of 20260911165612 (no officialName).
create or replace function public.read_admin_notice_comments(
  p_actor_app_user_id uuid,
  p_actor_admin_allowlist_id uuid,
  p_slug text,
  p_before timestamptz,
  p_before_id uuid,
  p_limit integer
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  perform public.assert_active_admin(
    p_actor_app_user_id,
    p_actor_admin_allowlist_id,
    false
  );
  if p_limit is null or p_limit not between 1 and 100
     or ((p_before is null) <> (p_before_id is null)) then
    raise exception 'FANPAGE_INVALID_REQUEST';
  end if;

  select jsonb_build_object(
    'comments',
    coalesce(
      jsonb_agg(row.body order by row.created_at desc, row.id desc),
      '[]'::jsonb
    )
  )
  into v_result
  from (
    select
      cm.created_at,
      cm.id,
      jsonb_build_object(
        'id', cm.id,
        'body', cm.body,
        'nickname', coalesce(p.nickname, '팬'),
        'celebritySlug', c.slug,
        'noticeSlug', n.slug,
        'createdAt', cm.created_at
      ) body
    from public.celebrity_notice_comments cm
    join public.celebrity_notices n on n.id = cm.notice_id
    join public.celebrities c on c.id = n.celebrity_id
    left join public.user_profiles p on p.app_user_id = cm.app_user_id
    where cm.removed_at is null
      and (p_slug is null or c.slug = p_slug)
      and (
        p_before is null
        or (cm.created_at, cm.id) < (p_before, p_before_id)
      )
    order by cm.created_at desc, cm.id desc
    limit p_limit
  ) row;
  return v_result;
end;
$$;
drop function public.read_notice_comment_author(uuid,text,public.content_locale);
drop function public.post_celebrity_notice_comment_as_official(uuid,text,text,text,uuid,uuid);
drop function public.notice_official_author_allowed(uuid,uuid);
commit;
